"""
military_profile/api_views.py

JSON API endpoints สำหรับ student portal (กำลังพลทั่วไป)
+ Admin user management
+ Instructor course/student/grade views
"""
import json
from datetime import date, datetime

from django.contrib.auth import get_user_model
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import MilitaryUserProfile, RANK_CHOICES, ARMY_REGION_CHOICES, encrypt_field, decrypt_field
from certificate_expiry.models import UserCertificateExpiry, CourseCertificateConfig
from military_auth.models import PendingRegistration

try:
    from common.djangoapps.student.models import UserProfile as EdxUserProfile
except ImportError:
    EdxUserProfile = None

User = get_user_model()


def _parse_date(value) -> date:
    """Parse a date string ('YYYY-MM-DD') or date object to datetime.date."""
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    return date.fromisoformat(str(value).strip())


def _grant_course_creator(user) -> None:
    """Grant CourseCreator 'granted' status to a user via raw SQL.
    The course_creators app lives in CMS which shares the same DB, but the
    model is not registered in LMS INSTALLED_APPS, so we use raw SQL.
    """
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO course_creators_coursecreator "
                "(user_id, state, note, created, updated) "
                "VALUES (%s, 'granted', '', %s, %s) "
                "ON DUPLICATE KEY UPDATE state='granted', updated=%s",
                [user.id, now_str, now_str, now_str],
            )
    except Exception:
        pass  # Table may not exist in dev; non-fatal


def _revoke_course_creator(user) -> None:
    """Revoke CourseCreator by setting state='denied' via raw SQL."""
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE course_creators_coursecreator "
                "SET state='denied', updated=%s "
                "WHERE user_id=%s",
                [now_str, user.id],
            )
    except Exception:
        pass  # Non-fatal


def _require_login(view_func):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


def _require_admin(view_func):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        # ต้องเป็น staff หรือมี role=admin ใน military profile — ป้องกัน non-military staff เข้าถึง API
        profile = getattr(request.user, "military_profile", None)
        is_military_admin = profile and profile.role == "admin"
        if not (request.user.is_staff or is_military_admin):
            return JsonResponse({"error": "Forbidden"}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


def _require_instructor(view_func):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        profile = getattr(request.user, "military_profile", None)
        if not (request.user.is_staff or (profile and profile.role in ("admin", "instructor"))):
            return JsonResponse({"error": "Forbidden"}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


def _ensure_edx_user_profile(user, full_name: str = "") -> None:
    """Create the Open edX UserProfile if it doesn't exist — required for login to work."""
    if EdxUserProfile is None:
        return
    EdxUserProfile.objects.get_or_create(user=user, defaults={"name": full_name or user.get_full_name() or user.username})


def _profile_to_dict(profile: MilitaryUserProfile) -> dict:
    ssd = profile.service_start_date
    bd = profile.birth_date
    return {
        "id": profile.user_id,
        "username": profile.user.username,
        "email": profile.user.email,
        "is_active": profile.user.is_active,
        "is_staff": profile.user.is_staff,
        "role": profile.role,
        "full_name": profile.full_name_th,
        "rank": profile.rank,
        "rank_display": profile.get_rank_display(),
        "rank_class": profile.rank_class,
        "rank_class_display": profile.rank_class_display,
        "unit": profile.unit,
        "sub_unit": profile.sub_unit,
        "army_region": profile.army_region,
        "army_region_display": profile.get_army_region_display(),
        "contact_email": profile.contact_email,
        "phone_number": profile.phone_number,
        "service_start_date": ssd.isoformat() if hasattr(ssd, "isoformat") else str(ssd),
        "birth_date": bd.isoformat() if hasattr(bd, "isoformat") else str(bd),
        "created_at": profile.created_at.isoformat(),
    }


@require_GET
@_require_login
def api_me(request):
    """
    GET /military/api/v1/me/
    ข้อมูลพื้นฐานของ user ที่ login อยู่ (สำหรับ frontend หลัง login)
    """
    user = request.user
    profile = getattr(user, "military_profile", None)
    role = profile.role if profile else ("admin" if user.is_staff else "student")
    return JsonResponse({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_staff": user.is_staff,
        "role": role,
        "full_name": (profile.full_name_th if profile else None) or user.get_full_name() or user.username,
        "rank": profile.rank if profile else None,
        "unit": profile.unit if profile else None,
    })


@require_GET
@_require_login
def api_my_profile(request):
    """
    GET /military/api/v1/my/profile/
    ข้อมูลส่วนตัวของกำลังพลที่ login อยู่
    """
    user = request.user
    profile = getattr(user, "military_profile", None)

    if not profile:
        return JsonResponse({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.get_full_name() or user.username,
            "rank": None,
            "rank_display": None,
            "unit": None,
            "sub_unit": None,
            "service_start_date": None,
            "service_years": None,
            "birth_date": None,
            "age": None,
        })

    return JsonResponse({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": profile.full_name_th,
        "rank": profile.rank,
        "rank_display": profile.get_rank_display(),
        "unit": profile.unit,
        "sub_unit": profile.sub_unit,
        "service_start_date": profile.service_start_date.isoformat() if hasattr(profile.service_start_date, "isoformat") else str(profile.service_start_date),
        "service_years": profile.service_years,
        "birth_date": profile.birth_date.isoformat() if hasattr(profile.birth_date, "isoformat") else str(profile.birth_date),
        "age": profile.age,
    })


@require_GET
@_require_login
def api_my_certificates(request):
    """
    GET /military/api/v1/my/certificates/
    รายการใบประกาศของตนเอง พร้อมสถานะและวันหมดอายุ
    """
    today = date.today()
    certs = (
        UserCertificateExpiry.objects
        .filter(user=request.user)
        .select_related()
        .order_by("expiry_date")
    )

    results = []
    for cert in certs:
        # ดึงชื่อหลักสูตรจาก config (ถ้ามี)
        try:
            config = CourseCertificateConfig.objects.get(course_id=cert.course_id)
            course_name = config.course_name
        except CourseCertificateConfig.DoesNotExist:
            course_name = cert.course_id

        days_left = (cert.expiry_date - today).days if cert.expiry_date else None

        results.append({
            "id": cert.id,
            "course_id": cert.course_id,
            "course_name": course_name,
            "issued_date": cert.issued_date.isoformat() if cert.issued_date else None,
            "expiry_date": cert.expiry_date.isoformat() if cert.expiry_date else None,
            "status": cert.status,
            "status_display": cert.get_status_display(),
            "days_left": days_left,
            "can_renew": cert.status in ("expired", "active") and days_left is not None and days_left <= 60,
        })

    return JsonResponse({"results": results, "count": len(results)})


# ============================================================================
# Admin: User Management API
# ============================================================================

@require_GET
@_require_admin
def api_admin_users(request):
    """
    GET /military/api/v1/admin/users/
    รายการ user ทั้งหมด (paginated, search)
    Query params: ?search=&unit=&role=&page=1&page_size=20
    """
    qs = MilitaryUserProfile.objects.select_related("user").order_by("-created_at")

    search = request.GET.get("search", "").strip()
    if search:
        qs = qs.filter(full_name_th__icontains=search) | qs.filter(unit__icontains=search)

    unit = request.GET.get("unit", "").strip()
    if unit:
        qs = qs.filter(unit__icontains=unit)

    role = request.GET.get("role", "").strip()
    if role:
        qs = qs.filter(role=role)

    page = max(1, int(request.GET.get("page", 1)))
    page_size = min(100, int(request.GET.get("page_size", 20)))
    total = qs.count()
    start = (page - 1) * page_size
    profiles = qs[start:start + page_size]

    return JsonResponse({
        "count": total,
        "page": page,
        "page_size": page_size,
        "results": [_profile_to_dict(p) for p in profiles],
    })


@csrf_exempt
@require_http_methods(["POST"])
@_require_admin
def api_admin_create_user(request):
    """
    POST /military/api/v1/admin/users/create/
    Admin สร้าง user ใหม่โดยตรง
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    required = ["national_id", "military_id", "full_name_th", "rank", "unit",
                "service_start_date", "birth_date", "username"]
    for field in required:
        if not body.get(field):
            return JsonResponse({"error": f"Missing field: {field}"}, status=400)

    if User.objects.filter(username=body["username"]).exists():
        return JsonResponse({"error": "Username already exists"}, status=409)
    # Use national_id as email so OpenEdX login_ajax can look up the user.
    national_id = body["national_id"]
    if User.objects.filter(email=national_id).exists():
        return JsonResponse({"error": "National ID already registered"}, status=409)

    try:
        user = User.objects.create_user(
            username=body["username"],
            email=national_id,
            password=body.get("password") or body["military_id"],
            first_name=body["full_name_th"],
        )
        # Force active — Open edX post-save signals may set is_active=False
        # for users created programmatically (email verification flow).
        user.is_active = True
        user.is_staff = body.get("role") == "admin"
        user.save()

        profile = MilitaryUserProfile.objects.create(
            user=user,
            national_id_encrypted=encrypt_field(body["national_id"]),
            military_id_encrypted=encrypt_field(body["military_id"]),
            full_name_th=body["full_name_th"],
            rank=body["rank"],
            unit=body["unit"],
            sub_unit=body.get("sub_unit", ""),
            service_start_date=_parse_date(body["service_start_date"]),
            birth_date=_parse_date(body["birth_date"]),
            role=body.get("role", "student"),
            contact_email=body.get("contact_email", ""),
            phone_number=body.get("phone_number", ""),
            army_region=body.get("army_region", ""),
        )

        _ensure_edx_user_profile(user, body["full_name_th"])

        if profile.role == "instructor":
            _grant_course_creator(user)

        return JsonResponse(_profile_to_dict(profile), status=201)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=400)


@csrf_exempt
@require_http_methods(["PATCH", "PUT"])
@_require_admin
def api_admin_update_user(request, user_id: int):
    """
    PATCH /military/api/v1/admin/users/<user_id>/
    แก้ไขข้อมูล user
    """
    try:
        profile = MilitaryUserProfile.objects.select_related("user").get(user_id=user_id)
    except MilitaryUserProfile.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    # อัปเดต profile fields
    for field in ("full_name_th", "rank", "unit", "sub_unit", "contact_email", "phone_number", "army_region"):
        if field in body:
            setattr(profile, field, body[field])
    for date_field in ("service_start_date", "birth_date"):
        if date_field in body:
            setattr(profile, date_field, _parse_date(body[date_field]))

    if "role" in body:
        old_role = profile.role
        new_role = body["role"]
        profile.role = new_role
        profile.user.is_staff = new_role == "admin"
        profile.user.save()
        # Grant CourseCreator when promoting to instructor
        if new_role == "instructor" and old_role != "instructor":
            _grant_course_creator(profile.user)
        # Revoke CourseCreator when demoting from instructor
        elif old_role == "instructor" and new_role != "instructor":
            _revoke_course_creator(profile.user)

    if "is_active" in body:
        profile.user.is_active = body["is_active"]
        profile.user.save()

    profile.save()
    return JsonResponse(_profile_to_dict(profile))


@csrf_exempt
@require_http_methods(["DELETE"])
@_require_admin
def api_admin_deactivate_user(request, user_id: int):
    """
    DELETE /military/api/v1/admin/users/<user_id>/
    ปิดใช้งาน user (ไม่ลบจริง)
    """
    try:
        profile = MilitaryUserProfile.objects.select_related("user").get(user_id=user_id)
    except MilitaryUserProfile.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if profile.user_id == request.user.id:
        return JsonResponse({"error": "Cannot deactivate yourself"}, status=400)

    profile.user.is_active = False
    profile.user.save()
    return JsonResponse({"success": True, "message": "User deactivated"})


@csrf_exempt
@require_http_methods(["DELETE"])
@_require_admin
def api_admin_hard_delete_user(request, user_id: int):
    """
    DELETE /military/api/v1/admin/users/<user_id>/hard-delete/
    ลบ user ออกจากระบบถาวร (hard delete)
    """
    try:
        profile = MilitaryUserProfile.objects.select_related("user").get(user_id=user_id)
    except MilitaryUserProfile.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if profile.user_id == request.user.id:
        return JsonResponse({"error": "Cannot delete yourself"}, status=400)

    username = profile.user.username
    profile.user.delete()  # cascade deletes profile via FK
    return JsonResponse({"success": True, "message": f"User {username} deleted permanently"})


# ============================================================================
# Public: Self-Registration
# ============================================================================

@csrf_exempt
@require_POST
def api_register(request):
    """
    POST /military/api/v1/register/
    กำลังพลสมัครสมาชิกด้วยตัวเอง → PendingRegistration
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    required = ["national_id", "military_id", "full_name_th", "rank", "unit", "birth_date"]
    for field in required:
        if not body.get(field):
            return JsonResponse({"error": f"กรุณากรอก {field}"}, status=400)

    # Validate national_id — 13 หลักตัวเลขเท่านั้น
    national_id = body.get("national_id", "").strip()
    if not national_id.isdigit() or len(national_id) != 13:
        return JsonResponse({"error": "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"}, status=400)

    # Validate military_id — 10 ตัวอักษร (อักษรนำหน้า + ตัวเลข)
    military_id = body.get("military_id", "").strip()
    if len(military_id) < 6 or len(military_id) > 15:
        return JsonResponse({"error": "เลขประจำตัวทหารต้องมี 6-15 ตัวอักษร"}, status=400)

    # ป้องกัน duplicate — ถ้ามี national_id เดิมและยัง pending/approved
    enc_national_id = encrypt_field(national_id)
    dup = PendingRegistration.objects.filter(
        national_id_encrypted=enc_national_id,
        status__in=("pending", "approved"),
    ).first()
    if dup:
        return JsonResponse(
            {"error": "มีคำขอสมัครสมาชิกที่ใช้เลขบัตรประชาชนนี้อยู่แล้ว"},
            status=409,
        )

    pending = PendingRegistration.objects.create(
        full_name_th=body["full_name_th"],
        rank=body["rank"],
        unit=body["unit"],
        birth_date=body["birth_date"],
        email=body.get("email", ""),
        phone_number=body.get("phone_number", ""),
        national_id_encrypted=enc_national_id,
        military_id_encrypted=encrypt_field(military_id),
    )

    return JsonResponse({
        "id": pending.id,
        "status": pending.status,
        "message": "ส่งคำขอสมัครสมาชิกเรียบร้อยแล้ว กรุณารอการอนุมัติจากผู้ดูแลระบบ",
    }, status=201)


# ============================================================================
# Admin: Registration Approval
# ============================================================================

@require_GET
@_require_admin
def api_admin_registrations(request):
    """
    GET /military/api/v1/admin/registrations/
    รายการคำขอสมัครสมาชิก
    Query params: ?status=pending (default), ?status=all
    """
    status_filter = request.GET.get("status", "pending")
    qs = PendingRegistration.objects.order_by("-submitted_at")
    if status_filter != "all":
        qs = qs.filter(status=status_filter)

    page = max(1, int(request.GET.get("page", 1)))
    page_size = min(100, int(request.GET.get("page_size", 20)))
    total = qs.count()
    items = qs[(page - 1) * page_size: page * page_size]

    rank_lookup = dict(RANK_CHOICES)
    results = []
    for r in items:
        results.append({
            "id": r.id,
            "full_name_th": r.full_name_th,
            "rank": r.rank,
            "rank_display": rank_lookup.get(r.rank, r.rank),
            "unit": r.unit,
            "birth_date": r.birth_date.isoformat(),
            "email": r.email,
            "status": r.status,
            "status_display": r.get_status_display(),
            "submitted_at": r.submitted_at.isoformat(),
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "reject_reason": r.reject_reason,
            "reviewed_by": r.reviewed_by.username if r.reviewed_by else None,
        })

    return JsonResponse({"count": total, "page": page, "results": results})


@csrf_exempt
@require_http_methods(["PATCH"])
@_require_admin
def api_admin_registration_action(request, registration_id: int):
    """
    PATCH /military/api/v1/admin/registrations/<id>/
    Body: {"action": "approve"|"reject", "reject_reason": "...", "username": "...", "password": "..."}
    """
    try:
        reg = PendingRegistration.objects.get(id=registration_id)
    except PendingRegistration.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if reg.status != "pending":
        return JsonResponse({"error": f"คำขอนี้มีสถานะ {reg.status} แล้ว"}, status=400)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    action = body.get("action")
    if action not in ("approve", "reject"):
        return JsonResponse({"error": "action must be 'approve' or 'reject'"}, status=400)

    now = datetime.now()

    if action == "reject":
        reg.status = "rejected"
        reg.reviewed_by = request.user
        reg.reviewed_at = now
        reg.reject_reason = body.get("reject_reason", "")
        reg.save()
        return JsonResponse({"success": True, "status": "rejected"})

    # Approve — สร้าง User + MilitaryUserProfile
    username = body.get("username") or reg.email.split("@")[0] or f"user_{reg.id}"
    # Default password = military_id (ผู้ใช้เปลี่ยนได้ภายหลัง)
    password = body.get("password") or decrypt_field(reg.military_id_encrypted)

    if User.objects.filter(username=username).exists():
        return JsonResponse({"error": f"Username '{username}' already exists"}, status=409)

    try:
        national_id = decrypt_field(reg.national_id_encrypted)
        user = User.objects.create_user(
            username=username,
            email=national_id,   # national_id as email so edX login can look up the user
            password=password,
            first_name=reg.full_name_th,
        )
        # Force active — Open edX post-save signals may set is_active=False
        user.is_active = True
        user.save()

        profile = MilitaryUserProfile.objects.create(
            user=user,
            national_id_encrypted=reg.national_id_encrypted,
            military_id_encrypted=reg.military_id_encrypted,
            full_name_th=reg.full_name_th,
            rank=reg.rank,
            unit=reg.unit,
            birth_date=reg.birth_date,
            service_start_date=reg.birth_date,  # placeholder — admin แก้ไขได้ภายหลัง
            role="student",
            contact_email=reg.email,
            phone_number=reg.phone_number,
            army_region=body.get("army_region", ""),
        )

        _ensure_edx_user_profile(user, reg.full_name_th)

        reg.status = "approved"
        reg.reviewed_by = request.user
        reg.reviewed_at = now
        reg.approved_user = user
        reg.save()

        return JsonResponse({
            "success": True,
            "status": "approved",
            "user_id": user.id,
            "username": username,
        })
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=400)


# ============================================================================
# Instructor: Course / Student / Grade APIs
# ============================================================================

@require_GET
@_require_instructor
def api_instructor_courses(request):
    """
    GET /military/api/v1/instructor/courses/
    รายการ course ที่ผู้ใช้เป็น instructor/staff เฉพาะ course นั้น
    ดึงจาก CourseAccessRole โดยตรง เพื่อไม่ให้ global-staff เห็นทุก course
    """
    try:
        from common.djangoapps.student.models import CourseAccessRole
        from openedx.core.djangoapps.content.course_overviews.models import CourseOverview

        # เฉพาะ course ที่ user ถูก assign role instructor หรือ staff
        course_ids = list(
            CourseAccessRole.objects.filter(
                user=request.user,
                role__in=["instructor", "staff"],
            ).values_list("course_id", flat=True)
        )

        overviews = CourseOverview.objects.filter(id__in=course_ids)

        results = []
        for ov in overviews:
            results.append({
                "id": str(ov.id),
                "name": ov.display_name or str(ov.id),
                "short_description": getattr(ov, "short_description", "") or "",
                "effort": getattr(ov, "effort", "") or "",
                "enrollment_count": 0,  # จะ populate ทีหลังถ้าต้องการ
            })

        return JsonResponse({"results": results, "count": len(results)})

    except Exception as exc:
        return JsonResponse({"error": str(exc), "results": [], "count": 0}, status=200)


@require_http_methods(["DELETE"])
@_require_instructor
def api_instructor_delete_course(request, course_id: str):
    """
    DELETE /military/api/v1/instructor/courses/<course_id>/delete/
    ลบ course — อนุญาตเฉพาะผู้ที่เป็น instructor/staff ของ course นั้น หรือ admin
    """
    try:
        from common.djangoapps.student.models import CourseAccessRole
        from opaque_keys.edx.keys import CourseKey

        course_key = CourseKey.from_string(course_id)

        profile = getattr(request.user, "military_profile", None)
        is_admin = request.user.is_staff or (profile and profile.role == "admin")

        # ถ้าไม่ใช่ admin ต้องตรวจสอบว่ามี role ใน course นี้จริง
        if not is_admin:
            has_role = CourseAccessRole.objects.filter(
                user=request.user,
                course_id=course_key,
                role__in=["instructor", "staff"],
            ).exists()
            if not has_role:
                return JsonResponse({"error": "คุณไม่มีสิทธิ์ลบ course นี้"}, status=403)

        # ลบ course via modulestore API
        from xmodule.modulestore.django import modulestore
        from xmodule.modulestore import ModuleStoreEnum

        store = modulestore()
        if not store.get_course(course_key):
            return JsonResponse({"error": "ไม่พบ course"}, status=404)

        store.delete_course(course_key, ModuleStoreEnum.UserID.mgmt_command)
        return JsonResponse({"success": True, "deleted": course_id})

    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=500)


@require_GET
@_require_instructor
def api_instructor_course_students(request, course_id: str):
    """
    GET /military/api/v1/instructor/courses/<course_id>/students/
    รายชื่อนักเรียนที่ลงทะเบียน course นี้
    """
    import urllib.request as urlreq
    import urllib.parse
    lms_url = "http://localhost:8000"
    encoded_id = urllib.parse.quote(course_id, safe="")
    api_url = f"{lms_url}/api/enrollment/v1/enrollments/?course_id={encoded_id}&page_size=100"

    try:
        headers = {"Cookie": request.META.get("HTTP_COOKIE", "")}
        req = urlreq.Request(api_url, headers=headers)
        with urlreq.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())

        # Enrich with MilitaryUserProfile data
        results = []
        for enroll in data.get("results", []):
            username = enroll.get("user")
            try:
                user_obj = User.objects.get(username=username)
                profile = getattr(user_obj, "military_profile", None)
                results.append({
                    "username": username,
                    "full_name": profile.full_name_th if profile else username,
                    "rank": profile.get_rank_display() if profile else "-",
                    "unit": profile.unit if profile else "-",
                    "is_active": enroll.get("is_active", True),
                    "created": enroll.get("created"),
                })
            except User.DoesNotExist:
                results.append({"username": username})

        return JsonResponse({"results": results, "count": len(results)})
    except Exception as exc:
        return JsonResponse({"error": str(exc), "results": [], "count": 0}, status=200)


@require_GET
@_require_instructor
def api_instructor_course_grades(request, course_id: str):
    """
    GET /military/api/v1/instructor/courses/<course_id>/grades/
    คะแนนนักเรียนใน course นี้ (ผ่าน Grades API ของ Open edX)
    """
    import urllib.request as urlreq
    import urllib.parse
    lms_url = "http://localhost:8000"
    encoded_id = urllib.parse.quote(course_id, safe="")
    api_url = f"{lms_url}/api/grades/v1/gradebook/{encoded_id}/?page_size=100"

    try:
        headers = {"Cookie": request.META.get("HTTP_COOKIE", "")}
        req = urlreq.Request(api_url, headers=headers)
        with urlreq.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        return JsonResponse(data)
    except Exception as exc:
        return JsonResponse({"error": str(exc), "results": [], "count": 0}, status=200)



# ── Password Management ────────────────────────────────────────────────────

@csrf_exempt
@_require_login
@require_POST
def api_change_password(request):
    """
    POST /military/api/v1/change-password/
    เปลี่ยนรหัสผ่านของตัวเอง — ต้องผ่าน login แล้ว
    Body: { "current_password": "...", "new_password": "...", "confirm_password": "..." }
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    current_password = body.get("current_password", "").strip()
    new_password = body.get("new_password", "").strip()
    confirm_password = body.get("confirm_password", "").strip()

    if not current_password or not new_password or not confirm_password:
        return JsonResponse({"error": "กรุณากรอกข้อมูลให้ครบถ้วน"}, status=400)

    if new_password != confirm_password:
        return JsonResponse({"error": "รหัสผ่านใหม่ไม่ตรงกัน"}, status=400)

    if len(new_password) < 8:
        return JsonResponse({"error": "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร"}, status=400)

    # Password complexity — ต้องมีตัวเลขหรืออักขระพิเศษอย่างน้อย 1 ตัว และมีตัวอักษรอย่างน้อย 1 ตัว
    import re
    if not re.search(r'[A-Za-z]', new_password):
        return JsonResponse({"error": "รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษอย่างน้อย 1 ตัว"}, status=400)
    if not re.search(r'[0-9!@#$%^&*()_+\-=\[\]{};\'"\\|,.<>\/?]', new_password):
        return JsonResponse({"error": "รหัสผ่านต้องมีตัวเลขหรืออักขระพิเศษอย่างน้อย 1 ตัว"}, status=400)

    profile = getattr(request.user, "military_profile", None)
    if not profile:
        return JsonResponse({"error": "ไม่พบข้อมูลผู้ใช้"}, status=404)

    # Verify current password
    if profile.custom_password_hash:
        if not profile.check_custom_password(current_password):
            return JsonResponse({"error": "รหัสผ่านปัจจุบันไม่ถูกต้อง"}, status=400)
    else:
        if not profile.check_military_id(current_password):
            return JsonResponse({"error": "รหัสผ่านปัจจุบันไม่ถูกต้อง"}, status=400)

    profile.set_custom_password(new_password)
    return JsonResponse({"success": True, "message": "เปลี่ยนรหัสผ่านสำเร็จ"})


@csrf_exempt
@_require_admin
@require_POST
def api_admin_reset_password(request, user_id: int):
    """
    POST /military/api/v1/admin/users/<user_id>/reset-password/
    Admin รีเซ็ตรหัสผ่านผู้ใช้กลับเป็น default (เลขทหาร = military_id)
    ป้องกัน: admin ไม่สามารถรีเซ็ตรหัสผ่านของ admin/superuser คนอื่นได้
    """
    try:
        target_user = User.objects.get(pk=user_id)
        profile = target_user.military_profile
    except (User.DoesNotExist, MilitaryUserProfile.DoesNotExist):
        return JsonResponse({"error": "ไม่พบผู้ใช้"}, status=404)

    # ป้องกัน privilege escalation — admin ทั่วไปรีเซ็ตรหัส admin/superuser คนอื่นไม่ได้
    if target_user.is_superuser:
        return JsonResponse({"error": "ไม่สามารถรีเซ็ตรหัสผ่านของ superuser ได้"}, status=403)

    if target_user.is_staff and not request.user.is_superuser:
        return JsonResponse({"error": "ต้องการสิทธิ์ superuser ในการรีเซ็ตรหัสผ่านของ admin"}, status=403)

    if profile.role == "admin" and not request.user.is_superuser:
        return JsonResponse({"error": "ต้องการสิทธิ์ superuser ในการรีเซ็ตรหัสผ่านของ admin"}, status=403)

    profile.reset_to_default_password()
    return JsonResponse({
        "success": True,
        "message": f"รีเซ็ตรหัสผ่านของ {profile.full_name_th} เป็นค่า default (เลขทหาร) สำเร็จ",
    })


@require_GET
@_require_login
def api_courses_catalog(request):
    """
    GET /military/api/v1/courses/
    Return course catalog using Django ORM directly (avoids HTTP self-call deadlock).
    """
    from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
    from common.djangoapps.student.models import CourseEnrollment

    search = request.GET.get('search_term', '')
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 24))

    qs = CourseOverview.objects.filter(
        catalog_visibility__in=['both', 'about'],
    ).order_by('display_name')

    if search:
        qs = qs.filter(display_name__icontains=search)

    total = qs.count()
    offset = (page - 1) * page_size
    courses = qs[offset:offset + page_size]

    enrolled_ids = set(
        str(e.course_id)
        for e in CourseEnrollment.objects.filter(user=request.user, is_active=True)
    )

    # Count active enrollments per course in one query
    from django.db.models import Count as _Count
    _enroll_counts = dict(
        CourseEnrollment.objects
        .filter(course_id__in=[c.id for c in courses], is_active=True)
        .values('course_id')
        .annotate(_cnt=_Count('id'))
        .values_list('course_id', '_cnt')
    )

    results = []
    for c in courses:
        course_image = None
        if c.course_image_url:
            if c.course_image_url.startswith('http'):
                course_image = c.course_image_url
            else:
                course_image = f'https://signalstandard.rta.mi.th{c.course_image_url}'
        results.append({
            'id': str(c.id),
            'name': c.display_name or '',
            'short_description': c.short_description or '',
            'course_image_url': course_image,
            'start': c.start.isoformat() if c.start else None,
            'end': c.end.isoformat() if c.end else None,
            'enrollment_start': c.enrollment_start.isoformat() if c.enrollment_start else None,
            'enrollment_end': c.enrollment_end.isoformat() if c.enrollment_end else None,
            'org': c.org,
            'number': c.number,
            'effort': None,
            'is_enrolled': str(c.id) in enrolled_ids,
            'category': '',
            'enrollment_count': _enroll_counts.get(c.id, 0),
        })

    base_url = '/military/api/v1/courses/'
    next_url = f'{base_url}?page={page + 1}&page_size={page_size}' if offset + page_size < total else None
    prev_url = f'{base_url}?page={page - 1}&page_size={page_size}' if page > 1 else None

    return JsonResponse({
        'count': total,
        'next': next_url,
        'previous': prev_url,
        'results': results,
    })


@csrf_exempt
@require_POST
@_require_login
def api_enroll_course(request):
    """
    POST /military/api/v1/enroll/
    Enroll current user into a course using Django ORM directly.
    """
    import json as _json
    try:
        body = _json.loads(request.body)
        course_id = body.get("course_id") or (body.get("course_details") or {}).get("course_id")
    except Exception:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    if not course_id:
        return JsonResponse({"error": "course_id required"}, status=400)

    try:
        from opaque_keys.edx.keys import CourseKey
        from common.djangoapps.student.models import CourseEnrollment
        from openedx.core.djangoapps.content.course_overviews.models import CourseOverview

        course_key = CourseKey.from_string(course_id)

        # Verify course exists
        CourseOverview.objects.get(id=course_key)

        # Auto-create audit mode if course has no modes (required for enrollment to work)
        from common.djangoapps.course_modes.models import CourseMode
        if not CourseMode.objects.filter(course_id=course_key).exists():
            CourseMode.objects.create(course_id=course_key, mode_slug='audit',
                                      mode_display_name='Audit', min_price=0)

        result = CourseEnrollment.enroll(request.user, course_key, check_access=False)
        if isinstance(result, tuple):
            enrollment, created = result
        else:
            enrollment, created = result, not CourseEnrollment.is_enrolled(request.user, course_key)
        return JsonResponse({
            "success": True,
            "created": created,
            "course_id": course_id,
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@require_GET
@_require_login
def api_my_certificate_detail(request, cert_id):
    """
    GET /military/api/v1/my/certificates/<cert_id>/
    ข้อมูลครบสำหรับแสดงใบประกาศ พร้อม profile ผู้รับ
    """
    try:
        cert = UserCertificateExpiry.objects.get(id=cert_id, user=request.user)
    except UserCertificateExpiry.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    try:
        config = CourseCertificateConfig.objects.get(course_id=cert.course_id)
        course_name  = config.course_name
        validity_yrs = config.validity_years
    except CourseCertificateConfig.DoesNotExist:
        course_name  = str(cert.course_id)
        validity_yrs = None

    # ดึง profile ผู้รับ
    try:
        from military_profile.models import MilitaryUserProfile
        profile = MilitaryUserProfile.objects.get(user=request.user)
        rank      = profile.get_rank_display()
        full_name = profile.full_name_th
        unit      = profile.unit
        sub_unit  = profile.sub_unit or ''
        position  = profile.get_rank_display()  # ใช้ยศแทน ถ้าไม่มี position field
    except Exception:
        rank = full_name = unit = sub_unit = position = ''

    today = date.today()
    days_left = (cert.expiry_date - today).days if cert.expiry_date else None

    return JsonResponse({
        'id':          cert.id,
        'cert_no':     f'สส.{cert.issued_date.year + 543 if cert.issued_date else ""}-{cert.id:04d}',
        'course_id':   str(cert.course_id),
        'course_name': course_name,
        'issued_date': cert.issued_date.isoformat() if cert.issued_date else None,
        'expiry_date': cert.expiry_date.isoformat() if cert.expiry_date else None,
        'status':      cert.status,
        'days_left':   days_left,
        'rank':        rank,
        'full_name':   full_name,
        'unit':        unit,
        'sub_unit':    sub_unit,
    })


# --- Admin Course Management ---

@csrf_exempt
def api_admin_courses(request):
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    if not (request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser)):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
        from common.djangoapps.student.models import CourseAccessRole, CourseEnrollment
        from django.contrib.auth import get_user_model
        from military_profile.models import MilitaryUserProfile
        User = get_user_model()
        courses = CourseOverview.objects.all()
        result = []
        for course in courses:
            instructors = CourseAccessRole.objects.filter(
                course_id=course.id, role__in=["instructor", "staff"]
            ).select_related("user")
            instructor_list = []
            for role in instructors:
                try:
                    profile = MilitaryUserProfile.objects.get(user=role.user)
                    name = profile.full_name_th or role.user.username
                except Exception:
                    name = role.user.username
                instructor_list.append({
                    "user_id": role.user.id,
                    "username": role.user.username,
                    "full_name": name,
                    "role": role.role,
                })
            enrollment_count = CourseEnrollment.objects.filter(
                course_id=course.id, is_active=True
            ).count()
            result.append({
                "id": str(course.id),
                "name": course.display_name or str(course.id),
                "start": course.start.isoformat() if course.start else None,
                "end": course.end.isoformat() if course.end else None,
                "enrollment_count": enrollment_count,
                "instructors": instructor_list,
            })
        return JsonResponse({"results": result, "count": len(result)})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def api_admin_course_assign_instructor(request, course_id: str):
    if not (request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser)):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        import json
        from opaque_keys.edx.keys import CourseKey
        from common.djangoapps.student.models import CourseAccessRole
        from django.contrib.auth import get_user_model
        User = get_user_model()
        data = json.loads(request.body)
        action = data.get("action", "add")
        user_id = data.get("user_id")
        if not user_id:
            return JsonResponse({"error": "user_id required"}, status=400)
        user = User.objects.get(id=user_id)
        course_key = CourseKey.from_string(course_id)
        if action == "add":
            CourseAccessRole.objects.get_or_create(
                user=user, course_id=course_key, role="instructor",
                defaults={"org": course_key.org}
            )
            # Also update org if record already exists with empty org
            CourseAccessRole.objects.filter(
                user=user, course_id=course_key, role="instructor", org=""
            ).update(org=course_key.org)
            # Grant Studio (CourseCreator) access so instructor can edit in Studio
            from datetime import datetime as _dt
            now = _dt.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            from django.db import connection as _conn
            with _conn.cursor() as cur:
                cur.execute(
                    "UPDATE course_creators_coursecreator SET state='granted', state_changed=%s WHERE user_id=%s",
                    [now, user.id]
                )
                if cur.rowcount == 0:
                    cur.execute(
                        "INSERT INTO course_creators_coursecreator (user_id, state, note, state_changed, all_organizations) VALUES (%s, 'granted', '', %s, 0)",
                        [user.id, now]
                    )
            msg = "Assigned " + user.username + " as instructor"
        else:
            CourseAccessRole.objects.filter(
                user=user, course_id=course_key, role__in=["instructor", "staff"]
            ).delete()
            msg = "Removed " + user.username + " from course"
        return JsonResponse({"success": True, "message": msg})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def api_admin_delete_course(request, course_id: str):
    if request.method != "DELETE":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    if not (request.user.is_authenticated and request.user.is_superuser):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        from opaque_keys.edx.keys import CourseKey
        from xmodule.modulestore.django import modulestore
        from xmodule.modulestore import ModuleStoreEnum

        course_key = CourseKey.from_string(course_id)
        store = modulestore()

        # ตรวจว่า course มีอยู่จริง
        course = store.get_course(course_key)
        if not course:
            return JsonResponse({"error": "ไม่พบ course"}, status=404)

        # ลบ course via modulestore API
        store.delete_course(course_key, ModuleStoreEnum.UserID.mgmt_command)

        return JsonResponse({"success": True, "deleted": course_id})
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)

# ============================================================
# Import Questions from Word/Docx API
# ============================================================

def _parse_docx_questions(file_bytes):
    import io, re
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    questions = []
    errors = []
    CHOICE_MAP = {"ก": "A", "ข": "B", "ค": "C", "ง": "D", "จ": "E"}

    def normalize_letter(s):
        s = s.strip().upper()
        return CHOICE_MAP.get(s, s)

    current = None
    line_num = 0

    def flush(q, ln):
        if not q:
            return None
        if not q.get("question"):
            errors.append(f"บรรทัด {ln}: ไม่พบคำถาม")
            return None
        if len(q.get("choices", [])) < 2:
            errors.append(f"บรรทัด {ln}: '{q['question'][:30]}' มีตัวเลือกน้อยเกินไป ({len(q.get('choices',[]))} ตัวเลือก)")
            return None
        if not q.get("answer"):
            errors.append(f"บรรทัด {ln}: '{q['question'][:30]}' ไม่มีเฉลย")
            return None
        return q

    for para in doc.paragraphs:
        line_num += 1
        line = para.text.strip()
        if not line:
            if current:
                q = flush(current, line_num)
                if q:
                    questions.append(q)
                current = None
            continue

        choice_match = re.match(r"^([กขคงจABCDE])[.)]\s+(.*)", line, re.IGNORECASE)
        answer_match = re.match(r"^(?:เฉลย|ตอบ|คำตอบ|answer)[:\s]+([กขคงABCDE])", line, re.IGNORECASE)
        new_q_match = re.match(r"^(?:ข้อ\s*\d+[.\s]*|(?:\d+)[.)]\s*)(.*)", line)

        if answer_match:
            if current:
                current["answer"] = normalize_letter(answer_match.group(1))
        elif choice_match:
            letter = normalize_letter(choice_match.group(1))
            text = choice_match.group(2).strip()
            if current is None:
                current = {"question": "", "choices": [], "answer": ""}
            current["choices"].append({"letter": letter, "text": text})
        elif new_q_match:
            if current:
                q = flush(current, line_num)
                if q:
                    questions.append(q)
            q_text = new_q_match.group(1).strip() or line
            current = {"question": q_text, "choices": [], "answer": ""}
        else:
            if current is None:
                current = {"question": line, "choices": [], "answer": ""}
            elif not current.get("question"):
                current["question"] = line
            elif not current.get("choices"):
                current["question"] += " " + line

    if current:
        q = flush(current, line_num)
        if q:
            questions.append(q)

    return questions, errors


def _question_to_olx(q, idx):
    import xml.sax.saxutils as saxutils
    esc = saxutils.escape
    choices_xml = ""
    for c in q["choices"]:
        correct = "true" if c["letter"] == q["answer"] else "false"
        choices_xml += '        <choice correct="{}">{}</choice>\n'.format(correct, esc(c["text"]))
    return '<problem display_name="{}">\n  <multiplechoiceresponse>\n    <label>{}</label>\n    <choicegroup type="MultipleChoice" shuffle="true">\n{}    </choicegroup>\n  </multiplechoiceresponse>\n</problem>'.format(
        esc(q["question"][:80]), esc(q["question"]), choices_xml
    )


@require_http_methods(["GET"])
def api_import_list_libraries(request):
    if not (request.user.is_authenticated and request.user.is_superuser):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        from openedx.core.djangoapps.content_libraries import api as lib_api
        libs = lib_api.get_libraries_for_user(request.user)
        result = [
            {
                "key": str(l.library_key),
                "title": l.learning_package.title,
                "org": l.org.short_name if hasattr(l.org, "short_name") else str(l.org),
            }
            for l in libs
        ]
        return JsonResponse({"libraries": result})
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)


@require_http_methods(["POST"])
def api_import_parse(request):
    if not (request.user.is_authenticated and request.user.is_superuser):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        if "file" not in request.FILES:
            return JsonResponse({"error": "ไม่พบไฟล์"}, status=400)
        f = request.FILES["file"]
        if not f.name.lower().endswith(".docx"):
            return JsonResponse({"error": "รองรับเฉพาะไฟล์ .docx"}, status=400)
        file_bytes = f.read()
        questions, errors = _parse_docx_questions(file_bytes)
        return JsonResponse({
            "total": len(questions),
            "questions": questions[:20],
            "errors": errors[:20],
        })
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)


@require_http_methods(["POST"])
def api_import_execute(request):
    if not (request.user.is_authenticated and request.user.is_superuser):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        import uuid
        from openedx.core.djangoapps.content_libraries import api as lib_api
        from opaque_keys.edx.locator import LibraryLocatorV2

        library_key_str = request.POST.get("library_key", "")
        if not library_key_str:
            return JsonResponse({"error": "กรุณาระบุ library_key"}, status=400)
        if "file" not in request.FILES:
            return JsonResponse({"error": "ไม่พบไฟล์"}, status=400)

        f = request.FILES["file"]
        file_bytes = f.read()
        questions, parse_errors = _parse_docx_questions(file_bytes)

        if not questions:
            return JsonResponse({"error": "ไม่พบข้อสอบในไฟล์", "parse_errors": parse_errors}, status=400)

        library_key = LibraryLocatorV2.from_string(library_key_str)
        imported = 0
        import_errors = []

        for idx, q in enumerate(questions, 1):
            try:
                def_id = "q-{}".format(__import__("uuid").uuid4().hex[:12])
                block = lib_api.create_library_block(
                    library_key, "problem", def_id, user_id=request.user.id
                )
                olx = _question_to_olx(q, idx)
                lib_api.set_library_block_olx(block.usage_key, olx)
                imported += 1
            except Exception as ex:
                import_errors.append("ข้อ {}: {}".format(idx, str(ex)))

        try:
            lib_api.publish_changes(library_key)
        except Exception:
            pass

        return JsonResponse({
            "success": True,
            "imported": imported,
            "total": len(questions),
            "parse_errors": parse_errors,
            "import_errors": import_errors,
        })
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)
