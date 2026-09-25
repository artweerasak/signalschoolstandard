"""
tests/test_profile_self_edit.py

Unit + integration tests สำหรับ PATCH /military/api/v1/my/profile/complete/
เฉพาะส่วน rank/rank_effective_date self-edit (v1 — มีผลทันที ไม่มี approval gate)
"""
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from military_profile.models import MilitaryUserProfile, encrypt_field

User = get_user_model()


def _make_student(username="student_1"):
    user = User.objects.create_user(username=username, password="testpass123")
    user_id = encrypt_field(f"1-{username}-0000000000")
    MilitaryUserProfile.objects.create(
        user=user,
        national_id_encrypted=user_id,
        military_id_encrypted=encrypt_field(f"MIL-{username}"),
        full_name_th=f"ทดสอบ {username}",
        unit="หน่วยทดสอบ",
        role="student",
    )
    return user


@pytest.fixture
def student(db):
    return _make_student()


class TestRankSelfEdit:
    def test_updates_rank_and_effective_date_immediately(self, student):
        client = Client()
        client.force_login(student)
        resp = client.patch(
            "/military/api/v1/my/profile/complete/",
            data=json.dumps({"rank": "2LT", "rank_effective_date": "2025-01-15"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "rank" in body["updated"]
        assert "rank_effective_date" in body["updated"]

        student.military_profile.refresh_from_db()
        assert student.military_profile.rank == "2LT"
        assert str(student.military_profile.rank_effective_date) == "2025-01-15"

    def test_rejects_invalid_rank(self, student):
        client = Client()
        client.force_login(student)
        resp = client.patch(
            "/military/api/v1/my/profile/complete/",
            data=json.dumps({"rank": "ไม่มีอยู่จริง"}),
            content_type="application/json",
        )
        assert resp.status_code == 400

        student.military_profile.refresh_from_db()
        assert student.military_profile.rank == ""

    def test_rejects_invalid_effective_date(self, student):
        client = Client()
        client.force_login(student)
        resp = client.patch(
            "/military/api/v1/my/profile/complete/",
            data=json.dumps({"rank_effective_date": "not-a-date"}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_can_clear_effective_date(self, student):
        student.military_profile.rank = "ร.ต."
        student.military_profile.rank_effective_date = "2025-01-15"
        student.military_profile.save(update_fields=["rank", "rank_effective_date"])

        client = Client()
        client.force_login(student)
        resp = client.patch(
            "/military/api/v1/my/profile/complete/",
            data=json.dumps({"rank_effective_date": None}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        student.military_profile.refresh_from_db()
        assert student.military_profile.rank_effective_date is None

    def test_rank_effective_date_visible_via_get_profile(self, student):
        client = Client()
        client.force_login(student)
        client.patch(
            "/military/api/v1/my/profile/complete/",
            data=json.dumps({"rank": "2LT", "rank_effective_date": "2025-01-15"}),
            content_type="application/json",
        )
        resp = client.get("/military/api/v1/my/profile/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["rank"] == "2LT"
        assert body["rank_effective_date"] == "2025-01-15"

    def test_unrelated_fields_untouched_when_no_rank_in_body(self, student):
        client = Client()
        client.force_login(student)
        resp = client.patch(
            "/military/api/v1/my/profile/complete/",
            data=json.dumps({"position": "ครูฝึก"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "rank" not in body["updated"]
        assert "rank_effective_date" not in body["updated"]
