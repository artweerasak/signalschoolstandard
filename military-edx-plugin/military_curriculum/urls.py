"""
military_curriculum/urls.py

ทุก endpoint ใต้ /military/api/v1/curriculum/... (mount ผ่าน plugin_urls.py
ที่ include("military_curriculum.urls") เหมือน apps อื่น)
"""
from django.urls import path

from .curriculum_views import (
    api_curricula,
    api_curriculum_detail,
    api_curriculum_courses,
    api_curriculum_course_detail,
    api_curriculum_submit,
)
from .quota_views import (
    api_curricula_submitted,
    api_curriculum_activate,
    api_quota_demand_report,
    api_curriculum_enroll,
    api_enrollment_request_detail,
    api_enrollment_request_retry,
)

app_name = "military_curriculum"

urlpatterns = [
    # Curriculum CRUD (prep_school) — Sprint 1
    # หมายเหตุ: "submitted/" ต้องมาก่อน "<int:curriculum_id>/" ไม่งั้น Django
    # จะพยายาม match "submitted" เป็น int ก่อนแล้ว 404
    path("api/v1/curriculum/curricula/submitted/", api_curricula_submitted, name="api_curricula_submitted"),
    path("api/v1/curriculum/curricula/", api_curricula, name="api_curricula"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/", api_curriculum_detail, name="api_curriculum_detail"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/courses/", api_curriculum_courses, name="api_curriculum_courses"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/courses/<int:course_pk>/", api_curriculum_course_detail, name="api_curriculum_course_detail"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/submit/", api_curriculum_submit, name="api_curriculum_submit"),

    # Quota/Demand Report + Cascade Enrollment (prep_personnel) — Sprint 2
    path("api/v1/curriculum/curricula/<int:curriculum_id>/activate/", api_curriculum_activate, name="api_curriculum_activate"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/enroll/", api_curriculum_enroll, name="api_curriculum_enroll"),
    path("api/v1/curriculum/reports/quota-demand/", api_quota_demand_report, name="api_quota_demand_report"),
    path("api/v1/curriculum/enrollment-requests/<int:request_id>/", api_enrollment_request_detail, name="api_enrollment_request_detail"),
    path("api/v1/curriculum/enrollment-requests/<int:request_id>/retry/", api_enrollment_request_retry, name="api_enrollment_request_retry"),
]
