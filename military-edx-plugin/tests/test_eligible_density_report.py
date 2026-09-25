"""
tests/test_eligible_density_report.py

GET /military/api/v1/curriculum/reports/eligible-density/?curriculum_id=

รายงานความคับคั่งของผู้มีสิทธิ์เข้าเรียนแยกตามหน่วย ใช้ประกอบการตัดสินใจ
แบ่งโควตา (ก่อนตัดสินใจ ต่างจาก quota-demand ที่ดูหลังตัดสินใจ)
"""
import datetime
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_curriculum.models import Curriculum
from military_profile.models import MilitaryUserProfile, Organization, encrypt_field

User = get_user_model()


def _make_user(username, role, organization=None, rank="", rank_effective_date=None, personnel_type="military"):
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
        rank_effective_date=rank_effective_date,
        personnel_type=personnel_type,
    )
    return user


@pytest.fixture
def org_a(db):
    return Organization.objects.create(name="หน่วย ก", code="DENS-A")


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="หน่วย ข", code="DENS-B")


@pytest.fixture
def prep_personnel_user(db):
    return _make_user("t_density_prep_personnel", "prep_personnel")


@pytest.fixture
def curriculum_factory(db, org_a):
    creator = _make_user("t_density_creator", "admin")

    def _make(**kwargs):
        defaults = dict(
            name="หลักสูตรทดสอบความคับคั่ง", batch_code="1", academic_year=2570,
            organization=org_a, created_by=creator,
        )
        defaults.update(kwargs)
        return Curriculum.objects.create(**defaults)
    return _make


TODAY = datetime.date.today()


class TestEligibleDensityReport:
    def test_requires_curriculum_id(self, db, prep_personnel_user):
        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get("/military/api/v1/curriculum/reports/eligible-density/")
        assert resp.status_code == 400

    def test_student_forbidden(self, db, org_a, curriculum_factory):
        c = curriculum_factory()
        student = _make_user("t_density_student", "student", org_a)
        client = Client()
        client.force_login(student)
        resp = client.get(f"/military/api/v1/curriculum/reports/eligible-density/?curriculum_id={c.id}")
        assert resp.status_code == 403

    def test_filters_by_rank_range(self, db, org_a, org_b, prep_personnel_user, curriculum_factory):
        c = curriculum_factory(eligible_rank_min="CPL", eligible_rank_max="CSGT")

        _make_user("t_in_range_a", "student", org_a, rank="SGT2")      # in range
        _make_user("t_below_range_a", "student", org_a, rank="PVT")    # below range
        _make_user("t_above_range_b", "student", org_b, rank="2LT")    # above range (officer)
        _make_user("t_in_range_b", "student", org_b, rank="SSGT")      # in range

        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/reports/eligible-density/?curriculum_id={c.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["national"]["eligible_count"] == 2
        by_org = {r["organization_id"]: r for r in body["results"]}
        assert by_org[org_a.id]["eligible_count"] == 1
        assert by_org[org_b.id]["eligible_count"] == 1

    def test_min_years_in_rank_splits_eligible_vs_needs_verification(self, db, org_a, prep_personnel_user, curriculum_factory):
        c = curriculum_factory(eligible_rank_min="CSGT", eligible_rank_max="CSGT", eligible_min_years_in_rank=2)

        old_enough = TODAY - datetime.timedelta(days=3 * 365)
        too_recent = TODAY - datetime.timedelta(days=30)

        _make_user("t_veteran", "student", org_a, rank="CSGT", rank_effective_date=old_enough)
        _make_user("t_too_new", "student", org_a, rank="CSGT", rank_effective_date=too_recent)
        _make_user("t_unverified", "student", org_a, rank="CSGT", rank_effective_date=None)

        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/reports/eligible-density/?curriculum_id={c.id}")
        assert resp.status_code == 200
        row = resp.json()["results"][0]
        assert row["eligible_count"] == 1
        assert row["needs_verification_count"] == 1
        assert row["total_in_scope"] == 3

    def test_filters_by_personnel_type(self, db, org_a, prep_personnel_user, curriculum_factory):
        c = curriculum_factory(eligible_personnel_type="civilian")

        _make_user("t_military", "student", org_a, personnel_type="military")
        _make_user("t_civilian", "student", org_a, personnel_type="civilian")

        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/reports/eligible-density/?curriculum_id={c.id}")
        assert resp.status_code == 200
        assert resp.json()["national"]["total_in_scope"] == 1

    def test_no_criteria_counts_all_non_admin_personnel(self, db, org_a, prep_personnel_user, curriculum_factory):
        c = curriculum_factory()
        _make_user("t_any_1", "student", org_a)
        _make_user("t_any_2", "instructor", org_a)
        _make_user("t_excluded_admin", "admin", org_a)

        client = Client()
        client.force_login(prep_personnel_user)
        resp = client.get(f"/military/api/v1/curriculum/reports/eligible-density/?curriculum_id={c.id}")
        assert resp.status_code == 200
        # scope ไปที่ org_a เท่านั้น (ไม่นับ prep_personnel_user เองที่ไม่ผูก
        # หน่วย — role prep_personnel ไม่ได้ถูก exclude เหมือน admin/org_admin
        # ตาม convention เดียวกับ api_org_admin_users) — admin ในหน่วยเดียวกัน
        # ต้องถูกตัดออก เหลือแค่ student+instructor = 2
        org_a_row = next(r for r in resp.json()["results"] if r["organization_id"] == org_a.id)
        assert org_a_row["eligible_count"] == 2
