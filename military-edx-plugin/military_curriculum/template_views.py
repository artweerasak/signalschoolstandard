"""
military_curriculum/template_views.py

แม่แบบหลักสูตร (CurriculumTemplate) — prep_school "บันทึกเป็นแม่แบบ" จาก
หลักสูตรที่ทำเสร็จแล้ว แล้วปีถัดไป "สร้างจากแม่แบบ" แทนการแอดวิชาใหม่ทั้งหมด
ซ้ำทุกปี ลดภาระงานที่ต่างแค่ชื่อ/รุ่น/ปี/วันที่ แต่วิชาเดิมซ้ำเกือบทั้งหมด

reuse _clean_eligibility_fields/_clean_category_fields จาก curriculum_views.py
ตรงๆ เพราะ field ชื่อ/ชนิดตรงกับ Curriculum เป๊ะ (duck-typing ผ่าน existing param)
"""
import json

from django.db import IntegrityError
from django.db.models import ProtectedError
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from military_profile.permissions import require_role, ROLE_ADMIN, ROLE_PREP_SCHOOL

from .curriculum_views import _clean_eligibility_fields, _clean_category_fields, _clean_curriculum_dates
from .models import (
    Curriculum, CurriculumCourse, CurriculumTemplate, CurriculumTemplateCourse,
    personnel_type_display, prerequisite_categories_display,
)


def _get_template_scoped(request, template_id: int):
    """คืน CurriculumTemplate ถ้า user มีสิทธิ์เข้าถึง (admin ทุกอัน, prep_school
    เฉพาะของหน่วยงานตัวเอง) — pattern เดียวกับ _get_curriculum_scoped"""
    try:
        t = CurriculumTemplate.objects.select_related("organization").get(pk=template_id)
    except CurriculumTemplate.DoesNotExist:
        return None, JsonResponse({"error": "Not found"}, status=404)

    profile = getattr(request.user, "military_profile", None)
    is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if not is_admin and (not profile or t.organization_id != profile.organization_id):
        return None, JsonResponse({"error": "Forbidden"}, status=403)

    return t, None


def _template_summary(t: CurriculumTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "organization_id": t.organization_id,
        "organization_name": t.organization.name if t.organization_id else None,
        "course_count": t.courses.count(),
        "category": t.category,
        "category_display": t.get_category_display() if t.category else None,
        "training_purpose": t.training_purpose,
        "training_purpose_display": t.get_training_purpose_display() if t.training_purpose else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _template_detail(t: CurriculumTemplate) -> dict:
    data = _template_summary(t)
    data["eligible_rank_class"] = t.eligible_rank_class
    data["eligible_rank_min"] = t.eligible_rank_min
    data["eligible_rank_min_display"] = t.get_eligible_rank_min_display() if t.eligible_rank_min else None
    data["eligible_rank_max"] = t.eligible_rank_max
    data["eligible_rank_max_display"] = t.get_eligible_rank_max_display() if t.eligible_rank_max else None
    data["eligible_branch"] = t.eligible_branch
    data["eligible_branch_display"] = t.get_eligible_branch_display() if t.eligible_branch else None
    data["eligible_min_years_in_rank"] = t.eligible_min_years_in_rank
    data["eligible_personnel_type"] = t.eligible_personnel_type
    data["eligible_personnel_type_display"] = personnel_type_display(t.eligible_personnel_type)
    data["eligible_prerequisite_categories"] = t.eligible_prerequisite_categories
    data["eligible_prerequisite_categories_display"] = prerequisite_categories_display(t.eligible_prerequisite_categories)
    data["quota_total"] = t.quota_total
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
        for cc in t.courses.all()
    ]
    return data


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_templates(request):
    """
    GET  /military/api/v1/curriculum/templates/  → list
    POST /military/api/v1/curriculum/templates/  → create (ชื่อเปล่าๆ พอ ไปเพิ่มวิชาทีหลัง)
    """
    if request.method == "GET":
        profile = getattr(request.user, "military_profile", None)
        is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)

        if is_admin:
            org_id = request.GET.get("org_id")
            qs = CurriculumTemplate.objects.filter(organization_id=org_id) if org_id else CurriculumTemplate.objects.all()
        else:
            if not profile or not profile.organization_id:
                return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)
            qs = CurriculumTemplate.objects.filter(organization_id=profile.organization_id)

        results = [_template_summary(t) for t in qs.select_related("organization").order_by("name")]
        return JsonResponse({"results": results, "count": len(results)})

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (data.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "name required"}, status=400)

    organization_id = data.get("organization_id")
    profile = getattr(request.user, "military_profile", None)
    is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if not organization_id:
        # prep_school ที่ไม่ใช่ admin ต้องสร้างในหน่วยงานตัวเองเท่านั้น
        organization_id = profile.organization_id if profile else None

    if not is_admin and profile and organization_id != profile.organization_id:
        return JsonResponse({"error": "สร้างแม่แบบได้เฉพาะหน่วยงานตัวเองเท่านั้น"}, status=403)

    if not organization_id:
        return JsonResponse({"error": "organization_id required"}, status=400)

    eligibility, elig_error = _clean_eligibility_fields(data)
    if elig_error:
        return JsonResponse({"error": elig_error}, status=400)
    category_fields, category_error = _clean_category_fields(data)
    if category_error:
        return JsonResponse({"error": category_error}, status=400)

    t = CurriculumTemplate.objects.create(
        name=name,
        organization_id=organization_id,
        eligible_rank_class=eligibility.get("eligible_rank_class", []),
        eligible_rank_min=eligibility.get("eligible_rank_min", ""),
        eligible_rank_max=eligibility.get("eligible_rank_max", ""),
        eligible_branch=eligibility.get("eligible_branch", ""),
        eligible_min_years_in_rank=eligibility.get("eligible_min_years_in_rank"),
        eligible_personnel_type=eligibility.get("eligible_personnel_type", []),
        category=category_fields.get("category", ""),
        training_purpose=category_fields.get("training_purpose", ""),
        eligible_prerequisite_categories=category_fields.get("eligible_prerequisite_categories", []),
        quota_total=data.get("quota_total") or 0,
        created_by=request.user,
    )
    return JsonResponse(_template_detail(t), status=201)


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_template_detail(request, template_id: int):
    """
    GET    /military/api/v1/curriculum/templates/{id}/  → detail
    PATCH  /military/api/v1/curriculum/templates/{id}/  → แก้ไข
    DELETE /military/api/v1/curriculum/templates/{id}/  → ลบ
    """
    t, err = _get_template_scoped(request, template_id)
    if err:
        return err

    if request.method == "GET":
        return JsonResponse(_template_detail(t))

    if request.method == "DELETE":
        t.delete()
        return JsonResponse({"deleted": True})

    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        if "name" in data:
            name = (data["name"] or "").strip()
            if not name:
                return JsonResponse({"error": "name ต้องไม่ว่าง"}, status=400)
            t.name = name

        if "quota_total" in data:
            t.quota_total = data["quota_total"] or 0

        eligibility, elig_error = _clean_eligibility_fields(data, existing=t)
        if elig_error:
            return JsonResponse({"error": elig_error}, status=400)
        for k, v in eligibility.items():
            setattr(t, k, v)

        category_fields, category_error = _clean_category_fields(data, existing=t)
        if category_error:
            return JsonResponse({"error": category_error}, status=400)
        for k, v in category_fields.items():
            setattr(t, k, v)

        t.save()
        return JsonResponse(_template_detail(t))

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_template_courses(request, template_id: int):
    """POST /military/api/v1/curriculum/templates/{id}/courses/  → เพิ่มวิชาเข้าแม่แบบ
    (mirror api_curriculum_courses ใน curriculum_views.py)"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    t, err = _get_template_scoped(request, template_id)
    if err:
        return err

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
        cc = CurriculumTemplateCourse.objects.create(
            template=t,
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
        return JsonResponse({"error": "วิชานี้อยู่ในแม่แบบแล้ว"}, status=409)

    return JsonResponse({"id": cc.id, "course_id": cc.course_id, "display_name": cc.display_name}, status=201)


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_template_course_detail(request, template_id: int, course_pk: int):
    """DELETE /military/api/v1/curriculum/templates/{id}/courses/{course_pk}/  → ลบวิชาออกจากแม่แบบ"""
    if request.method != "DELETE":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    t, err = _get_template_scoped(request, template_id)
    if err:
        return err

    try:
        cc = t.courses.get(pk=course_pk)
    except CurriculumTemplateCourse.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)
    cc.delete()
    return JsonResponse({"deleted": True})


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curriculum_save_as_template(request, curriculum_id: int):
    """POST /military/api/v1/curriculum/curricula/{id}/save-as-template/  body: {"name": "..."}
    Snapshot เกณฑ์คุณสมบัติ+โคลนวิชาทั้งหมดของหลักสูตรนี้ลงแม่แบบใหม่"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    from .curriculum_views import _get_curriculum_scoped
    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (data.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "name required"}, status=400)

    if not c.courses.exists():
        return JsonResponse({"error": "หลักสูตรนี้ยังไม่มีวิชา — เพิ่มวิชาก่อนบันทึกเป็นแม่แบบ"}, status=400)

    t = CurriculumTemplate.objects.create(
        name=name,
        organization_id=c.organization_id,
        eligible_rank_class=c.eligible_rank_class,
        eligible_rank_min=c.eligible_rank_min,
        eligible_rank_max=c.eligible_rank_max,
        eligible_branch=c.eligible_branch,
        eligible_min_years_in_rank=c.eligible_min_years_in_rank,
        eligible_personnel_type=c.eligible_personnel_type,
        category=c.category,
        training_purpose=c.training_purpose,
        eligible_prerequisite_categories=c.eligible_prerequisite_categories,
        quota_total=c.quota_total,
        created_by=request.user,
    )
    CurriculumTemplateCourse.objects.bulk_create([
        CurriculumTemplateCourse(
            template=t,
            course_id=cc.course_id,
            display_name=cc.display_name,
            sequence_order=cc.sequence_order,
            credit_hours=cc.credit_hours,
            credits=cc.credits,
            assessment_type=cc.assessment_type,
            passing_score=cc.passing_score,
            is_required=cc.is_required,
        )
        for cc in c.courses.all()
    ])
    return JsonResponse(_template_detail(t), status=201)


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_template_create_curriculum(request, template_id: int):
    """POST /military/api/v1/curriculum/templates/{id}/create-curriculum/
    body: {"name","batch_code","academic_year","start_date?","end_date?"}
    สร้างหลักสูตรร่างใหม่ คัดลอกเกณฑ์คุณสมบัติ+โคลนวิชาทั้งหมดจากแม่แบบ"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    t, err = _get_template_scoped(request, template_id)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (data.get("name") or "").strip()
    batch_code = (data.get("batch_code") or "").strip()
    academic_year = data.get("academic_year")
    if not name or not batch_code or not academic_year:
        return JsonResponse({"error": "name, batch_code, academic_year required"}, status=400)

    dates, date_error = _clean_curriculum_dates(data)
    if date_error:
        return JsonResponse({"error": date_error}, status=400)

    try:
        c = Curriculum.objects.create(
            name=name,
            batch_code=batch_code,
            academic_year=academic_year,
            start_date=dates.get("start_date"),
            end_date=dates.get("end_date"),
            organization_id=t.organization_id,
            eligible_rank_class=t.eligible_rank_class,
            eligible_rank_min=t.eligible_rank_min,
            eligible_rank_max=t.eligible_rank_max,
            eligible_branch=t.eligible_branch,
            eligible_min_years_in_rank=t.eligible_min_years_in_rank,
            eligible_personnel_type=t.eligible_personnel_type,
            category=t.category,
            training_purpose=t.training_purpose,
            eligible_prerequisite_categories=t.eligible_prerequisite_categories,
            quota_total=t.quota_total,
            created_by=request.user,
        )
    except IntegrityError:
        return JsonResponse({"error": "มีหลักสูตรชื่อ/รุ่น/ปีนี้อยู่แล้ว"}, status=409)

    CurriculumCourse.objects.bulk_create([
        CurriculumCourse(
            curriculum=c,
            course_id=cc.course_id,
            display_name=cc.display_name,
            sequence_order=cc.sequence_order,
            credit_hours=cc.credit_hours,
            credits=cc.credits,
            assessment_type=cc.assessment_type,
            passing_score=cc.passing_score,
            is_required=cc.is_required,
        )
        for cc in t.courses.all()
    ])

    from .curriculum_views import _curriculum_detail
    return JsonResponse(_curriculum_detail(c), status=201)
