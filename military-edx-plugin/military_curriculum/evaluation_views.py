"""
military_curriculum/evaluation_views.py

Evaluation Gatekeeper (evaluator) — Sprint 4

student-facing endpoints (api_pending_evaluations, api_submit_evaluation)
ใช้ _require_login เฉยๆ ไม่ใช่ require_role เฉพาะ role ใดเพราะกำลังพลทุกคน
(รวม admin/instructor/prep_school ฯลฯ) เป็น "student" ได้เสมอตาม requirement
"""
import json
from datetime import date

from django.contrib.auth import get_user_model
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

from military_profile.permissions import (
    require_role, _require_login, ROLE_ADMIN, ROLE_EVALUATOR, ROLE_PREP_SCHOOL, ROLE_PREP_PERSONNEL,
)

from .models import (
    Curriculum, CurriculumCourse, EvaluationForm, EvaluationResponse, FinalCourseResult,
)
from .services.gatekeeper_service import is_evaluation_complete, get_pending_evaluations

User = get_user_model()


def _form_summary(f: EvaluationForm) -> dict:
    return {
        "id": f.id,
        "curriculum_id": f.curriculum_id,
        "curriculum_course_id": f.curriculum_course_id,
        "level": f.level,
        "title": f.title,
        "schema": f.schema,
        "is_required": f.is_required,
        "is_active": f.is_active,
        "response_count": f.responses.count(),
    }


@require_role([ROLE_EVALUATOR, ROLE_ADMIN])
def api_evaluator_curricula(request):
    """
    GET /military/api/v1/curriculum/evaluator/curricula/?academic_year=

    รายการหลักสูตรสำหรับ evaluator เลือกเข้าไปตั้งแบบประเมิน/ดูสถานะ — เจ้าหน้าที่
    ประเมินผลไม่รู้ curriculum_id ล่วงหน้า เดิมหน้าเว็บบังคับพิมพ์รหัสเอง
    endpoint นี้แทนที่ด้วยรายการเลือกได้ (ค่าเริ่มต้นหน้าเว็บกรองปีล่าสุดเอง)

    เห็นเฉพาะหลักสูตรที่ submitted/active/closed (ตัด draft ออก เพราะยังไม่มี
    นักเรียนให้ประเมินจนกว่าจะส่งให้เตรียมพล) ไม่ org-scope (evaluator เป็น
    ส่วนกลาง ต้องเห็นข้ามหน่วยเหมือน prep_personnel)
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    qs = Curriculum.objects.filter(status__in=["submitted", "active", "closed"])

    academic_year = request.GET.get("academic_year", "").strip()
    if academic_year:
        try:
            qs = qs.filter(academic_year=int(academic_year))
        except ValueError:
            return JsonResponse({"error": "academic_year ต้องเป็นตัวเลข"}, status=400)

    results = [
        {
            "id": c.id,
            "name": c.name,
            "batch_code": c.batch_code,
            "academic_year": c.academic_year,
            "organization_name": c.organization.name if c.organization_id else None,
            "status": c.status,
        }
        for c in qs.select_related("organization").order_by("-academic_year", "name")
    ]
    return JsonResponse({"results": results, "count": len(results)})


@csrf_exempt
@require_role([ROLE_EVALUATOR, ROLE_ADMIN])
def api_evaluation_forms(request):
    """
    GET  /military/api/v1/curriculum/evaluation-forms/?curriculum_id=&curriculum_course_id=
    POST /military/api/v1/curriculum/evaluation-forms/
    {"curriculum_id", "curriculum_course_id"(nullable), "level", "title", "schema", "is_required"}
    """
    if request.method == "GET":
        qs = EvaluationForm.objects.all()
        curriculum_id = request.GET.get("curriculum_id")
        curriculum_course_id = request.GET.get("curriculum_course_id")
        if curriculum_id:
            qs = qs.filter(curriculum_id=curriculum_id)
        if curriculum_course_id:
            qs = qs.filter(curriculum_course_id=curriculum_course_id)
        results = [_form_summary(f) for f in qs.order_by("-created_at")]
        return JsonResponse({"results": results, "count": len(results)})

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    curriculum_id = data.get("curriculum_id")
    level = data.get("level")
    title = (data.get("title") or "").strip()
    schema = data.get("schema")
    curriculum_course_id = data.get("curriculum_course_id")

    if not curriculum_id or level not in ("course", "curriculum") or not title or schema is None:
        return JsonResponse({"error": "curriculum_id, level, title, schema required"}, status=400)
    if level == "course" and not curriculum_course_id:
        return JsonResponse({"error": "curriculum_course_id required เมื่อ level=course"}, status=400)
    if level == "curriculum" and curriculum_course_id:
        return JsonResponse({"error": "level=curriculum ต้องไม่ระบุ curriculum_course_id"}, status=400)

    try:
        curriculum = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "curriculum not found"}, status=404)

    curriculum_course = None
    if curriculum_course_id:
        try:
            curriculum_course = CurriculumCourse.objects.get(pk=curriculum_course_id, curriculum=curriculum)
        except CurriculumCourse.DoesNotExist:
            return JsonResponse({"error": "curriculum_course not found in this curriculum"}, status=404)

    form = EvaluationForm.objects.create(
        curriculum=curriculum, curriculum_course=curriculum_course, level=level,
        title=title, schema=schema, is_required=data.get("is_required", True),
        created_by=request.user,
    )
    return JsonResponse(_form_summary(form), status=201)


@csrf_exempt
@require_role([ROLE_EVALUATOR, ROLE_ADMIN])
def api_evaluation_form_detail(request, form_id: int):
    """PATCH /military/api/v1/curriculum/evaluation-forms/{id}/"""
    if request.method != "PATCH":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        form = EvaluationForm.objects.get(pk=form_id)
    except EvaluationForm.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    if "title" in data:
        form.title = (data["title"] or "").strip()
    if "schema" in data:
        form.schema = data["schema"]
    if "is_required" in data:
        form.is_required = bool(data["is_required"])
    if "is_active" in data:
        form.is_active = bool(data["is_active"])
    form.save()
    return JsonResponse(_form_summary(form))


@require_role([ROLE_EVALUATOR, ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_evaluation_form_responses_summary(request, form_id: int):
    """GET /military/api/v1/curriculum/evaluation-forms/{id}/responses/summary/"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        form = EvaluationForm.objects.get(pk=form_id)
    except EvaluationForm.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    answered_count = form.responses.count()
    return JsonResponse({
        "form_id": form.id, "title": form.title, "answered_count": answered_count,
    })


@require_role([ROLE_EVALUATOR, ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_evaluation_status_dashboard(request):
    """GET /military/api/v1/curriculum/dashboard/evaluation-status/?curriculum_id=
    matrix นักเรียน × แบบประเมินบังคับ — evaluator/prep_school เห็นได้เสมอ
    ไม่ถูก gate (gate มีไว้ป้องกันฝั่ง student เท่านั้น)"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    curriculum_id = request.GET.get("curriculum_id")
    if not curriculum_id:
        return JsonResponse({"error": "curriculum_id required"}, status=400)

    try:
        curriculum = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    student_ids = set(
        curriculum.enrollment_requests.filter(status__in=["completed", "partial_failed"])
        .values_list("student_id", flat=True)
    )
    students = User.objects.filter(id__in=student_ids).select_related("military_profile")

    rows = []
    for s in students:
        profile = getattr(s, "military_profile", None)
        rows.append({
            "student_id": s.id,
            "full_name": profile.full_name_th if profile else s.username,
            "curriculum_evaluation_complete": is_evaluation_complete(s, curriculum=curriculum),
        })

    return JsonResponse({
        "curriculum_id": curriculum.id,
        "curriculum_name": curriculum.name,
        "results": rows,
        "count": len(rows),
    })


@require_role([ROLE_EVALUATOR, ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_grading_status_report(request):
    """
    GET /military/api/v1/curriculum/reports/grading-status/?curriculum_id=&academic_year=

    ติดตามว่าวิชาไหนในหลักสูตร (active/closed) ยังไม่ถูกครูปิดคะแนน
    (finalize_course ยังไม่เคยเรียก หรือเรียกแล้วแต่ยังไม่ครบทุกคนที่บรรจุ)
    — ใช้ curriculum.end_date กำหนดว่า "เกินกำหนด" หรือยัง (ยังไม่มี end_date
    = ยังบอกไม่ได้ว่าเกินกำหนดหรือไม่ แต่ยังโชว์ในรายการเป็น pending ปกติ)

    Dashboard เท่านั้น (v1) — ยังไม่มีการส่ง email/แจ้งเตือนอัตโนมัติ ตามที่
    ตกลงกันไว้ว่าจะเริ่มจากส่วนนี้ก่อน
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    qs = Curriculum.objects.filter(status__in=["active", "closed"])

    curriculum_id = request.GET.get("curriculum_id")
    if curriculum_id:
        qs = qs.filter(pk=curriculum_id)

    academic_year = request.GET.get("academic_year", "").strip()
    if academic_year:
        try:
            qs = qs.filter(academic_year=int(academic_year))
        except ValueError:
            return JsonResponse({"error": "academic_year ต้องเป็นตัวเลข"}, status=400)

    today = date.today()
    rows = []
    for c in qs.prefetch_related("courses", "courses__instructors__user__military_profile"):
        enrolled_count = c.enrollment_requests.filter(status__in=["completed", "partial_failed"]).count()
        if enrolled_count == 0:
            continue  # ยังไม่มีคนบรรจุ ไม่มีอะไรให้ปิดคะแนน

        for cc in c.courses.all():
            finalized_count = FinalCourseResult.objects.filter(curriculum_course=cc).count()
            pending_count = max(enrolled_count - finalized_count, 0)
            if pending_count == 0:
                continue  # ปิดคะแนนครบแล้ว ไม่ต้องติดตาม

            instructors = [
                {
                    "user_id": ci.user_id,
                    "full_name": ci.user.military_profile.full_name_th if hasattr(ci.user, "military_profile") else ci.user.username,
                    "is_owner": ci.is_owner,
                }
                for ci in cc.instructors.all()
            ]
            is_overdue = bool(c.end_date and today > c.end_date)

            rows.append({
                "curriculum_id": c.id,
                "curriculum_name": c.name,
                "academic_year": c.academic_year,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "curriculum_course_id": cc.id,
                "course_display_name": cc.display_name,
                "enrolled_count": enrolled_count,
                "finalized_count": finalized_count,
                "pending_count": pending_count,
                "instructors": instructors,
                "is_overdue": is_overdue,
            })

    rows.sort(key=lambda r: (not r["is_overdue"], r["end_date"] or "9999-99-99"))
    return JsonResponse({"results": rows, "count": len(rows)})


@require_role([ROLE_EVALUATOR, ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_curriculum_ranking(request, curriculum_id: int):
    """
    GET /military/api/v1/curriculum/curricula/{id}/ranking/

    จัดอันดับนักเรียนในหลักสูตรด้วยเกรดเฉลี่ยถ่วงน้ำหนักตามหน่วยกิต
    (sum(final_score × credits) / sum(credits) ของวิชาที่ปิดคะแนนแล้ว)
    ถ้าเกรดเฉลี่ยเท่ากัน จัดอันดับต่อด้วยคะแนนรวมดิบ (sum(final_score) ไม่
    ถ่วงน้ำหนัก) — นักเรียนที่ยังไม่มีวิชาไหนปิดคะแนนเลยจะไม่ถูกจัดอันดับ
    (ไม่มีข้อมูลให้เทียบ) is_complete บอกว่าปิดคะแนนครบทุกวิชาหรือยัง เพื่อ
    แยกอันดับที่ยัง "ไม่นิ่ง" ออกจากอันดับสุดท้ายจริง
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        c = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    courses = list(c.courses.all())
    total_course_count = len(courses)

    student_ids = list(
        c.enrollment_requests.filter(status__in=["completed", "partial_failed"]).values_list("student_id", flat=True)
    )
    students = User.objects.filter(id__in=student_ids).select_related("military_profile")

    results_by_student: dict = {}
    for fr in FinalCourseResult.objects.filter(
        curriculum_course__curriculum=c, final_score__isnull=False,
    ).select_related("curriculum_course"):
        results_by_student.setdefault(fr.student_id, []).append(fr)

    rows = []
    for s in students:
        frs = results_by_student.get(s.id, [])
        if not frs:
            continue
        weighted_sum = sum(float(fr.final_score) * float(fr.curriculum_course.credits) for fr in frs)
        credit_sum = sum(float(fr.curriculum_course.credits) for fr in frs)
        weighted_average = round(weighted_sum / credit_sum, 2) if credit_sum > 0 else None
        total_score = round(sum(float(fr.final_score) for fr in frs), 2)
        profile = getattr(s, "military_profile", None)
        rows.append({
            "student_id": s.id,
            "full_name": profile.full_name_th if profile else s.username,
            "rank_display": profile.get_rank_display() if profile else "",
            "weighted_average": weighted_average,
            "total_score": total_score,
            "courses_graded": len(frs),
            "courses_total": total_course_count,
            "is_complete": len(frs) == total_course_count,
        })

    rows.sort(key=lambda r: (-(r["weighted_average"] or 0), -(r["total_score"] or 0)))
    for i, r in enumerate(rows, start=1):
        r["rank"] = i

    return JsonResponse({
        "curriculum_id": c.id,
        "curriculum_name": c.name,
        "results": rows,
        "count": len(rows),
    })


# ---------------------------------------------------------------------------
# Student-facing (ทุกคนเข้าได้ ไม่ใช่เฉพาะ role=student)
# ---------------------------------------------------------------------------

@_require_login
def api_pending_evaluations(request):
    """GET /military/api/v1/curriculum/my/evaluations/pending/
    แบบประเมินบังคับที่ยังไม่ได้ตอบ ของทุกหลักสูตรที่กำลังพลคนนี้เรียนอยู่"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    curriculum_ids = set(
        request.user.curriculum_enrollment_requests.filter(
            status__in=["completed", "partial_failed"]
        ).values_list("curriculum_id", flat=True)
    )
    pending = []
    for cid in curriculum_ids:
        curriculum = Curriculum.objects.get(pk=cid)
        for form in get_pending_evaluations(request.user, curriculum):
            pending.append({
                "form_id": form.id,
                "title": form.title,
                "level": form.level,
                "curriculum_name": curriculum.name,
                "curriculum_course_name": form.curriculum_course.display_name if form.curriculum_course_id else None,
                "schema": form.schema,
            })
    return JsonResponse({"results": pending, "count": len(pending)})


@csrf_exempt
@_require_login
def api_submit_evaluation(request, form_id: int):
    """POST /military/api/v1/curriculum/my/evaluations/{form_id}/submit/  {"answers": {...}}"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        form = EvaluationForm.objects.get(pk=form_id, is_active=True)
    except EvaluationForm.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    answers = data.get("answers")
    if answers is None:
        return JsonResponse({"error": "answers required"}, status=400)

    if EvaluationResponse.objects.filter(form=form, student=request.user).exists():
        return JsonResponse({"error": "ตอบแบบประเมินนี้ไปแล้ว"}, status=409)

    resp = EvaluationResponse.objects.create(form=form, student=request.user, answers=answers)
    return JsonResponse({"id": resp.id, "submitted_at": resp.submitted_at.isoformat()}, status=201)
