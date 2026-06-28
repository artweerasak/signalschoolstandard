"""
military_profile/urls.py
"""
from django.urls import path
from .api_views import (
    api_my_certificate_detail,
    api_my_certificate_download,
    api_my_notifications,
    api_system_health,
    api_concurrent_status,
    api_audit_log,
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
    api_admin_course_policy,
    api_admin_course_rename,
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
    api_goto_course_as_student,
    # Password
    api_change_password,
    api_reset_password_request,
    api_import_list_libraries,
    api_import_parse,
    api_import_execute,
    api_delete_library,
    api_list_library_blocks,
    api_bulk_delete_blocks,
    api_cert_batches,
    api_cert_batch_detail,
    api_cert_scan_passed,
    api_cert_student_status,
    api_admin_bulk_import_users,
    api_admin_bulk_import_template,
    api_video_list,
    api_video_upload,
    api_video_delete,
    api_video_move,
    api_video_share,
    api_video_subjects,
    api_doc_subjects,
    api_doc_list,
    api_doc_upload,
    api_doc_delete,
    api_doc_share,
    # Reports
    api_reports_compliance_overview,
    api_reports_compliance_by_region,
    api_reports_compliance_by_rank_class,
    api_reports_compliance_by_rank,
    api_reports_compliance_by_unit,
    api_reports_compliance_not_passed,
    api_reports_certificates_expiring,
    api_reports_certificates_expired,
    # Organizations
    api_admin_organizations,
    api_admin_organization_detail,
    api_admin_organization_bulk_transfer,
    api_organizations_public,
    # Org Admin
    api_org_admin_dashboard,
    api_org_admin_users,
)

app_name = "military_profile"

urlpatterns = [
    # Current user info
    path("api/v1/me/",              api_me,          name="api_me"),

    # Student
    path("api/v1/my/profile/",      api_my_profile,      name="api_my_profile"),
    path("api/v1/my/certificates/", api_my_certificates, name="api_my_certificates"),
    path("api/v1/my/certificates/<int:cert_id>/", api_my_certificate_detail, name="api_my_certificate_detail"),
    path("api/v1/my/certificates/<int:cert_id>/download/", api_my_certificate_download, name="api_my_certificate_download"),
    path("api/v1/my/notifications/", api_my_notifications, name="api_my_notifications"),
    path("api/v1/admin/system-health/", api_system_health, name="api_system_health"),
    path("api/v1/admin/concurrent-users/", api_concurrent_status, name="api_concurrent_status"),
    path("api/v1/admin/audit-log/", api_audit_log, name="api_audit_log"),

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
    path("api/v1/admin/users/bulk-import/", api_admin_bulk_import_users, name="api_admin_bulk_import_users"),
    path("api/v1/admin/users/bulk-import/template/", api_admin_bulk_import_template, name="api_admin_bulk_import_template"),
    path("api/v1/admin/courses/", api_admin_courses, name="api_admin_courses"),
    path("api/v1/admin/courses/<path:course_id>/assign-instructor/", api_admin_course_assign_instructor, name="api_admin_course_assign_instructor"),
    path("api/v1/admin/courses/<path:course_id>/policy/", api_admin_course_policy, name="api_admin_course_policy"),
    path("api/v1/admin/courses/<path:course_id>/rename/", api_admin_course_rename, name="api_admin_course_rename"),
    path("api/v1/admin/courses/<path:course_id>/delete/", api_admin_delete_course, name="api_admin_delete_course"),

    # Password Change (self)
    path("api/v1/change-password/", api_change_password, name="api_change_password"),
    path("api/v1/reset-password/request/", api_reset_password_request, name="api_reset_password_request"),

    # Courses catalog proxy
    path("api/v1/courses/", api_courses_catalog, name="api_courses_catalog"),
    path("api/v1/enroll/", api_enroll_course, name="api_enroll_course"),
    path("api/v1/goto-course/", api_goto_course_as_student, name="api_goto_course_as_student"),

    # Instructor
    path("api/v1/instructor/courses/",                                   api_instructor_courses,         name="api_instructor_courses"),
    path("api/v1/instructor/courses/<str:course_id>/delete/",            api_instructor_delete_course,   name="api_instructor_delete_course"),
    path("api/v1/instructor/courses/<str:course_id>/students/",          api_instructor_course_students, name="api_instructor_course_students"),
    path("api/v1/instructor/courses/<str:course_id>/grades/",            api_instructor_course_grades,   name="api_instructor_course_grades"),
    path("api/v1/instructor/courses/<path:course_id>/policy/",           api_admin_course_policy,        name="api_instructor_course_policy"),
    # Import Questions from Word
    path("api/v1/import/libraries/", api_import_list_libraries, name="api_import_list_libraries"),
    path("api/v1/import/parse/", api_import_parse, name="api_import_parse"),
    path("api/v1/import/execute/", api_import_execute, name="api_import_execute"),
    path("api/v1/import/libraries/<path:library_key_str>/delete/", api_delete_library, name="api_delete_library"),
    path("api/v1/import/libraries/<path:library_key_str>/blocks/", api_list_library_blocks, name="api_list_library_blocks"),
    path("api/v1/import/blocks/bulk-delete/", api_bulk_delete_blocks, name="api_bulk_delete_blocks"),
    # Certificate Approval Batch
    path("api/v1/cert/batches/", api_cert_batches, name="api_cert_batches"),
    path("api/v1/cert/batches/<int:batch_id>/", api_cert_batch_detail, name="api_cert_batch_detail"),
    path("api/v1/cert/scan-passed/", api_cert_scan_passed, name="api_cert_scan_passed"),
    path("api/v1/cert/my-status/", api_cert_student_status, name="api_cert_student_status"),
    # Video Management
    path("api/v1/videos/", api_video_list, name="api_video_list"),
    path("api/v1/videos/subjects/", api_video_subjects, name="api_video_subjects"),
    path("api/v1/videos/upload/", api_video_upload, name="api_video_upload"),
    path("api/v1/videos/delete/", api_video_delete, name="api_video_delete"),
    path("api/v1/videos/move/", api_video_move, name="api_video_move"),
    path("api/v1/videos/share/", api_video_share, name="api_video_share"),
    path("api/v1/documents/", api_doc_list, name="api_doc_list"),
    path("api/v1/documents/subjects/", api_doc_subjects, name="api_doc_subjects"),
    path("api/v1/documents/upload/", api_doc_upload, name="api_doc_upload"),
    path("api/v1/documents/delete/", api_doc_delete, name="api_doc_delete"),
    path("api/v1/documents/share/", api_doc_share, name="api_doc_share"),
    # Reports — Compliance
    path("api/v1/reports/compliance/overview/",      api_reports_compliance_overview,     name="api_reports_compliance_overview"),
    path("api/v1/reports/compliance/by-region/",      api_reports_compliance_by_region,    name="api_reports_compliance_by_region"),
    path("api/v1/reports/compliance/by-rank-class/",  api_reports_compliance_by_rank_class, name="api_reports_compliance_by_rank_class"),
    path("api/v1/reports/compliance/by-rank/",        api_reports_compliance_by_rank,      name="api_reports_compliance_by_rank"),
    path("api/v1/reports/compliance/by-unit/",        api_reports_compliance_by_unit,      name="api_reports_compliance_by_unit"),
    path("api/v1/reports/compliance/not-passed/",     api_reports_compliance_not_passed,   name="api_reports_compliance_not_passed"),
    path("api/v1/reports/certificates/expiring/",     api_reports_certificates_expiring,   name="api_reports_certificates_expiring"),
    path("api/v1/reports/certificates/expired/",      api_reports_certificates_expired,    name="api_reports_certificates_expired"),
    # Organizations (Super Admin)
    path("api/v1/admin/organizations/",                         api_admin_organizations,               name="api_admin_organizations"),
    path("api/v1/admin/organizations/<int:org_id>/",            api_admin_organization_detail,         name="api_admin_organization_detail"),
    path("api/v1/admin/organizations/<int:org_id>/bulk-transfer/", api_admin_organization_bulk_transfer, name="api_admin_organization_bulk_transfer"),
    # Public
    path("api/v1/organizations/",                               api_organizations_public,              name="api_organizations_public"),
    # Org Admin
    path("api/v1/org-admin/dashboard/",                         api_org_admin_dashboard,               name="api_org_admin_dashboard"),
    path("api/v1/org-admin/users/",                             api_org_admin_users,                   name="api_org_admin_users"),
]

