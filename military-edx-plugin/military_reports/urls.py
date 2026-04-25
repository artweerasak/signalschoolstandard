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
)

app_name = "military_reports"

urlpatterns = [
    # HTML views (Django templates)
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reports/", ReportSearchView.as_view(), name="search"),

    # JSON API endpoints — สำหรับ Next.js frontend
    path("api/v1/me/", api_me, name="api_me"),
    path("api/v1/dashboard/summary/", api_dashboard_summary, name="api_dashboard_summary"),
    path("api/v1/dashboard/chart/", api_dashboard_chart, name="api_dashboard_chart"),
    path("api/v1/dashboard/expiring-soon/", api_expiring_soon, name="api_expiring_soon"),
    path("api/v1/dashboard/rank-stats/", api_rank_stats, name="api_rank_stats"),
]
