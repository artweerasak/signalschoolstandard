"""
military_curriculum/evaluation_views.py

Evaluation Gatekeeper (evaluator) — Sprint 4

student-facing endpoints (api_pending_evaluations, api_submit_evaluation)
ใช้ _require_login เฉยๆ ไม่ใช่ require_role เฉพาะ role ใดเพราะกำลังพลทุกคน
(รวม admin/instructor/prep_school ฯลฯ) เป็น "student" ได้เสมอตาม requirement
"""
import json

from django.contrib.auth import get_user_model
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

from military_profile.permissions import require_role, _require_login, ROLE_ADMIN, ROLE_EVALUATOR, ROLE_PREP_SCHOOL

from .models import Curriculum, CurriculumCourse, EvaluationForm, EvaluationResponse
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
