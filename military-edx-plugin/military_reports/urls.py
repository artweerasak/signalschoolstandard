"""
military_reports/urls.py
"""
from django.urls import path
from .views import ReportSearchView, DashboardView

app_name = "military_reports"

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reports/", ReportSearchView.as_view(), name="search"),
]
