"""
tests/test_quota_enrollment.py

Sprint 2: Quota/Demand Report + Cascade Enrollment (prep_personnel)

_enroll_single_course ต้อง mock เพราะพึ่ง edx-platform จริง
(opaque_keys/student.models/xmodule) ที่ไม่มีใน standalone test harness —
เทสชุดนี้เน้นตรวจ orchestration logic (status transition, partial failure,
dry-run ไม่มี side effect, retry เฉพาะวิชาที่ fail) ไม่ใช่ enrollment จริง
"""
import json
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import (
    Curriculum, CurriculumCourse, CurriculumEnrollmentRequest, CurriculumRegionQuota,
)
from military_curriculum.services.enrollment_service import EnrollmentResult
from military_profile.models import MilitaryUserProfile, Organization, encrypt_field

User = get_user_model()


def _make_user(username, role, organization=None, army_region=""):
    user = User.objects.create_user(username=username, password="testpass123")
    MilitaryUserProfile.objects.create(
        user=user,
        national_id_encrypted=encrypt_field(f"1-{username}-0000000000"),
        military_id_encrypted=encrypt_field(f"MIL-{username}"),
        full_name_th=f"ทดสอบ {username}",
        unit="หน่วยทดสอบ",
        role=role,
        organization=organization,
        army_region=army_region,
    )
    return user


@pytest.fixture
def organization(db):
    return Organization.objects.create(name="หน่วยทดสอบ", code="Q-01", army_region="1")


@pytest.fixture
def prep_personnel_user(db):
    return _make_user("prep_personnel_user", "prep_personnel")


@pytest.fixture
def active_curriculum(db, organization):
    creator = _make_user("creator", "prep_school", organization)
    c = Curriculum.objects.create(
        name="หลักสูตรทดสอบ", batch_code="1", academic_year=2570,
        organization=organization, created_by=creator, status="active",
        quota_total=50,
    )
    CurriculumRegionQuota.objects.create(curriculum=c, army_region="1", quota=10)
    CurriculumCourse.objects.create(
        curriculum=c, course_id="course-v1:Signal+101+2570", display_name="วิชา 1",
        sequence_order=1, credit_hours=10, credits=1,
    )
    CurriculumCourse.objects.create(
        curriculum=c, course_id="course-v1:Signal+102+2570", display_name="วิชา 2",
        sequence_order=2, credit_hours=10, credits=1,
    )
    return c


@pytest.fixture
def submitted_curriculum(db, organization):
    creator = _make_user("creator2", "prep_school", organization)
    c = Curriculum.objects.create(
        name="หลักสูตรรอเปิด", batch_code="2", academic_year=2570,
        organization=organization, created_by=creator, status="submitted",
    )
    return c


class TestCurriculaSubmittedAndActivate:
    def test_list_submitted(self, db, prep_personnel_user, submitted_curriculum, active_curriculum):
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get("/military/api/v1/curriculum/curricula/submitted/")
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()["results"]]
        assert "หลักสูตรรอเปิด" in names
        assert "หลักสูตรทดสอบ" in names  # active ก็เห็นด้วย (default filter)

    def test_activate_success(self, db, prep_personnel_user, submitted_curriculum):
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.post(f"/military/api/v1/curriculum/curricula/{submitted_curriculum.id}/activate/")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_activate_rejects_non_submitted(self, db, prep_personnel_user, active_curriculum):
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.post(f"/military/api/v1/curriculum/curricula/{active_curriculum.id}/activate/")
        assert resp.status_code == 409


class TestQuotaDemandReport:
    def test_report_counts_by_region(self, db, prep_personnel_user, active_curriculum, organization):
        student1 = _make_user("s1", "student", organization, army_region="1")
        student2 = _make_user("s2", "student", organization, army_region="1")
        CurriculumEnrollmentRequest.objects.create(
            curriculum=active_curriculum, student=student1, requested_by=prep_personnel_user,
            status="completed",
        )
        CurriculumEnrollmentRequest.objects.create(
            curriculum=active_curriculum, student=student2, requested_by=prep_personnel_user,
            status="pending",
        )
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/reports/quota-demand/?curriculum_id={active_curriculum.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["national_requested"] == 2
        assert data["national_filled"] == 1
        region1 = next(r for r in data["region_quotas"] if r["army_region"] == "1")
        assert region1["quota"] == 10
        assert region1["requested"] == 2
        assert region1["filled"] == 1

    def test_report_requires_curriculum_id(self, db, prep_personnel_user):
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get("/military/api/v1/curriculum/reports/quota-demand/")
        assert resp.status_code == 400


class TestCascadeEnrollment:
    def test_dry_run_no_side_effects(self, db, prep_personnel_user, active_curriculum, organization):
        student = _make_user("dryrun_student", "student", organization)
        with patch(
            "military_curriculum.services.enrollment_service._enroll_single_course",
            return_value=EnrollmentResult("course-v1:X", True, None),
        ) as mock_enroll:
            client = Client()
            client.force_login(prep_personnel_user)
            resp = client.post(
                f"/military/api/v1/curriculum/curricula/{active_curriculum.id}/enroll/",
                data=json.dumps({"student_ids": [student.id], "dry_run": True}),
                content_type="application/json",
            )
        assert resp.status_code == 200, resp.content
        assert resp.json()["dry_run"] is True
        assert resp.json()["preview"][0]["would_succeed"] is True
        # ต้องไม่สร้าง CurriculumEnrollmentRequest ใดๆ จาก dry-run
        assert CurriculumEnrollmentRequest.objects.filter(curriculum=active_curriculum, student=student).count() == 0
        # เรียก _enroll_single_course ด้วย dry_run=True เท่านั้น (ไม่ enroll จริง)
        for call in mock_enroll.call_args_list:
            assert call.kwargs.get("dry_run") is True

    def test_enroll_all_success(self, db, prep_personnel_user, active_curriculum, organization):
        student = _make_user("success_student", "student", organization)
        with patch(
            "military_curriculum.services.enrollment_service._enroll_single_course",
            return_value=EnrollmentResult("course-v1:X", True, None),
        ):
            client = Client()
            client.force_login(prep_personnel_user)
            resp = client.post(
                f"/military/api/v1/curriculum/curricula/{active_curriculum.id}/enroll/",
                data=json.dumps({"student_ids": [student.id]}),
                content_type="application/json",
            )
        assert resp.status_code == 201, resp.content
        assert resp.json()["mode"] == "sync"
        req = CurriculumEnrollmentRequest.objects.get(curriculum=active_curriculum, student=student)
        assert req.status == "completed"
        assert all(v == "enrolled" for v in req.result_detail.values())

    def test_enroll_partial_failure(self, db, prep_personnel_user, active_curriculum, organization):
        student = _make_user("partial_student", "student", organization)

        def side_effect(student_arg, course_id_str, dry_run=False):
            if course_id_str.endswith("102+2570"):
                return EnrollmentResult(course_id_str, False, "course full")
            return EnrollmentResult(course_id_str, True, None)

        with patch(
            "military_curriculum.services.enrollment_service._enroll_single_course",
            side_effect=side_effect,
        ):
            client = Client()
            client.force_login(prep_personnel_user)
            resp = client.post(
                f"/military/api/v1/curriculum/curricula/{active_curriculum.id}/enroll/",
                data=json.dumps({"student_ids": [student.id]}),
                content_type="application/json",
            )
        assert resp.status_code == 201
        req = CurriculumEnrollmentRequest.objects.get(curriculum=active_curriculum, student=student)
        assert req.status == "partial_failed"
        assert req.result_detail["course-v1:Signal+101+2570"] == "enrolled"
        assert "failed" in req.result_detail["course-v1:Signal+102+2570"]

    def test_enroll_idempotent_no_duplicate_request(self, db, prep_personnel_user, active_curriculum, organization):
        student = _make_user("idempotent_student", "student", organization)
        with patch(
            "military_curriculum.services.enrollment_service._enroll_single_course",
            return_value=EnrollmentResult("course-v1:X", True, None),
        ):
            client = Client()
            client.force_login(prep_personnel_user)
            for _ in range(2):
                resp = client.post(
                    f"/military/api/v1/curriculum/curricula/{active_curriculum.id}/enroll/",
                    data=json.dumps({"student_ids": [student.id]}),
                    content_type="application/json",
                )
                assert resp.status_code == 201
        assert CurriculumEnrollmentRequest.objects.filter(curriculum=active_curriculum, student=student).count() == 1

    def test_enroll_rejects_non_active_curriculum(self, db, prep_personnel_user, submitted_curriculum, organization):
        student = _make_user("blocked_student", "student", organization)
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{submitted_curriculum.id}/enroll/",
            data=json.dumps({"student_ids": [student.id]}),
            content_type="application/json",
        )
        assert resp.status_code == 409

    def test_retry_only_failed_courses(self, db, prep_personnel_user, active_curriculum, organization):
        student = _make_user("retry_student", "student", organization)
        req = CurriculumEnrollmentRequest.objects.create(
            curriculum=active_curriculum, student=student, requested_by=prep_personnel_user,
            status="partial_failed",
            result_detail={
                "course-v1:Signal+101+2570": "enrolled",
                "course-v1:Signal+102+2570": "failed: course full",
            },
        )
        call_log = []

        def side_effect(student_arg, course_id_str, dry_run=False):
            call_log.append(course_id_str)
            return EnrollmentResult(course_id_str, True, None)

        with patch(
            "military_curriculum.services.enrollment_service._enroll_single_course",
            side_effect=side_effect,
        ):
            client = Client()
            client.force_login(prep_personnel_user)
            resp = client.post(f"/military/api/v1/curriculum/enrollment-requests/{req.id}/retry/")

        assert resp.status_code == 200
        # ต้อง retry แค่วิชาที่ fail (102) ไม่แตะ 101 ที่สำเร็จแล้ว
        assert call_log == ["course-v1:Signal+102+2570"]
        req.refresh_from_db()
        assert req.status == "completed"
        assert req.result_detail["course-v1:Signal+101+2570"] == "enrolled"
        assert req.result_detail["course-v1:Signal+102+2570"] == "enrolled"

    def test_retry_rejects_non_failed_request(self, db, prep_personnel_user, active_curriculum, organization):
        student = _make_user("no_retry_student", "student", organization)
        req = CurriculumEnrollmentRequest.objects.create(
            curriculum=active_curriculum, student=student, requested_by=prep_personnel_user,
            status="completed", result_detail={"course-v1:X": "enrolled"},
        )
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.post(f"/military/api/v1/curriculum/enrollment-requests/{req.id}/retry/")
        assert resp.status_code == 409
