"""
military_curriculum/services/grading_service.py

Hybrid grading (auto จาก e-Learning + manual กรอกเอง) และ sync co-instructor
กับ native CourseAccessRole ของ edX

⚠️ imports ของ edx-platform อยู่ภายในฟังก์ชันเท่านั้น (lazy) — เหตุผล
เดียวกับ enrollment_service.py

⚠️ field names ของ PersistentCourseGrade/CourseAccessRole อ้างอิงจาก
Open edX schema มาตรฐาน (เสถียรมาหลายปี) + `role__in=["instructor","staff"]`
ที่พบจริงใน military_profile/api_views.py (ยืนยันว่า role string ที่ระบบนี้
ใช้จริงคือ "staff"/"instructor") — **ยังไม่ได้ verify field ของ
PersistentCourseGrade กับ edx-platform เวอร์ชันที่รันจริงบนเครื่อง
เนื่องจาก SSH ใช้งานไม่ได้ตอนเขียนโค้ดนี้ ควรตรวจสอบก่อน merge**
"""
import logging

from django.db import transaction

logger = logging.getLogger(__name__)

# role string ที่ให้สิทธิ์ course team ใน Studio/instructor dashboard ของ edX
# เอง (ยืนยันจาก pattern role__in=["instructor","staff"] ที่ใช้จริงใน
# military_profile/api_views.py หลายจุด)
COURSE_STAFF_ROLE = "staff"


def sync_course_access_role(course_id_str: str, user, add: bool) -> None:
    """เพิ่ม/ลบ native CourseAccessRole ให้ตรงกับ CurriculumCourseInstructor
    — ต้องเรียกทุกครั้งที่ add/remove co-instructor เพื่อให้เครื่องมือ edX
    เอง (Studio, instructor dashboard) เห็น permission ตรงกัน"""
    from opaque_keys import InvalidKeyError
    from opaque_keys.edx.keys import CourseKey
    from student.models.user import CourseAccessRole

    try:
        course_key = CourseKey.from_string(course_id_str)
    except InvalidKeyError:
        logger.error("sync_course_access_role: invalid course_id %s", course_id_str)
        return

    if add:
        CourseAccessRole.objects.get_or_create(
            user=user, course_id=course_key, org=course_key.org, role=COURSE_STAFF_ROLE,
        )
    else:
        CourseAccessRole.objects.filter(
            user=user, course_id=course_key, role=COURSE_STAFF_ROLE,
        ).delete()


def get_course_percent_grade(student, course_id_str: str) -> float | None:
    """ดึงคะแนนรวม % ของวิชาจาก e-Learning อัตโนมัติ (PersistentCourseGrade)
    คืน None ถ้ายังไม่มีข้อมูลเกรด (ยังไม่เริ่มเรียน/ยังไม่คำนวณ)"""
    from opaque_keys import InvalidKeyError
    from opaque_keys.edx.keys import CourseKey

    try:
        course_key = CourseKey.from_string(course_id_str)
    except InvalidKeyError:
        return None

    try:
        from lms.djangoapps.grades.models import PersistentCourseGrade
        grade = PersistentCourseGrade.objects.filter(user_id=student.id, course_id=course_key).first()
    except Exception as e:  # noqa: BLE001
        logger.warning("get_course_percent_grade failed course=%s student=%s: %s", course_id_str, student.id, e)
        return None

    if grade is None:
        return None
    return float(grade.percent_grade) * 100


def finalize_course(curriculum_course) -> list:
    """คำนวณ FinalCourseResult ของนักเรียนทุกคนที่ enroll วิชานี้ — ผสม
    auto grade (PersistentCourseGrade) กับ ManualGradeEntry ตามน้ำหนักที่
    ครูกำหนด (ManualGradeEntry.weight = สัดส่วน % ของคะแนนนั้นในเกรดสุดท้าย,
    ส่วนที่เหลือ 100-sum(weight) มาจากคะแนนอัตโนมัติ — ถ้าไม่มี manual entry
    เลย final_score = auto percent ทั้งหมด)

    คำนวณคะแนนจริงเสมอ ไม่ถูก evaluation gatekeeper บล็อก (gate บล็อกแค่
    การ "แสดงผล" ให้ student เห็น ดู services/gatekeeper_service.py)"""
    from student.models.course_enrollment import CourseEnrollment
    from opaque_keys.edx.keys import CourseKey

    from ..models import FinalCourseResult

    course_key = CourseKey.from_string(curriculum_course.course_id)
    manual_entries_by_student: dict[int, list] = {}
    for entry in curriculum_course.manual_grades.all():
        manual_entries_by_student.setdefault(entry.student_id, []).append(entry)

    enrolled_user_ids = list(
        CourseEnrollment.objects.filter(course_id=course_key, is_active=True).values_list("user_id", flat=True)
    )

    results = []
    with transaction.atomic():
        for user_id in enrolled_user_ids:
            from django.contrib.auth import get_user_model
            student = get_user_model().objects.get(pk=user_id)

            manual_entries = manual_entries_by_student.get(user_id, [])
            manual_weight_total = sum(float(e.weight) for e in manual_entries)
            manual_weight_total = min(manual_weight_total, 100.0)  # กันน้ำหนักรวมเกิน 100%
            manual_contribution = sum(
                (float(e.score) / float(e.max_score) * 100 * float(e.weight) / 100)
                for e in manual_entries if float(e.max_score) > 0
            )

            auto_weight = 100.0 - manual_weight_total
            auto_percent = get_course_percent_grade(student, curriculum_course.course_id)
            auto_contribution = (auto_percent or 0.0) * auto_weight / 100 if auto_weight > 0 else 0.0

            final_score = round(manual_contribution + auto_contribution, 2)

            if curriculum_course.assessment_type == "score" and curriculum_course.passing_score is not None:
                passed = final_score >= float(curriculum_course.passing_score)
            elif curriculum_course.assessment_type == "pass_fail":
                passed = final_score >= 50.0
            else:
                passed = None  # ไม่มีเกณฑ์ผ่านกำหนดไว้ — ปล่อยให้ผู้ดูรายงานตัดสินเอง

            obj, _ = FinalCourseResult.objects.update_or_create(
                curriculum_course=curriculum_course, student_id=user_id,
                defaults={"final_score": final_score, "passed": passed},
            )
            results.append(obj)

    return results
