"""
military_profile/urls.py
"""
from django.urls import path
from .api_views import (
    api_my_profile,
    api_my_certificates,
    # Admin
    api_admin_users,
    api_admin_create_user,
    api_admin_update_user,
    api_admin_deactivate_user,
    api_admin_registrations,
    api_admin_registration_action,
    # Public
    api_register,
    # Instructor
    api_instructor_courses,
    api_instructor_course_students,
    api_instructor_course_grades,
)

app_name = "military_profile"

urlpatterns = [
    # Student
    path("api/v1/my/profile/",      api_my_profile,      name="api_my_profile"),
    path("api/v1/my/certificates/", api_my_certificates, name="api_my_certificates"),

    # Public
    path("api/v1/register/", api_register, name="api_register"),

    # Admin — User Management
    path("api/v1/admin/users/",               api_admin_users,       name="api_admin_users"),
    path("api/v1/admin/users/create/",        api_admin_create_user, name="api_admin_create_user"),
    path("api/v1/admin/users/<int:user_id>/", api_admin_update_user, name="api_admin_update_user"),
    path("api/v1/admin/users/<int:user_id>/delete/", api_admin_deactivate_user, name="api_admin_deactivate_user"),

    # Admin — Registrations
    path("api/v1/admin/registrations/",                    api_admin_registrations,       name="api_admin_registrations"),
    path("api/v1/admin/registrations/<int:registration_id>/", api_admin_registration_action, name="api_admin_registration_action"),

    # Instructor
    path("api/v1/instructor/courses/",                              api_instructor_courses,         name="api_instructor_courses"),
    path("api/v1/instructor/courses/<str:course_id>/students/",    api_instructor_course_students, name="api_instructor_course_students"),
    path("api/v1/instructor/courses/<str:course_id>/grades/",      api_instructor_course_grades,   name="api_instructor_course_grades"),
]

