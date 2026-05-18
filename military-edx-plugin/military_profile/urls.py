"""
military_profile/urls.py
"""
from django.urls import path
from .api_views import (
    api_my_certificate_detail,
    api_me,
    api_my_profile,
    api_my_certificates,
    # Admin
    api_admin_users,
    api_admin_create_user,
    api_admin_update_user,
    api_admin_deactivate_user,
    api_admin_hard_delete_user,
    api_admin_registrations,
    api_admin_registration_action,
    api_admin_reset_password,
    api_admin_courses,
    api_admin_course_assign_instructor,
    api_admin_delete_course,
    # Public
    api_register,
    # Instructor
    api_instructor_courses,
    api_instructor_delete_course,
    api_instructor_course_students,
    api_instructor_course_grades,
    # Courses proxy
    api_courses_catalog,
    api_enroll_course,
    # Password
    api_change_password,
    api_import_list_libraries,
    api_import_parse,
    api_import_execute, api_delete_library,
)

app_name = "military_profile"

urlpatterns = [
    # Current user info
    path("api/v1/me/",              api_me,          name="api_me"),

    # Student
    path("api/v1/my/profile/",      api_my_profile,      name="api_my_profile"),
    path("api/v1/my/certificates/", api_my_certificates, name="api_my_certificates"),
    path("api/v1/my/certificates/<int:cert_id>/", api_my_certificate_detail, name="api_my_certificate_detail"),

    # Public
    path("api/v1/register/", api_register, name="api_register"),

    # Admin — User Management
    path("api/v1/admin/users/",               api_admin_users,       name="api_admin_users"),
    path("api/v1/admin/users/create/",        api_admin_create_user, name="api_admin_create_user"),
    path("api/v1/admin/users/<int:user_id>/", api_admin_update_user, name="api_admin_update_user"),
    path("api/v1/admin/users/<int:user_id>/delete/", api_admin_deactivate_user, name="api_admin_deactivate_user"),
    path("api/v1/admin/users/<int:user_id>/hard-delete/", api_admin_hard_delete_user, name="api_admin_hard_delete_user"),

    # Admin — Registrations
    path("api/v1/admin/registrations/",                    api_admin_registrations,       name="api_admin_registrations"),
    path("api/v1/admin/registrations/<int:registration_id>/", api_admin_registration_action, name="api_admin_registration_action"),

    # Admin — Password Reset
    path("api/v1/admin/users/<int:user_id>/reset-password/", api_admin_reset_password, name="api_admin_reset_password"),
    path("api/v1/admin/courses/", api_admin_courses, name="api_admin_courses"),
    path("api/v1/admin/courses/<path:course_id>/assign-instructor/", api_admin_course_assign_instructor, name="api_admin_course_assign_instructor"),
    path("api/v1/admin/courses/<path:course_id>/delete/", api_admin_delete_course, name="api_admin_delete_course"),

    # Password Change (self)
    path("api/v1/change-password/", api_change_password, name="api_change_password"),

    # Courses catalog proxy
    path("api/v1/courses/", api_courses_catalog, name="api_courses_catalog"),
    path("api/v1/enroll/", api_enroll_course, name="api_enroll_course"),

    # Instructor
    path("api/v1/instructor/courses/",                                   api_instructor_courses,         name="api_instructor_courses"),
    path("api/v1/instructor/courses/<str:course_id>/delete/",            api_instructor_delete_course,   name="api_instructor_delete_course"),
    path("api/v1/instructor/courses/<str:course_id>/students/",          api_instructor_course_students, name="api_instructor_course_students"),
    path("api/v1/instructor/courses/<str:course_id>/grades/",            api_instructor_course_grades,   name="api_instructor_course_grades"),
    # Import Questions from Word
    path("api/v1/import/libraries/", api_import_list_libraries, name="api_import_list_libraries"),
    path("api/v1/import/parse/", api_import_parse, name="api_import_parse"),
    path("api/v1/import/execute/", api_import_execute, name="api_import_execute"),
    path("api/v1/import/libraries/<path:library_key_str>/delete/", api_delete_library, name="api_delete_library"),
]

