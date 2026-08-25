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


def army_region_q(region_code: str, prefix: str = ""):
    """Q object กรอง queryset ตามทัพภาคที่ใช้จริงของ MilitaryUserProfile

    ยึดตามหน่วย (organization.army_region) เป็นหลัก เพราะทัพภาคเป็นคุณสมบัติ
    ของหน่วย ไม่ใช่ของบุคคล — ถ้าหน่วยยังไม่ได้ตั้งทัพภาคไว้ (หรือยังไม่ผูกกับ
    Organization) จึง fallback ไปที่ army_region เดิมของตัวบุคคล เพื่อ backward
    compat กับข้อมูลเก่าก่อนมีระบบนี้ ดูคู่กับ
    MilitaryUserProfile.effective_army_region (ต้องแก้ไปพร้อมกันถ้าเปลี่ยน)

    prefix: ใช้เมื่อ queryset ตั้งต้นไม่ใช่ MilitaryUserProfile เอง เช่น
        army_region_q(code, prefix="user__military_profile") สำหรับ
        queryset ของ UserCertificateExpiry
    """
    from django.db.models import Q
    p = f"{prefix}__" if prefix else ""
    return (
        Q(**{f"{p}organization__army_region": region_code})
        | Q(**{f"{p}organization__isnull": True, f"{p}army_region": region_code})
        | Q(**{f"{p}organization__army_region": "", f"{p}army_region": region_code})
    )


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


def bulk_get_compliance_statuses(profiles) -> dict:
    """
    Compute compliance status for many profiles using only 2 DB queries total
    (regardless of user count), instead of 2 queries per user.

    profiles: iterable of MilitaryUserProfile (with .user already accessible)

    Returns: dict mapping user_id → "passed" | "not_passed" | "no_requirements"
    """
    from .models import CourseRequirement
    from certificate_expiry.models import UserCertificateExpiry

    profile_list = list(profiles)
    if not profile_list:
        return {}

    # Query 1: ALL active CourseRequirements (tiny table — one query)
    all_requirements = list(
        CourseRequirement.objects.filter(is_active=True).values("rank_class", "course_id")
    )

    # Build: rank_class → set of required course_ids
    req_by_class: dict[str, set] = {}
    all_req_course_ids: set = set()
    for r in all_requirements:
        rc = r["rank_class"]
        cid = r["course_id"]
        req_by_class.setdefault(rc, set()).add(cid)
        all_req_course_ids.add(cid)

    # Query 2: ALL active/renewed certs for these users × required courses (one query)
    user_ids = [p.user_id for p in profile_list]
    passed_certs: set = set()  # (user_id, course_id) tuples
    if all_req_course_ids and user_ids:
        rows = UserCertificateExpiry.objects.filter(
            user_id__in=user_ids,
            course_id__in=all_req_course_ids,
            status__in=("active", "renewed"),
        ).values_list("user_id", "course_id")
        for uid, cid in rows:
            passed_certs.add((uid, cid))

    # Python-side status computation — no further DB hits
    result: dict = {}
    all_reqs = req_by_class.get("all", set())
    for profile in profile_list:
        rank_class = profile.rank_class
        required_ids = req_by_class.get(rank_class, set()) | all_reqs

        if not required_ids:
            result[profile.user_id] = "no_requirements"
            continue

        uid = profile.user_id
        if all((uid, cid) in passed_certs for cid in required_ids):
            result[profile.user_id] = "passed"
        else:
            result[profile.user_id] = "not_passed"

    return result


def bulk_get_compliance_details(profiles) -> dict:
    """
    Like bulk_get_compliance_statuses but returns full per-user detail
    (missing / passed / expired course lists) in 2 DB queries total.

    profiles: iterable of MilitaryUserProfile (with .user accessible)

    Returns: dict mapping user_id → {
        "status": ..., "required": [...], "passed": [...],
        "missing": [...], "expired": [...]
    }
    """
    from .models import CourseRequirement
    from certificate_expiry.models import UserCertificateExpiry

    profile_list = list(profiles)
    if not profile_list:
        return {}

    # Query 1: ALL active CourseRequirements
    all_requirements = list(
        CourseRequirement.objects.filter(is_active=True).values("rank_class", "course_id", "course_name")
    )

    req_by_class: dict[str, list] = {}
    all_req_course_ids: set = set()
    for r in all_requirements:
        rc = r["rank_class"]
        req_by_class.setdefault(rc, []).append(r)
        all_req_course_ids.add(r["course_id"])

    # Query 2: ALL cert rows for these users × required courses
    user_ids = [p.user_id for p in profile_list]
    cert_map: dict = {}  # (user_id, course_id) → cert row
    if all_req_course_ids and user_ids:
        rows = UserCertificateExpiry.objects.filter(
            user_id__in=user_ids,
            course_id__in=all_req_course_ids,
        ).values("user_id", "course_id", "status", "expiry_date")
        for row in rows:
            cert_map[(row["user_id"], row["course_id"])] = row

    # Query 3: ALL active enrollments for these users
    # (แยก "ยังไม่ลงทะเบียน" ออกจาก "ลงทะเบียนแล้วแต่ยังไม่ผ่าน" — เดิมรวมเป็น missing)
    enrolled_set: set = set()  # (user_id, course_id_str)
    if user_ids:
        try:
            from common.djangoapps.student.models import CourseEnrollment
            for _uid, _cid in CourseEnrollment.objects.filter(
                user_id__in=user_ids, is_active=True,
            ).values_list("user_id", "course_id"):
                enrolled_set.add((_uid, str(_cid)))
        except Exception:
            pass

    all_reqs_for_all = req_by_class.get("all", [])
    result: dict = {}
    for profile in profile_list:
        rank_class = profile.rank_class
        required = req_by_class.get(rank_class, []) + all_reqs_for_all

        if not required:
            result[profile.user_id] = {
                "status": "no_requirements", "required": [], "passed": [], "missing": [], "expired": [],
                "not_enrolled": [], "enrolled_not_passed": [],
            }
            continue

        uid = profile.user_id
        passed_list: list = []
        missing_list: list = []
        expired_list: list = []
        not_enrolled_list: list = []
        enrolled_not_passed_list: list = []

        for req in required:
            cid = req["course_id"]
            cert = cert_map.get((uid, cid))
            if cert is None:
                missing_list.append(req)               # เดิม: missing = ไม่มีใบประกาศ (คงไว้)
                if (uid, cid) in enrolled_set:
                    enrolled_not_passed_list.append(req)  # ลงทะเบียนแล้วแต่ยังไม่ผ่าน
                else:
                    not_enrolled_list.append(req)         # ยังไม่ลงทะเบียน
            elif cert["status"] in ("active", "renewed"):
                expiry = cert["expiry_date"]
                passed_list.append({**req, "expiry_date": expiry.isoformat() if hasattr(expiry, "isoformat") else str(expiry)})
            else:
                expiry = cert["expiry_date"]
                expired_list.append({**req, "expiry_date": expiry.isoformat() if hasattr(expiry, "isoformat") else str(expiry)})

        status = "passed" if (not missing_list and not expired_list) else "not_passed"
        result[profile.user_id] = {
            "status": status,
            "required": required,
            "passed": passed_list,
            "missing": missing_list,
            "expired": expired_list,
            "not_enrolled": not_enrolled_list,
            "enrolled_not_passed": enrolled_not_passed_list,
        }

    return result


def bulk_compliance_stats(queryset) -> dict:
    """
    Compute compliance statistics for a queryset of MilitaryUserProfile.

    Returns
    -------
    {
        "total":            int,
        "passed":           int,   # มีเงื่อนไขและผ่านครบ (อนุมัติใบประกาศแล้ว)
        "not_passed":       int,   # มีเงื่อนไขแต่ยังไม่ผ่าน (รวมทั้งยังไม่สอบ และสอบผ่านแต่รออนุมัติ)
        "pending_approval": int,   # สอบผ่านคะแนนแล้ว แต่ยังรอ admin กด "อนุมัติทั้งหมด" ในรอบ (ย่อยของ not_passed)
        "no_requirements":  int,   # ยังไม่กำหนดเงื่อนไขสำหรับระดับชั้นนี้
        "percent_passed":        float,
        "percent_not_passed":    float,
        "percent_no_requirements": float,
        "percent_pending_approval": float,
    }
    """
    profiles = list(queryset.select_related("user"))
    total = len(profiles)
    if total == 0:
        return {
            "total": 0, "passed": 0, "not_passed": 0, "pending_approval": 0, "no_requirements": 0,
            "percent_passed": 0.0, "percent_not_passed": 0.0, "percent_no_requirements": 0.0,
            "percent_pending_approval": 0.0,
        }

    statuses = bulk_get_compliance_statuses(profiles)

    passed = sum(1 for s in statuses.values() if s == "passed")
    no_requirements = sum(1 for s in statuses.values() if s == "no_requirements")
    not_passed = total - passed - no_requirements

    from .models import CertificatePendingApproval
    pending_approval = (
        CertificatePendingApproval.objects
        .filter(user_id__in=[p.user_id for p in profiles], status="pending")
        .values("user_id").distinct().count()
    )

    return {
        "total": total,
        "passed": passed,
        "not_passed": not_passed,
        "pending_approval": pending_approval,
        "no_requirements": no_requirements,
        "percent_passed": round(passed / total * 100, 1),
        "percent_not_passed": round(not_passed / total * 100, 1),
        "percent_no_requirements": round(no_requirements / total * 100, 1),
        "percent_pending_approval": round(pending_approval / total * 100, 1),
    }
