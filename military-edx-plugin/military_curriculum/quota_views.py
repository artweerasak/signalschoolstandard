"""
military_curriculum/quota_views.py

Quota/Demand Report + Cascade Enrollment (prep_personnel) — Sprint 2

prep_personnel มองเห็นได้ทุกหน่วยงาน (ไม่ org-scope เหมือน prep_school
เพราะเป็นหน่วยงานกลาง/กพ. ที่ต้องบรรจุกำลังพลข้ามหน่วย) — ต่างจาก
curriculum_views.py ที่ prep_school เห็นเฉพาะหน่วยตัวเอง

⚠️ api_curriculum_enroll เป็น endpoint ที่เขียนเข้า production enrollment
จริง (ผ่าน CourseEnrollment) — มี dry_run mode ให้ preview ก่อน execute จริง
ตามคำแนะนำ risk mitigation ในแผน
"""
import json
from datetime import date

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

from military_profile.permissions import require_role, ROLE_ADMIN, ROLE_PREP_PERSONNEL

from .models import Curriculum, CurriculumEnrollmentRequest, CurriculumOrgQuota, ranks_in_range
from .services.enrollment_service import (
    cascade_enroll_student,
    preview_cascade_enroll,
    retry_failed_courses,
)

User = get_user_model()

# จำนวนคำขอต่อครั้งที่ยังรัน sync ได้ในเวลา HTTP request ปกติ — เกินกว่านี้
# dispatch เป็น Celery task ต่อคนแทน กัน request timeout (ดู
# military_curriculum/tasks.py:cascade_enroll_student_task)
SYNC_ENROLL_THRESHOLD = 30


@csrf_exempt
@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_curricula_submitted(request):
    """GET /military/api/v1/curriculum/curricula/submitted/
    รายการหลักสูตรที่ prep_school ส่งมาแล้ว (status=submitted) หรือที่
    บรรจุอยู่แล้ว (status=active) — กรองด้วย ?status= ได้"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    status = request.GET.get("status")
    qs = Curriculum.objects.filter(status=status) if status else Curriculum.objects.filter(
        status__in=["submitted", "active"]
    )
    results = [
        {
            "id": c.id,
            "name": c.name,
            "batch_code": c.batch_code,
            "academic_year": c.academic_year,
            "organization_name": c.organization.name if c.organization_id else None,
            "status": c.status,
            "quota_total": c.quota_total,
            # จำนวนที่บรรจุไปแล้ว (นับทุกคำขอ ไม่ว่าผลจะสำเร็จครบ/บางส่วน — ถือว่า
            # "อยู่ในระบบแล้ว") ให้เห็นชัดจากหน้ารายการเลย ไม่ต้องเข้าไปดูในหน้า
            # โควตาก่อนถึงจะรู้ ตามที่ผู้ใช้รายงานว่าไม่ชัดเจน
            "enrolled_count": c.enrollment_requests.count(),
            "course_count": c.courses.count(),
            "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
        }
        for c in qs.select_related("organization").order_by("-submitted_at")
    ]
    return JsonResponse({"results": results, "count": len(results)})


@csrf_exempt
@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_curriculum_activate(request, curriculum_id: int):
    """POST /military/api/v1/curriculum/curricula/{id}/activate/  → submitted → active"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        c = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if c.status != "submitted":
        return JsonResponse({"error": "เปิดใช้งานได้เฉพาะหลักสูตรที่ส่งมาแล้วเท่านั้น"}, status=409)

    c.status = "active"
    c.save(update_fields=["status"])
    return JsonResponse({"id": c.id, "status": c.status})


@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_quota_demand_report(request):
    """GET /military/api/v1/curriculum/reports/quota-demand/?curriculum_id=&army_region=

    เปรียบเทียบโควตาที่ตั้งไว้ (CurriculumRegionQuota) กับยอดขอจริง (จำนวน
    CurriculumEnrollmentRequest ต่อหลักสูตร แบ่งตาม effective_army_region
    ของนักเรียนที่ขอมา)"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    curriculum_id = request.GET.get("curriculum_id")
    if not curriculum_id:
        return JsonResponse({"error": "curriculum_id required"}, status=400)

    try:
        c = Curriculum.objects.prefetch_related("region_quotas").get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    region_filter = request.GET.get("army_region")

    # นับยอดขอจริงต่อภูมิภาค จาก effective_army_region ของนักเรียนที่ถูกขอ
    # บรรจุแล้ว (ทุกสถานะ ไม่ใช่แค่ completed เพราะ "ขอ" แล้วนับเป็นความ
    # ต้องการ ไม่ว่าผลจะสำเร็จหรือไม่)
    requested_by_region: dict[str, int] = {}
    filled_by_region: dict[str, int] = {}
    for req in c.enrollment_requests.select_related("student__military_profile__organization"):
        profile = getattr(req.student, "military_profile", None)
        region = profile.effective_army_region if profile else "ไม่ระบุ"
        region = region or "ไม่ระบุ"
        requested_by_region[region] = requested_by_region.get(region, 0) + 1
        if req.status == "completed":
            filled_by_region[region] = filled_by_region.get(region, 0) + 1

    region_rows = []
    for rq in c.region_quotas.all():
        if region_filter and rq.army_region != region_filter:
            continue
        region_rows.append({
            "army_region": rq.army_region,
            "quota": rq.quota,
            "requested": requested_by_region.get(rq.army_region, 0),
            "filled": filled_by_region.get(rq.army_region, 0),
        })

    national_requested = sum(requested_by_region.values())
    national_filled = sum(filled_by_region.values())

    return JsonResponse({
        "curriculum_id": c.id,
        "curriculum_name": c.name,
        "national_quota": c.quota_total,
        "national_requested": national_requested,
        "national_filled": national_filled,
        "region_quotas": region_rows,
    })


@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_eligible_density_report(request):
    """
    GET /military/api/v1/curriculum/reports/eligible-density/?curriculum_id=

    ความคับคั่งของผู้ "มีสิทธิ์" เข้าเรียนหลักสูตรนี้ แยกตามหน่วย — ใช้
    ประกอบการตัดสินใจ*ก่อน*แบ่งโควตาให้แต่ละหน่วย (คนละรายงานกับ
    api_quota_demand_report ซึ่งดูยอดขอ/บรรจุ*หลังจาก*ตัดสินใจแบ่งโควตาไปแล้ว)

    นับกำลังพลที่ยศอยู่ในช่วง eligible_rank_min–eligible_rank_max และ
    personnel_type ตรงกับ eligible_personnel_type ของหลักสูตร (ว่าง =
    ไม่จำกัดด้านนั้น) ถ้าหลักสูตรกำหนด eligible_min_years_in_rank ด้วย จะ
    เทียบกับ rank_effective_date ของแต่ละคน — คนที่ยศ/ประเภทตรงเกณฑ์แต่ไม่มี
    rank_effective_date ให้ตรวจสอบระยะเวลาครองยศไม่ได้ จะถูกนับแยกเป็น
    needs_verification_count (ไม่นับเป็นทั้งเข้าเกณฑ์และไม่เข้าเกณฑ์) เพื่อให้
    หน่วยตามไปเก็บข้อมูลกำลังพลของตัวเองให้ครบ (ดู EditRankSection ที่กำลังพล
    กรอกเองได้ใน /my/profile)
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    curriculum_id = request.GET.get("curriculum_id")
    if not curriculum_id:
        return JsonResponse({"error": "curriculum_id required"}, status=400)

    try:
        c = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    from military_profile.models import ARMY_REGION_CHOICES, MilitaryUserProfile

    qs = MilitaryUserProfile.objects.exclude(role__in=("admin", "org_admin")).select_related("organization")

    if c.eligible_personnel_type:
        qs = qs.filter(personnel_type=c.eligible_personnel_type)

    if c.eligible_rank_min or c.eligible_rank_max:
        qs = qs.filter(rank__in=ranks_in_range(c.eligible_rank_min, c.eligible_rank_max))

    region_filter = request.GET.get("army_region", "").strip()
    if region_filter:
        if region_filter in ("none", "unspecified"):
            qs = qs.filter(Q(organization__isnull=True) | Q(organization__army_region=""))
        else:
            qs = qs.filter(
                Q(organization__army_region=region_filter)
                | (Q(organization__isnull=True) & Q(army_region=region_filter))
            )

    today = date.today()
    min_years = c.eligible_min_years_in_rank
    region_labels = dict(ARMY_REGION_CHOICES)

    per_org: dict = {}
    for p in qs:
        region = p.effective_army_region or ""
        bucket = per_org.setdefault(p.organization_id, {
            "organization_id": p.organization_id,
            "organization_name": p.organization.name if p.organization_id else "ไม่ระบุหน่วย",
            "army_region": region,
            "army_region_display": region_labels.get(region) or "ไม่ระบุ",
            "eligible_count": 0,
            "needs_verification_count": 0,
            "total_in_scope": 0,
        })
        bucket["total_in_scope"] += 1

        if min_years is not None:
            if not p.rank_effective_date:
                bucket["needs_verification_count"] += 1
                continue
            years_in_rank = (today - p.rank_effective_date).days / 365.25
            if years_in_rank < min_years:
                continue

        bucket["eligible_count"] += 1

    rows = sorted(per_org.values(), key=lambda r: -r["eligible_count"])

    return JsonResponse({
        "curriculum_id": c.id,
        "curriculum_name": c.name,
        "eligible_rank_min": c.eligible_rank_min,
        "eligible_rank_min_display": c.get_eligible_rank_min_display() if c.eligible_rank_min else None,
        "eligible_rank_max": c.eligible_rank_max,
        "eligible_rank_max_display": c.get_eligible_rank_max_display() if c.eligible_rank_max else None,
        "eligible_min_years_in_rank": c.eligible_min_years_in_rank,
        "eligible_personnel_type": c.eligible_personnel_type,
        "eligible_personnel_type_display": c.get_eligible_personnel_type_display() if c.eligible_personnel_type else None,
        "national": {
            "eligible_count": sum(r["eligible_count"] for r in rows),
            "needs_verification_count": sum(r["needs_verification_count"] for r in rows),
            "total_in_scope": sum(r["total_in_scope"] for r in rows),
        },
        "results": rows,
    })


@csrf_exempt
@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_curriculum_org_quotas(request, curriculum_id: int):
    """
    GET  /military/api/v1/curriculum/curricula/{id}/org-quotas/
    POST /military/api/v1/curriculum/curricula/{id}/org-quotas/  {"organization_id": 1, "quota": 5}

    โควตาแยกตามหน่วยงานจริง (เช่น กรมการทหารสื่อสาร 5 นาย, รร.ส.สส. 2 นาย,
    ส.1 2 นาย) — ต่างจาก CurriculumRegionQuota เดิมที่ตั้งได้แค่ตอนสร้าง
    หลักสูตรและไม่มี UI แก้ไขเลย endpoint นี้แก้ไขได้ตลอดอายุหลักสูตร (upsert
    ทีละหน่วยผ่าน POST) — ดู military_curriculum/models.py:CurriculumOrgQuota
    """
    try:
        c = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if request.method == "GET":
        requested_by_org: dict = {}
        filled_by_org: dict = {}
        for req in c.enrollment_requests.select_related("student__military_profile"):
            profile = getattr(req.student, "military_profile", None)
            org_id = profile.organization_id if profile else None
            requested_by_org[org_id] = requested_by_org.get(org_id, 0) + 1
            if req.status == "completed":
                filled_by_org[org_id] = filled_by_org.get(org_id, 0) + 1

        rows = [
            {
                "organization_id": oq.organization_id,
                "organization_name": oq.organization.name,
                "quota": oq.quota,
                "requested": requested_by_org.get(oq.organization_id, 0),
                "filled": filled_by_org.get(oq.organization_id, 0),
            }
            for oq in c.org_quotas.select_related("organization").order_by("organization__name")
        ]
        return JsonResponse({
            "curriculum_id": c.id,
            "curriculum_name": c.name,
            "national_quota": c.quota_total,
            "national_requested": sum(requested_by_org.values()),
            "national_filled": sum(filled_by_org.values()),
            "org_quotas": rows,
        })

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    organization_id = data.get("organization_id")
    if not organization_id:
        return JsonResponse({"error": "organization_id required"}, status=400)
    try:
        quota = int(data.get("quota", 0))
    except (TypeError, ValueError):
        return JsonResponse({"error": "quota ต้องเป็นตัวเลข"}, status=400)
    if quota < 0:
        return JsonResponse({"error": "quota ต้องไม่ติดลบ"}, status=400)

    from military_profile.models import Organization
    try:
        org = Organization.objects.get(pk=organization_id)
    except Organization.DoesNotExist:
        return JsonResponse({"error": "ไม่พบหน่วยงานนี้"}, status=404)

    oq, _ = CurriculumOrgQuota.objects.update_or_create(
        curriculum=c, organization=org, defaults={"quota": quota},
    )
    return JsonResponse({"organization_id": org.id, "organization_name": org.name, "quota": oq.quota})


@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_curriculum_personnel_search(request):
    """
    GET /military/api/v1/curriculum/personnel-search/?q=&organization_id=&army_region=&page=&page_size=

    ค้นหากำลังพลข้ามหน่วยทั้งหมด (ชื่อหรือหน่วย) — ใช้ในหน้าบรรจุกำลังพลของ
    prep_personnel เพื่อเลือกคนแบบค้นหา+multi-select แทนพิมพ์ user_id เอง
    ต่างจาก api_admin_users (military_profile) ที่ org_admin ถูกบังคับเห็นแค่
    หน่วยตัวเอง เพราะ prep_personnel ต้องเห็นข้ามหน่วยเสมอ (เหมือน
    api_quota_demand_report/api_eligible_density_report)

    organization_id = กรองเฉพาะหน่วยนั้นแบบเป๊ะๆ (ต่างจาก army_region ที่กรอง
    ทั้งทัพภาค) — เรียกโดยไม่ส่ง q เลยได้ เพื่อดูรายชื่อทั้งหน่วยมาเลือกทีละ
    หลายคน แก้ปัญหาค้นหาชื่อไม่เจอเพราะสมัครพิมพ์ชื่อ-นามสกุลไม่ตรงกัน (เว้น
    วรรค/ไม่ใส่นามสกุล) — เลือกดูเป็นหน่วยแทนแม่นยำกว่า
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    from military_profile.models import MilitaryUserProfile

    qs = MilitaryUserProfile.objects.exclude(role__in=("admin", "org_admin")).select_related("organization")

    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(full_name_th__icontains=q) | Q(unit__icontains=q))

    organization_id = request.GET.get("organization_id", "").strip()
    if organization_id:
        try:
            qs = qs.filter(organization_id=int(organization_id))
        except ValueError:
            return JsonResponse({"error": "organization_id ต้องเป็นตัวเลข"}, status=400)

    region = request.GET.get("army_region", "").strip()
    if region:
        if region in ("none", "unspecified"):
            qs = qs.filter(Q(organization__isnull=True) | Q(organization__army_region=""))
        else:
            qs = qs.filter(
                Q(organization__army_region=region)
                | (Q(organization__isnull=True) & Q(army_region=region))
            )

    try:
        page = max(1, int(request.GET.get("page", 1)))
        page_size = min(100, int(request.GET.get("page_size", 20)))
    except (ValueError, TypeError):
        page, page_size = 1, 20

    qs = qs.order_by("full_name_th")
    total = qs.count()
    start = (page - 1) * page_size
    results = [
        {
            "id": p.user_id,
            "full_name": p.display_full_name,
            "rank_display": p.get_rank_display(),
            "unit": p.unit,
            "organization_id": p.organization_id,
            "organization_name": p.organization.name if p.organization_id else None,
        }
        for p in qs[start:start + page_size]
    ]

    return JsonResponse({"count": total, "page": page, "page_size": page_size, "results": results})


@csrf_exempt
@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_curriculum_enroll(request, curriculum_id: int):
    """POST /military/api/v1/curriculum/curricula/{id}/enroll/
    {"student_ids": [1,2,3], "dry_run": false}

    dry_run=true: preview ผลลัพธ์ต่อคนต่อวิชาโดยไม่เขียนอะไรลง DB เลย (ไม่
    สร้าง CurriculumEnrollmentRequest, ไม่ enroll จริง) — ให้ตรวจสอบก่อน
    execute จริงครั้งแรกตามคำแนะนำ risk mitigation

    dry_run=false (ปกติ): สร้าง CurriculumEnrollmentRequest ต่อคน (ถ้ายังไม่
    มี — idempotent ผ่าน unique_together) แล้ว enroll จริง — sync ถ้าจำนวน
    ไม่เกิน SYNC_ENROLL_THRESHOLD ไม่งั้น dispatch เป็น Celery task ต่อคน
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        c = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if c.status != "active":
        return JsonResponse({"error": "บรรจุนักเรียนได้เฉพาะหลักสูตรที่เปิดใช้งาน (active) เท่านั้น"}, status=409)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    student_ids = data.get("student_ids") or []
    if not isinstance(student_ids, list) or not student_ids:
        return JsonResponse({"error": "student_ids (list) required"}, status=400)

    dry_run = bool(data.get("dry_run", False))
    students = list(User.objects.filter(id__in=student_ids))
    found_ids = {s.id for s in students}
    missing_ids = [sid for sid in student_ids if sid not in found_ids]

    if dry_run:
        preview = []
        for student in students:
            course_results = preview_cascade_enroll(c, student)
            preview.append({
                "student_id": student.id,
                "would_succeed": all(r.success for r in course_results),
                "courses": [
                    {"course_id": r.course_id, "would_enroll": r.success, "error": r.error}
                    for r in course_results
                ],
            })
        return JsonResponse({"dry_run": True, "preview": preview, "missing_student_ids": missing_ids})

    # ปกติ (execute จริง) — สร้าง/ดึง CurriculumEnrollmentRequest ต่อคนก่อน
    created_requests = []
    for student in students:
        req, _ = CurriculumEnrollmentRequest.objects.get_or_create(
            curriculum=c, student=student,
            defaults={"requested_by": request.user},
        )
        created_requests.append(req)

    if len(created_requests) <= SYNC_ENROLL_THRESHOLD:
        for req in created_requests:
            cascade_enroll_student(req)
        mode = "sync"
    else:
        from .tasks import cascade_enroll_student_task
        for req in created_requests:
            cascade_enroll_student_task.delay(req.id)
        mode = "async"

    return JsonResponse({
        "mode": mode,
        "enrollment_request_ids": [r.id for r in created_requests],
        "missing_student_ids": missing_ids,
    }, status=201)


@csrf_exempt
@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_catch_up_enrollment(request, curriculum_id: int):
    """POST /military/api/v1/curriculum/curricula/{id}/catch-up-enrollment/

    "ตามให้ครบ" — เมื่อ prep_school เพิ่มวิชาใหม่เข้าหลักสูตรที่บรรจุคนไป
    บางส่วนแล้ว (submitted/active) คนที่บรรจุไปก่อนหน้านี้จะไม่ถูก enroll
    วิชาใหม่อัตโนมัติ (cascade_enroll_student รันแค่ตอนบรรจุครั้งแรกต่อคน)
    endpoint นี้ re-run cascade_enroll_student ให้ทุก CurriculumEnrollmentRequest
    ที่เคยบรรจุไปแล้ว (completed/partial_failed) ของหลักสูตรนี้อีกครั้ง —
    ปลอดภัยเพราะ _enroll_single_course idempotent ต่อวิชาที่ enroll อยู่แล้ว
    (แค่ยืนยันซ้ำ ไม่ enroll ซ้ำ) จะ enroll จริงเฉพาะวิชาที่เพิ่งเพิ่มเท่านั้น

    เป็น action ที่ต้องกดเอง (ไม่ auto-trigger ตอนเพิ่มวิชา) ตามหลัก risk
    mitigation เดียวกับ api_curriculum_enroll — เขียนเข้า production
    enrollment จริง ไม่ควรมี side effect แบบเงียบๆ
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        c = Curriculum.objects.get(pk=curriculum_id)
    except Curriculum.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    requests_to_process = list(
        CurriculumEnrollmentRequest.objects.filter(
            curriculum=c, status__in=["completed", "partial_failed"],
        )
    )
    if not requests_to_process:
        return JsonResponse({"mode": "sync", "affected_count": 0})

    if len(requests_to_process) <= SYNC_ENROLL_THRESHOLD:
        for req in requests_to_process:
            cascade_enroll_student(req)
        mode = "sync"
    else:
        from .tasks import cascade_enroll_student_task
        for req in requests_to_process:
            cascade_enroll_student_task.delay(req.id)
        mode = "async"

    return JsonResponse({"mode": mode, "affected_count": len(requests_to_process)})


@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_enrollment_request_detail(request, request_id: int):
    """GET /military/api/v1/curriculum/enrollment-requests/{id}/"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        req = CurriculumEnrollmentRequest.objects.select_related("student", "curriculum").get(pk=request_id)
    except CurriculumEnrollmentRequest.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    return JsonResponse({
        "id": req.id,
        "curriculum_id": req.curriculum_id,
        "curriculum_name": req.curriculum.name,
        "student_id": req.student_id,
        "student_username": req.student.username,
        "status": req.status,
        "result_detail": req.result_detail,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "processed_at": req.processed_at.isoformat() if req.processed_at else None,
    })


@csrf_exempt
@require_role([ROLE_PREP_PERSONNEL, ROLE_ADMIN])
def api_enrollment_request_retry(request, request_id: int):
    """POST /military/api/v1/curriculum/enrollment-requests/{id}/retry/
    retry เฉพาะวิชาที่ failed ในคำขอนี้ (ไม่แตะวิชาที่สำเร็จแล้ว)"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        req = CurriculumEnrollmentRequest.objects.get(pk=request_id)
    except CurriculumEnrollmentRequest.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if req.status not in ("partial_failed", "failed"):
        return JsonResponse({"error": "retry ได้เฉพาะคำขอที่มีวิชาล้มเหลวเท่านั้น"}, status=409)

    retry_failed_courses(req)
    req.refresh_from_db()
    return JsonResponse({"id": req.id, "status": req.status, "result_detail": req.result_detail})
