"""
military_profile/permissions.py

Central RBAC module — role registry + permission decorators ที่ apps อื่น
(military_reports, military_curriculum, ...) ควร import จากที่นี่แทนการ
copy decorator ไปเขียนซ้ำเอง (ที่เคยเกิดปัญหาจริง: military_reports/api_views.py
มี _require_login/_require_admin ฉบับของตัวเองที่ "ลืม" ใส่ _apply_private_no_cache
ทำให้ endpoint กลุ่มนั้นไม่มีการป้องกัน shared-cache leak เหมือนจุดอื่น)

ย้ายมาจาก military_profile/api_views.py (เดิมนิยาม inline ในไฟล์เดียวกับ view
5,847 บรรทัด) — ชื่อ/พฤติกรรมของ _require_admin/_require_org_admin/
_require_instructor/_require_login/_apply_private_no_cache เหมือนเดิมทุกประการ
เพื่อ backward compatibility (ดู api_views.py ที่เปลี่ยนเป็น import จากที่นี่แทน)
"""
from functools import wraps

from django.http import JsonResponse
from django.utils.cache import patch_vary_headers

# ---------------------------------------------------------------------------
# Role registry — single source of truth สำหรับชื่อ role ทั้งระบบ
# ---------------------------------------------------------------------------

ROLE_ADMIN = "admin"
ROLE_ORG_ADMIN = "org_admin"
ROLE_INSTRUCTOR = "instructor"
ROLE_STUDENT = "student"
ROLE_PREP_SCHOOL = "prep_school"
ROLE_PREP_PERSONNEL = "prep_personnel"
ROLE_EVALUATOR = "evaluator"

ALL_ROLES = [
    ROLE_ADMIN, ROLE_ORG_ADMIN, ROLE_INSTRUCTOR, ROLE_STUDENT,
    ROLE_PREP_SCHOOL, ROLE_PREP_PERSONNEL, ROLE_EVALUATOR,
]

# role ที่เป็น "หน่วยงาน/functional" ไม่ใช่ "กำลังพลที่เรียน" — ใช้ตัดออกจาก
# รายงาน/สถิติจำนวนกำลังพล (ดู _SYSTEM_ROLES ใน military_profile/api_views.py
# และ _PERSONNEL_QS ใน military_reports/api_views.py ที่ควร reference ค่านี้)
#
# ⚠️ TODO ก่อน Sprint 6 (role assignment ไปจริง): ยังมี ~20 จุดใน
# military_profile/api_views.py และ military_reports/api_views.py ที่ hardcode
# role__in=("admin","org_admin") ตรงๆ แทนที่จะ import ค่านี้ — ต้องไล่แก้ให้ครบ
# ก่อน assign role ใหม่ให้ user จริง ไม่งั้นรายงาน/compliance/PDX export จะนับ
# prep_school/prep_personnel/evaluator ปนเป็น "กำลังพล" ผิด (ดู commit message
# ที่แนบรายการบรรทัดที่ต้องแก้)
NON_PERSONNEL_ROLES = (
    ROLE_ADMIN, ROLE_ORG_ADMIN, ROLE_PREP_SCHOOL, ROLE_PREP_PERSONNEL, ROLE_EVALUATOR,
)


def user_has_role(user, roles) -> bool:
    """True ถ้า user เป็น Django staff/superuser หรือมี military_profile.role อยู่ใน roles"""
    if user.is_staff or getattr(user, "is_superuser", False):
        return True
    profile = getattr(user, "military_profile", None)
    return bool(profile and profile.role in roles)


def get_org_scope(request) -> tuple[bool, int | None]:
    """คืน (is_unscoped_admin, org_id) สำหรับ endpoint ที่ต้องแยกสิทธิ์ระหว่าง
    admin เต็ม (เห็นทุกหน่วย) กับ org_admin (ถูกบังคับเห็นแค่หน่วยตัวเอง)

    - admin/is_staff: (True, None) ปกติ — หรือ (True, <n>) ถ้าส่ง ?org_id= มา
      เพื่อกรองดูหน่วยเดียว (ยังเลือกได้อิสระ ไม่ใช่ scope บังคับ)
    - org_admin: (False, <organization_id ของตัวเอง>) เสมอ ไม่สนใจ ?org_id=
      ที่ส่งมา (ป้องกัน org_admin ปลอมพารามิเตอร์ดูหน่วยอื่น)
    - org_admin ที่ยังไม่ผูกหน่วย (organization_id เป็น None): คืน (False, None)
      — caller ต้อง handle เป็น 400 "ยังไม่ได้ผูกหน่วยงาน" เอง (ดูตัวอย่างใน
      api_org_admin_dashboard/api_org_admin_users)
    """
    profile = getattr(request.user, "military_profile", None)
    is_super = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if is_super:
        org_id = request.GET.get("org_id")
        return True, (int(org_id) if org_id else None)
    return False, (profile.organization_id if profile else None)


# ---------------------------------------------------------------------------
# Response helper
# ---------------------------------------------------------------------------

def _apply_private_no_cache(resp):
    """กัน shared cache (proxy/CDN) เก็บ response รายบุคคลแล้วเสิร์ฟข้ามผู้ใช้
    อาการ: มือถือ/แท็บเล็ต (วิ่งผ่าน proxy) เห็นชื่อ/หน่วย/ใบประกาศของคนอื่น
    ส่วนคอม (LAN ตรง ไม่ผ่าน cache) ปกติ — บังคับ per-user ไม่ให้แคชร่วม

    ทุก view ที่ผ่าน decorator ในไฟล์นี้ (require_role / _require_*) จะได้
    การป้องกันนี้อัตโนมัติ — ห้ามเขียน decorator ใหม่ที่ข้าม wrapper นี้"""
    try:
        resp['Cache-Control'] = 'no-store, no-cache, private, max-age=0'
        resp['Pragma'] = 'no-cache'
        patch_vary_headers(resp, ('Cookie',))
    except Exception:
        pass
    return resp


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------

def require_role(roles):
    """Decorator กลาง — ใช้แทน _require_admin/_require_org_admin/_require_instructor
    เดิมสำหรับ endpoint ใหม่ทั้งหมด (military_curriculum และต่อๆ ไป)

    ตัวอย่าง: @require_role([ROLE_PREP_SCHOOL, ROLE_ADMIN])
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return _apply_private_no_cache(JsonResponse({"error": "Unauthorized"}, status=401))
            if not user_has_role(request.user, roles):
                return _apply_private_no_cache(JsonResponse({"error": "Forbidden"}, status=403))
            return _apply_private_no_cache(view_func(request, *args, **kwargs))
        return wrapper
    return decorator


def _require_login(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return _apply_private_no_cache(JsonResponse({"error": "Unauthorized"}, status=401))
        return _apply_private_no_cache(view_func(request, *args, **kwargs))
    return wrapper


def _require_admin(view_func):
    """Backward-compatible alias — เนื้อหาเดิมจาก military_profile/api_views.py
    (ย้ายมาไว้ที่นี่, api_views.py import กลับไปใช้แทน local def)"""
    return require_role([ROLE_ADMIN])(view_func)


def _require_org_admin(view_func):
    """ต้องเป็น admin หรือ org_admin เท่านั้น"""
    return require_role([ROLE_ADMIN, ROLE_ORG_ADMIN])(view_func)


def _require_instructor(view_func):
    return require_role([ROLE_ADMIN, ROLE_INSTRUCTOR])(view_func)


# ---------------------------------------------------------------------------
# Object-level helpers — สำหรับ military_curriculum (co-instructor / owner check)
# ---------------------------------------------------------------------------

def user_owns_curriculum_course(user, curriculum_course) -> bool:
    """True ถ้า user เป็นเจ้าของวิชานี้ (is_owner=True) หรือเป็น admin"""
    from military_curriculum.models import CurriculumCourseInstructor
    if user_has_role(user, [ROLE_ADMIN]):
        return True
    return CurriculumCourseInstructor.objects.filter(
        curriculum_course=curriculum_course, user=user, is_owner=True
    ).exists()


def user_is_course_instructor(user, curriculum_course) -> bool:
    """True ถ้า user เป็น instructor หรือ co-instructor ของวิชานี้ หรือเป็น admin"""
    from military_curriculum.models import CurriculumCourseInstructor
    if user_has_role(user, [ROLE_ADMIN]):
        return True
    return CurriculumCourseInstructor.objects.filter(
        curriculum_course=curriculum_course, user=user
    ).exists()
