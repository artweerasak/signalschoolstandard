"""
tests/test_school_curriculum_roster.py

Sprint 1: roster หลักสูตรสำหรับ org_admin ของ "โรงเรียนทหารสื่อสาร
กรมการทหารสื่อสาร" (organization id=161) เท่านั้น — org_admin หน่วยอื่น
ต้องโดน 403 เสมอ (ดู military_curriculum/permissions.py)
"""
import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import Curriculum, CurriculumEnrollmentRequest
from military_curriculum.permissions import SIGNAL_SCHOOL_ORG_ID
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
def signal_school_org(db):
    # SIGNAL_SCHOOL_ORG_ID เป็น pk ตายตัว (161) — ต้องบังคับ pk ตอนสร้างใน test DB
    return Organization.objects.create(
        id=SIGNAL_SCHOOL_ORG_ID, name="โรงเรียนทหารสื่อสาร กรมการทหารสื่อสาร", code="RS-SS",
    )


@pytest.fixture
def other_org(db):
    return Organization.objects.create(name="หน่วยอื่น", code="T-OTHER")


@pytest.fixture
def school_org_admin(db, signal_school_org):
    return _make_user("t_school_org_admin", "org_admin", signal_school_org)


@pytest.fixture
def other_org_admin(db, other_org):
    return _make_user("t_other_org_admin", "org_admin", other_org)


@pytest.fixture
def admin_user(db):
    return _make_user("t_admin", "admin")


@pytest.fixture
def school_curriculum(db, signal_school_org, admin_user):
    return Curriculum.objects.create(
        name="หลักสูตร รร.ส.สส. ทดสอบ", batch_code="1", academic_year=2569,
        organization=signal_school_org, created_by=admin_user,
    )


@pytest.fixture
def other_curriculum(db, other_org, admin_user):
    return Curriculum.objects.create(
        name="หลักสูตรหน่วยอื่น", batch_code="1", academic_year=2569,
        organization=other_org, created_by=admin_user,
    )


class TestApiSchoolCurricula:
    def test_requires_login(self, db):
        client = Client()
        resp = client.get("/military/api/v1/curriculum/school/curricula/")
        assert resp.status_code == 401

    def test_other_unit_org_admin_forbidden(self, db, other_org_admin):
        client = Client()
        client.force_login(other_org_admin)
        resp = client.get("/military/api/v1/curriculum/school/curricula/")
        assert resp.status_code == 403

    def test_plain_student_forbidden(self, db):
        student = _make_user("t_student_plain", "student")
        client = Client()
        client.force_login(student)
        resp = client.get("/military/api/v1/curriculum/school/curricula/")
        assert resp.status_code == 403

    def test_school_org_admin_sees_school_curricula_only(
        self, db, school_org_admin, school_curriculum, other_curriculum,
    ):
        client = Client()
        client.force_login(school_org_admin)
        resp = client.get("/military/api/v1/curriculum/school/curricula/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 1
        assert body["results"][0]["id"] == school_curriculum.id

    def test_academic_year_filter(self, db, school_org_admin, school_curriculum):
        client = Client()
        client.force_login(school_org_admin)
        resp = client.get("/military/api/v1/curriculum/school/curricula/?academic_year=2570")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_admin_sees_school_curricula(self, db, admin_user, school_curriculum, other_curriculum):
        client = Client()
        client.force_login(admin_user)
        resp = client.get("/military/api/v1/curriculum/school/curricula/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1
        assert resp.json()["results"][0]["id"] == school_curriculum.id


class TestApiSchoolCurriculumRoster:
    def test_other_unit_org_admin_forbidden(self, db, other_org_admin, school_curriculum):
        client = Client()
        client.force_login(other_org_admin)
        resp = client.get(f"/military/api/v1/curriculum/school/curricula/{school_curriculum.id}/roster/")
        assert resp.status_code == 403

    def test_curriculum_from_other_unit_returns_404(self, db, school_org_admin, other_curriculum):
        client = Client()
        client.force_login(school_org_admin)
        resp = client.get(f"/military/api/v1/curriculum/school/curricula/{other_curriculum.id}/roster/")
        assert resp.status_code == 404

    def test_roster_lists_enrolled_students_with_count(
        self, db, school_org_admin, school_curriculum, admin_user, signal_school_org,
    ):
        s1 = _make_user("t_roster_student1", "student", signal_school_org)
        s2 = _make_user("t_roster_student2", "student", signal_school_org)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=school_curriculum, student=s1, requested_by=admin_user, status="completed",
        )
        CurriculumEnrollmentRequest.objects.create(
            curriculum=school_curriculum, student=s2, requested_by=admin_user, status="partial_failed",
        )

        client = Client()
        client.force_login(school_org_admin)
        resp = client.get(f"/military/api/v1/curriculum/school/curricula/{school_curriculum.id}/roster/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 2
        assert {r["student_id"] for r in body["results"]} == {s1.id, s2.id}

    def test_pending_enrollment_not_counted_as_roster(
        self, db, school_org_admin, school_curriculum, admin_user, signal_school_org,
    ):
        s1 = _make_user("t_roster_pending", "student", signal_school_org)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=school_curriculum, student=s1, requested_by=admin_user, status="pending",
        )
        client = Client()
        client.force_login(school_org_admin)
        resp = client.get(f"/military/api/v1/curriculum/school/curricula/{school_curriculum.id}/roster/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0
