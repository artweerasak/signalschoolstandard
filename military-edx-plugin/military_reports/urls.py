"""
military_reports/urls.py
"""
from django.urls import path
from .views import ReportSearchView, DashboardView
from .api_views import (
    api_dashboard_summary,
    api_dashboard_chart,
    api_expiring_soon,
    api_rank_stats,
    api_me,
    # Compliance reports
    api_compliance_overview,
    api_compliance_by_region,
    api_compliance_by_rank_class,
    api_compliance_by_rank,
    api_compliance_by_unit,
    api_compliance_not_passed,
    # Certificate alerts
    api_certificates_expiring,
    api_certificates_expired,
    # Course requirements CRUD
    api_course_requirements,
    api_course_requirement_detail,
)

app_name = "military_reports"

urlpatterns = [
    # HTML views (Django templates)
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reports/", ReportSearchView.as_view(), name="search"),

    # JSON API — สำหรับ Next.js frontend
    path("api/v1/me/", api_me, name="api_me"),
    path("api/v1/dashboard/summary/", api_dashboard_summary, name="api_dashboard_summary"),
    path("api/v1/dashboard/chart/", api_dashboard_chart, name="api_dashboard_chart"),
    path("api/v1/dashboard/expiring-soon/", api_expiring_soon, name="api_expiring_soon"),
    path("api/v1/dashboard/rank-stats/", api_rank_stats, name="api_rank_stats"),

    # Compliance reports
    path("api/v1/reports/compliance/overview/", api_compliance_overview, name="api_compliance_overview"),
    path("api/v1/reports/compliance/by-region/", api_compliance_by_region, name="api_compliance_by_region"),
    path("api/v1/reports/compliance/by-rank-class/", api_compliance_by_rank_class, name="api_compliance_by_rank_class"),
    path("api/v1/reports/compliance/by-rank/", api_compliance_by_rank, name="api_compliance_by_rank"),
    path("api/v1/reports/compliance/by-unit/", api_compliance_by_unit, name="api_compliance_by_unit"),
    path("api/v1/reports/compliance/not-passed/", api_compliance_not_passed, name="api_compliance_not_passed"),

    # Certificate alerts
    path("api/v1/reports/certificates/expiring/", api_certificates_expiring, name="api_certificates_expiring"),
    path("api/v1/reports/certificates/expired/", api_certificates_expired, name="api_certificates_expired"),

    # Course requirements admin CRUD
    path("api/v1/admin/course-requirements/", api_course_requirements, name="api_course_requirements"),
    path("api/v1/admin/course-requirements/<int:req_id>/", api_course_requirement_detail, name="api_course_requirement_detail"),
]
