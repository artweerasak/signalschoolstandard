"""
tests/test_transcript.py

Sprint 5: Learner Transcript (student)

get_gated_transcript() ไม่มี edx-platform dependency (pure Django ORM) —
เทสเต็มรูปแบบได้จริง
"""
import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import (
    Curriculum, CurriculumCourse, CurriculumEnrollmentRequest,
    EvaluationForm, EvaluationResponse, FinalCourseResult,
)
from military_curriculum.services.gatekeeper_service import get_gated_transcript
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
    return Organization.objects.create(name="หน่วยทดสอบ", code="T-01")


@pytest.fixture
def evaluator_user(db):
    return _make_user("t_evaluator", "evaluator")


@pytest.fixture
def curriculum(db, organization):
    creator = _make_user("t_creator", "prep_school", organization)
    return Curriculum.objects.create(
        name="หลักสูตรทดสอบ Transcript", batch_code="1", academic_year=2570,
        organization=organization, created_by=creator, status="active",
    )


@pytest.fixture
def curriculum_course(db, curriculum):
    return CurriculumCourse.objects.create(
        curriculum=curriculum, course_id="course-v1:Signal+T101+2570", display_name="วิชาทดสอบ Transcript",
        credit_hours=10, credits=3, assessment_type="score", passing_score=60,
    )


@pytest.fixture
def student_user(db, organization, curriculum, evaluator_user):
    s = _make_user("t_student", "student", organization)
    CurriculumEnrollmentRequest.objects.create(
        curriculum=curriculum, student=s, requested_by=evaluator_user, status="completed",
    )
    return s


class TestGetGatedTranscript:
    def test_no_gate_shows_grade(self, db, curriculum, curriculum_course, student_user):
        FinalCourseResult.objects.create(curriculum_course=curriculum_course, student=student_user, final_score=75, passed=True)
        result = get_gated_transcript(student_user)
        assert len(result) == 1
        course = result[0]["courses"][0]
        assert course["grade_visible"] is True
        assert course["final_score"] == "75.00"
        assert course["passed"] is True
        assert result[0]["certificate_available"] is True

    def test_gate_hides_grade_when_evaluation_pending(self, db, curriculum, curriculum_course, evaluator_user, student_user):
        FinalCourseResult.objects.create(curriculum_course=curriculum_course, student=student_user, final_score=75, passed=True)
        EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="ประเมินหลักสูตร",
            schema={}, is_required=True, created_by=evaluator_user,
        )
        result = get_gated_transcript(student_user)
        entry = result[0]
        assert entry["gate_reason"] == "pending_curriculum_evaluation"
        course = entry["courses"][0]
        # course-level gate ไม่มี form บังคับแยก จึง grade_visible=True เสมอ
        # (คนละ scope กับ curriculum-level) แต่ certificate_available=False
        # เพราะ curriculum-level ยังไม่ผ่าน
        assert course["grade_visible"] is True
        assert entry["certificate_available"] is False

    def test_course_level_gate_hides_only_that_course(self, db, curriculum, curriculum_course, evaluator_user, student_user):
        FinalCourseResult.objects.create(curriculum_course=curriculum_course, student=student_user, final_score=75, passed=True)
        EvaluationForm.objects.create(
            curriculum=curriculum, curriculum_course=curriculum_course, level="course",
            title="ประเมินวิชา", schema={}, is_required=True, created_by=evaluator_user,
        )
        result = get_gated_transcript(student_user)
        course = result[0]["courses"][0]
        assert course["grade_visible"] is False
        assert course["final_score"] is None
        assert course["passed"] is None
        assert course["gate_reason"] == "pending_course_evaluation"

    def test_no_enrollment_returns_empty(self, db, organization):
        lone_student = _make_user("lonely_student", "student", organization)
        assert get_gated_transcript(lone_student) == []

    def test_grade_computation_never_blocked_by_gate(self, db, curriculum, curriculum_course, evaluator_user, student_user):
        """การคำนวณเกรดจริง (FinalCourseResult) ต้องยังมีอยู่ในระบบเสมอ
        แม้ gate จะซ่อนไม่ให้ student เห็น — ตรวจสอบว่า record ไม่หาย"""
        fr = FinalCourseResult.objects.create(curriculum_course=curriculum_course, student=student_user, final_score=90, passed=True)
        EvaluationForm.objects.create(
            curriculum=curriculum, curriculum_course=curriculum_course, level="course",
            title="x", schema={}, is_required=True, created_by=evaluator_user,
        )
        get_gated_transcript(student_user)  # gate จะซ่อนใน response
        fr.refresh_from_db()
        assert fr.final_score == 90  # แต่ record จริงใน DB ไม่ถูกแตะ/ลบ


class TestTranscriptAPI:
    def test_transcript_requires_login(self, db):
        client = Client()
        resp = client.get("/military/api/v1/curriculum/my/transcript/")
        assert resp.status_code == 401

    def test_transcript_shows_own_data_only(self, db, curriculum, curriculum_course, student_user):
        FinalCourseResult.objects.create(curriculum_course=curriculum_course, student=student_user, final_score=80, passed=True)
        client = Client()
        client.force_login(student_user)
        resp = client.get("/military/api/v1/curriculum/my/transcript/")
        assert resp.status_code == 200
        assert len(resp.json()["curricula"]) == 1
        assert resp.json()["total_credits_earned"] == 3.0

    def test_certificate_blocked_before_gate_passed(self, db, curriculum, curriculum_course, evaluator_user, student_user):
        FinalCourseResult.objects.create(curriculum_course=curriculum_course, student=student_user, final_score=80, passed=True)
        EvaluationForm.objects.create(
            curriculum=curriculum, level="curriculum", title="x", schema={},
            is_required=True, created_by=evaluator_user,
        )
        client = Client()
        client.force_login(student_user)
        resp = client.get(f"/military/api/v1/curriculum/my/transcript/{curriculum.id}/certificate/")
        assert resp.status_code == 403
        assert resp.json()["available"] is False

    def test_certificate_available_after_gate_passed(self, db, curriculum, curriculum_course, student_user):
        FinalCourseResult.objects.create(curriculum_course=curriculum_course, student=student_user, final_score=80, passed=True)
        client = Client()
        client.force_login(student_user)
        resp = client.get(f"/military/api/v1/curriculum/my/transcript/{curriculum.id}/certificate/")
        assert resp.status_code == 200
        assert resp.json()["available"] is True

    def test_certificate_not_found_for_unrelated_curriculum(self, db, student_user):
        client = Client()
        client.force_login(student_user)
        resp = client.get("/military/api/v1/curriculum/my/transcript/99999/certificate/")
        assert resp.status_code == 404
