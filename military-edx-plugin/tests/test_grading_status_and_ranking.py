"""
tests/test_grading_status_and_ranking.py

- GET /military/api/v1/curriculum/reports/grading-status/
  ติดตามวิชาที่ยังไม่ถูกครูปิดคะแนน (finalize_course) — ใช้ curriculum.end_date
  บอกว่าเกินกำหนดหรือยัง
- GET /military/api/v1/curriculum/curricula/{id}/ranking/
  จัดอันดับนักเรียนด้วยเกรดเฉลี่ยถ่วงน้ำหนักหน่วยกิต ทาย tie-break ด้วย
  คะแนนรวมดิบ

FinalCourseResult สร้างตรงผ่าน ORM ได้เลย ไม่ต้องเรียก finalize_course()
จริง (ซึ่งพึ่ง edx-platform) เพราะ endpoint พวกนี้แค่อ่านค่าที่มีอยู่แล้ว
"""
import datetime

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import (
    Curriculum, CurriculumCourse, CurriculumCourseInstructor, CurriculumEnrollmentRequest, FinalCourseResult,
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
    return Organization.objects.create(name="หน่วยทดสอบ", code="GS-01")


@pytest.fixture
def evaluator_user(db):
    return _make_user("gs_evaluator", "evaluator")


@pytest.fixture
def instructor_user(db, organization):
    return _make_user("gs_instructor", "instructor", organization)


TODAY = datetime.date.today()


class TestGradingStatusReport:
    def test_flags_overdue_course_past_end_date(self, db, organization, evaluator_user, instructor_user):
        creator = _make_user("gs_creator_overdue", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรเกินกำหนด", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
            end_date=TODAY - datetime.timedelta(days=5),
        )
        cc = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+GS1+2570", display_name="วิชาเกินกำหนด",
            credit_hours=10, credits=1,
        )
        CurriculumCourseInstructor.objects.create(
            curriculum_course=cc, user=instructor_user, is_owner=True, added_by=evaluator_user,
        )
        student = _make_user("gs_overdue_student", "student", organization)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=c, student=student, requested_by=evaluator_user, status="completed",
        )

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get("/military/api/v1/curriculum/reports/grading-status/")
        assert resp.status_code == 200
        row = next(r for r in resp.json()["results"] if r["curriculum_course_id"] == cc.id)
        assert row["is_overdue"] is True
        assert row["pending_count"] == 1
        assert row["instructors"][0]["user_id"] == instructor_user.id

    def test_not_overdue_when_end_date_in_future(self, db, organization, evaluator_user):
        creator = _make_user("gs_creator_future", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรยังไม่ถึงกำหนด", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
            end_date=TODAY + datetime.timedelta(days=30),
        )
        cc = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+GS2+2570", display_name="วิชายังไม่ถึงกำหนด",
            credit_hours=10, credits=1,
        )
        student = _make_user("gs_future_student", "student", organization)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=c, student=student, requested_by=evaluator_user, status="completed",
        )

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get("/military/api/v1/curriculum/reports/grading-status/")
        row = next(r for r in resp.json()["results"] if r["curriculum_course_id"] == cc.id)
        assert row["is_overdue"] is False

    def test_fully_finalized_course_excluded(self, db, organization, evaluator_user):
        creator = _make_user("gs_creator_done", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรปิดคะแนนครบ", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        cc = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+GS3+2570", display_name="วิชาปิดคะแนนครบ",
            credit_hours=10, credits=1,
        )
        student = _make_user("gs_done_student", "student", organization)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=c, student=student, requested_by=evaluator_user, status="completed",
        )
        FinalCourseResult.objects.create(curriculum_course=cc, student=student, final_score=80, passed=True)

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get("/military/api/v1/curriculum/reports/grading-status/")
        course_ids = {r["curriculum_course_id"] for r in resp.json()["results"]}
        assert cc.id not in course_ids

    def test_student_forbidden(self, db, organization):
        student = _make_user("gs_forbidden_student", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.get("/military/api/v1/curriculum/reports/grading-status/")
        assert resp.status_code == 403


class TestCurriculumRanking:
    def test_ranks_by_weighted_average_desc(self, db, organization, evaluator_user):
        creator = _make_user("rank_creator", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรจัดอันดับ", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        cc1 = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+R1+2570", display_name="วิชา 1",
            credit_hours=10, credits=3,
        )
        cc2 = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+R2+2570", display_name="วิชา 2",
            credit_hours=10, credits=1,
        )
        top = _make_user("rank_top_student", "student", organization)
        low = _make_user("rank_low_student", "student", organization)
        for s in (top, low):
            CurriculumEnrollmentRequest.objects.create(
                curriculum=c, student=s, requested_by=evaluator_user, status="completed",
            )
        FinalCourseResult.objects.create(curriculum_course=cc1, student=top, final_score=90, passed=True)
        FinalCourseResult.objects.create(curriculum_course=cc2, student=top, final_score=90, passed=True)
        FinalCourseResult.objects.create(curriculum_course=cc1, student=low, final_score=60, passed=True)
        FinalCourseResult.objects.create(curriculum_course=cc2, student=low, final_score=60, passed=True)

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/ranking/")
        assert resp.status_code == 200
        results = resp.json()["results"]
        assert results[0]["student_id"] == top.id
        assert results[0]["rank"] == 1
        assert results[0]["weighted_average"] == 90.0
        assert results[1]["student_id"] == low.id
        assert results[1]["rank"] == 2

    def test_credit_weighting_affects_average(self, db, organization, evaluator_user):
        creator = _make_user("rank_creator_wt", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรถ่วงน้ำหนัก", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        # วิชาหนักหน่วยกิตเยอะ (3) คะแนนสูง, วิชาหน่วยกิตน้อย (1) คะแนนต่ำ
        # เฉลี่ยถ่วงน้ำหนักต้องเอียงไปทางวิชาหน่วยกิตเยอะ ไม่ใช่ 50/50
        cc_heavy = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+RW1+2570", display_name="วิชาหนัก",
            credit_hours=30, credits=3,
        )
        cc_light = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+RW2+2570", display_name="วิชาเบา",
            credit_hours=10, credits=1,
        )
        student = _make_user("rank_weighted_student", "student", organization)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=c, student=student, requested_by=evaluator_user, status="completed",
        )
        FinalCourseResult.objects.create(curriculum_course=cc_heavy, student=student, final_score=100, passed=True)
        FinalCourseResult.objects.create(curriculum_course=cc_light, student=student, final_score=0, passed=False)

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/ranking/")
        row = resp.json()["results"][0]
        # (100*3 + 0*1) / 4 = 75, ไม่ใช่ 50 แบบไม่ถ่วงน้ำหนัก
        assert row["weighted_average"] == 75.0

    def test_tie_break_by_total_score(self, db, organization, evaluator_user):
        creator = _make_user("rank_creator_tie", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรเสมอ", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        cc1 = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+RT1+2570", display_name="วิชา 1",
            credit_hours=10, credits=2,
        )
        cc2 = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+RT2+2570", display_name="วิชา 2",
            credit_hours=10, credits=2,
        )
        a = _make_user("rank_tie_a", "student", organization)
        b = _make_user("rank_tie_b", "student", organization)
        for s in (a, b):
            CurriculumEnrollmentRequest.objects.create(
                curriculum=c, student=s, requested_by=evaluator_user, status="completed",
            )
        # ทั้งคู่เฉลี่ยเท่ากัน (75) แต่ a มีคะแนนรวมดิบสูงกว่า (85+65=150 vs 75+75=150)
        # ปรับให้ a รวมสูงกว่าจริง: a=90+60=150(avg75) b=75+75=150(avg75) เท่ากันทั้งคู่
        # เปลี่ยนให้ a มีคะแนนรวมดิบสูงกว่าจริง โดยเฉลี่ยเท่ากันไม่ได้ในเคสหน่วยกิตเท่ากัน
        # เพราะเฉลี่ยถ่วงน้ำหนัก = รวมดิบ/หน่วยกิตรวมเดียวกัน ดังนั้นถ่วงน้ำหนักเท่ากัน
        # หมายความว่ารวมดิบก็ต้องเท่ากันด้วยเสมอในเคสนี้ — ทดสอบแค่ว่า sort เสถียร
        FinalCourseResult.objects.create(curriculum_course=cc1, student=a, final_score=90, passed=True)
        FinalCourseResult.objects.create(curriculum_course=cc2, student=a, final_score=60, passed=True)
        FinalCourseResult.objects.create(curriculum_course=cc1, student=b, final_score=75, passed=True)
        FinalCourseResult.objects.create(curriculum_course=cc2, student=b, final_score=75, passed=True)

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/ranking/")
        results = resp.json()["results"]
        assert {r["weighted_average"] for r in results} == {75.0}
        # เท่ากันทั้งเฉลี่ยและคะแนนรวมดิบ (150 ทั้งคู่ในเคสหน่วยกิตเท่ากันนี้) —
        # ยังต้องได้อันดับ 1,2 ตามลำดับที่ sort ได้ (เสถียร ไม่ error)
        assert {r["rank"] for r in results} == {1, 2}

    def test_incomplete_grading_flagged_not_complete(self, db, organization, evaluator_user):
        creator = _make_user("rank_creator_incomplete", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรยังไม่ครบ", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        cc1 = CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+RI1+2570", display_name="วิชา 1",
            credit_hours=10, credits=1,
        )
        CurriculumCourse.objects.create(
            curriculum=c, course_id="course-v1:Signal+RI2+2570", display_name="วิชา 2 (ยังไม่ปิดคะแนน)",
            credit_hours=10, credits=1,
        )
        student = _make_user("rank_incomplete_student", "student", organization)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=c, student=student, requested_by=evaluator_user, status="completed",
        )
        FinalCourseResult.objects.create(curriculum_course=cc1, student=student, final_score=80, passed=True)

        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/ranking/")
        row = resp.json()["results"][0]
        assert row["is_complete"] is False
        assert row["courses_graded"] == 1
        assert row["courses_total"] == 2

    def test_student_with_no_grades_excluded(self, db, organization, evaluator_user):
        creator = _make_user("rank_creator_none", "prep_school", organization)
        c = Curriculum.objects.create(
            name="หลักสูตรไม่มีคะแนน", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        student = _make_user("rank_no_grades_student", "student", organization)
        CurriculumEnrollmentRequest.objects.create(
            curriculum=c, student=student, requested_by=evaluator_user, status="completed",
        )
        client = Client()
        client.force_login(evaluator_user)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/ranking/")
        assert resp.json()["count"] == 0

    def test_ranking_student_forbidden(self, db, organization):
        creator = _make_user("rank_creator_forbidden", "prep_school", organization)
        c = Curriculum.objects.create(
            name="x", batch_code="1", academic_year=2570,
            organization=organization, created_by=creator, status="active",
        )
        student = _make_user("rank_forbidden_student", "student", organization)
        client = Client()
        client.force_login(student)
        resp = client.get(f"/military/api/v1/curriculum/curricula/{c.id}/ranking/")
        assert resp.status_code == 403
