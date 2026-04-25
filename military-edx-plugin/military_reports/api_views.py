"""
military_reports/api_views.py

JSON API endpoints สำหรับ Next.js frontend
ไม่ต้องใช้ DRF — ใช้ Django JsonResponse ธรรมดา
"""
import json
from datetime import date, timedelta

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from military_profile.models import MilitaryUserProfile, RANK_CHOICES
from certificate_expiry.models import UserCertificateExpiry, CourseCertificateConfig


def _require_login(view_func):
    """Decorator: return 401 JSON แทน redirect เมื่อยังไม่ login"""
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Unauthorized"}, status=401)
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
