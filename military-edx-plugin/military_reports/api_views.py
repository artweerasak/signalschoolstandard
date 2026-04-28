"""
military_reports/api_views.py

JSON API endpoints สำหรับ Next.js frontend
ไม่ต้องใช้ DRF — ใช้ Django JsonResponse ธรรมดา
"""
import json
from datetime import date, timedelta

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from military_profile.models import (
    MilitaryUserProfile, RANK_CHOICES, ARMY_REGION_CHOICES,
    RANK_CLASS_CHOICES, NCO_RANKS, OFFICER_RANKS, CourseRequirement,
)
from military_profile.compliance import get_compliance_status, bulk_compliance_stats
from certificate_expiry.models import UserCertificateExpiry, CourseCertificateConfig


def _require_login(view_func):
    """Decorator: return 401 JSON แทน redirect เมื่อยังไม่ login"""
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


def _require_admin(view_func):
    """Decorator: admin only (is_staff or role=admin)"""
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        profile = getattr(request.user, "military_profile", None)
        is_admin = request.user.is_staff or (profile and profile.role == "admin")
        if not is_admin:
            return JsonResponse({"error": "Forbidden"}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


@require_GET
@_require_login
def api_dashboard_summary(request):
    """
    GET /military/api/v1/dashboard/summary/
    Returns: stats counts สำหรับ summary cards บน dashboard
    """
    today = date.today()
    soon = today + timedelta(days=30)

    all_certs = UserCertificateExpiry.objects.all()

    data = {
        "total_personnel": MilitaryUserProfile.objects.count(),
        "active_count": all_certs.filter(status="active").count(),
        "expired_count": all_certs.filter(status="expired").count(),
        "renewed_count": all_certs.filter(status="renewed").count(),
        "near_expiry_count": all_certs.filter(
            status="active", expiry_date__lte=soon, expiry_date__gte=today
        ).count(),
    }
    return JsonResponse(data)


@require_GET
@_require_login
def api_dashboard_chart(request):
    """
    GET /military/api/v1/dashboard/chart/
    Returns: ข้อมูล chart แสดงสถานะใบประกาศแต่ละหลักสูตร
    """
    all_certs = UserCertificateExpiry.objects.all()
    courses = CourseCertificateConfig.objects.all()

    labels = []
    active = []
    expired = []
    renewed = []

    for course in courses:
        short_id = (
            course.course_id.split("+")[-2]
            if "+" in course.course_id
            else course.course_id
        )
        labels.append(short_id)
        certs = all_certs.filter(course_id=course.course_id)
        active.append(certs.filter(status="active").count())
        expired.append(certs.filter(status="expired").count())
        renewed.append(certs.filter(status="renewed").count())

    return JsonResponse({
        "labels": labels,
        "datasets": {
            "active": active,
            "expired": expired,
            "renewed": renewed,
        },
    })


@require_GET
@_require_login
def api_expiring_soon(request):
    """
    GET /military/api/v1/dashboard/expiring-soon/
    Returns: รายชื่อผู้ที่ใบประกาศหมดอายุใน 30 วัน
    """
    today = date.today()
    soon = today + timedelta(days=30)

    records = (
        UserCertificateExpiry.objects
        .filter(status="active", expiry_date__lte=soon, expiry_date__gte=today)
        .select_related("user__military_profile")
        .order_by("expiry_date")[:50]
    )

    data = []
    for cert in records:
        profile = getattr(cert.user, "military_profile", None)
        data.append({
            "user_id": cert.user.id,
            "full_name": profile.full_name_th if profile else cert.user.username,
            "rank": profile.get_rank_display() if profile else "-",
            "unit": profile.unit if profile else "-",
            "course_id": cert.course_id,
            "expiry_date": cert.expiry_date.isoformat(),
            "days_left": (cert.expiry_date - today).days,
        })

    return JsonResponse({"results": data, "count": len(data)})


@require_GET
@_require_login
def api_rank_stats(request):
    """
    GET /military/api/v1/dashboard/rank-stats/
    Returns: จำนวนบุคลากรแยกตามชั้นยศ
    """
    rank_lookup = dict(RANK_CHOICES)
    stats = []
    for code, label in RANK_CHOICES:
        count = MilitaryUserProfile.objects.filter(rank=code).count()
        if count:
            stats.append({"code": code, "label": label, "count": count})

    return JsonResponse({"results": stats})


@require_GET
@_require_login
def api_me(request):
    """
    GET /military/api/v1/me/
    Returns: ข้อมูลผู้ใช้ปัจจุบัน (สำหรับ header/nav ของ Next.js)
    """
    user = request.user
    profile = getattr(user, "military_profile", None)

    # Determine effective role
    if user.is_staff:
        role = "admin"
    elif profile and profile.role == "instructor":
        role = "instructor"
    else:
        role = profile.role if profile else "student"

    data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_staff": user.is_staff,
        "role": role,
        "full_name": profile.full_name_th if profile else user.get_full_name() or user.username,
        "rank": profile.get_rank_display() if profile else None,
        "unit": profile.unit if profile else None,
    }
    return JsonResponse(data)


# ===========================================================================
# Compliance Report Endpoints
# ===========================================================================

def _parse_filters(request):
    """Extract common filter params from GET request."""
    return {
        "army_region": request.GET.get("army_region", "").strip(),
        "rank_class": request.GET.get("rank_class", "").strip(),
        "unit": request.GET.get("unit", "").strip(),
    }


def _apply_profile_filters(queryset, filters: dict):
    """Apply army_region, rank_class, unit filters to MilitaryUserProfile queryset."""
    if filters.get("army_region"):
        queryset = queryset.filter(army_region=filters["army_region"])
    if filters.get("rank_class"):
        rc = filters["rank_class"]
        if rc == "nco":
            queryset = queryset.filter(rank__in=list(NCO_RANKS))
        elif rc == "officer":
            queryset = queryset.filter(rank__in=list(OFFICER_RANKS))
        elif rc == "pvt":
            queryset = queryset.filter(rank="PVT")
    if filters.get("unit"):
        queryset = queryset.filter(unit__icontains=filters["unit"])
    return queryset


@require_GET
@_require_admin
def api_compliance_overview(request):
    """
    GET /military/api/v1/reports/compliance/overview/
    ภาพรวมสถานะผ่าน/ไม่ผ่านมาตรฐานทั้งระบบ
    """
    filters = _parse_filters(request)
    qs = _apply_profile_filters(MilitaryUserProfile.objects.all(), filters)
    stats = bulk_compliance_stats(qs)
    return JsonResponse(stats)


@require_GET
@_require_admin
def api_compliance_by_region(request):
    """
    GET /military/api/v1/reports/compliance/by-region/
    สถิติแยกตามกองทัพภาค
    """
    results = []
    for code, label in ARMY_REGION_CHOICES:
        qs = MilitaryUserProfile.objects.all()
        if code:
            qs = qs.filter(army_region=code)
        else:
            qs = qs.filter(army_region="")
        stats = bulk_compliance_stats(qs)
        results.append({
            "army_region": code,
            "army_region_label": label,
            **stats,
        })
    return JsonResponse({"results": results})


@require_GET
@_require_admin
def api_compliance_by_rank_class(request):
    """
    GET /military/api/v1/reports/compliance/by-rank-class/
    สถิติแยกตามระดับชั้น (ประทวน / สัญญาบัตร / พลทหาร)
    """
    filters = _parse_filters(request)
    groups = [
        ("nco", "นายทหารประทวน", list(NCO_RANKS)),
        ("officer", "นายทหารสัญญาบัตร", list(OFFICER_RANKS)),
        ("pvt", "พลทหาร", ["PVT"]),
    ]
    results = []
    for code, label, rank_list in groups:
        qs = MilitaryUserProfile.objects.filter(rank__in=rank_list)
        if filters.get("army_region"):
            qs = qs.filter(army_region=filters["army_region"])
        stats = bulk_compliance_stats(qs)
        results.append({"rank_class": code, "rank_class_label": label, **stats})
    return JsonResponse({"results": results})


@require_GET
@_require_admin
def api_compliance_by_rank(request):
    """
    GET /military/api/v1/reports/compliance/by-rank/
    สถิติแยกตามชั้นยศ
    """
    filters = _parse_filters(request)
    results = []
    for code, label in RANK_CHOICES:
        qs = MilitaryUserProfile.objects.filter(rank=code)
        qs = _apply_profile_filters(qs, {k: v for k, v in filters.items() if k != "rank_class"})
        stats = bulk_compliance_stats(qs)
        if stats["total"] > 0:
            results.append({"rank": code, "rank_label": label, **stats})
    return JsonResponse({"results": results})


@require_GET
@_require_admin
def api_compliance_by_unit(request):
    """
    GET /military/api/v1/reports/compliance/by-unit/
    สถิติแยกตามหน่วยต้นสังกัด
    Optional filters: army_region, rank_class
    """
    filters = _parse_filters(request)
    qs = _apply_profile_filters(MilitaryUserProfile.objects.all(), filters)
    units = qs.values_list("unit", flat=True).distinct().order_by("unit")

    results = []
    for unit in units:
        unit_qs = qs.filter(unit=unit)
        stats = bulk_compliance_stats(unit_qs)
        results.append({"unit": unit, **stats})

    return JsonResponse({"results": results})


@require_GET
@_require_admin
def api_compliance_not_passed(request):
    """
    GET /military/api/v1/reports/compliance/not-passed/
    รายชื่อกำลังพลที่ยังไม่ผ่านมาตรฐาน
    Optional filters: army_region, rank_class, unit
    สำหรับ admin ทำหนังสือติดตาม
    """
    filters = _parse_filters(request)
    qs = _apply_profile_filters(MilitaryUserProfile.objects.all(), filters)
    page = int(request.GET.get("page", 1))
    per_page = int(request.GET.get("per_page", 50))
    offset = (page - 1) * per_page

    not_passed = []
    for profile in qs.select_related("user")[offset:offset + per_page + 50]:
        result = get_compliance_status(profile.user)
        if result["status"] == "not_passed":
            not_passed.append({
                "user_id": profile.user.id,
                "full_name": profile.full_name_th,
                "rank": profile.get_rank_display(),
                "rank_class": profile.rank_class_display,
                "unit": profile.unit,
                "sub_unit": profile.sub_unit,
                "army_region": profile.get_army_region_display(),
                "contact_email": profile.contact_email,
                "phone_number": profile.phone_number,
                "missing_courses": result["missing"],
                "expired_courses": result["expired"],
            })
        if len(not_passed) >= per_page:
            break

    return JsonResponse({"results": not_passed, "count": len(not_passed), "page": page})


@require_GET
@_require_admin
def api_certificates_expiring(request):
    """
    GET /military/api/v1/reports/certificates/expiring/?days=30
    ใบประกาศที่ใกล้หมดอายุ
    """
    days = int(request.GET.get("days", 30))
    today = date.today()
    soon = today + timedelta(days=days)

    records = (
        UserCertificateExpiry.objects
        .filter(status="active", expiry_date__lte=soon, expiry_date__gte=today)
        .select_related("user__military_profile")
        .order_by("expiry_date")
    )

    results = []
    for cert in records:
        profile = getattr(cert.user, "military_profile", None)
        results.append({
            "user_id": cert.user.id,
            "full_name": profile.full_name_th if profile else cert.user.username,
            "rank": profile.get_rank_display() if profile else "-",
            "unit": profile.unit if profile else "-",
            "army_region": profile.get_army_region_display() if profile else "-",
            "course_id": cert.course_id,
            "expiry_date": cert.expiry_date.isoformat(),
            "days_left": cert.days_until_expiry,
        })

    return JsonResponse({"results": results, "count": len(results), "days_threshold": days})


@require_GET
@_require_admin
def api_certificates_expired(request):
    """
    GET /military/api/v1/reports/certificates/expired/
    ใบประกาศที่หมดอายุแล้ว
    """
    filters = _parse_filters(request)
    records = (
        UserCertificateExpiry.objects
        .filter(status="expired")
        .select_related("user__military_profile")
        .order_by("-expiry_date")
    )

    results = []
    for cert in records:
        profile = getattr(cert.user, "military_profile", None)
        if not profile:
            continue
        # Apply filters
        if filters.get("army_region") and profile.army_region != filters["army_region"]:
            continue
        if filters.get("unit") and filters["unit"].lower() not in profile.unit.lower():
            continue
        results.append({
            "user_id": cert.user.id,
            "full_name": profile.full_name_th,
            "rank": profile.get_rank_display(),
            "unit": profile.unit,
            "army_region": profile.get_army_region_display(),
            "course_id": cert.course_id,
            "expiry_date": cert.expiry_date.isoformat(),
            "days_overdue": -cert.days_until_expiry,
        })

    return JsonResponse({"results": results, "count": len(results)})


# ===========================================================================
# Course Requirements CRUD (Admin)
# ===========================================================================

@csrf_exempt
@_require_admin
def api_course_requirements(request):
    """
    GET    /military/api/v1/admin/course-requirements/  → list all
    POST   /military/api/v1/admin/course-requirements/  → create
    """
    if request.method == "GET":
        reqs = CourseRequirement.objects.all().values(
            "id", "rank_class", "course_id", "course_name", "is_active", "created_at"
        )
        rank_class_map = dict(RANK_CLASS_CHOICES)
        results = []
        for r in reqs:
            results.append({
                **r,
                "rank_class_label": rank_class_map.get(r["rank_class"], r["rank_class"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return JsonResponse({"results": results, "count": len(results)})

    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        rank_class = data.get("rank_class", "").strip()
        course_id = data.get("course_id", "").strip()
        course_name = data.get("course_name", "").strip()

        if not rank_class or not course_id or not course_name:
            return JsonResponse({"error": "rank_class, course_id, course_name required"}, status=400)

        valid_classes = [c[0] for c in RANK_CLASS_CHOICES]
        if rank_class not in valid_classes:
            return JsonResponse({"error": f"rank_class must be one of {valid_classes}"}, status=400)

        req, created = CourseRequirement.objects.get_or_create(
            rank_class=rank_class,
            course_id=course_id,
            defaults={"course_name": course_name, "is_active": data.get("is_active", True)},
        )
        if not created:
            return JsonResponse({"error": "Requirement already exists", "id": req.id}, status=409)

        return JsonResponse({"id": req.id, "rank_class": req.rank_class, "course_id": req.course_id, "course_name": req.course_name}, status=201)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@_require_admin
def api_course_requirement_detail(request, req_id: int):
    """
    PATCH  /military/api/v1/admin/course-requirements/{id}/  → update
    DELETE /military/api/v1/admin/course-requirements/{id}/  → delete
    """
    try:
        req = CourseRequirement.objects.get(pk=req_id)
    except CourseRequirement.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        if "course_name" in data:
            req.course_name = data["course_name"]
        if "is_active" in data:
            req.is_active = bool(data["is_active"])
        req.save()
        return JsonResponse({"id": req.id, "course_name": req.course_name, "is_active": req.is_active})

    if request.method == "DELETE":
        req.delete()
        return JsonResponse({"deleted": True})

    return JsonResponse({"error": "Method not allowed"}, status=405)
