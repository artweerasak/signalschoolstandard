"""
tests/test_evaluation.py

Sprint 4: Evaluation Gatekeeper (evaluator)

gatekeeper_service.py ไม่มี edx-platform dependency (pure Django ORM) —
เทสชุดนี้ทดสอบเต็มรูปแบบได้จริง ไม่ต้อง mock
"""
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import (
    Curriculum, CurriculumCourse, CurriculumEnrollmentRequest, EvaluationForm, EvaluationResponse,
)
from military_curriculum.services.gatekeeper_service import is_evaluation_complete, get_pending_evaluations
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
    return Organization.objects.create(name="หน่วยทดสอบ", code="E-01")


@pytest.fixture
def evaluator_user(db):
    return _make_user("evaluator_user", "evaluator")


@pytest.fixture
def curriculum(db, organization):
    creator = _make_user("creator", "prep_school", organization)
    return Curriculum.objects.create(
        name="หลักสูตรทดสอบประเมิน", batch_code="1", academic_year=2570,
        organization=organization, created_by=creator, status="active",
    )


@pytest.fixture
def curriculum_course(db, curriculum):
    return CurriculumCourse.objects.create(
        curriculum=curriculum, course_id="course-v1:Signal+E101+2570", display_name="วิชาทดสอบประเมิน",
        credit_hours=10, credits=1,
    )


@pytest.fixture
def student_user(db, organization, curriculum, evaluator_user):
    s = _make_user("eval_student", "student", organization)
    CurriculumEnrollmentRequest.objects.create(
        curriculum=curriculum, student=s, requested_by=evaluator_user, status="completed",
    )
    return s


class TestGatekeeperService:
    def test_no_required_forms_passes_by_default(self, db, curriculum, student_user):
        assert is_evaluation_complete(student_user, curriculum=curriculum) is True

    def test_required_form_unanswered_blocks(self, db, curriculum, evaluator_user, student_user):
        EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="ประเมินหลักสูตร",
            schema={"q": []}, is_required=True, created_by=evaluator_user,
        )
        assert is_evaluation_complete(student_user, curriculum=curriculum) is False

    def test_answered_form_passes(self, db, curriculum, evaluator_user, student_user):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="ประเมินหลักสูตร",
            schema={"q": []}, is_required=True, created_by=evaluator_user,
        )
        EvaluationResponse.objects.create(form=form, student=student_user, answers={"a": 1})
        assert is_evaluation_complete(student_user, curriculum=curriculum) is True

    def test_optional_form_does_not_block(self, db, curriculum, evaluator_user, student_user):
        EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="ประเมินไม่บังคับ",
            schema={"q": []}, is_required=False, created_by=evaluator_user,
        )
        assert is_evaluation_complete(student_user, curriculum=curriculum) is True

    def test_course_level_scope_independent_of_curriculum_level(self, db, curriculum, curriculum_course, evaluator_user, student_user):
        EvaluationForm.objects.create(
            curriculum=curriculum, curriculum_course=curriculum_course, level="course",
            title="ประเมินวิชา", schema={"q": []}, is_required=True, created_by=evaluator_user,
        )
        # ยังไม่ตอบวิชา แต่ curriculum-level ไม่มี form บังคับ ต้องผ่านแยกกัน
        assert is_evaluation_complete(student_user, curriculum=curriculum) is True
        assert is_evaluation_complete(student_user, curriculum_course=curriculum_course) is False

    def test_get_pending_evaluations(self, db, curriculum, curriculum_course, evaluator_user, student_user):
        f1 = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="ประเมินหลักสูตร",
            schema={}, is_required=True, created_by=evaluator_user,
        )
        EvaluationForm.objects.create(
            curriculum=curriculum, curriculum_course=curriculum_course, level="course",
            title="ประเมินวิชา", schema={}, is_required=True, created_by=evaluator_user,
        )
        pending = get_pending_evaluations(student_user, curriculum)
        assert len(pending) == 2
        # ตอบ f1 แล้ว ต้องเหลือแค่ course-level
        EvaluationResponse.objects.create(form=f1, student=student_user, answers={})
        pending = get_pending_evaluations(student_user, curriculum)
        assert len(pending) == 1
        assert pending[0].level == "course"


class TestEvaluationFormAPI:
    def test_create_form_requires_evaluator(self, db, evaluator_user, curriculum):
        client = Client()
        client.force_login(evaluator_user)
        resp = client.post(
            "/military/api/v1/curriculum/evaluation-forms/",
            data=json.dumps({
                "curriculum_id": curriculum.id, "level": "curriculum",
                "title": "แบบประเมินหลักสูตรรวม", "schema": {"questions": []},
            }),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["level"] == "curriculum"

    def test_course_level_requires_curriculum_course_id(self, db, evaluator_user, curriculum):
        client = Client()
        client.force_login(evaluator_user)
        resp = client.post(
            "/military/api/v1/curriculum/evaluation-forms/",
            data=json.dumps({"curriculum_id": curriculum.id, "level": "course", "title": "x", "schema": {}}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_student_cannot_create_form(self, db, organization, curriculum):
        student = _make_user("no_permission_student", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.post(
            "/military/api/v1/curriculum/evaluation-forms/",
            data=json.dumps({"curriculum_id": curriculum.id, "level": "curriculum", "title": "x", "schema": {}}),
            content_type="application/json",
        )
        assert resp.status_code == 403

    def test_toggle_is_active(self, db, evaluator_user, curriculum):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="x", schema={},
            is_required=True, created_by=evaluator_user,
        )
        client = Client()
        client.force_login(evaluator_user)
        resp = client.patch(
            f"/military/api/v1/curriculum/evaluation-forms/{form.id}/",
            data=json.dumps({"is_active": False}), content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False


class TestEvaluationStatusDashboard:
    def test_dashboard_shows_completion_per_student(self, db, evaluator_user, curriculum, student_user):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="x", schema={},
            is_required=True, created_by=evaluator_user,
        )
        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/dashboard/evaluation-status/?curriculum_id={curriculum.id}")
        assert resp.status_code == 200
        row = resp.json()["results"][0]
        assert row["student_id"] == student_user.id
        assert row["curriculum_evaluation_complete"] is False

        EvaluationResponse.objects.create(form=form, student=student_user, answers={})
        resp = client.get(f"/military/api/v1/curriculum/dashboard/evaluation-status/?curriculum_id={curriculum.id}")
        assert resp.json()["results"][0]["curriculum_evaluation_complete"] is True


class TestStudentFacingEndpoints:
    def test_any_role_can_see_pending_evaluations(self, db, curriculum, evaluator_user, student_user):
        EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="ประเมินหลักสูตร",
            schema={}, is_required=True, created_by=evaluator_user,
        )
        client = Client()
        client.force_login(student_user)
        resp = client.get("/military/api/v1/curriculum/my/evaluations/pending/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_submit_evaluation(self, db, curriculum, evaluator_user, student_user):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="x", schema={},
            is_required=True, created_by=evaluator_user,
        )
        client = Client()
        client.force_login(student_user)
        resp = client.post(
            f"/military/api/v1/curriculum/my/evaluations/{form.id}/submit/",
            data=json.dumps({"answers": {"q1": "ดี"}}), content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        assert EvaluationResponse.objects.filter(form=form, student=student_user).exists()

    def test_duplicate_submit_rejected(self, db, curriculum, evaluator_user, student_user):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="x", schema={},
            is_required=True, created_by=evaluator_user,
        )
        EvaluationResponse.objects.create(form=form, student=student_user, answers={})
        client = Client()
        client.force_login(student_user)
        resp = client.post(
            f"/military/api/v1/curriculum/my/evaluations/{form.id}/submit/",
            data=json.dumps({"answers": {}}), content_type="application/json",
        )
        assert resp.status_code == 409

    def test_unauthenticated_cannot_access(self, db):
        client = Client()
        resp = client.get("/military/api/v1/curriculum/my/evaluations/pending/")
        assert resp.status_code == 401
