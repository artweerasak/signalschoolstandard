"""
military_curriculum/services/gatekeeper_service.py

Evaluation Gatekeeper: บังคับให้นักเรียนทำแบบประเมิน (is_required=True) ก่อน
จึงจะเห็นคะแนน/ใบประกาศ

⚠️ หลักการสำคัญ (ตามแผนที่อนุมัติ): gate ทำงานที่ "read/display layer"
เท่านั้น ของ endpoint ใหม่ (student-facing) — **ไม่แตะ grades app หรือ
certificate generation ของ edX เดิมเลย** การคำนวณเกรดจริง
(FinalCourseResult ผ่าน finalize_course()) ยังทำงานปกติเสมอ ไม่ถูก gate
บล็อก — instructor/evaluator ยังเห็นคะแนนจริงได้เสมอเพื่อ audit ผ่าน
endpoint เดิม (roster, evaluation-status dashboard) gate บล็อกแค่ "การ
แสดงผลให้ student เห็น" ในหน้า transcript (Sprint 5) เท่านั้น
"""
from .. import models as m


def is_evaluation_complete(student, curriculum_course=None, curriculum=None) -> bool:
    """เช็คว่านักเรียนทำแบบประเมินที่ is_required=True ของ scope นี้ครบหรือ
    ยัง — ระบุ curriculum_course (ระดับรายวิชา) หรือ curriculum (ระดับ
    หลักสูตรรวม) อย่างใดอย่างหนึ่ง

    ไม่มี form บังคับเลย = ผ่าน gate โดย default (backward-safe — หลักสูตร
    ที่ evaluator ยังไม่สร้างแบบประเมินเลยไม่ควรถูกบล็อกโดยไม่ตั้งใจ)"""
    qs = m.EvaluationForm.objects.filter(is_active=True, is_required=True)
    if curriculum_course is not None:
        qs = qs.filter(level="course", curriculum_course=curriculum_course)
    elif curriculum is not None:
        qs = qs.filter(level="curriculum", curriculum=curriculum)
    else:
        raise ValueError("ต้องระบุ curriculum_course หรือ curriculum อย่างใดอย่างหนึ่ง")

    required_form_ids = set(qs.values_list("id", flat=True))
    if not required_form_ids:
        return True

    answered_ids = set(
        m.EvaluationResponse.objects.filter(
            student=student, form_id__in=required_form_ids
        ).values_list("form_id", flat=True)
    )
    return required_form_ids.issubset(answered_ids)


def get_pending_evaluations(student, curriculum) -> list:
    """คืน list ของ EvaluationForm ที่บังคับ (course-level ของทุกวิชาใน
    หลักสูตร + curriculum-level) แต่นักเรียนยังไม่ได้ตอบ — ใช้แสดงในหน้า
    "แบบประเมินที่ต้องทำ" ของ student"""
    course_form_ids = m.EvaluationForm.objects.filter(
        is_active=True, is_required=True, level="course",
        curriculum_course__curriculum=curriculum,
    ).values_list("id", flat=True)
    curriculum_form_ids = m.EvaluationForm.objects.filter(
        is_active=True, is_required=True, level="curriculum", curriculum=curriculum,
    ).values_list("id", flat=True)
    all_ids = set(course_form_ids) | set(curriculum_form_ids)
    if not all_ids:
        return []

    answered_ids = set(
        m.EvaluationResponse.objects.filter(student=student, form_id__in=all_ids).values_list("form_id", flat=True)
    )
    pending_ids = all_ids - answered_ids
    return list(m.EvaluationForm.objects.filter(id__in=pending_ids).select_related("curriculum_course"))


def get_gated_transcript(student) -> list[dict]:
    """ใช้เฉพาะใน /my/transcript/ endpoint (Sprint 5) — ไม่แตะ endpoint
    คะแนนเดิมของ edX เลย คำนวณ FinalCourseResult เอง (finalize_course) ยัง
    ทำงานเสมอไม่ว่า gate จะผ่านหรือไม่ — gate กระทบแค่ field ที่คืนใน
    dict นี้ (grade_visible/final_score/passed = None ถ้ายังไม่ผ่าน gate)"""
    results = []
    # หนึ่งหลักสูตรอาจมีหลาย CurriculumEnrollmentRequest ไม่ได้ (unique_together
    # curriculum+student) แต่ query ตรงๆ แล้ว dedupe เองแทน .distinct("field")
    # ที่ใช้ได้เฉพาะ Postgres (production เป็น MySQL)
    enrollment_requests = m.CurriculumEnrollmentRequest.objects.filter(
        student=student, status__in=["completed", "partial_failed"]
    ).select_related("curriculum")
    seen_curriculum_ids = set()
    for req in enrollment_requests:
        if req.curriculum_id in seen_curriculum_ids:
            continue
        seen_curriculum_ids.add(req.curriculum_id)
        curriculum = req.curriculum
        curriculum_gate_ok = is_evaluation_complete(student, curriculum=curriculum)

        courses_out = []
        for cc in curriculum.courses.all().order_by("sequence_order"):
            course_gate_ok = is_evaluation_complete(student, curriculum_course=cc)
            final = m.FinalCourseResult.objects.filter(curriculum_course=cc, student=student).first()
            visible = course_gate_ok
            courses_out.append({
                "course_id": cc.course_id,
                "display_name": cc.display_name,
                "credits": str(cc.credits),
                "grade_visible": visible,
                "final_score": (str(final.final_score) if final.final_score is not None else None) if (final and visible) else None,
                "passed": (final.passed if visible else None) if final else None,
                "completed_at": (final.computed_at.isoformat() if final and visible else None),
                "gate_reason": None if visible else "pending_course_evaluation",
            })

        determined_passed = [c["passed"] for c in courses_out if c["passed"] is not None]
        cert_available = curriculum_gate_ok and bool(determined_passed) and all(determined_passed)
        results.append({
            "curriculum_id": curriculum.id,
            "curriculum_name": curriculum.name,
            "batch_code": curriculum.batch_code,
            "academic_year": curriculum.academic_year,
            "courses": courses_out,
            "certificate_available": cert_available,
            "gate_reason": None if curriculum_gate_ok else "pending_curriculum_evaluation",
        })
    return results
