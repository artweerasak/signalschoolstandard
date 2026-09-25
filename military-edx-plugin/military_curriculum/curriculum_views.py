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

from django.contrib.auth import get_user_model

from military_profile.permissions import require_role, ROLE_ADMIN, ROLE_PREP_SCHOOL
from military_profile.models import PERSONNEL_TYPE_CHOICES

from .models import Curriculum, CurriculumCourse, CurriculumRegionQuota, RANK_ORDER
from .permissions import require_school_curriculum_read, SIGNAL_SCHOOL_ORG_ID

User = get_user_model()


def _clean_eligibility_fields(data: dict, existing: Curriculum | None = None) -> tuple:
    """เตรียม+ตรวจสอบฟิลด์เกณฑ์คุณสมบัติ (ช่วงยศ/ระยะเวลาครองยศ/ประเภทบุคลากร)
    จาก request body — คืน (updates, error) โดย updates มีเฉพาะ key ที่ผู้ใช้
    ส่งมาจริง (รองรับทั้งตอนสร้าง ที่ส่งครบ และ PATCH ที่ส่งบางส่วน) ถ้า PATCH
    ส่งมาแค่ rank_min หรือ rank_max ด้านเดียว จะเทียบ ordering กับค่าเดิมของ
    หลักสูตร (existing) ด้วย"""
    updates: dict = {}

    if "eligible_rank_min" in data:
        v = (data["eligible_rank_min"] or "").strip()
        if v and v not in RANK_ORDER:
            return {}, "eligible_rank_min ไม่ถูกต้อง"
        updates["eligible_rank_min"] = v

    if "eligible_rank_max" in data:
        v = (data["eligible_rank_max"] or "").strip()
        if v and v not in RANK_ORDER:
            return {}, "eligible_rank_max ไม่ถูกต้อง"
        updates["eligible_rank_max"] = v

    rank_min = updates.get("eligible_rank_min", existing.eligible_rank_min if existing else "")
    rank_max = updates.get("eligible_rank_max", existing.eligible_rank_max if existing else "")
    if rank_min and rank_max and RANK_ORDER[rank_min] > RANK_ORDER[rank_max]:
        return {}, "ยศต่ำสุดต้องไม่สูงกว่ายศสูงสุด"

    if "eligible_min_years_in_rank" in data:
        raw = data["eligible_min_years_in_rank"]
        if raw in (None, ""):
            updates["eligible_min_years_in_rank"] = None
        else:
            try:
                years = int(raw)
            except (TypeError, ValueError):
                return {}, "eligible_min_years_in_rank ต้องเป็นตัวเลข"
            if years < 0:
                return {}, "eligible_min_years_in_rank ต้องไม่ติดลบ"
            updates["eligible_min_years_in_rank"] = years

    if "eligible_personnel_type" in data:
        v = (data["eligible_personnel_type"] or "").strip()
        if v and v not in dict(PERSONNEL_TYPE_CHOICES):
            return {}, "eligible_personnel_type ไม่ถูกต้อง"
        updates["eligible_personnel_type"] = v

    return updates, None


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
    data["eligible_rank_min"] = c.eligible_rank_min
    data["eligible_rank_min_display"] = c.get_eligible_rank_min_display() if c.eligible_rank_min else None
    data["eligible_rank_max"] = c.eligible_rank_max
    data["eligible_rank_max_display"] = c.get_eligible_rank_max_display() if c.eligible_rank_max else None
    data["eligible_min_years_in_rank"] = c.eligible_min_years_in_rank
    data["eligible_personnel_type"] = c.eligible_personnel_type
    data["eligible_personnel_type_display"] = c.get_eligible_personnel_type_display() if c.eligible_personnel_type else None
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

    eligibility, elig_error = _clean_eligibility_fields(data)
    if elig_error:
        return JsonResponse({"error": elig_error}, status=400)

    try:
        c = Curriculum.objects.create(
            name=name,
            batch_code=batch_code,
            academic_year=academic_year,
            organization_id=organization_id,
            eligible_rank_class=(data.get("eligible_rank_class") or "").strip(),
            eligible_rank_min=eligibility.get("eligible_rank_min", ""),
            eligible_rank_max=eligibility.get("eligible_rank_max", ""),
            eligible_min_years_in_rank=eligibility.get("eligible_min_years_in_rank"),
            eligible_personnel_type=eligibility.get("eligible_personnel_type", ""),
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

        for field in ("name", "batch_code", "eligible_rank_class"):
            if field in data:
                setattr(c, field, (data[field] or "").strip())
        if "academic_year" in data:
            c.academic_year = data["academic_year"]
        if "quota_total" in data:
            c.quota_total = data["quota_total"] or 0

        eligibility, elig_error = _clean_eligibility_fields(data, existing=c)
        if elig_error:
            return JsonResponse({"error": elig_error}, status=400)
        for k, v in eligibility.items():
            setattr(c, k, v)

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


@require_school_curriculum_read
def api_school_curricula(request):
    """
    GET /military/api/v1/curriculum/school/curricula/?academic_year=
    รายการหลักสูตรของ "โรงเรียนทหารสื่อสาร กรมการทหารสื่อสาร" (org id=161)
    เท่านั้น — read-only สำหรับ org_admin ของหน่วยนี้โดยเฉพาะ (ดู
    military_curriculum/permissions.py) scope ตายตัวที่ org=161 เสมอ
    ไม่พึ่ง organization ของผู้เรียก (ต่างจาก api_curricula ที่ scope ตาม
    หน่วยของผู้เรียกเอง)
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    qs = Curriculum.objects.filter(organization_id=SIGNAL_SCHOOL_ORG_ID)
    academic_year = request.GET.get("academic_year", "").strip()
    if academic_year:
        try:
            qs = qs.filter(academic_year=int(academic_year))
        except ValueError:
            return JsonResponse({"error": "academic_year ต้องเป็นตัวเลข"}, status=400)

    results = [_curriculum_summary(c) for c in qs.select_related("organization").order_by("-academic_year", "name")]
    return JsonResponse({"results": results, "count": len(results)})


@require_school_curriculum_read
def api_school_curriculum_roster(request, curriculum_id: int):
    """
    GET /military/api/v1/curriculum/school/curricula/{id}/roster/
    รายชื่อ + จำนวนนักเรียนที่บรรจุในหลักสูตรนี้แล้ว (ของ รร.ส.สส. เท่านั้น —
    404 ถ้า curriculum_id ไม่ใช่ของหน่วยนี้ กัน org_admin หน่วยอื่นเดา id
    หลักสูตรของหน่วยอื่นมาดู แม้ผ่าน require_school_curriculum_read แล้วก็ตาม)
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        c = Curriculum.objects.get(pk=curriculum_id, organization_id=SIGNAL_SCHOOL_ORG_ID)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    student_ids = list(
        c.enrollment_requests.filter(status__in=["completed", "partial_failed"])
        .values_list("student_id", flat=True)
    )
    students = User.objects.filter(id__in=student_ids).select_related("military_profile")

    results = []
    for s in students:
        p = getattr(s, "military_profile", None)
        results.append({
            "student_id": s.id,
            "full_name": p.display_full_name if p else s.username,
            "rank_display": p.get_rank_display() if p else "",
            "unit": p.unit if p else "",
        })
    results.sort(key=lambda r: r["full_name"])

    return JsonResponse({
        "curriculum_id": c.id,
        "curriculum_name": c.name,
        "batch_code": c.batch_code,
        "academic_year": c.academic_year,
        "results": results,
        "count": len(results),
    })
