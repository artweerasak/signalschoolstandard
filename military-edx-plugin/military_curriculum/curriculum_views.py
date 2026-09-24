"""
military_curriculum/curriculum_views.py

Curriculum CRUD (prep_school) — สร้าง/แก้ไขกรอบหลักสูตรประจำปี/รุ่น และวิชา
ย่อยภายใน ก่อนส่งต่อให้ prep_personnel บรรจุกำลังพล (ดู quota_views.py)

Sprint 1 เท่านั้น — ยังไม่มี cascade enrollment (Sprint 2), grading (Sprint 3),
evaluation gatekeeper (Sprint 4), transcript (Sprint 5)
"""
import json

from django.db import IntegrityError
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

from military_profile.permissions import require_role, ROLE_ADMIN, ROLE_PREP_SCHOOL

from .models import Curriculum, CurriculumCourse, CurriculumRegionQuota


def _curriculum_summary(c: Curriculum) -> dict:
    """แปลง Curriculum เป็น dict สำหรับ list view (ไม่รวมวิชาย่อย — ดู detail)"""
    return {
        "id": c.id,
        "name": c.name,
        "batch_code": c.batch_code,
        "academic_year": c.academic_year,
        "organization_id": c.organization_id,
        "organization_name": c.organization.name if c.organization_id else None,
        "status": c.status,
        "quota_total": c.quota_total,
        "course_count": c.courses.count(),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
    }


def _curriculum_detail(c: Curriculum) -> dict:
    data = _curriculum_summary(c)
    data["eligible_rank_class"] = c.eligible_rank_class
    data["eligible_personnel_type"] = c.eligible_personnel_type
    data["region_quotas"] = [
        {"id": q.id, "army_region": q.army_region, "quota": q.quota}
        for q in c.region_quotas.all()
    ]
    data["courses"] = [
        {
            "id": cc.id,
            "course_id": cc.course_id,
            "display_name": cc.display_name,
            "sequence_order": cc.sequence_order,
            "credit_hours": str(cc.credit_hours),
            "credits": str(cc.credits),
            "assessment_type": cc.assessment_type,
            "passing_score": str(cc.passing_score) if cc.passing_score is not None else None,
            "is_required": cc.is_required,
        }
        for cc in c.courses.all()
    ]
    return data


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curricula(request):
    """
    GET  /military/api/v1/curriculum/curricula/  → list
    POST /military/api/v1/curriculum/curricula/  → create (status=draft เสมอ)

    admin เห็นทุกหลักสูตร (กรองด้วย ?org_id= ได้), prep_school เห็นเฉพาะของ
    หน่วยงานตัวเอง (ตาม pattern api_org_admin_users)
    """
    if request.method == "GET":
        profile = getattr(request.user, "military_profile", None)
        is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)

        if is_admin:
            org_id = request.GET.get("org_id")
            qs = Curriculum.objects.filter(organization_id=org_id) if org_id else Curriculum.objects.all()
        else:
            if not profile or not profile.organization_id:
                return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)
            qs = Curriculum.objects.filter(organization_id=profile.organization_id)

        status = request.GET.get("status")
        if status:
            qs = qs.filter(status=status)

        results = [_curriculum_summary(c) for c in qs.select_related("organization").order_by("-academic_year", "name")]
        return JsonResponse({"results": results, "count": len(results)})

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (data.get("name") or "").strip()
    batch_code = (data.get("batch_code") or "").strip()
    academic_year = data.get("academic_year")
    organization_id = data.get("organization_id")

    profile = getattr(request.user, "military_profile", None)
    is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if not organization_id:
        # prep_school ที่ไม่ใช่ admin ต้องสร้างในหน่วยงานตัวเองเท่านั้น
        organization_id = profile.organization_id if profile else None

    if not is_admin and profile and organization_id != profile.organization_id:
        return JsonResponse({"error": "สร้างหลักสูตรได้เฉพาะหน่วยงานตัวเองเท่านั้น"}, status=403)

    if not name or not batch_code or not academic_year or not organization_id:
        return JsonResponse(
            {"error": "name, batch_code, academic_year, organization_id required"}, status=400
        )

    try:
        c = Curriculum.objects.create(
            name=name,
            batch_code=batch_code,
            academic_year=academic_year,
            organization_id=organization_id,
            eligible_rank_class=(data.get("eligible_rank_class") or "").strip(),
            eligible_personnel_type=(data.get("eligible_personnel_type") or "").strip(),
            quota_total=data.get("quota_total") or 0,
            created_by=request.user,
        )
    except IntegrityError:
        return JsonResponse(
            {"error": "มีหลักสูตรชื่อ/รุ่น/ปีนี้อยู่แล้ว"}, status=409
        )

    for rq in data.get("region_quotas") or []:
        army_region = (rq.get("army_region") or "").strip()
        if army_region:
            CurriculumRegionQuota.objects.create(
                curriculum=c, army_region=army_region, quota=rq.get("quota") or 0
            )

    return JsonResponse(_curriculum_detail(c), status=201)


def _get_curriculum_scoped(request, curriculum_id):
    """คืน Curriculum ถ้า user มีสิทธิ์เข้าถึง (admin ทุกอัน, prep_school
    เฉพาะของหน่วยงานตัวเอง) — คืน None + JsonResponse error ถ้าไม่ผ่าน"""
    try:
        c = Curriculum.objects.select_related("organization").get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return None, JsonResponse({"error": "Not found"}, status=404)

    profile = getattr(request.user, "military_profile", None)
    is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if not is_admin and (not profile or c.organization_id != profile.organization_id):
        return None, JsonResponse({"error": "Forbidden"}, status=403)

    return c, None


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curriculum_detail(request, curriculum_id: int):
    """
    GET   /military/api/v1/curriculum/curricula/{id}/  → detail
    PATCH /military/api/v1/curriculum/curricula/{id}/  → แก้ไข (เฉพาะ status=draft)
    """
    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err

    if request.method == "GET":
        return JsonResponse(_curriculum_detail(c))

    if request.method == "PATCH":
        if c.status != "draft":
            return JsonResponse({"error": "แก้ไขได้เฉพาะหลักสูตรสถานะร่างเท่านั้น"}, status=409)
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        for field in ("name", "batch_code", "eligible_rank_class", "eligible_personnel_type"):
            if field in data:
                setattr(c, field, (data[field] or "").strip())
        if "academic_year" in data:
            c.academic_year = data["academic_year"]
        if "quota_total" in data:
            c.quota_total = data["quota_total"] or 0
        c.save()
        return JsonResponse(_curriculum_detail(c))

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curriculum_courses(request, curriculum_id: int):
    """POST /military/api/v1/curriculum/curricula/{id}/courses/  → เพิ่มวิชา (เฉพาะ status=draft)"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err
    if c.status != "draft":
        return JsonResponse({"error": "แก้ไขวิชาได้เฉพาะหลักสูตรสถานะร่างเท่านั้น"}, status=409)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    course_id = (data.get("course_id") or "").strip()
    display_name = (data.get("display_name") or "").strip()
    if not course_id or not display_name:
        return JsonResponse({"error": "course_id, display_name required"}, status=400)

    assessment_type = data.get("assessment_type", "score")
    if assessment_type not in ("score", "pass_fail"):
        return JsonResponse({"error": "assessment_type must be 'score' or 'pass_fail'"}, status=400)

    try:
        cc = CurriculumCourse.objects.create(
            curriculum=c,
            course_id=course_id,
            display_name=display_name,
            sequence_order=data.get("sequence_order") or 0,
            credit_hours=data.get("credit_hours") or 0,
            credits=data.get("credits") or 0,
            assessment_type=assessment_type,
            passing_score=data.get("passing_score"),
            is_required=data.get("is_required", True),
        )
    except IntegrityError:
        return JsonResponse({"error": "วิชานี้อยู่ในหลักสูตรแล้ว"}, status=409)

    return JsonResponse({"id": cc.id, "course_id": cc.course_id, "display_name": cc.display_name}, status=201)


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curriculum_course_detail(request, curriculum_id: int, course_pk: int):
    """DELETE /military/api/v1/curriculum/curricula/{id}/courses/{course_pk}/  → ลบวิชา (เฉพาะ status=draft)"""
    if request.method != "DELETE":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err
    if c.status != "draft":
        return JsonResponse({"error": "แก้ไขวิชาได้เฉพาะหลักสูตรสถานะร่างเท่านั้น"}, status=409)

    try:
        cc = c.courses.get(pk=course_pk)
    except CurriculumCourse.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    cc.delete()
    return JsonResponse({"deleted": True})


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curriculum_submit(request, curriculum_id: int):
    """POST /military/api/v1/curriculum/curricula/{id}/submit/  → draft → submitted"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err
    if c.status != "draft":
        return JsonResponse({"error": "ส่งได้เฉพาะหลักสูตรสถานะร่างเท่านั้น"}, status=409)
    if not c.courses.exists():
        return JsonResponse({"error": "ต้องมีอย่างน้อย 1 วิชาก่อนส่ง"}, status=400)

    from django.utils import timezone
    c.status = "submitted"
    c.submitted_at = timezone.now()
    c.save(update_fields=["status", "submitted_at"])
    return JsonResponse(_curriculum_detail(c))
