"""
military_curriculum/curriculum_views.py

Curriculum CRUD (prep_school) — สร้าง/แก้ไขกรอบหลักสูตรประจำปี/รุ่น และวิชา
ย่อยภายใน ก่อนส่งต่อให้ prep_personnel บรรจุกำลังพล (ดู quota_views.py)

Sprint 1 เท่านั้น — ยังไม่มี cascade enrollment (Sprint 2), grading (Sprint 3),
evaluation gatekeeper (Sprint 4), transcript (Sprint 5)
"""
import json
from datetime import date

from django.db import IntegrityError
from django.db.models import ProtectedError
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

from django.contrib.auth import get_user_model

from military_profile.permissions import require_role, ROLE_ADMIN, ROLE_PREP_SCHOOL, _require_login
from military_profile.models import PERSONNEL_TYPE_CHOICES

from .models import (
    Curriculum, CurriculumCourse, CurriculumRegionQuota, RANK_ORDER,
    CURRICULUM_CATEGORY_CODES, LegacyCurriculumCompletion,
    TRAINING_PURPOSE_CODES, ELIGIBLE_BRANCH_CODES,
    personnel_type_display, prerequisite_categories_display,
)
from .permissions import require_school_curriculum_read, SIGNAL_SCHOOL_ORG_ID

User = get_user_model()


def _parse_date(value):
    """Parse 'YYYY-MM-DD' (หรือ date object) เป็น datetime.date — คืน None
    ถ้าว่าง/parse ไม่ได้ (ตาม pattern เดียวกับ military_profile.api_views._parse_date
    แต่แยกไฟล์เพื่อไม่ต้อง import ข้าม api_views.py ที่หนักและมี edx-platform
    lazy import ปนอยู่)"""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip())
    except (ValueError, TypeError):
        return None


def _clean_curriculum_dates(data: dict, existing: Curriculum | None = None) -> tuple:
    """เตรียม+ตรวจสอบ start_date/end_date จาก request body — คืน (updates,
    error) เหมือน _clean_eligibility_fields (รองรับทั้ง create ที่ส่งครบ และ
    PATCH ที่ส่งบางส่วน — เทียบกับค่าเดิมถ้า PATCH ส่งมาแค่ด้านเดียว)"""
    updates: dict = {}

    if "start_date" in data:
        updates["start_date"] = _parse_date(data["start_date"])
    if "end_date" in data:
        updates["end_date"] = _parse_date(data["end_date"])

    start = updates.get("start_date", existing.start_date if existing else None)
    end = updates.get("end_date", existing.end_date if existing else None)
    if start and end and start > end:
        return {}, "วันเริ่มหลักสูตรต้องไม่หลังวันจบหลักสูตร"

    return updates, None


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
        raw = data["eligible_personnel_type"]
        if raw in (None, ""):
            updates["eligible_personnel_type"] = []
        elif isinstance(raw, list):
            invalid = [v for v in raw if v not in dict(PERSONNEL_TYPE_CHOICES)]
            if invalid:
                return {}, f"eligible_personnel_type มีค่าไม่ถูกต้อง: {', '.join(invalid)}"
            updates["eligible_personnel_type"] = list(dict.fromkeys(raw))  # de-dup, คง order
        else:
            return {}, "eligible_personnel_type ต้องเป็น list"

    if "eligible_branch" in data:
        v = (data["eligible_branch"] or "").strip()
        if v and v not in ELIGIBLE_BRANCH_CODES:
            return {}, "eligible_branch ไม่ถูกต้อง"
        updates["eligible_branch"] = v

    if "eligible_rank_class" in data:
        raw = data["eligible_rank_class"]
        if raw in (None, ""):
            updates["eligible_rank_class"] = []
        elif isinstance(raw, list):
            items = [str(item).strip() for item in raw if str(item).strip()]
            updates["eligible_rank_class"] = items
        else:
            return {}, "eligible_rank_class ต้องเป็น list"

    return updates, None


def _clean_category_fields(data: dict, existing: Curriculum | None = None) -> tuple:
    """เตรียม+ตรวจสอบ category (สำหรับจับคู่ prerequisite), training_purpose
    (ประเภทหลักสูตรของแผนกเตรียมการ — คนละเรื่องกับ category) และ
    eligible_prerequisite_categories (ต้องผ่านหลักสูตรประเภทไหนมาก่อน กี่ปี) —
    คืน (updates, error) แบบเดียวกับ _clean_eligibility_fields"""
    updates: dict = {}

    if "category" in data:
        v = (data["category"] or "").strip()
        if v and v not in CURRICULUM_CATEGORY_CODES:
            return {}, "category ไม่ถูกต้อง"
        updates["category"] = v

    if "training_purpose" in data:
        v = (data["training_purpose"] or "").strip()
        if v and v not in TRAINING_PURPOSE_CODES:
            return {}, "training_purpose ไม่ถูกต้อง"
        updates["training_purpose"] = v

    if "eligible_prerequisite_categories" in data:
        raw = data["eligible_prerequisite_categories"]
        if raw in (None, ""):
            updates["eligible_prerequisite_categories"] = []
        elif isinstance(raw, list):
            cleaned = []
            seen = set()
            for item in raw:
                if not isinstance(item, dict):
                    return {}, "eligible_prerequisite_categories แต่ละรายการต้องเป็น object"
                category = (item.get("category") or "").strip()
                if category not in CURRICULUM_CATEGORY_CODES:
                    return {}, f"eligible_prerequisite_categories มีค่าไม่ถูกต้อง: {category}"
                min_years_since = item.get("min_years_since")
                if min_years_since not in (None, ""):
                    try:
                        min_years_since = int(min_years_since)
                    except (TypeError, ValueError):
                        return {}, "min_years_since ต้องเป็นตัวเลข"
                    if min_years_since < 0:
                        return {}, "min_years_since ต้องไม่ติดลบ"
                else:
                    min_years_since = None
                if category in seen:  # de-dup ตาม category, คง order
                    continue
                seen.add(category)
                cleaned.append({"category": category, "min_years_since": min_years_since})
            updates["eligible_prerequisite_categories"] = cleaned
        else:
            return {}, "eligible_prerequisite_categories ต้องเป็น list"

    return updates, None


def _curriculum_summary(c: Curriculum) -> dict:
    """แปลง Curriculum เป็น dict สำหรับ list view (ไม่รวมวิชาย่อย — ดู detail)"""
    return {
        "id": c.id,
        "name": c.name,
        "batch_code": c.batch_code,
        "academic_year": c.academic_year,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "organization_id": c.organization_id,
        "organization_name": c.organization.name if c.organization_id else None,
        "status": c.status,
        "quota_total": c.quota_total,
        "category": c.category,
        "category_display": c.get_category_display() if c.category else None,
        "training_purpose": c.training_purpose,
        "training_purpose_display": c.get_training_purpose_display() if c.training_purpose else None,
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
    data["eligible_branch"] = c.eligible_branch
    data["eligible_branch_display"] = c.get_eligible_branch_display() if c.eligible_branch else None
    data["eligible_personnel_type"] = c.eligible_personnel_type
    data["eligible_personnel_type_display"] = personnel_type_display(c.eligible_personnel_type)
    data["category"] = c.category
    data["category_display"] = c.get_category_display() if c.category else None
    data["eligible_prerequisite_categories"] = c.eligible_prerequisite_categories
    data["eligible_prerequisite_categories_display"] = prerequisite_categories_display(c.eligible_prerequisite_categories)
    data["region_quotas"] = [
        {"id": q.id, "army_region": q.army_region, "quota": q.quota}
        for q in c.region_quotas.all()
    ]
    data["courses"] = []
    for cc in c.courses.prefetch_related("instructors__user__military_profile").all():
        owner = next((i for i in cc.instructors.all() if i.is_owner), None)
        owner_profile = getattr(owner.user, "military_profile", None) if owner else None
        data["courses"].append({
            "id": cc.id,
            "course_id": cc.course_id,
            "display_name": cc.display_name,
            "sequence_order": cc.sequence_order,
            "credit_hours": str(cc.credit_hours),
            "credits": str(cc.credits),
            "assessment_type": cc.assessment_type,
            "passing_score": str(cc.passing_score) if cc.passing_score is not None else None,
            "is_required": cc.is_required,
            "owner_user_id": owner.user_id if owner else None,
            "owner_name": owner_profile.full_name_th if owner_profile else (owner.user.username if owner else None),
        })
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

        academic_year_filter = request.GET.get("academic_year", "").strip()
        if academic_year_filter:
            try:
                qs = qs.filter(academic_year=int(academic_year_filter))
            except ValueError:
                return JsonResponse({"error": "academic_year ต้องเป็นตัวเลข"}, status=400)

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

    dates, date_error = _clean_curriculum_dates(data)
    if date_error:
        return JsonResponse({"error": date_error}, status=400)

    category_fields, category_error = _clean_category_fields(data)
    if category_error:
        return JsonResponse({"error": category_error}, status=400)

    try:
        c = Curriculum.objects.create(
            name=name,
            batch_code=batch_code,
            academic_year=academic_year,
            start_date=dates.get("start_date"),
            end_date=dates.get("end_date"),
            organization_id=organization_id,
            eligible_rank_class=eligibility.get("eligible_rank_class", []),
            eligible_rank_min=eligibility.get("eligible_rank_min", ""),
            eligible_rank_max=eligibility.get("eligible_rank_max", ""),
            eligible_min_years_in_rank=eligibility.get("eligible_min_years_in_rank"),
            eligible_branch=eligibility.get("eligible_branch", ""),
            eligible_personnel_type=eligibility.get("eligible_personnel_type", []),
            category=category_fields.get("category", ""),
            training_purpose=category_fields.get("training_purpose", ""),
            eligible_prerequisite_categories=category_fields.get("eligible_prerequisite_categories", []),
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
    GET    /military/api/v1/curriculum/curricula/{id}/  → detail
    PATCH  /military/api/v1/curriculum/curricula/{id}/  → แก้ไข
    DELETE /military/api/v1/curriculum/curricula/{id}/  → ลบ (เฉพาะ status=draft)

    PATCH แบ่งเป็น 2 กลุ่ม:
    - metadata ล้วน (name/batch_code/academic_year/start_date/end_date) —
      แก้ได้ทุกสถานะ ไม่กระทบตรรกะอื่น (แก้ให้ตามที่ผู้ใช้รายงานว่าพิมพ์ผิด
      แล้วแก้ไม่ได้เลยแม้จะส่งไปแล้ว)
    - เกณฑ์คุณสมบัติ/ประเภทหลักสูตร/โควตา (eligible_*, category,
      eligible_prerequisite_categories, quota_total) — แก้ได้เฉพาะ draft
      เท่านั้นเหมือนเดิม เพราะกระทบการกรอง/รายงานที่อาจมีคนอ้างอิงไปแล้วหลัง
      ส่งหลักสูตร (submitted/active)
    """
    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err

    if request.method == "GET":
        return JsonResponse(_curriculum_detail(c))

    if request.method == "DELETE":
        if c.status != "draft":
            return JsonResponse({"error": "ลบได้เฉพาะหลักสูตรสถานะร่างเท่านั้น"}, status=409)
        try:
            c.delete()
        except ProtectedError:
            return JsonResponse({"error": "ลบไม่ได้ เพราะมีข้อมูลการบรรจุกำลังพลผูกอยู่แล้ว"}, status=409)
        return JsonResponse({"deleted": True})

    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        RESTRICTED_FIELDS = (
            "eligible_rank_class", "eligible_rank_min", "eligible_rank_max",
            "eligible_min_years_in_rank", "eligible_branch", "eligible_personnel_type",
            "category", "training_purpose", "eligible_prerequisite_categories", "quota_total",
        )
        if c.status != "draft" and any(f in data for f in RESTRICTED_FIELDS):
            return JsonResponse(
                {"error": "แก้ไขเกณฑ์คุณสมบัติ/ประเภทหลักสูตร/โควตาได้เฉพาะหลักสูตรสถานะร่างเท่านั้น (ชื่อ/รุ่น/ปี/ระยะเวลาแก้ได้ทุกสถานะ)"},
                status=409,
            )

        for field in ("name", "batch_code"):
            if field in data:
                setattr(c, field, (data[field] or "").strip())
        if "academic_year" in data:
            c.academic_year = data["academic_year"]

        dates, date_error = _clean_curriculum_dates(data, existing=c)
        if date_error:
            return JsonResponse({"error": date_error}, status=400)
        for k, v in dates.items():
            setattr(c, k, v)

        if c.status == "draft":
            if "quota_total" in data:
                c.quota_total = data["quota_total"] or 0

            eligibility, elig_error = _clean_eligibility_fields(data, existing=c)
            if elig_error:
                return JsonResponse({"error": elig_error}, status=400)
            for k, v in eligibility.items():
                setattr(c, k, v)

            category_fields, category_error = _clean_category_fields(data, existing=c)
            if category_error:
                return JsonResponse({"error": category_error}, status=400)
            for k, v in category_fields.items():
                setattr(c, k, v)

        c.save()
        return JsonResponse(_curriculum_detail(c))

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curriculum_courses(request, curriculum_id: int):
    """POST /military/api/v1/curriculum/curricula/{id}/courses/  → เพิ่มวิชา

    เพิ่มได้ตราบใดที่หลักสูตรยังไม่ปิดรุ่น (draft/submitted/active) — ต่างจาก
    การลบวิชา (api_curriculum_course_detail) ที่ยังล็อกเฉพาะ draft เท่านั้น
    เพราะลบวิชาที่มีคนบรรจุ/enroll ไปแล้วเสี่ยงข้อมูลเสียหายมากกว่าเพิ่ม

    ⚠️ ถ้าเพิ่มวิชาหลังจากมีคนบรรจุ (submitted/active) ไปแล้ว คนที่บรรจุไป
    ก่อนหน้านี้จะ**ไม่ถูก enroll วิชาใหม่อัตโนมัติ** — ต้องให้ prep_personnel
    กดปุ่ม "ตามให้ครบ" (api_catch_up_enrollment ใน quota_views.py) เพื่อ
    enroll คนที่บรรจุไปแล้วเข้าวิชาใหม่นี้ด้วย"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err
    if c.status == "closed":
        return JsonResponse({"error": "เพิ่มวิชาไม่ได้ เพราะหลักสูตรนี้ปิดรุ่นแล้ว"}, status=409)

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
def api_curriculum_course_instructor(request, curriculum_id: int, course_pk: int):
    """
    POST   /military/api/v1/curriculum/curricula/{id}/courses/{course_pk}/instructor/  {"user_id"}
    DELETE /military/api/v1/curriculum/curricula/{id}/courses/{course_pk}/instructor/

    มอบหมาย/ถอด "เจ้าของวิชา" (is_owner=True ใน CurriculumCourseInstructor)
    — เดิมไม่มีช่องทางนี้เลยในแอปพลิเคชัน (มีแค่ api_co_instructors ที่ต้อง
    เป็น owner อยู่แล้วถึงจะเพิ่มคนอื่นได้ = ไก่กับไข่ ไม่มีใครเป็น owner
    คนแรกได้เลยนอกจากเข้า Django admin โดยตรง) ทำให้อาจารย์ที่ควรสอนวิชานั้น
    มองไม่เห็นวิชา/รายชื่อนักเรียนใน /instructor เลยแม้แต่น้อย เพราะ
    api_my_courses กรองจาก CurriculumCourseInstructor เท่านั้น — endpoint
    นี้ให้ prep_school (ผู้สร้างหลักสูตร ทราบว่าใครสอนวิชาไหน) มอบหมายได้เอง
    ไม่ต้องพึ่ง Django admin

    ตั้ง owner ใหม่ = แทนที่ owner เดิม (ถ้ามี) เสมอ มีได้แค่ 1 คนต่อวิชา —
    จะเพิ่มผู้ช่วยสอนคนอื่นได้ต้องให้ owner เพิ่มเองผ่าน api_co_instructors
    อีกที (สงวนสิทธิ์นั้นไว้กับ owner ตามเดิม ไม่เปลี่ยน)

    ⚠️ ผู้ใช้ที่จะมอบหมายต้องมี role="instructor" อยู่แล้วในระบบ ไม่งั้น
    endpoint ฝั่ง /instructor/* อื่นๆ ทั้งหมด (require_role ROLE_INSTRUCTOR)
    จะยังบล็อกเขาอยู่ดีแม้จะมี CurriculumCourseInstructor row แล้วก็ตาม
    """
    from military_profile.permissions import ROLE_INSTRUCTOR
    from .models import CurriculumCourseInstructor
    from .services.grading_service import sync_course_access_role

    c, err = _get_curriculum_scoped(request, curriculum_id)
    if err:
        return err
    if c.status == "closed":
        return JsonResponse({"error": "แก้ไขผู้สอนไม่ได้ เพราะหลักสูตรนี้ปิดรุ่นแล้ว"}, status=409)

    try:
        cc = c.courses.get(pk=course_pk)
    except CurriculumCourse.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    existing_owner = cc.instructors.filter(is_owner=True).first()

    if request.method == "DELETE":
        if existing_owner:
            sync_course_access_role(cc.course_id, existing_owner.user, add=False)
            existing_owner.delete()
        return JsonResponse({"deleted": True})

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    user_id = data.get("user_id")
    try:
        target_user = User.objects.get(pk=user_id)
    except (User.DoesNotExist, TypeError, ValueError):
        return JsonResponse({"error": "ไม่พบผู้ใช้นี้"}, status=404)

    target_profile = getattr(target_user, "military_profile", None)
    if not target_profile or target_profile.role != ROLE_INSTRUCTOR:
        return JsonResponse({"error": "มอบหมายได้เฉพาะผู้ใช้ที่มีสิทธิ์ role ครูอาจารย์ (instructor) เท่านั้น"}, status=400)

    if existing_owner and existing_owner.user_id != target_user.id:
        sync_course_access_role(cc.course_id, existing_owner.user, add=False)
        existing_owner.delete()
    elif existing_owner and existing_owner.user_id == target_user.id:
        return JsonResponse({
            "user_id": target_user.id,
            "username": target_user.username,
            "full_name": target_profile.full_name_th if target_profile else target_user.username,
        })

    CurriculumCourseInstructor.objects.create(
        curriculum_course=cc, user=target_user, is_owner=True, added_by=request.user,
    )
    sync_course_access_role(cc.course_id, target_user, add=True)
    return JsonResponse({
        "user_id": target_user.id,
        "username": target_user.username,
        "full_name": target_profile.full_name_th if target_profile else target_user.username,
    }, status=201)


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


@csrf_exempt
@require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
def api_curriculum_bulk_submit(request):
    """POST /military/api/v1/curriculum/curricula/bulk-submit/  → {"ids": [1,2,3]}
    ส่งหลายหลักสูตรพร้อมกัน — เกณฑ์เดียวกับ api_curriculum_submit ทีละ id
    (draft-only + ต้องมีอย่างน้อย 1 วิชา) แต่ล้มเหลวบาง id ไม่ทำให้ id อื่น
    ที่ผ่านเกณฑ์ถูกยกเลิกไปด้วย (partial success) — คืนผลลัพธ์แยกราย id"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    ids = data.get("ids")
    if not isinstance(ids, list) or not ids:
        return JsonResponse({"error": "ids ต้องเป็น list ที่ไม่ว่าง"}, status=400)

    from django.utils import timezone

    submitted, failed = [], []
    for curriculum_id in ids:
        c, err = _get_curriculum_scoped(request, curriculum_id)
        if err:
            failed.append({"id": curriculum_id, "error": "ไม่พบ หรือไม่มีสิทธิ์เข้าถึง"})
            continue
        if c.status != "draft":
            failed.append({"id": curriculum_id, "error": "ส่งได้เฉพาะหลักสูตรสถานะร่างเท่านั้น"})
            continue
        if not c.courses.exists():
            failed.append({"id": curriculum_id, "error": "ต้องมีอย่างน้อย 1 วิชาก่อนส่ง"})
            continue
        c.status = "submitted"
        c.submitted_at = timezone.now()
        c.save(update_fields=["status", "submitted_at"])
        submitted.append(curriculum_id)

    return JsonResponse({"submitted": submitted, "failed": failed})


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


@csrf_exempt
@_require_login
def api_my_legacy_curriculum_completions(request):
    """
    GET    /military/api/v1/curriculum/my/legacy-completions/
    POST   /military/api/v1/curriculum/my/legacy-completions/  {"category": "nco_basic", "note": "..."}
    DELETE /military/api/v1/curriculum/my/legacy-completions/?category=nco_basic

    กำลังพลกรอกเองได้ว่าเคยผ่านหลักสูตรประเภทไหนมาก่อนที่ระบบนี้จะมีข้อมูล
    (เช่น จบนายสิบชั้นต้นมาหลายปีก่อนระบบจะเกิด) มีผลทันทีไม่ต้องรออนุมัติ —
    หลักการเดียวกับ rank/rank_effective_date self-edit ใน
    military_profile.api_views.api_my_profile_complete (v1, ไม่มี approval
    gate เพราะ org_admin ยังไม่ถูกแบ่งมอบหน้าที่ชัดเจนในหลายหน่วย) ใช้กัน
    ไม่ให้คนที่มีสิทธิ์จริงถูกตัดออกจากการค้นหา/รายงานที่มีเงื่อนไข
    eligible_prerequisite_categories เพียงเพราะไม่มีข้อมูลอิเล็กทรอนิกส์
    ย้อนหลัง (ดู models.py:has_completed_curriculum_category)
    """
    if request.method == "GET":
        rows = [
            {
                "category": r.category,
                "category_display": r.get_category_display(),
                "note": r.note,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in LegacyCurriculumCompletion.objects.filter(student=request.user).order_by("category")
        ]
        return JsonResponse({"results": rows, "count": len(rows)})

    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        category = (data.get("category") or "").strip()
        if not category or category not in CURRICULUM_CATEGORY_CODES:
            return JsonResponse({"error": "category ไม่ถูกต้อง"}, status=400)

        note = (data.get("note") or "").strip()
        obj, _ = LegacyCurriculumCompletion.objects.update_or_create(
            student=request.user, category=category,
            defaults={"note": note, "recorded_by": request.user},
        )
        return JsonResponse({
            "category": obj.category,
            "category_display": obj.get_category_display(),
            "note": obj.note,
        }, status=201)

    if request.method == "DELETE":
        category = (request.GET.get("category") or "").strip()
        if not category:
            return JsonResponse({"error": "category required"}, status=400)
        deleted, _ = LegacyCurriculumCompletion.objects.filter(
            student=request.user, category=category,
        ).delete()
        return JsonResponse({"deleted": bool(deleted)})

    return JsonResponse({"error": "Method not allowed"}, status=405)
