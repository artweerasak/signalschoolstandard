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
                "title": "แบบประเมินหลักสูตรรวม",
                "schema": {"questions": [{"key": "q1", "label": "ความพึงพอใจโดยรวม", "type": "rating"}]},
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


class TestEvaluationSchemaValidation:
    """บังคับให้ทุกคำถามมี key/label/type (rating|text) — ดู
    military_curriculum/evaluation_views.py:_validate_schema"""

    def _create(self, client, curriculum, questions):
        return client.post(
            "/military/api/v1/curriculum/evaluation-forms/",
            data=json.dumps({
                "curriculum_id": curriculum.id, "level": "curriculum",
                "title": "x", "schema": {"questions": questions},
            }),
            content_type="application/json",
        )

    def test_rejects_no_questions(self, db, evaluator_user, curriculum):
        client = Client()
        client.force_login(evaluator_user)
        resp = self._create(client, curriculum, [])
        assert resp.status_code == 400

    def test_rejects_missing_type(self, db, evaluator_user, curriculum):
        client = Client()
        client.force_login(evaluator_user)
        resp = self._create(client, curriculum, [{"key": "q1", "label": "x"}])
        assert resp.status_code == 400

    def test_rejects_invalid_type(self, db, evaluator_user, curriculum):
        client = Client()
        client.force_login(evaluator_user)
        resp = self._create(client, curriculum, [{"key": "q1", "label": "x", "type": "number"}])
        assert resp.status_code == 400

    def test_rejects_duplicate_keys(self, db, evaluator_user, curriculum):
        client = Client()
        client.force_login(evaluator_user)
        resp = self._create(client, curriculum, [
            {"key": "q1", "label": "a", "type": "rating"},
            {"key": "q1", "label": "b", "type": "text"},
        ])
        assert resp.status_code == 400

    def test_accepts_valid_mixed_questions(self, db, evaluator_user, curriculum):
        client = Client()
        client.force_login(evaluator_user)
        resp = self._create(client, curriculum, [
            {"key": "q1", "label": "ความพึงพอใจต่อผู้สอน", "type": "rating"},
            {"key": "q2", "label": "ข้อเสนอแนะเพิ่มเติม", "type": "text"},
        ])
        assert resp.status_code == 201, resp.content

    def test_patch_validates_new_schema(self, db, evaluator_user, curriculum):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="x",
            schema={"questions": [{"key": "q1", "label": "a", "type": "rating"}]},
            is_required=True, created_by=evaluator_user,
        )
        client = Client()
        client.force_login(evaluator_user)
        resp = client.patch(
            f"/military/api/v1/curriculum/evaluation-forms/{form.id}/",
            data=json.dumps({"schema": {"questions": []}}), content_type="application/json",
        )
        assert resp.status_code == 400


class TestEvaluationResponsesSummary:
    """สรุปผลจริงต่อคำถาม — rating ได้ค่าเฉลี่ย+distribution, text ได้รายการ
    คำตอบทั้งหมด (anonymous) ดู api_evaluation_form_responses_summary"""

    def test_rating_question_average_and_distribution(self, db, evaluator_user, curriculum, organization):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="แบบประเมิน",
            schema={"questions": [{"key": "q1", "label": "ความพึงพอใจ", "type": "rating"}]},
            is_required=True, created_by=evaluator_user,
        )
        for i, score in enumerate([5, 5, 3, 1]):
            s = _make_user(f"summary_student_{i}", "student", organization)
            EvaluationResponse.objects.create(form=form, student=s, answers={"q1": score})

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/evaluation-forms/{form.id}/responses/summary/")
        assert resp.status_code == 200
        q = resp.json()["questions"][0]
        assert q["type"] == "rating"
        assert q["average"] == 3.5
        assert q["distribution"] == {"1": 1, "2": 0, "3": 1, "4": 0, "5": 2}
        assert q["response_count"] == 4

    def test_text_question_lists_all_answers(self, db, evaluator_user, curriculum, organization):
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="แบบประเมิน",
            schema={"questions": [{"key": "q2", "label": "ข้อเสนอแนะ", "type": "text"}]},
            is_required=True, created_by=evaluator_user,
        )
        s1 = _make_user("summary_text_student_1", "student", organization)
        s2 = _make_user("summary_text_student_2", "student", organization)
        EvaluationResponse.objects.create(form=form, student=s1, answers={"q2": "สอนดีมาก"})
        EvaluationResponse.objects.create(form=form, student=s2, answers={"q2": "   "})  # ว่าง (whitespace) ไม่ควรถูกนับ

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/evaluation-forms/{form.id}/responses/summary/")
        q = resp.json()["questions"][0]
        assert q["type"] == "text"
        assert q["answers"] == ["สอนดีมาก"]
        assert q["response_count"] == 1

    def test_old_schema_without_type_defaults_to_text(self, db, evaluator_user, curriculum, organization):
        """แบบประเมินเก่าก่อนมี field type — สร้างตรงผ่าน ORM (ข้าม validation
        ของ view) จำลองข้อมูลเก่าในระบบจริง ต้องไม่ crash และถือเป็น text"""
        form = EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="แบบประเมินเก่า",
            schema={"questions": [{"key": "q1", "label": "ความเห็น"}]},
            is_required=True, created_by=evaluator_user,
        )
        s = _make_user("summary_legacy_student", "student", organization)
        EvaluationResponse.objects.create(form=form, student=s, answers={"q1": "ok"})

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/evaluation-forms/{form.id}/responses/summary/")
        assert resp.status_code == 200
        assert resp.json()["questions"][0]["type"] == "text"


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


class TestEvaluatorCurriculaList:
    """หน้า evaluator เดิมบังคับพิมพ์ curriculum_id เอง — endpoint นี้แทนที่
    ด้วยรายการเลือกได้ (ดู military_curriculum/evaluation_views.py:api_evaluator_curricula)"""

    def test_lists_submitted_active_closed_not_draft(self, db, organization, evaluator_user):
        creator = _make_user("evc_creator", "prep_school", organization)
        Curriculum.objects.create(
            name="ร่าง", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="draft",
        )
        Curriculum.objects.create(
            name="ส่งแล้ว", batch_code="2", academic_year=2570,
            organization=organization, created_by=creator, status="submitted",
        )
        Curriculum.objects.create(
            name="ใช้งาน", batch_code="3", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        Curriculum.objects.create(
            name="ปิดรุ่น", batch_code="4", academic_year=2570,
            organization=organization, created_by=creator, status="closed",
        )
        client = Client()
        client.force_login(evaluator_user)
        resp = client.get("/military/api/v1/curriculum/evaluator/curricula/")
        assert resp.status_code == 200
        names = {r["name"] for r in resp.json()["results"]}
        assert names == {"ส่งแล้ว", "ใช้งาน", "ปิดรุ่น"}

    def test_filters_by_academic_year(self, db, organization, evaluator_user):
        creator = _make_user("evc_creator_yr", "prep_school", organization)
        Curriculum.objects.create(
            name="ปีเก่า", batch_code="1", academic_year=2569,
            organization=organization, created_by=creator, status="active",
        )
        Curriculum.objects.create(
            name="ปีล่าสุด", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        client = Client()
        client.force_login(evaluator_user)
        resp = client.get("/military/api/v1/curriculum/evaluator/curricula/?academic_year=2570")
        assert resp.status_code == 200
        names = {r["name"] for r in resp.json()["results"]}
        assert names == {"ปีล่าสุด"}

    def test_sees_curricula_across_all_units(self, db, evaluator_user):
        org_a = Organization.objects.create(name="หน่วย ก เอวาล", code="EVC-A")
        org_b = Organization.objects.create(name="หน่วย ข เอวาล", code="EVC-B")
        creator_a = _make_user("evc_creator_a", "prep_school", org_a)
        creator_b = _make_user("evc_creator_b", "prep_school", org_b)
        Curriculum.objects.create(
            name="หน่วย ก", batch_code="1", academic_year=2570,
            organization=org_a, created_by=creator_a, status="active",
        )
        Curriculum.objects.create(
            name="หน่วย ข", batch_code="1", academic_year=2570,
            organization=org_b, created_by=creator_b, status="active",
        )
        client = Client()
        client.force_login(evaluator_user)
        resp = client.get("/military/api/v1/curriculum/evaluator/curricula/")
        names = {r["name"] for r in resp.json()["results"]}
        assert names == {"หน่วย ก", "หน่วย ข"}

    def test_student_forbidden(self, db, organization):
        student = _make_user("evc_forbidden_student", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.get("/military/api/v1/curriculum/evaluator/curricula/")
        assert resp.status_code == 403
