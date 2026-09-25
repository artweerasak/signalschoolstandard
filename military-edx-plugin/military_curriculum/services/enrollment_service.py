"""
military_curriculum/services/enrollment_service.py

Cascade enrollment: เมื่อ prep_personnel บรรจุนักเรียนเข้าหลักสูตร ต้อง
enroll เข้าทุกวิชาย่อยในหลักสูตรนั้นโดยอัตโนมัติ ผ่าน CourseEnrollment
(native edX) — ไฟล์นี้เป็นแค่ orchestration layer ไม่ duplicate enrollment
model ใหม่

⚠️ imports ของ edx-platform (opaque_keys, student.models, xmodule) ต้องอยู่
*ภายใน* ฟังก์ชันเท่านั้น (lazy import) ไม่ใช่ที่หัวไฟล์ — เพราะ
standalone test harness (docker-compose.test.yml) ไม่มี edx-platform ติดตั้ง
ถ้า import ที่หัวไฟล์จะทำให้ทั้ง military_curriculum app โหลดไม่ได้แม้แต่
ตอนรัน pytest ธรรมดา (ดู tests/test_curriculum.py ที่ test model/view อื่น
ต้องรันได้โดยไม่มี edx-platform)
"""
import logging
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class EnrollmentResult:
    course_id: str
    success: bool
    error: str | None = None


def preview_cascade_enroll(curriculum, student) -> list[EnrollmentResult]:
    """Dry-run: ตรวจว่าแต่ละวิชา *จะ* enroll สำเร็จหรือไม่ (course_id ถูกต้อง,
    มีอยู่จริงใน modulestore) โดย**ไม่เรียก CourseEnrollment.enroll() จริง**
    และ**ไม่สร้าง CurriculumEnrollmentRequest ใดๆ** (รับ curriculum/student
    ตรงๆ ไม่ใช่ enrollment_request object เพราะ preview ไม่ควรมี side effect
    ใน DB เลย) — ให้ prep_personnel ตรวจสอบผลก่อน execute จริงครั้งแรก (ตาม
    คำแนะนำด้าน risk mitigation ในแผน — cascade enrollment เขียนเข้า
    production enrollment จริง จึงควรมี preview ก่อน)"""
    courses = curriculum.courses.all().order_by("sequence_order")
    return [_enroll_single_course(student, cc.course_id, dry_run=True) for cc in courses]


def cascade_enroll_student(enrollment_request) -> list[EnrollmentResult]:
    """เรียกแบบ sync (ทีละคน) — สำหรับ bulk จำนวนมากให้ dispatch เป็น Celery
    task ต่อคนแทน (ดู military_curriculum/tasks.py:cascade_enroll_student_task)

    แต่ละวิชา enroll แยก transaction.atomic() ของตัวเอง — ถ้าวิชาที่ 3 fail
    ต้องไม่ rollback วิชา 1,2,4,5 ที่สำเร็จแล้ว (requirement: error handling
    ต่อวิชา ไม่ใช่ all-or-nothing ทั้งคำขอ)
    """
    enrollment_request.status = "processing"
    enrollment_request.save(update_fields=["status"])

    courses = enrollment_request.curriculum.courses.all().order_by("sequence_order")
    results = [_enroll_single_course(enrollment_request.student, cc.course_id) for cc in courses]

    _save_results(enrollment_request, results)
    return results


def retry_failed_courses(enrollment_request) -> list[EnrollmentResult]:
    """วนเฉพาะ course_id ที่ result_detail เดิมเป็น 'failed: ...' — ไม่แตะ
    วิชาที่สำเร็จแล้ว (idempotent ทั้งระดับ course อยู่แล้วผ่าน
    _enroll_single_course แต่ retry แค่วิชาที่จำเป็นลดงานซ้ำ)"""
    prior = enrollment_request.result_detail or {}
    failed_course_ids = [cid for cid, status in prior.items() if status.startswith("failed")]
    if not failed_course_ids:
        return []

    enrollment_request.status = "processing"
    enrollment_request.save(update_fields=["status"])

    new_results = [_enroll_single_course(enrollment_request.student, cid) for cid in failed_course_ids]

    merged = dict(prior)
    for r in new_results:
        merged[r.course_id] = "enrolled" if r.success else f"failed: {r.error}"
    # ผลรวมล่าสุดของทุกวิชา (เดิม + ที่เพิ่ง retry) ใช้ตัดสิน status สุดท้าย
    all_ok = all(v == "enrolled" for v in merged.values())
    any_ok = any(v == "enrolled" for v in merged.values())
    enrollment_request.result_detail = merged
    enrollment_request.status = "completed" if all_ok else ("partial_failed" if any_ok else "failed")
    enrollment_request.processed_at = timezone.now()
    enrollment_request.save(update_fields=["status", "result_detail", "processed_at"])
    return new_results


def _save_results(enrollment_request, results: list[EnrollmentResult]) -> None:
    detail = {r.course_id: ("enrolled" if r.success else f"failed: {r.error}") for r in results}
    enrollment_request.result_detail = detail
    if all(r.success for r in results):
        enrollment_request.status = "completed"
    elif any(r.success for r in results):
        enrollment_request.status = "partial_failed"
    else:
        enrollment_request.status = "failed"
    enrollment_request.processed_at = timezone.now()
    enrollment_request.save(update_fields=["status", "result_detail", "processed_at"])


def _enroll_single_course(student, course_id_str: str, dry_run: bool = False) -> EnrollmentResult:
    """enroll นักเรียน 1 คนเข้า 1 วิชา — idempotent (ถ้า enroll อยู่แล้ว
    ไม่ error ซ้ำ), แยก transaction ของตัวเอง

    dry_run=True: ตรวจ course_id/modulestore/enrollment ที่มีอยู่เหมือนเดิม
    แต่ข้ามการเรียก CourseEnrollment.enroll() จริง — ใช้สำหรับ preview"""
    from opaque_keys import InvalidKeyError
    from opaque_keys.edx.keys import CourseKey

    try:
        course_key = CourseKey.from_string(course_id_str)
    except InvalidKeyError as e:
        return EnrollmentResult(course_id_str, False, f"invalid course_id: {e}")

    try:
        from xmodule.modulestore.django import modulestore
        if modulestore().get_course(course_key) is None:
            return EnrollmentResult(course_id_str, False, "course not found in modulestore")
    except Exception as e:  # noqa: BLE001 — modulestore เชื่อมต่อไม่ได้ก็ถือว่า enroll ไม่สำเร็จ ไม่ crash ทั้ง request
        logger.warning("cascade_enroll: modulestore check failed course=%s: %s", course_id_str, e)
        return EnrollmentResult(course_id_str, False, f"modulestore error: {e}")

    try:
        from common.djangoapps.student.models.course_enrollment import CourseEnrollment
        existing = CourseEnrollment.objects.filter(user=student, course_id=course_key).first()
        if existing and existing.is_active:
            return EnrollmentResult(course_id_str, True, None)  # idempotent — enroll อยู่แล้ว
        if dry_run:
            return EnrollmentResult(course_id_str, True, None)  # จะ enroll สำเร็จถ้าทำจริง
        with transaction.atomic():
            CourseEnrollment.enroll(student, course_key, mode="audit", check_access=False)
        return EnrollmentResult(course_id_str, True, None)
    except Exception as e:  # noqa: BLE001 — CourseEnrollment.enroll() อาจ raise หลายชนิด
        # (EnrollmentClosedError, CourseFullError, AlreadyEnrolledError, ...) ต้อง
        # catch broad เพื่อให้วิชาอื่นใน loop เดินต่อได้ ไม่ให้ทั้ง request ล้ม
        logger.exception("cascade_enroll failed course=%s student=%s dry_run=%s", course_id_str, student.id, dry_run)
        return EnrollmentResult(course_id_str, False, str(e))
