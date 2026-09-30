"""
tests/test_curriculum_category_prerequisite.py

ประเภทหลักสูตร (category) + เงื่อนไข prerequisite ข้ามหลักสูตร
(eligible_prerequisite_categories) — ใช้กรณีเช่น "ต้องผ่านนายสิบชั้นต้นมาก่อน
ถึงจะเข้าเกณฑ์นายสิบอาวุโส" โดยไม่ผูกกับชื่อ/รุ่นที่อาจสะกดต่างกันไปในแต่ละปี

ครอบคลุม:
- model helper has_completed_curriculum_category / student_ids_completed_curriculum_category
- validation ตอน create/PATCH curriculum (category, eligible_prerequisite_categories)
- ฟิลด์ metadata (name/batch_code/academic_year/dates) แก้ได้ทุกสถานะ ต่างจาก
  เกณฑ์คุณสมบัติ/โควตา/ประเภทหลักสูตร ที่ยังแก้ได้แค่ draft
- ลบหลักสูตร (เฉพาะ draft)
- integration กับ api_eligible_density_report / api_curriculum_personnel_search
- self-edit LegacyCurriculumCompletion (กำลังพลกรอกเองว่าเคยผ่านมาก่อนระบบนี้)
"""
import json
from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import (
    Curriculum, CurriculumCourse, CurriculumEnrollmentRequest, FinalCourseResult,
    LegacyCurriculumCompletion, has_completed_curriculum_category,
    student_ids_completed_curriculum_category,
)
from military_profile.models import MilitaryUserProfile, Organization, encrypt_field

User = get_user_model()


def _make_user(username, role, organization=None, rank="", personnel_type="military"):
    user = User.objects.create_user(username=username, password="testpass123")
    MilitaryUserProfile.objects.create(
        user=user,
        national_id_encrypted=encrypt_field(f"1-{username}-0000000000"),
        military_id_encrypted=encrypt_field(f"MIL-{username}"),
        full_name_th=f"ทดสอบ {username}",
        unit="หน่วยทดสอบ",
        role=role,
        organization=organization,
        rank=rank,
        personnel_type=personnel_type,
    )
    return user


@pytest.fixture
def organization(db):
    return Organization.objects.create(name="หน่วยทดสอบ", code="CAT-01")


@pytest.fixture
def prep_school_user(db, organization):
    return _make_user("cat_prep_school", "prep_school", organization)


@pytest.fixture
def prep_personnel_user(db):
    return _make_user("cat_prep_personnel", "prep_personnel")


def _prereq(category, min_years_since=None):
    """สร้าง entry เดียวของ eligible_prerequisite_categories (list ของ dict
    {"category","min_years_since"} ตั้งแต่ PR แผนกเตรียมการ — เดิมเป็น list[str] เฉยๆ)"""
    return {"category": category, "min_years_since": min_years_since}


def _make_passed_curriculum(organization, creator, category, course_count=2, credit=1):
    c = Curriculum.objects.create(
        name=f"หลักสูตร {category}", batch_code="1", academic_year=2569,
        organization=organization, created_by=creator, status="closed", category=category,
    )
    courses = [
        CurriculumCourse.objects.create(
            curriculum=c, course_id=f"course-v1:Cat+{category}{i}+2569", display_name=f"วิชา {i}",
            sequence_order=i, credit_hours=10, credits=credit,
        )
        for i in range(course_count)
    ]
    return c, courses


class TestCurriculumCategoryModel:
    def test_str_with_no_courses_never_counts_as_passed(self, db, organization):
        creator = _make_user("cat_creator_empty", "prep_school", organization)
        student = _make_user("cat_student_empty_curr", "student", organization)
        Curriculum.objects.create(
            name="หลักสูตรไม่มีวิชา", batch_code="1", academic_year=2569,
            organization=organization, created_by=creator, category="nco_basic",
        )
        assert not has_completed_curriculum_category(student, [_prereq("nco_basic")])

    def test_passes_when_all_courses_passed(self, db, organization):
        creator = _make_user("cat_creator_pass", "prep_school", organization)
        student = _make_user("cat_student_pass", "student", organization)
        c, courses = _make_passed_curriculum(organization, creator, "nco_basic")
        for cc in courses:
            FinalCourseResult.objects.create(curriculum_course=cc, student=student, passed=True)

        assert has_completed_curriculum_category(student, [_prereq("nco_basic")]) is True
        assert student.id in student_ids_completed_curriculum_category([_prereq("nco_basic")])

    def test_fails_when_only_some_courses_passed(self, db, organization):
        creator = _make_user("cat_creator_partial", "prep_school", organization)
        student = _make_user("cat_student_partial", "student", organization)
        c, courses = _make_passed_curriculum(organization, creator, "nco_basic")
        FinalCourseResult.objects.create(curriculum_course=courses[0], student=student, passed=True)
        FinalCourseResult.objects.create(curriculum_course=courses[1], student=student, passed=False)

        assert has_completed_curriculum_category(student, [_prereq("nco_basic")]) is False

    def test_different_category_curriculum_not_counted(self, db, organization):
        creator = _make_user("cat_creator_wrong_cat", "prep_school", organization)
        student = _make_user("cat_student_wrong_cat", "student", organization)
        c, courses = _make_passed_curriculum(organization, creator, "officer_company")
        for cc in courses:
            FinalCourseResult.objects.create(curriculum_course=cc, student=student, passed=True)

        assert has_completed_curriculum_category(student, [_prereq("nco_basic")]) is False

    def test_legacy_completion_counts_as_passed(self, db, organization):
        student = _make_user("cat_student_legacy", "student", organization)
        LegacyCurriculumCompletion.objects.create(student=student, category="nco_basic", note="จบปี 2560")
        assert has_completed_curriculum_category(student, [_prereq("nco_basic")]) is True

    def test_legacy_completion_does_not_count_when_min_years_since_set(self, db, organization):
        """LegacyCurriculumCompletion ไม่มีวันที่ผ่านเก็บไว้เลย จึงไม่นับเข้า
        เกณฑ์ที่มีเงื่อนไขปีกำกับ (ดู docstring student_ids_completed_curriculum_category)"""
        student = _make_user("cat_student_legacy_years", "student", organization)
        LegacyCurriculumCompletion.objects.create(student=student, category="nco_basic", note="จบปี 2560")
        assert has_completed_curriculum_category(student, [_prereq("nco_basic", min_years_since=2)]) is False

    def test_min_years_since_blocks_recent_completion(self, db, organization):
        creator = _make_user("cat_creator_recent", "prep_school", organization)
        student = _make_user("cat_student_recent", "student", organization)
        c, courses = _make_passed_curriculum(organization, creator, "nco_basic")
        c.end_date = date.today() - timedelta(days=30)  # จบมาแค่ ~1 เดือน
        c.save(update_fields=["end_date"])
        for cc in courses:
            FinalCourseResult.objects.create(curriculum_course=cc, student=student, passed=True)

        assert has_completed_curriculum_category(student, [_prereq("nco_basic", min_years_since=2)]) is False
        assert has_completed_curriculum_category(student, [_prereq("nco_basic")]) is True

    def test_min_years_since_allows_old_enough_completion(self, db, organization):
        creator = _make_user("cat_creator_old", "prep_school", organization)
        student = _make_user("cat_student_old", "student", organization)
        c, courses = _make_passed_curriculum(organization, creator, "nco_basic")
        c.end_date = date.today() - timedelta(days=365 * 3)  # จบมาแล้ว ~3 ปี
        c.save(update_fields=["end_date"])
        for cc in courses:
            FinalCourseResult.objects.create(curriculum_course=cc, student=student, passed=True)

        assert has_completed_curriculum_category(student, [_prereq("nco_basic", min_years_since=2)]) is True

    def test_min_years_since_ignores_completion_with_no_end_date(self, db, organization):
        """หลักสูตรที่ไม่มี end_date ถือว่าไม่ทราบวันที่ผ่าน ไม่นับเข้าเกณฑ์ที่
        มีเงื่อนไขปีกำกับ (แต่ยังนับเข้าเกณฑ์ที่ไม่มีเงื่อนไขปีตามปกติ)"""
        creator = _make_user("cat_creator_noend", "prep_school", organization)
        student = _make_user("cat_student_noend", "student", organization)
        c, courses = _make_passed_curriculum(organization, creator, "nco_basic")
        assert c.end_date is None
        for cc in courses:
            FinalCourseResult.objects.create(curriculum_course=cc, student=student, passed=True)

        assert has_completed_curriculum_category(student, [_prereq("nco_basic", min_years_since=2)]) is False
        assert has_completed_curriculum_category(student, [_prereq("nco_basic")]) is True

    def test_empty_category_list_means_no_restriction(self, db, organization):
        student = _make_user("cat_student_norestriction", "student", organization)
        assert has_completed_curriculum_category(student, []) is True


class TestCurriculumCreateWithCategory:
    def test_create_with_category_and_prerequisite(self, db, prep_school_user, organization):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            "/military/api/v1/curriculum/curricula/",
            data=json.dumps({
                "name": "นายสิบอาวุโส", "batch_code": "1", "academic_year": 2570,
                "organization_id": organization.id,
                "category": "nco_senior",
                "eligible_prerequisite_categories": [{"category": "nco_basic", "min_years_since": 2}],
            }),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        body = resp.json()
        assert body["category"] == "nco_senior"
        assert body["category_display"] == "นายสิบชั้นสูง (อาวุโส)"
        assert body["eligible_prerequisite_categories"] == [{"category": "nco_basic", "min_years_since": 2}]
        assert body["eligible_prerequisite_categories_display"] == [
            {"category": "nco_basic", "category_display": "นายสิบชั้นต้น", "min_years_since": 2}
        ]

    def test_create_rejects_invalid_category(self, db, prep_school_user, organization):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            "/military/api/v1/curriculum/curricula/",
            data=json.dumps({
                "name": "x", "batch_code": "1", "academic_year": 2570,
                "organization_id": organization.id, "category": "ไม่มีอยู่จริง",
            }),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_create_rejects_invalid_prerequisite_category(self, db, prep_school_user, organization):
        client = Client()
        client.force_login(prep_school_user)
        resp = client.post(
            "/military/api/v1/curriculum/curricula/",
            data=json.dumps({
                "name": "x", "batch_code": "1", "academic_year": 2570,
                "organization_id": organization.id,
                "eligible_prerequisite_categories": [{"category": "ไม่มีอยู่จริง"}],
            }),
            content_type="application/json",
        )
        assert resp.status_code == 400


class TestCurriculumEditableFieldsRegardlessOfStatus:
    def test_metadata_fields_editable_when_active(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="ชื่อเดิม", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="active",
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.patch(
            f"/military/api/v1/curriculum/curricula/{c.id}/",
            data=json.dumps({
                "name": "ชื่อใหม่ที่แก้แล้ว", "batch_code": "2", "academic_year": 2571,
                "start_date": "2571-01-01", "end_date": "2571-06-30",
            }),
            content_type="application/json",
        )
        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["name"] == "ชื่อใหม่ที่แก้แล้ว"
        assert body["batch_code"] == "2"
        assert body["academic_year"] == 2571
        assert body["start_date"] == "2571-01-01"

    def test_eligibility_fields_still_blocked_when_active(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="x", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="active",
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.patch(
            f"/military/api/v1/curriculum/curricula/{c.id}/",
            data=json.dumps({"eligible_rank_min": "CPL"}),
            content_type="application/json",
        )
        assert resp.status_code == 409

    def test_category_fields_still_blocked_when_submitted(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="x", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="submitted",
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.patch(
            f"/military/api/v1/curriculum/curricula/{c.id}/",
            data=json.dumps({"eligible_prerequisite_categories": ["nco_basic"]}),
            content_type="application/json",
        )
        assert resp.status_code == 409

    def test_quota_total_still_blocked_when_active(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="x", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="active", quota_total=5,
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.patch(
            f"/military/api/v1/curriculum/curricula/{c.id}/",
            data=json.dumps({"quota_total": 99}),
            content_type="application/json",
        )
        assert resp.status_code == 409

    def test_metadata_and_eligibility_together_rejected_when_not_draft(self, db, prep_school_user, organization):
        """ถ้าส่งฟิลด์ที่แก้ไม่ได้ปนมากับฟิลด์ที่แก้ได้ ในสถานะที่ไม่ใช่ draft
        ต้อง reject ทั้งก้อน (ไม่ apply บางส่วนแล้วเงียบๆ ข้ามส่วนที่ block)"""
        c = Curriculum.objects.create(
            name="เดิม", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="active",
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.patch(
            f"/military/api/v1/curriculum/curricula/{c.id}/",
            data=json.dumps({"name": "ใหม่", "quota_total": 99}),
            content_type="application/json",
        )
        assert resp.status_code == 409
        c.refresh_from_db()
        assert c.name == "เดิม"


class TestCurriculumDelete:
    def test_delete_draft_succeeds(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="ร่างผิด", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="draft",
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.delete(f"/military/api/v1/curriculum/curricula/{c.id}/")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True
        assert not Curriculum.objects.filter(pk=c.id).exists()

    def test_delete_blocked_when_not_draft(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="x", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="submitted",
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.delete(f"/military/api/v1/curriculum/curricula/{c.id}/")
        assert resp.status_code == 409
        assert Curriculum.objects.filter(pk=c.id).exists()

    def test_delete_cascades_courses(self, db, prep_school_user, organization):
        c = Curriculum.objects.create(
            name="ร่างมีวิชา", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_school_user, status="draft",
        )
        CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Del+101+2570", display_name="วิชา",
            sequence_order=1, credit_hours=10, credits=1,
        )
        client = Client()
        client.force_login(prep_school_user)
        resp = client.delete(f"/military/api/v1/curriculum/curricula/{c.id}/")
        assert resp.status_code == 200
        assert CurriculumCourse.objects.filter(curriculum_id=c.id).count() == 0


class TestEligibleDensityReportPrerequisite:
    def test_filters_by_prerequisite_category(self, db, prep_personnel_user, organization):
        creator = _make_user("cat_density_creator", "prep_school", organization)
        prereq_c, prereq_courses = _make_passed_curriculum(organization, creator, "nco_basic")

        passed_student = _make_user("cat_density_passed", "student", organization)
        not_passed_student = _make_user("cat_density_not_passed", "student", organization)
        for cc in prereq_courses:
            FinalCourseResult.objects.create(curriculum_course=cc, student=passed_student, passed=True)

        target = Curriculum.objects.create(
            name="นายสิบอาวุโส เทส", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_personnel_user,
            eligible_prerequisite_categories=[_prereq("nco_basic")],
        )

        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/reports/eligible-density/?curriculum_id={target.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["eligible_prerequisite_categories_display"] == [
            {"category": "nco_basic", "category_display": "นายสิบชั้นต้น", "min_years_since": None}
        ]
        assert body["national"]["eligible_count"] == 1
        row = body["results"][0]
        assert row["eligible_count"] == 1


class TestPersonnelSearchPrerequisite:
    def test_curriculum_id_narrows_by_prerequisite_category(self, db, prep_personnel_user, organization):
        creator = _make_user("cat_search_creator", "prep_school", organization)
        prereq_c, prereq_courses = _make_passed_curriculum(organization, creator, "nco_basic")

        passed_student = _make_user("cat_search_passed", "student", organization)
        not_passed_student = _make_user("cat_search_not_passed", "student", organization)
        for cc in prereq_courses:
            FinalCourseResult.objects.create(curriculum_course=cc, student=passed_student, passed=True)

        target = Curriculum.objects.create(
            name="เทสค้นหา", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_personnel_user,
            eligible_prerequisite_categories=[_prereq("nco_basic")],
        )

        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/personnel-search/?curriculum_id={target.id}")
        names = {r["full_name"] for r in resp.json()["results"]}
        assert any("cat_search_passed" in n for n in names)
        assert not any("cat_search_not_passed" in n for n in names)


class TestOrgQuotasHasEligibilityCriteriaIncludesPrerequisite:
    def test_prerequisite_only_marks_has_eligibility_criteria(self, db, prep_personnel_user, organization):
        c = Curriculum.objects.create(
            name="x", batch_code="1", academic_year=2570,
            organization=organization, created_by=prep_personnel_user,
            eligible_prerequisite_categories=[_prereq("nco_basic")],
        )
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/org-quotas/")
        body = resp.json()
        assert body["has_eligibility_criteria"] is True
        assert body["eligible_prerequisite_categories_display"] == [
            {"category": "nco_basic", "category_display": "นายสิบชั้นต้น", "min_years_since": None}
        ]


class TestLegacyCurriculumCompletionSelfEdit:
    def test_requires_login(self, db):
        client = Client()
        resp = client.get("/military/api/v1/curriculum/my/legacy-completions/")
        assert resp.status_code == 401

    def test_create_and_list_own_completion(self, db, organization):
        student = _make_user("legacy_self_student", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.post(
            "/military/api/v1/curriculum/my/legacy-completions/",
            data=json.dumps({"category": "nco_basic", "note": "จบปี 2560 ก่อนมีระบบ"}),
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["category_display"] == "นายสิบชั้นต้น"

        get_resp = client.get("/military/api/v1/curriculum/my/legacy-completions/")
        rows = get_resp.json()["results"]
        assert len(rows) == 1
        assert rows[0]["category"] == "nco_basic"
        assert rows[0]["note"] == "จบปี 2560 ก่อนมีระบบ"

    def test_post_upserts_not_duplicates(self, db, organization):
        student = _make_user("legacy_upsert_student", "student", organization)
        client = Client()
        client.force_login(student)
        for note in ("first", "second"):
            resp = client.post(
                "/military/api/v1/curriculum/my/legacy-completions/",
                data=json.dumps({"category": "nco_basic", "note": note}),
                content_type="application/json",
            )
            assert resp.status_code == 201
        rows = LegacyCurriculumCompletion.objects.filter(student=student)
        assert rows.count() == 1
        assert rows.first().note == "second"

    def test_rejects_invalid_category(self, db, organization):
        student = _make_user("legacy_invalid_student", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.post(
            "/military/api/v1/curriculum/my/legacy-completions/",
            data=json.dumps({"category": "ไม่มีอยู่จริง"}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_delete_own_completion(self, db, organization):
        student = _make_user("legacy_delete_student", "student", organization)
        LegacyCurriculumCompletion.objects.create(student=student, category="nco_basic")
        client = Client()
        client.force_login(student)
        resp = client.delete("/military/api/v1/curriculum/my/legacy-completions/?category=nco_basic")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True
        assert not LegacyCurriculumCompletion.objects.filter(student=student).exists()

    def test_cannot_see_or_delete_others_completion(self, db, organization):
        student_a = _make_user("legacy_isolation_a", "student", organization)
        student_b = _make_user("legacy_isolation_b", "student", organization)
        LegacyCurriculumCompletion.objects.create(student=student_a, category="nco_basic")

        client = Client()
        client.force_login(student_b)
        get_resp = client.get("/military/api/v1/curriculum/my/legacy-completions/")
        assert get_resp.json()["results"] == []

        del_resp = client.delete("/military/api/v1/curriculum/my/legacy-completions/?category=nco_basic")
        assert del_resp.json()["deleted"] is False
        assert LegacyCurriculumCompletion.objects.filter(student=student_a).exists()
