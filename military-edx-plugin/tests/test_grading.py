"""
tests/test_grading.py

Sprint 3: Hybrid Grading & Co-Instructor (instructor)

finalize_course()/sync_course_access_role() ต้อง mock ที่ระดับ view
(military_curriculum.grading_views.finalize_course /
.sync_course_access_role) เพราะภายในพึ่ง edx-platform จริง — เทสชุดนี้เน้น
permission (owner-only สำหรับ co-instructor), manual grade CRUD (ไม่พึ่ง
edx-platform เลย), และ view orchestration
"""
import json
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import (
    Curriculum, CurriculumCourse, CurriculumCourseInstructor,
    CurriculumEnrollmentRequest, ManualGradeEntry, FinalCourseResult,
)
from military_profile.models import MilitaryUserProfile, Organization, encrypt_field

User = get_user_model()


def _make_user(username, role, organization=None):
    user = User.objects.create_user(username=username, password="testpass123")
    MilitaryUserProfile.objects.create(
        user=user,
        national_id_encrypted=encrypt_field(f"1-{username}-0000000000"),
        military_id_encrypted=encrypt_field(f"MIL-{username}"),
        full_name_th=f"ทดสอบ {username}",
        unit="หน่วยทดสอบ",
        role=role,
        organization=organization,
    )
    return user


@pytest.fixture
def organization(db):
    return Organization.objects.create(name="หน่วยทดสอบ", code="G-01")


@pytest.fixture
def curriculum_course(db, organization):
    creator = _make_user("creator", "prep_school", organization)
    c = Curriculum.objects.create(
        name="หลักสูตรทดสอบเกรด", batch_code="1", academic_year=2570,
        organization=organization, created_by=creator, status="active",
    )
    return CurriculumCourse.objects.create(
        curriculum=c, course_id="course-v1:Signal+G101+2570", display_name="วิชาเกรดทดสอบ",
        credit_hours=10, credits=1, assessment_type="score", passing_score=60,
    )


@pytest.fixture
def owner_user(db, organization, curriculum_course):
    u = _make_user("owner_instructor", "instructor", organization)
    CurriculumCourseInstructor.objects.create(
        curriculum_course=curriculum_course, user=u, is_owner=True, added_by=u,
    )
    return u


@pytest.fixture
def other_instructor(db, organization):
    return _make_user("other_instructor", "instructor", organization)


class TestMyCourses:
    def test_list_own_courses(self, db, owner_user, curriculum_course):
        client = Client()
        client.force_login(owner_user)
        resp = client.get("/military/api/v1/curriculum/my-courses/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1
        assert resp.json()["results"][0]["is_owner"] is True

    def test_other_instructor_sees_no_courses(self, db, other_instructor, curriculum_course):
        client = Client()
        client.force_login(other_instructor)
        resp = client.get("/military/api/v1/curriculum/my-courses/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0


class TestCourseRoster:
    def test_roster_forbidden_for_non_instructor_of_course(self, db, other_instructor, curriculum_course):
        client = Client()
        client.force_login(other_instructor)
        resp = client.get(f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/roster/")
        assert resp.status_code == 403

    def test_roster_shows_enrolled_students(self, db, owner_user, curriculum_course, organization):
        student = _make_user("roster_student", "student", organization)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=curriculum_course.curriculum, student=student, requested_by=owner_user,
            status="completed",
        )
        client = Client()
        client.force_login(owner_user)
        resp = client.get(f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/roster/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1
        assert resp.json()["results"][0]["student_id"] == student.id


class TestManualGrades:
    def test_add_and_update_manual_grade(self, db, owner_user, curriculum_course, organization):
        student = _make_user("grade_student", "student", organization)
        client = Client()
        client.force_login(owner_user)

        resp = client.post(
            f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/manual-grades/",
            data=json.dumps({
                "student_id": student.id, "component_name": "สอบภาคปฏิบัติ",
                "score": 80, "max_score": 100, "weight": 30,
            }),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        grade_id = resp.json()["id"]

        resp = client.patch(
            f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/manual-grades/{grade_id}/",
            data=json.dumps({"score": 90}), content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["score"] == "90.00" or resp.json()["score"] == "90"

    def test_non_instructor_cannot_add_grade(self, db, other_instructor, curriculum_course, organization):
        student = _make_user("blocked_grade_student", "student", organization)
        client = Client()
        client.force_login(other_instructor)
        resp = client.post(
            f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/manual-grades/",
            data=json.dumps({"student_id": student.id, "component_name": "x", "score": 1, "max_score": 1}),
            content_type="application/json",
        )
        assert resp.status_code == 403


class TestFinalize:
    def test_finalize_calls_service_and_sets_computed_by(self, db, owner_user, curriculum_course):
        fake_result = FinalCourseResult(curriculum_course=curriculum_course, student_id=999, final_score=75, passed=True)
        fake_result.save = lambda update_fields=None: None  # no-op save เพราะ student_id=999 ไม่มีจริง

        with patch("military_curriculum.grading_views.finalize_course", return_value=[fake_result]) as mock_finalize:
            client = Client()
            client.force_login(owner_user)
            resp = client.post(f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/finalize/")

        assert resp.status_code == 200
        assert resp.json()["finalized_count"] == 1
        mock_finalize.assert_called_once_with(curriculum_course)
        assert fake_result.computed_by_id == owner_user.id


class TestCoInstructors:
    def test_owner_can_add_co_instructor(self, db, owner_user, curriculum_course, other_instructor):
        with patch("military_curriculum.grading_views.sync_course_access_role") as mock_sync:
            client = Client()
            client.force_login(owner_user)
            resp = client.post(
                f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/co-instructors/",
                data=json.dumps({"user_id": other_instructor.id}), content_type="application/json",
            )
        assert resp.status_code == 201, resp.content
        assert CurriculumCourseInstructor.objects.filter(
            curriculum_course=curriculum_course, user=other_instructor, is_owner=False
        ).exists()
        mock_sync.assert_called_once_with(curriculum_course.course_id, other_instructor, add=True)

    def test_non_owner_co_instructor_cannot_add_another(self, db, owner_user, curriculum_course, other_instructor, organization):
        # ทำให้ other_instructor เป็น co-instructor (ไม่ใช่ owner) ก่อน
        CurriculumCourseInstructor.objects.create(
            curriculum_course=curriculum_course, user=other_instructor, is_owner=False, added_by=owner_user,
        )
        third_user = _make_user("third_instructor", "instructor", organization)
        client = Client()
        client.force_login(other_instructor)
        resp = client.post(
            f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/co-instructors/",
            data=json.dumps({"user_id": third_user.id}), content_type="application/json",
        )
        assert resp.status_code == 403

    def test_owner_can_remove_co_instructor(self, db, owner_user, curriculum_course, other_instructor):
        CurriculumCourseInstructor.objects.create(
            curriculum_course=curriculum_course, user=other_instructor, is_owner=False, added_by=owner_user,
        )
        with patch("military_curriculum.grading_views.sync_course_access_role") as mock_sync:
            client = Client()
            client.force_login(owner_user)
            resp = client.delete(
                f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/co-instructors/{other_instructor.id}/"
            )
        assert resp.status_code == 200
        assert not CurriculumCourseInstructor.objects.filter(
            curriculum_course=curriculum_course, user=other_instructor
        ).exists()
        mock_sync.assert_called_once_with(curriculum_course.course_id, other_instructor, add=False)

    def test_cannot_remove_owner(self, db, owner_user, curriculum_course):
        client = Client()
        client.force_login(owner_user)
        resp = client.delete(
            f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/co-instructors/{owner_user.id}/"
        )
        assert resp.status_code == 409

    def test_duplicate_co_instructor_rejected(self, db, owner_user, curriculum_course, other_instructor):
        CurriculumCourseInstructor.objects.create(
            curriculum_course=curriculum_course, user=other_instructor, is_owner=False, added_by=owner_user,
        )
        with patch("military_curriculum.grading_views.sync_course_access_role"):
            client = Client()
            client.force_login(owner_user)
            resp = client.post(
                f"/military/api/v1/curriculum/my-courses/{curriculum_course.id}/co-instructors/",
                data=json.dumps({"user_id": other_instructor.id}), content_type="application/json",
            )
        assert resp.status_code == 409
