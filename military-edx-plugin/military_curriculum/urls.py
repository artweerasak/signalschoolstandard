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

app_name = "military_curriculum"

urlpatterns = [
    # Curriculum CRUD (prep_school) — Sprint 1
    path("api/v1/curriculum/curricula/", api_curricula, name="api_curricula"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/", api_curriculum_detail, name="api_curriculum_detail"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/courses/", api_curriculum_courses, name="api_curriculum_courses"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/courses/<int:course_pk>/", api_curriculum_course_detail, name="api_curriculum_course_detail"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/submit/", api_curriculum_submit, name="api_curriculum_submit"),
]
