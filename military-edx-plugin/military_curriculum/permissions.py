"""
military_curriculum/permissions.py

Permission helper เฉพาะของแอปนี้ — org_admin ของ "โรงเรียนทหารสื่อสาร
กรมการทหารสื่อสาร" (Organization id=161) ได้สิทธิ์พิเศษดู roster หลักสูตร
แบบ read-only คล้าย prep_school (ดูอย่างเดียว แก้ไขหลักสูตรไม่ได้) — หน่วยอื่น
ไม่ได้สิทธิ์นี้ ตามที่ผู้ใช้ระบุชัดเจนว่า "เฉพาะ admin โรงเรียนทหารสื่อสารนะ"

ยืนยัน org id=161 จากฐานข้อมูลจริงแล้ว: 'โรงเรียนทหารสื่อสาร กรมการทหารสื่อสาร'
(รหัส รร.ส.สส.) — คนละ organization กับ 'กรมการทหารสื่อสาร' (id=155) ที่ผูกกับ
บัญชี admin_signal
"""
from functools import wraps

from django.http import JsonResponse

from military_profile.permissions import (
    _apply_private_no_cache, ROLE_ADMIN, ROLE_PREP_SCHOOL, ROLE_ORG_ADMIN,
)

SIGNAL_SCHOOL_ORG_ID = 161


def user_is_signal_school_org_admin(user) -> bool:
    """True เฉพาะ org_admin ที่ organization_id == รร.ส.สส. เท่านั้น"""
    profile = getattr(user, "military_profile", None)
    return bool(
        profile
        and profile.role == ROLE_ORG_ADMIN
        and profile.organization_id == SIGNAL_SCHOOL_ORG_ID
    )


def require_school_curriculum_read(view_func):
    """ดู roster หลักสูตรได้แบบ read-only เท่านั้น: admin เต็ม, prep_school,
    หรือ org_admin ของ รร.ส.สส. (id=161) — org_admin หน่วยอื่นโดน 403 เสมอ"""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return _apply_private_no_cache(JsonResponse({"error": "Unauthorized"}, status=401))
        profile = getattr(request.user, "military_profile", None)
        is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
        is_prep_school = bool(profile and profile.role == ROLE_PREP_SCHOOL)
        is_school_org_admin = user_is_signal_school_org_admin(request.user)
        if not (is_admin or is_prep_school or is_school_org_admin):
            return _apply_private_no_cache(JsonResponse({"error": "Forbidden"}, status=403))
        return _apply_private_no_cache(view_func(request, *args, **kwargs))
    return wrapper
