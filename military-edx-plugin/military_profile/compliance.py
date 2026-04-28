"""
military_profile/compliance.py

Logic สำหรับตรวจสอบสถานะ "ผ่านมาตรฐาน" ของกำลังพล

ผ่านมาตรฐาน = มีใบประกาศ (UserCertificateExpiry) สถานะ active/renewed
              ครบทุกหลักสูตรที่กำหนดสำหรับระดับชั้นของตัวเอง (CourseRequirement)
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser


def get_required_courses(rank_class: str) -> list[dict]:
    """
    Return list of active CourseRequirements for the given rank_class.
    Also includes requirements tagged 'all'.
    """
    from .models import CourseRequirement

    qs = CourseRequirement.objects.filter(
        is_active=True,
        rank_class__in=[rank_class, "all"],
    ).values("id", "course_id", "course_name", "rank_class")
    return list(qs)


def get_compliance_status(user) -> dict:
    """
    Return compliance status for a single user.

    Returns
    -------
    {
        "status":    "passed" | "not_passed" | "no_requirements",
        "required":  [{"course_id": ..., "course_name": ...}, ...],
        "passed":    [...],
        "missing":   [...],    # required but no cert
        "expired":   [...],    # cert exists but expired
    }
    """
    from certificate_expiry.models import UserCertificateExpiry

    profile = getattr(user, "military_profile", None)
    if profile is None:
        return {"status": "not_passed", "required": [], "passed": [], "missing": [], "expired": []}

    rank_class = profile.rank_class
    required = get_required_courses(rank_class)

    if not required:
        return {"status": "no_requirements", "required": [], "passed": [], "missing": [], "expired": []}

    course_ids = [r["course_id"] for r in required]
    certs = {
        c.course_id: c
        for c in UserCertificateExpiry.objects.filter(user=user, course_id__in=course_ids)
    }

    passed_list = []
    missing_list = []
    expired_list = []

    for req in required:
        cid = req["course_id"]
        cert = certs.get(cid)
        if cert is None:
            missing_list.append(req)
        elif cert.status in ("active", "renewed"):
            passed_list.append({**req, "expiry_date": cert.expiry_date.isoformat(), "days_left": cert.days_until_expiry})
        else:  # expired or revoked
            expired_list.append({**req, "expiry_date": cert.expiry_date.isoformat()})

    status = "passed" if (not missing_list and not expired_list) else "not_passed"

    return {
        "status": status,
        "required": required,
        "passed": passed_list,
        "missing": missing_list,
        "expired": expired_list,
    }


def bulk_compliance_stats(queryset) -> dict:
    """
    Compute compliance statistics for a queryset of MilitaryUserProfile.

    Returns
    -------
    {
        "total":   int,
        "passed":  int,
        "not_passed": int,
        "percent_passed":    float,
        "percent_not_passed": float,
    }
    """
    from certificate_expiry.models import UserCertificateExpiry
    from .models import CourseRequirement
    from django.db.models import OuterRef, Subquery, Exists

    total = queryset.count()
    if total == 0:
        return {"total": 0, "passed": 0, "not_passed": 0, "percent_passed": 0.0, "percent_not_passed": 0.0}

    # For each profile check compliance: a user passes if for every
    # active CourseRequirement matching their rank_class OR 'all',
    # they have a valid cert.
    passed = 0
    not_passed = 0

    for profile in queryset.select_related("user"):
        result = get_compliance_status(profile.user)
        if result["status"] == "passed" or result["status"] == "no_requirements":
            passed += 1
        else:
            not_passed += 1

    return {
        "total": total,
        "passed": passed,
        "not_passed": not_passed,
        "percent_passed": round(passed / total * 100, 1),
        "percent_not_passed": round(not_passed / total * 100, 1),
    }
