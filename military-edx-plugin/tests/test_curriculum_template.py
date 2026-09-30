"""
tests/test_curriculum_template.py

แม่แบบหลักสูตร (CurriculumTemplate) — บันทึกหลักสูตรที่ทำเสร็จแล้วเป็นแม่แบบ
แล้วสร้างหลักสูตรปี/รุ่นใหม่จากแม่แบบได้โดยไม่ต้องแอดวิชาใหม่ทั้งหมด
"""
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import Curriculum, CurriculumCourse, CurriculumTemplate, CurriculumTemplateCourse
from military_profile.models import MilitaryUserProfile, Organization, encrypt_field

User = get_user_model()


@pytest.fixture
def organization(db):
    return Organization.objects.create(name="หน่วยทดสอบ", code="TEST-01")


@pytest.fixture
def other_organization(db):
    return Organization.objects.create(name="หน่วยทดสอบอื่น", code="TEST-02")


def _make_user(username, role, organization=None):
    user = User.objects.create_user(username=username, password="testpass123")
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


@pytest.fixture
def curriculum_with_courses(db, organization, prep_school_user):
    c = Curriculum.objects.create(
        name="หลักสูตรต้นแบบ", batch_code="1", academic_year=2569,
        organization=organization, created_by=prep_school_user,
        eligible_rank_min="PVT", eligible_rank_max="SGT2",
        eligible_branch="signal", eligible_personnel_type=["military"],
        category="nco_basic", training_purpose="production",
        quota_total=20,
    )
    CurriculumCourse.objects.create(
        curriculum=c, course_id="course-v1:Org+1+Run", display_name="วิชา 1",
        sequence_order=1, credit_hours=10, credits=1,
    )
    CurriculumCourse.objects.create(
        curriculum=c, course_id="course-v1:Org+2+Run", display_name="วิชา 2",
        sequence_order=2, credit_hours=20, credits=2, is_required=False,
    )
    return c


# ---------------------------------------------------------------------------
# Model-level
# ---------------------------------------------------------------------------

class TestCurriculumTemplateModel:
    def test_str(self, organization, admin_user):
        t = CurriculumTemplate.objects.create(
            name="แม่แบบทดสอบ", organization=organization, created_by=admin_user,
        )
        assert str(t) == "แม่แบบทดสอบ"

    def test_course_ordering(self, organization, admin_user):
        t = CurriculumTemplate.objects.create(
            name="แม่แบบทดสอบ", organization=organization, created_by=admin_user,
        )
        CurriculumTemplateCourse.objects.create(
            template=t, course_id="course-v1:Org+2+Run", display_name="วิชา 2",
            sequence_order=2, credit_hours=10, credits=1,
        )
        CurriculumTemplateCourse.objects.create(
            template=t, course_id="course-v1:Org+1+Run", display_name="วิชา 1",
            sequence_order=1, credit_hours=10, credits=1,
        )
        names = list(t.courses.values_list("display_name", flat=True))
        assert names == ["วิชา 1", "วิชา 2"]

    def test_unique_course_per_template(self, organization, admin_user):
        t = CurriculumTemplate.objects.create(
            name="แม่แบบทดสอบ", organization=organization, created_by=admin_user,
        )
        CurriculumTemplateCourse.objects.create(
            template=t, course_id="course-v1:Org+1+Run", display_name="วิชา 1",
            sequence_order=1, credit_hours=10, credits=1,
        )
        with pytest.raises(Exception):
            CurriculumTemplateCourse.objects.create(
                template=t, course_id="course-v1:Org+1+Run", display_name="วิชา 1 (ซ้ำ)",
                sequence_order=2, credit_hours=10, credits=1,
            )


# ---------------------------------------------------------------------------
# View-level
# ---------------------------------------------------------------------------

class TestTemplateAPI:
    def test_list_requires_login(self, db):
        client = Client()
        resp = client.get("/military/api/v1/curriculum/templates/")
        assert resp.status_code == 401

    def test_student_forbidden(self, db, organization):
        student = _make_user("student1", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.get("/military/api/v1/curriculum/templates/")
        assert resp.status_code == 403

    def test_create_empty_template_then_add_course(self, db, prep_school_user):
        client = Client()
        client.force_login(prep_school_user)

        resp = client.post(
            "/military/api/v1/curriculum/templates/",
            data=json.dumps({"name": "แม่แบบเปล่า", "eligible_branch": "signal"}),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        template_id = resp.json()["id"]
        assert resp.json()["course_count"] == 0
        assert resp.json()["eligible_branch"] == "signal"

        resp = client.post(
            f"/military/api/v1/curriculum/templates/{template_id}/courses/",
            data=json.dumps({
                "course_id": "course-v1:Org+1+Run", "display_name": "วิชา 1",
                "credit_hours": 10, "credits": 1,
            }),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content

        resp = client.get(f"/military/api/v1/curriculum/templates/{template_id}/")
        assert resp.status_code == 200
        assert resp.json()["course_count"] == 1
        assert resp.json()["courses"][0]["display_name"] == "วิชา 1"

    def test_org_scoping(self, db, prep_school_user, other_organization, admin_user):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            "/military/api/v1/curriculum/templates/",
            data=json.dumps({"name": "แม่แบบของหน่วยเรา"}),
            content_type="application/json",
        )
        template_id = resp.json()["id"]

        other_user = _make_user("other_prep_school", "prep_school", other_organization)
        other_client = Client()
        other_client.force_login(other_user)

        resp = other_client.get(f"/military/api/v1/curriculum/templates/{template_id}/")
        assert resp.status_code == 403

        resp = other_client.get("/military/api/v1/curriculum/templates/")
        assert resp.json()["count"] == 0

        admin_client = Client()
        admin_client.force_login(admin_user)
        resp = admin_client.get(f"/military/api/v1/curriculum/templates/{template_id}/")
        assert resp.status_code == 200

    def test_patch_and_delete(self, db, prep_school_user):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            "/military/api/v1/curriculum/templates/",
            data=json.dumps({"name": "แม่แบบแก้ไข"}),
            content_type="application/json",
        )
        template_id = resp.json()["id"]

        resp = client.patch(
            f"/military/api/v1/curriculum/templates/{template_id}/",
            data=json.dumps({"name": "แม่แบบแก้ไขแล้ว", "eligible_rank_min": "PVT", "eligible_rank_max": "SGT2"}),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["name"] == "แม่แบบแก้ไขแล้ว"
        assert resp.json()["eligible_rank_min"] == "PVT"

        resp = client.delete(f"/military/api/v1/curriculum/templates/{template_id}/")
        assert resp.status_code == 200
        assert not CurriculumTemplate.objects.filter(pk=template_id).exists()

    def test_save_curriculum_as_template_copies_eligibility_and_courses(
        self, db, prep_school_user, curriculum_with_courses,
    ):
        client = Client()
        client.force_login(prep_school_user)

        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{curriculum_with_courses.id}/save-as-template/",
            data=json.dumps({"name": "แม่แบบจากหลักสูตรจริง"}),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        body = resp.json()
        assert body["eligible_rank_min"] == "PVT"
        assert body["eligible_rank_max"] == "SGT2"
        assert body["eligible_branch"] == "signal"
        assert body["eligible_personnel_type"] == ["military"]
        assert body["category"] == "nco_basic"
        assert body["training_purpose"] == "production"
        assert body["quota_total"] == 20
        assert len(body["courses"]) == 2
        names = sorted(c["display_name"] for c in body["courses"])
        assert names == ["วิชา 1", "วิชา 2"]

    def test_save_as_template_requires_at_least_one_course(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="หลักสูตรว่าง", batch_code="1", academic_year=2569,
            organization=organization, created_by=prep_school_user,
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{c.id}/save-as-template/",
            data=json.dumps({"name": "แม่แบบว่าง"}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_create_curriculum_from_template_copies_eligibility_and_courses(
        self, db, prep_school_user, curriculum_with_courses,
    ):
        client = Client()
        client.force_login(prep_school_user)

        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{curriculum_with_courses.id}/save-as-template/",
            data=json.dumps({"name": "แม่แบบสำหรับสร้างหลักสูตรใหม่"}),
            content_type="application/json",
        )
        template_id = resp.json()["id"]

        resp = client.post(
            f"/military/api/v1/curriculum/templates/{template_id}/create-curriculum/",
            data=json.dumps({
                "name": "หลักสูตรรุ่นใหม่", "batch_code": "2", "academic_year": 2570,
            }),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        body = resp.json()
        assert body["status"] == "draft"
        assert body["batch_code"] == "2"
        assert body["academic_year"] == 2570
        assert body["eligible_rank_min"] == "PVT"
        assert body["eligible_branch"] == "signal"

        new_curriculum = Curriculum.objects.get(pk=body["id"])
        assert new_curriculum.courses.count() == 2
        names = sorted(new_curriculum.courses.values_list("display_name", flat=True))
        assert names == ["วิชา 1", "วิชา 2"]

        # แม่แบบต้นฉบับต้องไม่ถูกแก้ไข (โคลน ไม่ใช่ move)
        template_courses = CurriculumTemplateCourse.objects.filter(template_id=template_id).count()
        assert template_courses == 2

    def test_create_curriculum_from_template_duplicate_conflict(
        self, db, prep_school_user, curriculum_with_courses,
    ):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            f"/military/api/v1/curriculum/curricula/{curriculum_with_courses.id}/save-as-template/",
            data=json.dumps({"name": "แม่แบบซ้ำ"}),
            content_type="application/json",
        )
        template_id = resp.json()["id"]

        resp = client.post(
            f"/military/api/v1/curriculum/templates/{template_id}/create-curriculum/",
            data=json.dumps({
                "name": curriculum_with_courses.name,
                "batch_code": curriculum_with_courses.batch_code,
                "academic_year": curriculum_with_courses.academic_year,
            }),
            content_type="application/json",
        )
        assert resp.status_code == 409

    def test_remove_template_course(self, db, prep_school_user):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            "/military/api/v1/curriculum/templates/",
            data=json.dumps({"name": "แม่แบบลบวิชา"}),
            content_type="application/json",
        )
        template_id = resp.json()["id"]
        resp = client.post(
            f"/military/api/v1/curriculum/templates/{template_id}/courses/",
            data=json.dumps({
                "course_id": "course-v1:Org+1+Run", "display_name": "วิชา 1",
                "credit_hours": 10, "credits": 1,
            }),
            content_type="application/json",
        )
        course_pk = resp.json()["id"]

        resp = client.delete(f"/military/api/v1/curriculum/templates/{template_id}/courses/{course_pk}/")
        assert resp.status_code == 200

        resp = client.get(f"/military/api/v1/curriculum/templates/{template_id}/")
        assert resp.json()["course_count"] == 0
