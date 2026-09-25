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
