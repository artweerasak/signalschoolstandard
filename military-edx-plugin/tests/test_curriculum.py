"""
tests/test_curriculum.py

Unit + integration tests สำหรับ military_curriculum (Sprint 0 models +
Sprint 1 Curriculum CRUD views)
"""
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import Curriculum, CurriculumCourse
from military_profile.models import MilitaryUserProfile, Organization, encrypt_field

User = get_user_model()


@pytest.fixture
def organization(db):
    return Organization.objects.create(name="หน่วยทดสอบ", code="TEST-01")


def _make_user(username, role, organization=None):
    user = User.objects.create_user(username=username, password="testpass123")
    # national_id_hmac ต้อง unique ต่อคน — เข้ารหัสค่าจาก username เพื่อให้
    # ถอดรหัสได้จริงตอน save() (MilitaryUserProfile คำนวณ hmac จาก plaintext
    # ที่ถอดรหัสแล้วทุกครั้งที่ save)
    user_id = encrypt_field(f"1-{username}-0000000000")
    MilitaryUserProfile.objects.create(
        user=user,
        national_id_encrypted=user_id,
        military_id_encrypted=encrypt_field(f"MIL-{username}"),
        full_name_th=f"ทดสอบ {username}",
        unit="หน่วยทดสอบ",
        role=role,
        organization=organization,
    )
    return user


@pytest.fixture
def prep_school_user(db, organization):
    return _make_user("prep_school_user", "prep_school", organization)


@pytest.fixture
def admin_user(db):
    return _make_user("admin_user", "admin")


# ---------------------------------------------------------------------------
# Model-level
# ---------------------------------------------------------------------------

class TestCurriculumModel:
    def test_str(self, organization, admin_user):
        c = Curriculum.objects.create(
            name="หลักสูตรทดสอบ", batch_code="1", academic_year=2569,
            organization=organization, created_by=admin_user,
        )
        assert "หลักสูตรทดสอบ" in str(c)
        assert c.status == "draft"

    def test_unique_together(self, organization, admin_user):
        Curriculum.objects.create(
            name="A", batch_code="1", academic_year=2569,
            organization=organization, created_by=admin_user,
        )
        with pytest.raises(Exception):
            Curriculum.objects.create(
                name="A", batch_code="1", academic_year=2569,
                organization=organization, created_by=admin_user,
            )

    def test_course_ordering(self, organization, admin_user):
        c = Curriculum.objects.create(
            name="B", batch_code="1", academic_year=2569,
            organization=organization, created_by=admin_user,
        )
        CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Org+2+Run", display_name="วิชา 2",
            sequence_order=2, credit_hours=10, credits=1,
        )
        CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Org+1+Run", display_name="วิชา 1",
            sequence_order=1, credit_hours=10, credits=1,
        )
        names = list(c.courses.values_list("display_name", flat=True))
        assert names == ["วิชา 1", "วิชา 2"]


# ---------------------------------------------------------------------------
# View-level (Curriculum CRUD, Sprint 1)
# ---------------------------------------------------------------------------

class TestCurriculumAPI:
    def test_create_requires_login(self, db):
        client = Client()
        resp = client.post(
            "/military/api/v1/curriculum/curricula/",
            data=json.dumps({}), content_type="application/json",
        )
        assert resp.status_code == 401

    def test_student_forbidden(self, db, organization):
        student = _make_user("student1", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.get("/military/api/v1/curriculum/curricula/")
        assert resp.status_code == 403

    def test_prep_school_full_flow(self, db, prep_school_user, organization):
        client = Client()
        client.force_login(prep_school_user)

        # 1) สร้างหลักสูตร (draft)
        resp = client.post(
            "/military/api/v1/curriculum/curricula/",
            data=json.dumps({
                "name": "หลักสูตรนายสิบ", "batch_code": "70", "academic_year": 2570,
                "organization_id": organization.id, "quota_total": 100,
                "region_quotas": [{"army_region": "1", "quota": 30}],
            }),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        curriculum_id = resp.json()["id"]
        assert resp.json()["status"] == "draft"
        assert resp.json()["region_quotas"][0]["army_region"] == "1"

        # 2) เพิ่มวิชา
        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{curriculum_id}/courses/",
            data=json.dumps({
                "course_id": "course-v1:Signal+101+2570",
                "display_name": "วิทยุพื้นฐาน",
                "credit_hours": 40, "credits": 2, "assessment_type": "score",
                "passing_score": 60,
            }),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content

        # 3) ยังส่งไม่ได้ก่อนมีวิชา — ตอนนี้มีวิชาแล้วเลยส่งได้
        resp = client.post(f"/military/api/v1/curriculum/curricula/{curriculum_id}/submit/")
        assert resp.status_code == 200, resp.content
        assert resp.json()["status"] == "submitted"

        # 4) แก้ไขไม่ได้อีกแล้วหลัง submit
        resp = client.patch(
            f"/military/api/v1/curriculum/curricula/{curriculum_id}/",
            data=json.dumps({"name": "เปลี่ยนชื่อ"}), content_type="application/json",
        )
        assert resp.status_code == 409

    def test_submit_without_courses_fails(self, db, prep_school_user, organization):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            "/military/api/v1/curriculum/curricula/",
            data=json.dumps({
                "name": "ว่างเปล่า", "batch_code": "1", "academic_year": 2570,
                "organization_id": organization.id,
            }),
            content_type="application/json",
        )
        curriculum_id = resp.json()["id"]
        resp = client.post(f"/military/api/v1/curriculum/curricula/{curriculum_id}/submit/")
        assert resp.status_code == 400

    def test_prep_school_cannot_see_other_org(self, db, organization):
        other_org = Organization.objects.create(name="หน่วยอื่น", code="TEST-02")
        other_prep_school = _make_user("other_prep", "prep_school", other_org)
        owner = _make_user("owner_prep", "prep_school", organization)

        c = Curriculum.objects.create(
            name="ของหน่วย 1", batch_code="1", academic_year=2570,
            organization=organization, created_by=owner,
        )

        client = Client()
        client.force_login(other_prep_school)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/")
        assert resp.status_code == 403
