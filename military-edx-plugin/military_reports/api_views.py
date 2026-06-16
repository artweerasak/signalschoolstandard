"""
military_reports/api_views.py

JSON API endpoints สำหรับ Next.js frontend
ไม่ต้องใช้ DRF — ใช้ Django JsonResponse ธรรมดา
"""
import json
from datetime import date, timedelta

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from military_profile.models import (
    MilitaryUserProfile, RANK_CHOICES, ARMY_REGION_CHOICES,
    RANK_CLASS_CHOICES, NCO_RANKS, OFFICER_RANKS, CourseRequirement,
)
from military_profile.compliance import get_compliance_status, bulk_compliance_stats
from certificate_expiry.models import UserCertificateExpiry, CourseCertificateConfig

# กำลังพลจริง (ไม่นับ admin / org_admin)
_PERSONNEL_QS = lambda: MilitaryUserProfile.objects.exclude(role__in=("admin", "org_admin"))



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
    CACHE_KEY = "dashboard_summary"
    cached = cache.get(CACHE_KEY)
    if cached:
        return JsonResponse(cached)

    today = date.today()
    soon = today + timedelta(days=30)

    cert_stats = UserCertificateExpiry.objects.aggregate(
        active_count=Count("id", filter=Q(status="active")),
        expired_count=Count("id", filter=Q(status="expired")),
        renewed_count=Count("id", filter=Q(status="renewed")),
        near_expiry_count=Count("id", filter=Q(
            status="active", expiry_date__lte=soon, expiry_date__gte=today
        )),
    )

    data = {
        "total_personnel": MilitaryUserProfile.objects.exclude(
            role__in=("admin", "org_admin")
        ).count(),
        **cert_stats,
    }
    cache.set(CACHE_KEY, data, timeout=300)
    return JsonResponse(data)


@require_GET
@_require_login
def api_dashboard_chart(request):
    """
    GET /military/api/v1/dashboard/chart/
    Returns: ข้อมูล chart แสดงสถานะใบประกาศแต่ละหลักสูตร
    """
    CACHE_KEY = "dashboard_chart"
    cached = cache.get(CACHE_KEY)
    if cached:
        return JsonResponse(cached)

    courses = CourseCertificateConfig.objects.all()
    course_ids = [c.course_id for c in courses]

    stats_qs = (
        UserCertificateExpiry.objects
        .filter(course_id__in=course_ids)
        .values("course_id", "status")
        .annotate(count=Count("id"))
    )
    stats_map: dict[str, dict[str, int]] = {}
    for row in stats_qs:
        stats_map.setdefault(row["course_id"], {})[row["status"]] = row["count"]

    labels, active, expired, renewed = [], [], [], []
    for course in courses:
        short_id = (
            course.course_id.split("+")[-2]
            if "+" in course.course_id
            else course.course_id
        )
        labels.append(short_id)
        cs = stats_map.get(course.course_id, {})
        active.append(cs.get("active", 0))
        expired.append(cs.get("expired", 0))
        renewed.append(cs.get("renewed", 0))

    data = {
        "labels": labels,
        "datasets": {"active": active, "expired": expired, "renewed": renewed},
    }
    cache.set(CACHE_KEY, data, timeout=300)
    return JsonResponse(data)


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
    CACHE_KEY = "rank_stats"
    cached = cache.get(CACHE_KEY)
    if cached:
        return JsonResponse(cached)

    rank_lookup = dict(RANK_CHOICES)
    count_map = {
        row["rank"]: row["count"]
        for row in _PERSONNEL_QS().values("rank").annotate(count=Count("id"))
    }
    stats = [
        {"code": code, "label": label, "count": count_map[code]}
        for code, label in RANK_CHOICES
        if count_map.get(code, 0) > 0
    ]
    data = {"results": stats}
    cache.set(CACHE_KEY, data, timeout=600)
    return JsonResponse(data)


@require_GET
@_require_login
def api_me(request):
    """
    GET /military/api/v1/me/
    Returns: ข้อมูลผู้ใช้ปัจจุบัน (สำหรับ header/nav ของ Next.js)
    Cache per-user 2 นาที — ถูกเรียกทุก page load
    """
    CACHE_KEY = f"api_me_{request.user.id}"
    cached = cache.get(CACHE_KEY)
    if cached:
        return JsonResponse(cached)

    user = request.user
    profile = getattr(user, "military_profile", None)

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
    cache.set(CACHE_KEY, data, timeout=120)
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
        "rank": request.GET.get("rank", "").strip(),
    }


def _apply_profile_filters(queryset, filters: dict):
    """Apply army_region, rank_class, rank, unit filters to MilitaryUserProfile queryset."""
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
    if filters.get("rank"):
        queryset = queryset.filter(rank=filters["rank"])
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
    qs = _apply_profile_filters(_PERSONNEL_QS(), filters)
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
        qs = _PERSONNEL_QS()
        if code:
            qs = qs.filter(army_region=code)
        else:
            qs = qs.filter(army_region="")
        stats = bulk_compliance_stats(qs)
        if stats["total"] > 0:
            results.append({"key": code, "label": label, **stats})
    return JsonResponse(results, safe=False)


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
        qs = _PERSONNEL_QS().filter(rank__in=rank_list)
        if filters.get("army_region"):
            qs = qs.filter(army_region=filters["army_region"])
        stats = bulk_compliance_stats(qs)
        if stats["total"] > 0:
            results.append({"key": code, "label": label, **stats})
    return JsonResponse(results, safe=False)


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
        qs = _PERSONNEL_QS().filter(rank=code)
        qs = _apply_profile_filters(qs, {k: v for k, v in filters.items() if k != "rank_class"})
        stats = bulk_compliance_stats(qs)
        if stats["total"] > 0:
            results.append({"key": code, "label": label, **stats})
    return JsonResponse(results, safe=False)


@require_GET
@_require_admin
def api_compliance_by_unit(request):
    """
    GET /military/api/v1/reports/compliance/by-unit/
    สถิติแยกตามหน่วยต้นสังกัด
    Optional filters: army_region, rank_class
    """
    filters = _parse_filters(request)
    qs = _apply_profile_filters(_PERSONNEL_QS(), filters)
    units = qs.values_list("unit", flat=True).distinct().order_by("unit")

    results = []
    for unit in units:
        unit_qs = qs.filter(unit=unit)
        stats = bulk_compliance_stats(unit_qs)
        if stats["total"] > 0:
            results.append({"key": unit, "label": unit or "ไม่ระบุหน่วย", **stats})

    return JsonResponse(results, safe=False)


@require_GET
@_require_admin
def api_compliance_not_passed(request):
    """
    GET /military/api/v1/reports/compliance/not-passed/
    รายชื่อกำลังพลตามสถานะมาตรฐาน
    Query params:
      passed=true → ผู้ผ่านมาตรฐาน (default: false = ไม่ผ่าน)
      army_region, rank_class, rank, unit, search
      page, per_page
    """
    import math
    filters = _parse_filters(request)
    want_passed = request.GET.get("passed", "false").lower() == "true"
    qs = _apply_profile_filters(_PERSONNEL_QS(), filters)

    search = request.GET.get("search", "").strip()
    if search:
        from django.db.models import Q as _Q
        qs = qs.filter(
            _Q(full_name_th__icontains=search) |
            _Q(unit__icontains=search) |
            _Q(sub_unit__icontains=search)
        )

    # Compute compliance for all matching profiles first, then paginate
    all_results = []
    for profile in qs.select_related("user").order_by("full_name_th"):
        result = get_compliance_status(profile.user)
        is_passed = result["status"] in ("passed", "no_requirements")
        if (want_passed and is_passed) or (not want_passed and not is_passed):
            all_results.append({
                "user_id": profile.user.id,
                "username": profile.user.username,
                "full_name": profile.full_name_th,
                "rank": profile.rank,
                "rank_display": profile.get_rank_display(),
                "rank_class": profile.rank_class,
                "rank_class_display": profile.rank_class_display,
                "unit": profile.unit,
                "sub_unit": profile.sub_unit,
                "army_region": profile.army_region,
                "army_region_display": profile.get_army_region_display(),
                "contact_email": profile.contact_email,
                "phone_number": profile.phone_number,
                "missing_courses": [c["course_name"] for c in result.get("missing", [])],
                "expired_courses": [c["course_name"] for c in result.get("expired", [])],
                "passed_courses": [c["course_name"] for c in result.get("passed", [])],
            })

    total_count = len(all_results)
    page = max(1, int(request.GET.get("page", 1)))
    per_page = min(100, max(10, int(request.GET.get("per_page", 20))))
    total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1
    start = (page - 1) * per_page
    paginated = all_results[start:start + per_page]

    return JsonResponse({
        "results": paginated,
        "count": len(paginated),
        "total_count": total_count,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    })


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
    qs = UserCertificateExpiry.objects.filter(status="expired").select_related("user__military_profile")
    if filters.get("army_region"):
        qs = qs.filter(user__military_profile__army_region=filters["army_region"])
    if filters.get("unit"):
        qs = qs.filter(user__military_profile__unit__icontains=filters["unit"])
    records = qs.order_by("-expiry_date")

    results = []
    for cert in records:
        profile = getattr(cert.user, "military_profile", None)
        if not profile:
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
