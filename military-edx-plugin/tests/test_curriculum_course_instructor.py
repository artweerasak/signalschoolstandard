"""
tests/test_curriculum_course_instructor.py

มอบหมาย/ถอดผู้สอน (เจ้าของวิชา) ให้ CurriculumCourse โดย prep_school —
แก้ปัญหาที่เดิมไม่มีช่องทางไหนในแอปเลยที่จะตั้ง owner คนแรกได้ (มีแค่
api_co_instructors ที่ต้องเป็น owner อยู่แล้วถึงจะเพิ่มคนอื่นได้ = ไก่กับไข่)
ทำให้อาจารย์มองไม่เห็นวิชา/รายชื่อนักเรียนของตัวเองใน /instructor เลย
"""
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from unittest.mock import patch

from military_curriculum.models import Curriculum, CurriculumCourse, CurriculumCourseInstructor
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
    return Organization.objects.create(name="หน่วยทดสอบ", code="INSTR-01")


@pytest.fixture
def prep_school_user(db, organization):
    return _make_user("instr_prep_school", "prep_school", organization)


@pytest.fixture
def curriculum(db, organization, prep_school_user):
    c = Curriculum.objects.create(
        name="หลักสูตรทดสอบผู้สอน", batch_code="1", academic_year=2570,
        organization=organization, created_by=prep_school_user, status="draft",
    )
    CurriculumCourse.objects.create(
        curriculum=c, course_id="course-v1:Instr+101+2570", display_name="วิชาแกนกลาง",
        sequence_order=1, credit_hours=10, credits=1,
    )
    return c


@pytest.fixture
def course(curriculum):
    return curriculum.courses.first()


class TestAssignCourseInstructor:
    def test_assigns_owner_and_syncs_access_role(self, db, prep_school_user, organization, curriculum, course):
        instructor = _make_user("instr_target", "instructor", organization)
        client = Client()
        client.force_login(prep_school_user)
        with patch("military_curriculum.services.grading_service.sync_course_access_role") as mock_sync:
            resp = client.post(
                f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
                data=json.dumps({"user_id": instructor.id}),
                content_type="application/json",
            )
        assert resp.status_code == 201, resp.content
        assert resp.json()["user_id"] == instructor.id
        assert CurriculumCourseInstructor.objects.filter(
            curriculum_course=course, user=instructor, is_owner=True,
        ).exists()
        mock_sync.assert_called_once_with(course.course_id, instructor, add=True)

    def test_newly_assigned_instructor_can_see_course_in_my_courses(self, db, prep_school_user, organization, curriculum, course):
        instructor = _make_user("instr_visibility", "instructor", organization)
        client = Client()
        client.force_login(prep_school_user)
        with patch("military_curriculum.services.grading_service.sync_course_access_role"):
            client.post(
                f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
                data=json.dumps({"user_id": instructor.id}),
                content_type="application/json",
            )

        instructor_client = Client()
        instructor_client.force_login(instructor)
        resp = instructor_client.get("/military/api/v1/curriculum/my-courses/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1
        assert resp.json()["results"][0]["id"] == course.id

    def test_rejects_non_instructor_role(self, db, prep_school_user, organization, curriculum, course):
        not_an_instructor = _make_user("instr_wrong_role", "student", organization)
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
            data=json.dumps({"user_id": not_an_instructor.id}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_replacing_owner_removes_previous_one(self, db, prep_school_user, organization, curriculum, course):
        first = _make_user("instr_first", "instructor", organization)
        second = _make_user("instr_second", "instructor", organization)
        client = Client()
        client.force_login(prep_school_user)
        with patch("military_curriculum.services.grading_service.sync_course_access_role"):
            client.post(
                f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
                data=json.dumps({"user_id": first.id}), content_type="application/json",
            )
            resp = client.post(
                f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
                data=json.dumps({"user_id": second.id}), content_type="application/json",
            )
        assert resp.status_code == 201
        owners = CurriculumCourseInstructor.objects.filter(curriculum_course=course, is_owner=True)
        assert owners.count() == 1
        assert owners.first().user_id == second.id

    def test_delete_unassigns_owner(self, db, prep_school_user, organization, curriculum, course):
        instructor = _make_user("instr_to_remove", "instructor", organization)
        client = Client()
        client.force_login(prep_school_user)
        with patch("military_curriculum.services.grading_service.sync_course_access_role"):
            client.post(
                f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
                data=json.dumps({"user_id": instructor.id}), content_type="application/json",
            )
            resp = client.delete(
                f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
            )
        assert resp.status_code == 200
        assert not CurriculumCourseInstructor.objects.filter(curriculum_course=course).exists()

    def test_other_org_prep_school_forbidden(self, db, curriculum, course):
        other_org = Organization.objects.create(name="หน่วยอื่น เทสผู้สอน", code="INSTR-02")
        other_prep_school = _make_user("instr_other_org", "prep_school", other_org)
        instructor = _make_user("instr_for_forbidden_test", "instructor", other_org)
        client = Client()
        client.force_login(other_prep_school)
        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
            data=json.dumps({"user_id": instructor.id}), content_type="application/json",
        )
        assert resp.status_code == 403

    def test_curriculum_detail_shows_current_owner(self, db, prep_school_user, organization, curriculum, course):
        instructor = _make_user("instr_shown_in_detail", "instructor", organization)
        client = Client()
        client.force_login(prep_school_user)
        with patch("military_curriculum.services.grading_service.sync_course_access_role"):
            client.post(
                f"/military/api/v1/curriculum/curricula/{curriculum.id}/courses/{course.id}/instructor/",
                data=json.dumps({"user_id": instructor.id}), content_type="application/json",
            )
        resp = client.get(f"/military/api/v1/curriculum/curricula/{curriculum.id}/")
        course_data = next(c for c in resp.json()["courses"] if c["id"] == course.id)
        assert course_data["owner_user_id"] == instructor.id
        assert course_data["owner_name"] == "ทดสอบ instr_shown_in_detail"

    def test_curriculum_detail_owner_none_when_unassigned(self, db, prep_school_user, curriculum, course):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{curriculum.id}/")
        course_data = next(c for c in resp.json()["courses"] if c["id"] == course.id)
        assert course_data["owner_user_id"] is None


class TestPersonnelSearchRoleFilterForInstructorAssignment:
    def test_prep_school_can_search_by_role(self, db, prep_school_user, organization):
        _make_user("instr_search_target", "instructor", organization)
        _make_user("instr_search_noise", "student", organization)
        client = Client()
        client.force_login(prep_school_user)
        resp = client.get("/military/api/v1/curriculum/personnel-search/?role=instructor")
        assert resp.status_code == 200
        names = {r["full_name"] for r in resp.json()["results"]}
        assert any("instr_search_target" in n for n in names)
        assert not any("instr_search_noise" in n for n in names)
