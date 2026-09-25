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
    api_school_curricula,
    api_school_curriculum_roster,
)
from .quota_views import (
    api_curricula_submitted,
    api_curriculum_activate,
    api_quota_demand_report,
    api_eligible_density_report,
    api_curriculum_org_quotas,
    api_curriculum_personnel_search,
    api_curriculum_enroll,
    api_catch_up_enrollment,
    api_enrollment_request_detail,
    api_enrollment_request_retry,
)
from .grading_views import (
    api_my_courses,
    api_course_roster,
    api_manual_grades,
    api_manual_grade_detail,
    api_course_finalize,
    api_co_instructors,
    api_co_instructor_detail,
)
from .evaluation_views import (
    api_evaluator_curricula,
    api_evaluation_forms,
    api_evaluation_form_detail,
    api_evaluation_form_responses_summary,
    api_evaluation_status_dashboard,
    api_pending_evaluations,
    api_submit_evaluation,
)
from .transcript_views import (
    api_my_transcript,
    api_my_certificate,
    api_org_completions,
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

    # โรงเรียนทหารสื่อสาร (org id=161) — org_admin ของหน่วยนี้เห็น roster
    # หลักสูตรแบบ read-only เพิ่มเติม (ดู military_curriculum/permissions.py)
    path("api/v1/curriculum/school/curricula/", api_school_curricula, name="api_school_curricula"),
    path("api/v1/curriculum/school/curricula/<int:curriculum_id>/roster/", api_school_curriculum_roster, name="api_school_curriculum_roster"),

    # Quota/Demand Report + Cascade Enrollment (prep_personnel) — Sprint 2
    path("api/v1/curriculum/curricula/<int:curriculum_id>/activate/", api_curriculum_activate, name="api_curriculum_activate"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/enroll/", api_curriculum_enroll, name="api_curriculum_enroll"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/catch-up-enrollment/", api_catch_up_enrollment, name="api_catch_up_enrollment"),
    path("api/v1/curriculum/reports/quota-demand/", api_quota_demand_report, name="api_quota_demand_report"),
    path("api/v1/curriculum/reports/eligible-density/", api_eligible_density_report, name="api_eligible_density_report"),
    path("api/v1/curriculum/curricula/<int:curriculum_id>/org-quotas/", api_curriculum_org_quotas, name="api_curriculum_org_quotas"),
    path("api/v1/curriculum/personnel-search/", api_curriculum_personnel_search, name="api_curriculum_personnel_search"),
    path("api/v1/curriculum/enrollment-requests/<int:request_id>/", api_enrollment_request_detail, name="api_enrollment_request_detail"),
    path("api/v1/curriculum/enrollment-requests/<int:request_id>/retry/", api_enrollment_request_retry, name="api_enrollment_request_retry"),

    # Hybrid Grading & Co-Instructor (instructor) — Sprint 3
    path("api/v1/curriculum/my-courses/", api_my_courses, name="api_my_courses"),
    path("api/v1/curriculum/my-courses/<int:curriculum_course_id>/roster/", api_course_roster, name="api_course_roster"),
    path("api/v1/curriculum/my-courses/<int:curriculum_course_id>/manual-grades/", api_manual_grades, name="api_manual_grades"),
    path("api/v1/curriculum/my-courses/<int:curriculum_course_id>/manual-grades/<int:grade_id>/", api_manual_grade_detail, name="api_manual_grade_detail"),
    path("api/v1/curriculum/my-courses/<int:curriculum_course_id>/finalize/", api_course_finalize, name="api_course_finalize"),
    path("api/v1/curriculum/my-courses/<int:curriculum_course_id>/co-instructors/", api_co_instructors, name="api_co_instructors"),
    path("api/v1/curriculum/my-courses/<int:curriculum_course_id>/co-instructors/<int:user_id>/", api_co_instructor_detail, name="api_co_instructor_detail"),

    # Evaluation Gatekeeper (evaluator) — Sprint 4
    path("api/v1/curriculum/evaluator/curricula/", api_evaluator_curricula, name="api_evaluator_curricula"),
    path("api/v1/curriculum/evaluation-forms/", api_evaluation_forms, name="api_evaluation_forms"),
    path("api/v1/curriculum/evaluation-forms/<int:form_id>/", api_evaluation_form_detail, name="api_evaluation_form_detail"),
    path("api/v1/curriculum/evaluation-forms/<int:form_id>/responses/summary/", api_evaluation_form_responses_summary, name="api_evaluation_form_responses_summary"),
    path("api/v1/curriculum/dashboard/evaluation-status/", api_evaluation_status_dashboard, name="api_evaluation_status_dashboard"),

    # Student-facing
    path("api/v1/curriculum/my/evaluations/pending/", api_pending_evaluations, name="api_pending_evaluations"),
    path("api/v1/curriculum/my/evaluations/<int:form_id>/submit/", api_submit_evaluation, name="api_submit_evaluation"),

    # Learner Transcript (student) — Sprint 5
    path("api/v1/curriculum/my/transcript/", api_my_transcript, name="api_my_transcript"),
    path("api/v1/curriculum/my/transcript/<int:curriculum_id>/certificate/", api_my_certificate, name="api_my_certificate"),

    # Org-wide personnel completion history (org_admin) — Sprint 2 (2026-09)
    path("api/v1/curriculum/org/completions/", api_org_completions, name="api_org_completions"),
]
