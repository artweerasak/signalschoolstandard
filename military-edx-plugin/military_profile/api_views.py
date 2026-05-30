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
        "gender": profile.gender,
        "gender_display": profile.get_gender_display(),
        "personnel_type": profile.personnel_type,
        "personnel_type_display": profile.get_personnel_type_display(),
        "civilian_prefix": profile.civilian_prefix,
        "display_prefix": profile.display_prefix,
        "display_full_name": profile.display_full_name,
    }


@require_GET
@_require_login


def _derive_gender_from_prefix(prefix: str) -> str:
    """นาย→M, นาง/นางสาว→F (สำหรับพลเรือน/พนักงานราชการ)"""
    return "M" if prefix == "นาย" else "F"

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

    personnel_type = body.get("personnel_type", "military")
    required_fields = ["national_id", "full_name_th", "unit", "service_start_date", "birth_date", "username"]
    if personnel_type == "military":
        required_fields.append("rank")
    required = required_fields
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
            gender=(
                _derive_gender_from_prefix(body.get("civilian_prefix", ""))
                if personnel_type != "military"
                else body.get("gender", "M")
            ),
            personnel_type=personnel_type,
            civilian_prefix=body.get("civilian_prefix", ""),
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
    for field in ("full_name_th", "rank", "unit", "sub_unit", "contact_email", "phone_number", "army_region", "gender", "personnel_type", "civilian_prefix"):
        if field in body:
            setattr(profile, field, body[field])
    # Auto-derive gender from civilian_prefix for non-military
    new_personnel_type = body.get("personnel_type", profile.personnel_type)
    if new_personnel_type != "military" and "civilian_prefix" in body:
        profile.gender = _derive_gender_from_prefix(body["civilian_prefix"])
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



def _is_admin_or_instructor(user):
    if not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    from common.djangoapps.student.models import CourseAccessRole
    return CourseAccessRole.objects.filter(user=user, role__in=["instructor", "staff"]).exists()

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

    def is_complete(q):
        return q and q.get("question") and len(q.get("choices", [])) >= 2 and q.get("answer")

    all_lines = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            all_lines.append("")
        else:
            # handle paragraph with embedded newlines (all in one paragraph)
            for subline in text.split("\n"):
                sl = subline.strip()
                if sl:
                    all_lines.append(sl)
                else:
                    all_lines.append("")

    for line in all_lines:
        line_num += 1
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
            # plain question line (no ข้อ prefix)
            if current is None:
                current = {"question": line, "choices": [], "answer": ""}
            elif not current.get("question"):
                current["question"] = line
            elif not current.get("choices"):
                current["question"] += " " + line
            elif is_complete(current):
                # previous question is complete, this line starts a new question
                q = flush(current, line_num)
                if q:
                    questions.append(q)
                current = {"question": line, "choices": [], "answer": ""}

    if current:
        q = flush(current, line_num)
        if q:
            questions.append(q)

    return questions, errors


def _question_to_olx(q, idx):
    import xml.sax.saxutils as saxutils
    esc = saxutils.escape
    # quoteattr handles attribute escaping including < > " & inside attribute values
    display_name = saxutils.quoteattr(q["question"][:80])
    choices_xml = ""
    for ch in q["choices"]:
        correct = "true" if ch["letter"] == q["answer"] else "false"
        choices_xml += '        <choice correct="{}">{}</choice>\n'.format(correct, esc(ch["text"]))
    return (
        '<problem display_name={}>\n'
        '  <multiplechoiceresponse>\n'
        '    <label>{}\n</label>\n'
        '    <choicegroup type="MultipleChoice" shuffle="true">\n'
        '{}    </choicegroup>\n'
        '  </multiplechoiceresponse>\n'
        '</problem>'
    ).format(display_name, esc(q["question"]), choices_xml)


@require_http_methods(["GET"])
def api_import_list_libraries(request):
    if not _is_admin_or_instructor(request.user):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        from openedx.core.djangoapps.content_libraries.models import ContentLibrary, ContentLibraryPermission
        from opaque_keys.edx.locator import LibraryLocatorV2
        user = request.user

        if user.is_staff or user.is_superuser:
            # admin sees all libraries
            libs = ContentLibrary.objects.all().select_related("learning_package", "org")
            result = [
                {
                    "key": str(LibraryLocatorV2(org=l.org.short_name, slug=l.slug)),
                    "title": l.learning_package.title,
                    "org": l.org.short_name,
                }
                for l in libs
            ]
        else:
            # instructor sees only libraries where they have permission
            perms = ContentLibraryPermission.objects.filter(user=user).select_related(
                "library__learning_package", "library__org"
            )
            result = [
                {
                    "key": str(LibraryLocatorV2(org=p.library.org.short_name, slug=p.library.slug)),
                    "title": p.library.learning_package.title,
                    "org": p.library.org.short_name,
                    "access_level": p.access_level,
                }
                for p in perms
            ]
        return JsonResponse({"libraries": result})
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)


@require_http_methods(["POST"])
def api_import_parse(request):
    if not _is_admin_or_instructor(request.user):
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
    if not _is_admin_or_instructor(request.user):
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
            lib_api.publish_changes(library_key, user_id=request.user.id)
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


@require_http_methods(["DELETE"])
def api_delete_library(request, library_key_str):
    if not (request.user.is_authenticated and _is_admin_or_instructor(request.user)):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        from openedx.core.djangoapps.content_libraries import api as lib_api
        from openedx.core.djangoapps.content_libraries.models import ContentLibrary, ContentLibraryPermission
        from opaque_keys.edx.locator import LibraryLocatorV2
        library_key = LibraryLocatorV2.from_string(library_key_str)

        # Superuser/staff can delete any library
        if not (request.user.is_staff or request.user.is_superuser):
            lib_obj = ContentLibrary.objects.filter(
                org__short_name=library_key.org, slug=library_key.slug
            ).first()
            if not lib_obj:
                return JsonResponse({"error": "Library not found"}, status=404)
            # Only allow instructors with admin access to this library
            has_admin = ContentLibraryPermission.objects.filter(
                library=lib_obj, user=request.user, access_level="admin"
            ).exists()
            if not has_admin:
                return JsonResponse({"error": "คุณไม่มีสิทธิ์ลบ Library นี้ (ต้องมีสิทธิ์ระดับ admin)"}, status=403)

        # Delete EntityListRow records first (FK RESTRICT blocks cascade)
        try:
            from openedx_learning.apps.authoring.publishing.models import EntityListRow, PublishableEntity
            from openedx.core.djangoapps.content_libraries.models import ContentLibrary as _CL
            _lib_obj2 = _CL.objects.get_by_key(library_key)
            _pkg2 = _lib_obj2.learning_package
            field_name = "id"
            _eids = list(PublishableEntity.objects.filter(learning_package=_pkg2).values_list(field_name, flat=True))
            EntityListRow.objects.filter(entity_id__in=_eids).delete()
        except Exception:
            pass

        # Nullify contentstore_componentlink.upstream_block_id before deleting library components.
        # The model declares on_delete=SET_NULL but lib_api bypasses Django ORM cascade,
        # so MySQL's FK constraint blocks the delete without this step.
        # Use raw SQL because cms.djangoapps.contentstore is not in LMS INSTALLED_APPS.
        try:
            from openedx_learning.apps.authoring.components.models import Component
            from openedx.core.djangoapps.content_libraries.models import ContentLibrary as _CL2
            _lib_obj3 = _CL2.objects.get_by_key(library_key)
            _pkg3 = _lib_obj3.learning_package
            _component_ids = list(Component.objects.filter(learning_package=_pkg3).values_list("pk", flat=True))
            if _component_ids:
                with connection.cursor() as _cursor:
                    _fmt = ",".join(["%s"] * len(_component_ids))
                    _cursor.execute(
                        f"UPDATE contentstore_componentlink SET upstream_block_id = NULL WHERE upstream_block_id IN ({_fmt})",
                        _component_ids,
                    )
        except Exception:
            pass

        lib_api.delete_library(library_key)
        return JsonResponse({"success": True, "deleted": library_key_str})
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)

# ──────────────────────────────────────────────
# Library Blocks Management
# ──────────────────────────────────────────────

@require_http_methods(["GET"])
def api_list_library_blocks(request, library_key_str):
    """List all blocks in a library with display name and usage key."""
    if not _is_admin_or_instructor(request.user):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        from openedx.core.djangoapps.content_libraries.api.blocks import (
            get_library_components, get_library_block
        )
        from opaque_keys.edx.locator import LibraryLocatorV2, LibraryUsageLocatorV2
        from openedx.core.djangoapps.content_libraries.models import ContentLibrary, ContentLibraryPermission

        library_key = LibraryLocatorV2.from_string(library_key_str)

        # Permission check for non-admins
        if not (request.user.is_staff or request.user.is_superuser):
            lib_obj = ContentLibrary.objects.filter(
                org__short_name=library_key.org,
                slug=library_key.slug
            ).first()
            if not lib_obj:
                return JsonResponse({"error": "Library not found"}, status=404)
            has_perm = ContentLibraryPermission.objects.filter(
                user=request.user, library=lib_obj
            ).exists()
            if not has_perm:
                return JsonResponse({"error": "Forbidden"}, status=403)

        comps = get_library_components(library_key)
        blocks = []
        for c in comps:
            # Build usage key from component key: xblock.v1:TYPE:LOCAL_KEY
            parts = c.key.split(":")
            if len(parts) >= 3:
                block_type = parts[-2]
                local_key = parts[-1]
                usage_key_str = "lb:{}:{}:{}:{}".format(
                    library_key.org, library_key.slug, block_type, local_key
                )
                try:
                    usage_key = LibraryUsageLocatorV2.from_string(usage_key_str)
                    meta = get_library_block(usage_key)
                    display_name = meta.display_name or local_key
                except Exception:
                    display_name = local_key

                blocks.append({
                    "usage_key": usage_key_str,
                    "display_name": display_name,
                    "block_type": block_type,
                    "local_key": local_key,
                })

        return JsonResponse({"blocks": blocks, "total": len(blocks)})
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)


@require_http_methods(["POST"])
def api_bulk_delete_blocks(request):
    """Delete multiple library blocks by usage_key."""
    if not _is_admin_or_instructor(request.user):
        return JsonResponse({"error": "Forbidden"}, status=403)
    try:
        import json as json_mod
        from openedx.core.djangoapps.content_libraries import api as lib_api
        from openedx.core.djangoapps.content_libraries.models import ContentLibrary, ContentLibraryPermission
        from opaque_keys.edx.locator import LibraryUsageLocatorV2, LibraryLocatorV2

        data = json_mod.loads(request.body)
        usage_keys = data.get("usage_keys", [])

        if not usage_keys:
            return JsonResponse({"error": "ไม่มี block_key ที่ส่งมา"}, status=400)

        if len(usage_keys) > 200:
            return JsonResponse({"error": "ลบได้ครั้งละไม่เกิน 200 ข้อ"}, status=400)

        # Permission check: ensure user has access to the library
        first_key = LibraryUsageLocatorV2.from_string(usage_keys[0])
        library_key = first_key.lib_key

        if not (request.user.is_staff or request.user.is_superuser):
            lib_obj = ContentLibrary.objects.filter(
                org__short_name=library_key.org, slug=library_key.slug
            ).first()
            if not lib_obj:
                return JsonResponse({"error": "Library not found"}, status=404)
            has_perm = ContentLibraryPermission.objects.filter(
                user=request.user, library=lib_obj
            ).exists()
            if not has_perm:
                return JsonResponse({"error": "Forbidden"}, status=403)

        deleted = 0
        errors = []
        for key_str in usage_keys:
            try:
                usage_key = LibraryUsageLocatorV2.from_string(key_str)
                lib_api.delete_library_block(usage_key)
                deleted += 1
            except Exception as ex:
                errors.append({"key": key_str, "error": str(ex)})

        # Publish changes after deletion
        try:
            lib_api.publish_changes(library_key, user_id=request.user.id)
        except Exception:
            pass

        return JsonResponse({
            "success": True,
            "deleted": deleted,
            "errors": errors,
        })
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "detail": traceback.format_exc()}, status=500)


# ──────────────────────────────────────────────
# Bulk Import Users from Excel
# ──────────────────────────────────────────────

def _parse_excel_users(file_bytes):
    """
    Parse Excel file and return list of user dicts.
    Expected columns (row 1 = header):
    username | full_name_th | rank | national_id | military_id |
    unit | sub_unit | birth_date | service_start_date | role | army_region | contact_email | phone_number
    """
    import io
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], ["ไฟล์ว่างเปล่า"]

    header = [str(c).strip().lower() if c else "" for c in rows[0]]

    ALIASES = {
        "username": ["username", "ชื่อผู้ใช้", "user"],
        "full_name_th": ["full_name_th", "ชื่อ-นามสกุล", "ชื่อเต็ม", "full_name"],
        "rank": ["rank", "ยศ", "ชั้นยศ"],
        "national_id": ["national_id", "เลขบัตรประชาชน", "หมายเลขประจำตัวประชาชน"],
        "military_id": ["military_id", "เลขประจำตัวทหาร", "รหัสทหาร"],
        "unit": ["unit", "หน่วย", "หน่วยงาน"],
        "sub_unit": ["sub_unit", "หน่วยรอง"],
        "birth_date": ["birth_date", "วันเกิด", "วันเดือนปีเกิด"],
        "service_start_date": ["service_start_date", "วันเข้ารับราชการ", "วันบรรจุ"],
        "role": ["role", "บทบาท", "ตำแหน่ง"],
        "army_region": ["army_region", "ภาค"],
        "contact_email": ["contact_email", "email", "อีเมล"],
        "phone_number": ["phone_number", "เบอร์โทร", "โทร"],
        "password": ["password", "รหัสผ่าน"],
        "gender": ["gender", "เพศ"],
        "personnel_type": ["personnel_type", "ประเภทบุคลากร", "ประเภท"],
        "civilian_prefix": ["civilian_prefix", "คำนำหน้า"],
    }

    col_index = {}
    for field, aliases in ALIASES.items():
        for alias in aliases:
            if alias in header:
                col_index[field] = header.index(alias)
                break

    required = ["username", "full_name_th", "national_id", "unit", "birth_date", "service_start_date"]
    missing = [f for f in required if f not in col_index]
    if missing:
        return [], [f"ไม่พบคอลัมน์ที่จำเป็น: {', '.join(missing)}"]

    users = []
    errors = []
    for row_num, row in enumerate(rows[1:], start=2):
        if all(v is None or str(v).strip() == "" for v in row):
            continue  # skip empty rows
        def get(field):
            idx = col_index.get(field)
            if idx is None:
                return ""
            val = row[idx] if idx < len(row) else None
            return str(val).strip() if val is not None else ""

        username = get("username")
        full_name = get("full_name_th")
        national_id = get("national_id")
        military_id = get("military_id")

        if not username:
            errors.append(f"แถว {row_num}: ไม่มี username")
            continue
        if not full_name:
            errors.append(f"แถว {row_num}: ไม่มีชื่อ-นามสกุล (username={username})")
            continue
        if not national_id:
            errors.append(f"แถว {row_num}: ไม่มีเลขบัตรประชาชน (username={username})")
            continue

        users.append({
            "username": username,
            "full_name_th": full_name,
            "rank": get("rank") or "PVT",
            "national_id": national_id,
            "military_id": military_id or national_id,
            "unit": get("unit"),
            "sub_unit": get("sub_unit"),
            "birth_date": get("birth_date"),
            "service_start_date": get("service_start_date"),
            "role": get("role") or "student",
            "army_region": get("army_region"),
            "contact_email": get("contact_email"),
            "phone_number": get("phone_number"),
            "password": get("password") or "",
            "personnel_type": get("personnel_type") or "military",
            "civilian_prefix": get("civilian_prefix") or "",
            "gender": (
                _derive_gender_from_prefix(get("civilian_prefix") or "นาย")
                if (get("personnel_type") or "military") != "military"
                else (get("gender") or "M")
            ),
            "_row": row_num,
        })

    return users, errors


@require_http_methods(["GET"])
@_require_admin
def api_admin_bulk_import_template(request):
    """GET /military/api/v1/admin/users/bulk-import/template/ — download Excel template"""
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from django.http import HttpResponse

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "นำเข้าผู้ใช้"

    headers = [
        "username", "full_name_th", "rank", "national_id", "military_id",
        "unit", "sub_unit", "birth_date", "service_start_date",
        "role", "army_region", "contact_email", "phone_number", "password",
        "gender", "personnel_type", "civilian_prefix",
    ]
    notes = [
        "ชื่อผู้ใช้ (ภาษาอังกฤษ/ตัวเลข)*", "ชื่อ-นามสกุล*", "ยศ (เช่น CPT, MAJ) - ทหารเท่านั้น",
        "เลขบัตรประชาชน 13 หลัก*", "เลขประจำตัวทหาร 10 หลัก - ทหารเท่านั้น",
        "หน่วยงาน*", "หน่วยรอง", "วันเกิด (DD/MM/YYYY)*", "วันเข้ารับราชการ (DD/MM/YYYY)*",
        "บทบาท: student/instructor", "ภาค (เช่น 1,2,3,4)", "อีเมล", "เบอร์โทร",
        "รหัสผ่าน (ว่าง=ใช้ military_id/national_id)",
        "เพศ: M=ชาย F=หญิง (ทหาร) - พลเรือนใช้คำนำหน้าแทน",
        "ประเภท: military=ทหาร / civilian=ลูกจ้าง / government=พนักงานราชการ",
        "คำนำหน้า (พลเรือน): นาย / นาง / นางสาว",
    ]
    sample_military = [
        "artsgt001", "วีระศักดิ์ มัจฉา", "SGT2", "1234567890123", "1234567890",
        "กรมทหารสื่อสาร", "กองพัน 1", "15/03/2000", "01/04/2020",
        "student", "1", "art@example.com", "0812345678", "",
        "M", "military", "",
    ]
    sample_civilian = [
        "civ001", "สมศรี ใจดี", "", "9876543210123", "",
        "กรมทหารสื่อสาร", "", "20/05/1990", "01/06/2018",
        "student", "", "ssc@example.com", "0898765432", "",
        "", "civilian", "นาง",
    ]
    sample = sample_military  # แถวตัวอย่างหลัก

    # Header row style
    header_fill = PatternFill("solid", fgColor="4A1A6B")
    header_font = Font(bold=True, color="FFFFFF")
    note_fill = PatternFill("solid", fgColor="F3E8FF")
    note_font = Font(italic=True, color="6B21A8", size=9)

    ws.append(headers)
    ws.append(notes)
    ws.append(sample_military)
    ws.append(sample_civilian)

    for col_num, cell in enumerate(ws[1], start=1):
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
        ws.column_dimensions[cell.column_letter].width = max(len(headers[col_num-1]) * 2, 18)

    for cell in ws[2]:
        cell.fill = note_fill
        cell.font = note_font

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    response = HttpResponse(
        buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = 'attachment; filename="template_bulk_users.xlsx"'
    return response


@require_http_methods(["POST"])
@_require_admin
def api_admin_bulk_import_users(request):
    """POST /military/api/v1/admin/users/bulk-import/ — import users from Excel"""
    if "file" not in request.FILES:
        return JsonResponse({"error": "ไม่พบไฟล์"}, status=400)

    f = request.FILES["file"]
    if not f.name.lower().endswith((".xlsx", ".xls")):
        return JsonResponse({"error": "รองรับเฉพาะไฟล์ .xlsx หรือ .xls"}, status=400)

    file_bytes = f.read()
    users, parse_errors = _parse_excel_users(file_bytes)

    if parse_errors and not users:
        return JsonResponse({"error": parse_errors[0], "parse_errors": parse_errors}, status=400)

    # dry_run mode: just parse and return preview
    dry_run = request.POST.get("dry_run", "false").lower() == "true"
    if dry_run:
        return JsonResponse({
            "dry_run": True,
            "total": len(users),
            "preview": users[:10],
            "parse_errors": parse_errors,
        })

    # Actual import
    created = []
    skipped = []
    errors = list(parse_errors)

    for u in users:
        row = u.pop("_row", "?")
        username = u["username"]
        national_id = u["national_id"]
        military_id = u["military_id"]

        if User.objects.filter(username=username).exists():
            skipped.append({"username": username, "reason": "username ซ้ำ"})
            continue
        if User.objects.filter(email=national_id).exists():
            skipped.append({"username": username, "reason": "เลขบัตรประชาชนซ้ำ"})
            continue

        try:
            password = u.get("password") or military_id
            user = User.objects.create_user(
                username=username,
                email=national_id,
                password=password,
                first_name=u["full_name_th"],
            )
            user.is_active = True
            user.is_staff = u.get("role") == "admin"
            user.save()

            profile = MilitaryUserProfile.objects.create(
                user=user,
                national_id_encrypted=encrypt_field(national_id),
                military_id_encrypted=encrypt_field(military_id),
                full_name_th=u["full_name_th"],
                rank=u["rank"],
                unit=u["unit"],
                sub_unit=u.get("sub_unit", ""),
                service_start_date=_parse_date(u["service_start_date"]),
                birth_date=_parse_date(u["birth_date"]),
                role=u.get("role", "student"),
                contact_email=u.get("contact_email", ""),
                phone_number=u.get("phone_number", ""),
                army_region=u.get("army_region", ""),
            )
            _ensure_edx_user_profile(user, u["full_name_th"])
            if profile.role == "instructor":
                _grant_course_creator(user)

            created.append(username)
        except Exception as ex:
            errors.append(f"แถว {row} ({username}): {str(ex)}")

    return JsonResponse({
        "success": True,
        "created": len(created),
        "skipped": len(skipped),
        "skipped_list": skipped,
        "errors": errors,
        "total": len(users),
    })

# ─────────────────────────────────────────────────────────────
# API: ระบบอนุมัติใบประกาศ Batch
# ─────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["GET", "POST"])
@_require_admin
def api_cert_batches(request):
    """
    GET  /military/api/v1/cert/batches/          — list batches (admin)
    POST /military/api/v1/cert/batches/          — create batch (admin)
    """

    from military_profile.models import CertificateApprovalBatch

    if request.method == 'GET':
        batches = CertificateApprovalBatch.objects.all().order_by('-approve_date')
        data = []
        for b in batches:
            pending_count  = b.pending_approvals.filter(status='pending').count()
            approved_count = b.pending_approvals.filter(status='approved').count()
            data.append({
                'id': b.id,
                'name': b.name,
                'course_id': b.course_id,
                'course_name': b.course_name,
                'enrollment_start': str(b.enrollment_start),
                'enrollment_end': str(b.enrollment_end),
                'approve_date': str(b.approve_date),
                'status': b.status,
                'note': b.note,
                'pending_count': pending_count,
                'approved_count': approved_count,
                'created_at': b.created_at.strftime('%Y-%m-%d'),
            })
        return JsonResponse({'batches': data})

    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        required = ['name', 'course_id', 'enrollment_start', 'enrollment_end', 'approve_date']
        for f in required:
            if not body.get(f):
                return JsonResponse({'error': f'Missing field: {f}'}, status=400)

        # get course name
        course_name = body.get('course_name', '')
        if not course_name:
            try:
                from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
                from opaque_keys.edx.keys import CourseKey
                ck = CourseKey.from_string(body['course_id'])
                co = CourseOverview.objects.get(id=ck)
                course_name = co.display_name
            except Exception:
                course_name = body['course_id']

        batch = CertificateApprovalBatch.objects.create(
            name=body['name'],
            course_id=body['course_id'],
            course_name=course_name,
            enrollment_start=body['enrollment_start'],
            enrollment_end=body['enrollment_end'],
            approve_date=body['approve_date'],
            note=body.get('note', ''),
            created_by=request.user,
        )
        return JsonResponse({'id': batch.id, 'message': 'สร้างรอบสำเร็จ'})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_http_methods(["GET", "POST", "DELETE"])
@_require_admin
def api_cert_batch_detail(request, batch_id):
    """
    GET    /military/api/v1/cert/batches/<id>/  — รายชื่อรออนุมัติ
    POST   /military/api/v1/cert/batches/<id>/  — อนุมัติทั้งหมด
    DELETE /military/api/v1/cert/batches/<id>/  — ลบรอบ
    """

    from military_profile.models import CertificateApprovalBatch, CertificatePendingApproval

    try:
        batch = CertificateApprovalBatch.objects.get(id=batch_id)
    except CertificateApprovalBatch.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        pendings = batch.pending_approvals.select_related('user').order_by('user__last_name')
        data = []
        for p in pendings:
            profile = getattr(p.user, 'militaryuserprofile', None)
            data.append({
                'id': p.id,
                'username': p.user.username,
                'full_name': p.user.get_full_name() or p.user.username,
                'rank': profile.rank if profile else '',
                'unit': profile.unit if profile else '',
                'passed_at': p.passed_at.strftime('%Y-%m-%d %H:%M'),
                'score': p.score,
                'status': p.status,
                'cert_uuid': p.cert_uuid,
            })
        return JsonResponse({
            'batch': {
                'id': batch.id,
                'name': batch.name,
                'course_id': batch.course_id,
                'course_name': batch.course_name,
                'approve_date': str(batch.approve_date),
                'enrollment_end': str(batch.enrollment_end),
                'status': batch.status,
            },
            'pending': data,
            'counts': {
                'pending': batch.pending_approvals.filter(status='pending').count(),
                'approved': batch.pending_approvals.filter(status='approved').count(),
                'total': batch.pending_approvals.count(),
            }
        })

    elif request.method == 'POST':
        # Batch approve — generate certificates for all pending
        import django.utils.timezone as tz
        from datetime import datetime

        pendings = batch.pending_approvals.filter(status='pending').select_related('user')
        approved_count = 0
        errors = []

        for p in pendings:
            try:
                from lms.djangoapps.certificates.api import generate_certificate_task
                from opaque_keys.edx.keys import CourseKey
                ck = CourseKey.from_string(batch.course_id)
                generate_certificate_task(p.user, ck)
                p.status = 'approved'
                p.save()
                approved_count += 1
            except Exception as e:
                errors.append({'user': p.user.username, 'error': str(e)})

        batch.status = 'approved'
        batch.approved_by = request.user
        batch.approved_at = tz.now()
        batch.save()

        return JsonResponse({
            'message': f'อนุมัติสำเร็จ {approved_count} คน',
            'approved': approved_count,
            'errors': errors,
        })

    elif request.method == 'DELETE':
        batch.delete()
        return JsonResponse({'message': 'ลบรอบสำเร็จ'})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_http_methods(["POST"])
@_require_admin
def api_cert_scan_passed(request):
    """
    POST /military/api/v1/cert/scan-passed/
    สแกนหาผู้ที่ผ่านแล้วใน course นั้น แล้วเพิ่มเข้า batch อัตโนมัติ
    body: { batch_id: int }
    """

    from military_profile.models import CertificateApprovalBatch, CertificatePendingApproval

    try:
        body = json.loads(request.body)
        batch = CertificateApprovalBatch.objects.get(id=body['batch_id'])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    from opaque_keys.edx.keys import CourseKey
    from lms.djangoapps.grades.api import CourseGradeFactory
    from common.djangoapps.student.models import CourseEnrollment
    import django.utils.timezone as tz

    try:
        ck = CourseKey.from_string(batch.course_id)
    except Exception as e:
        return JsonResponse({'error': f'Invalid course_id: {e}'}, status=400)

    enrollments = CourseEnrollment.objects.filter(course_id=ck, is_active=True).select_related('user')
    added = 0
    skipped = 0

    for enrollment in enrollments:
        user = enrollment.user
        # Skip if already in batch
        if CertificatePendingApproval.objects.filter(batch=batch, user=user).exists():
            skipped += 1
            continue
        try:
            grade = CourseGradeFactory().read(user, course_key=ck)
            if grade.passed:
                CertificatePendingApproval.objects.create(
                    batch=batch,
                    user=user,
                    passed_at=tz.now(),
                    score=round(grade.percent * 100, 1),
                    status='pending',
                )
                added += 1
        except Exception:
            continue

    return JsonResponse({'added': added, 'skipped': skipped, 'message': f'เพิ่ม {added} คน'})


@csrf_exempt
@require_GET
@_require_login
def api_cert_student_status(request):
    """
    GET /military/api/v1/cert/my-status/
    นักเรียนดูสถานะการรออนุมัติใบประกาศของตัวเอง
    """

    from military_profile.models import CertificateApprovalBatch, CertificatePendingApproval
    from datetime import date

    pendings = CertificatePendingApproval.objects.filter(
        user=request.user
    ).select_related('batch').order_by('-batch__approve_date')

    result = []
    today = date.today()
    for p in pendings:
        b = p.batch
        days_left = (b.enrollment_end - today).days
        result.append({
            'batch_id': b.id,
            'batch_name': b.name,
            'course_id': b.course_id,
            'course_name': b.course_name,
            'approve_date': str(b.approve_date),
            'enrollment_end': str(b.enrollment_end),
            'days_left_to_end': days_left,
            'batch_status': b.status,
            'my_status': p.status,
            'score': p.score,
            'cert_uuid': p.cert_uuid,
            'passed_at': p.passed_at.strftime('%Y-%m-%d'),
        })

    # Also find open batches for courses the user is enrolled in but hasn't passed
    from common.djangoapps.student.models import CourseEnrollment
    from lms.djangoapps.grades.api import CourseGradeFactory
    from opaque_keys.edx.keys import CourseKey

    open_batches = CertificateApprovalBatch.objects.filter(status='open')
    not_passed = []
    enrolled_courses = set(
        CourseEnrollment.objects.filter(user=request.user, is_active=True).values_list('course_id', flat=True)
    )

    for b in open_batches:
        # Check if enrolled & not already in pending list
        course_ids_in_result = {r['course_id'] for r in result}
        if b.course_id in enrolled_courses and b.course_id not in course_ids_in_result:
            days_left = (b.enrollment_end - today).days
            try:
                ck = CourseKey.from_string(b.course_id)
                grade = CourseGradeFactory().read(request.user, course_key=ck)
                passed = grade.passed
                score  = round(grade.percent * 100, 1)
            except Exception:
                passed = False
                score  = None
            not_passed.append({
                'batch_id': b.id,
                'batch_name': b.name,
                'course_id': b.course_id,
                'course_name': b.course_name,
                'approve_date': str(b.approve_date),
                'enrollment_end': str(b.enrollment_end),
                'days_left_to_end': days_left,
                'batch_status': b.status,
                'my_status': 'passed_waiting_scan' if passed else 'not_passed',
                'score': score,
                'cert_uuid': '',
                'passed_at': None,
            })

    return JsonResponse({'certificates': result + not_passed})


# ─────────────────────────────────────────────────────────────────────
# Video Management API
# ─────────────────────────────────────────────────────────────────────
import os as _os
import re as _re
import uuid as _uuid_mod
from django.conf import settings as _djsettings


def _get_video_dir():
    return getattr(_djsettings, 'MILITARY_VIDEO_DIR', '/opt/media/videos')


def _get_video_base_url():
    return getattr(_djsettings, 'MILITARY_VIDEO_BASE_URL', '/media/videos')


@_require_instructor
def api_video_list(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        video_dir = _get_video_dir()
        _os.makedirs(video_dir, exist_ok=True)
        files = []
        for fname in sorted(_os.listdir(video_dir)):
            fpath = _os.path.join(video_dir, fname)
            if _os.path.isfile(fpath):
                stat = _os.stat(fpath)
                files.append({
                    'name': fname,
                    'size': stat.st_size,
                    'url': f"{_get_video_base_url()}/{fname}",
                    'modified': stat.st_mtime,
                })
        return JsonResponse({'files': files})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@_require_instructor
def api_video_upload(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    if 'file' not in request.FILES:
        return JsonResponse({'error': 'No file provided'}, status=400)
    uploaded_file = request.FILES['file']
    original_name = uploaded_file.name
    safe_name = _re.sub(r'[^\w\-_.]', '_', original_name)
    if not safe_name or safe_name == '.':
        safe_name = f"video_{_uuid_mod.uuid4().hex}"
    video_dir = _get_video_dir()
    _os.makedirs(video_dir, exist_ok=True)
    file_path = _os.path.join(video_dir, safe_name)
    base, ext = _os.path.splitext(safe_name)
    counter = 1
    while _os.path.exists(file_path):
        safe_name = f"{base}_{counter}{ext}"
        file_path = _os.path.join(video_dir, safe_name)
        counter += 1
    try:
        with open(file_path, 'wb+') as dest:
            for chunk in uploaded_file.chunks(chunk_size=8 * 1024 * 1024):
                dest.write(chunk)
        return JsonResponse({
            'success': True,
            'filename': safe_name,
            'url': f"{_get_video_base_url()}/{safe_name}",
            'size': _os.path.getsize(file_path),
        })
    except Exception as e:
        if _os.path.exists(file_path):
            _os.remove(file_path)
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@_require_instructor
def api_video_delete(request, filename):
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    safe_name = _os.path.basename(filename)
    file_path = _os.path.join(_get_video_dir(), safe_name)
    if not _os.path.exists(file_path):
        return JsonResponse({'error': 'File not found'}, status=404)
    try:
        _os.remove(file_path)
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ─────────────────────────────────────────────────────────────────────
# Reports — Compliance (มาตรฐานกำลังพล)
# ─────────────────────────────────────────────────────────────────────

@require_http_methods(["GET"])
@_require_admin
def api_reports_compliance_overview(request):
    """GET /military/api/v1/reports/compliance/overview/"""
    from .compliance import bulk_compliance_stats
    from .models import MilitaryUserProfile
    qs = MilitaryUserProfile.objects.filter(user__is_active=True).select_related("user")
    stats = bulk_compliance_stats(qs)
    return JsonResponse(stats)


@require_http_methods(["GET"])
@_require_admin
def api_reports_compliance_by_region(request):
    """GET /military/api/v1/reports/compliance/by-region/"""
    from .compliance import bulk_compliance_stats
    from .models import MilitaryUserProfile, ARMY_REGION_CHOICES
    results = []
    region_map = {v: label for v, label in ARMY_REGION_CHOICES if v}
    regions = (MilitaryUserProfile.objects
               .filter(user__is_active=True)
               .values_list("army_region", flat=True)
               .distinct())
    for region in regions:
        qs = MilitaryUserProfile.objects.filter(user__is_active=True, army_region=region).select_related("user")
        stats = bulk_compliance_stats(qs)
        results.append({
            "label": region_map.get(region, region or "ไม่ระบุ"),
            "key": region,
            **stats,
        })
    results.sort(key=lambda x: x["total"], reverse=True)
    return JsonResponse(results, safe=False)


@require_http_methods(["GET"])
@_require_admin
def api_reports_compliance_by_rank_class(request):
    """GET /military/api/v1/reports/compliance/by-rank-class/"""
    from .compliance import bulk_compliance_stats
    from .models import MilitaryUserProfile, RANK_CLASS_CHOICES
    rank_class_map = dict(RANK_CLASS_CHOICES)
    results = []
    # Iterate over known rank classes
    for rc_code, rc_label in RANK_CLASS_CHOICES:
        if rc_code == "all":
            continue
        # Filter by computed rank_class property — need to do per-profile check
        all_profiles = MilitaryUserProfile.objects.filter(user__is_active=True).select_related("user")
        matching = [p for p in all_profiles if p.rank_class == rc_code]
        if not matching:
            continue
        # Build stats manually since bulk_compliance_stats needs a queryset
        from .compliance import get_compliance_status
        total = len(matching)
        passed = 0
        not_passed = 0
        for p in matching:
            result = get_compliance_status(p.user)
            if result["status"] in ("passed", "no_requirements"):
                passed += 1
            else:
                not_passed += 1
        results.append({
            "label": rc_label,
            "key": rc_code,
            "total": total,
            "passed": passed,
            "not_passed": not_passed,
            "percent_passed": round(passed / total * 100, 1) if total > 0 else 0.0,
            "percent_not_passed": round(not_passed / total * 100, 1) if total > 0 else 0.0,
        })
    results.sort(key=lambda x: x["total"], reverse=True)
    return JsonResponse(results, safe=False)


@require_http_methods(["GET"])
@_require_admin
def api_reports_compliance_by_rank(request):
    """GET /military/api/v1/reports/compliance/by-rank/"""
    from .compliance import get_compliance_status
    from .models import MilitaryUserProfile, RANK_CHOICES, CIVILIAN_PREFIX_CHOICES
    # Group by display rank/prefix
    groups = {}
    for profile in MilitaryUserProfile.objects.filter(user__is_active=True).select_related("user"):
        if profile.personnel_type == "military":
            key = profile.rank or "ไม่ระบุ"
            label = dict(RANK_CHOICES).get(key, key)
        else:
            key = profile.civilian_prefix or "ไม่ระบุ"
            label = key
        if key not in groups:
            groups[key] = {"label": label, "key": key, "total": 0, "passed": 0, "not_passed": 0}
        groups[key]["total"] += 1
        result = get_compliance_status(profile.user)
        if result["status"] in ("passed", "no_requirements"):
            groups[key]["passed"] += 1
        else:
            groups[key]["not_passed"] += 1
    results = list(groups.values())
    for r in results:
        t = r["total"]
        r["percent_passed"] = round(r["passed"] / t * 100, 1) if t > 0 else 0.0
        r["percent_not_passed"] = round(r["not_passed"] / t * 100, 1) if t > 0 else 0.0
    results.sort(key=lambda x: x["total"], reverse=True)
    return JsonResponse(results, safe=False)


@require_http_methods(["GET"])
@_require_admin
def api_reports_compliance_by_unit(request):
    """GET /military/api/v1/reports/compliance/by-unit/?unit=xxx"""
    from .compliance import get_compliance_status
    from .models import MilitaryUserProfile
    filter_unit = request.GET.get("unit", "")
    qs = MilitaryUserProfile.objects.filter(user__is_active=True)
    if filter_unit:
        qs = qs.filter(unit__icontains=filter_unit)
    groups = {}
    for profile in qs.select_related("user"):
        key = profile.unit or "ไม่ระบุ"
        if key not in groups:
            groups[key] = {"label": key, "key": key, "total": 0, "passed": 0, "not_passed": 0}
        groups[key]["total"] += 1
        result = get_compliance_status(profile.user)
        if result["status"] in ("passed", "no_requirements"):
            groups[key]["passed"] += 1
        else:
            groups[key]["not_passed"] += 1
    results = list(groups.values())
    for r in results:
        t = r["total"]
        r["percent_passed"] = round(r["passed"] / t * 100, 1) if t > 0 else 0.0
        r["percent_not_passed"] = round(r["not_passed"] / t * 100, 1) if t > 0 else 0.0
    results.sort(key=lambda x: x["total"], reverse=True)
    return JsonResponse(results, safe=False)


@require_http_methods(["GET"])
@_require_admin
def api_reports_compliance_not_passed(request):
    """GET /military/api/v1/reports/compliance/not-passed/
    Params: passed=true|false, rank_class, rank, army_region, unit, search, page, per_page
    """
    from .compliance import get_compliance_status
    from .models import MilitaryUserProfile, RANK_CHOICES, ARMY_REGION_CHOICES
    from django.db.models import Q

    want_passed = request.GET.get("passed", "false").lower() == "true"
    filter_rank_class = request.GET.get("rank_class", "")
    filter_rank = request.GET.get("rank", "")
    filter_unit = request.GET.get("unit", "")
    filter_region = request.GET.get("army_region", "")
    search_text = request.GET.get("search", "").strip()
    page = max(1, int(request.GET.get("page", 1)))
    per_page = min(100, max(1, int(request.GET.get("per_page", 20))))

    rank_display_map = dict(RANK_CHOICES)
    region_display_map = dict(ARMY_REGION_CHOICES)

    qs = MilitaryUserProfile.objects.filter(user__is_active=True).select_related("user")
    if filter_unit:
        qs = qs.filter(unit__icontains=filter_unit)
    if filter_region:
        qs = qs.filter(army_region=filter_region)
    if filter_rank:
        qs = qs.filter(rank=filter_rank)
    if search_text:
        qs = qs.filter(
            Q(user__first_name__icontains=search_text) |
            Q(user__last_name__icontains=search_text) |
            Q(user__username__icontains=search_text)
        )

    result_list = []
    for profile in qs:
        if filter_rank_class and profile.rank_class != filter_rank_class:
            continue
        comp = get_compliance_status(profile.user)
        is_passed = comp["status"] in ("passed", "no_requirements")
        if want_passed != is_passed:
            continue

        rank_code = profile.rank or profile.civilian_prefix or ""
        rank_display = rank_display_map.get(rank_code, rank_code)
        region_display = region_display_map.get(profile.army_region or "", profile.army_region or "ไม่ระบุ")

        entry = {
            "user_id": profile.user_id,
            "username": profile.user.username,
            "full_name": profile.display_name,
            "rank": rank_code,
            "rank_display": rank_display,
            "rank_class": profile.rank_class,
            "rank_class_display": profile.rank_class_display,
            "unit": profile.unit or "",
            "sub_unit": profile.sub_unit or "",
            "army_region": profile.army_region or "",
            "army_region_display": region_display,
            "contact_email": profile.contact_email or "",
            "phone_number": profile.phone_number or "",
            "missing_courses": [m["course_name"] for m in comp["missing"]],
            "expired_courses": [e["course_name"] for e in comp["expired"]],
            "passed_courses": [p["course_name"] for p in comp["passed"]],
        }
        result_list.append(entry)

    total_count = len(result_list)
    total_pages = max(1, (total_count + per_page - 1) // per_page)
    start = (page - 1) * per_page
    return JsonResponse({
        "total_count": total_count,
        "total_pages": total_pages,
        "count": total_count,
        "results": result_list[start:start + per_page],
    })
@require_http_methods(["GET"])
@_require_admin
def api_reports_certificates_expiring(request):
    """GET /military/api/v1/reports/certificates/expiring/?days=30"""
    from certificate_expiry.models import UserCertificateExpiry
    from .models import MilitaryUserProfile
    days = int(request.GET.get("days", 30))
    from django.utils import timezone
    import datetime
    cutoff = timezone.now().date() + datetime.timedelta(days=days)
    certs = (UserCertificateExpiry.objects
             .filter(status__in=("active", "renewed"), expiry_date__lte=cutoff)
             .select_related("user")
             .order_by("expiry_date"))
    results = []
    for cert in certs:
        profile = getattr(cert.user, "military_profile", None)
        results.append({
            "user_id": cert.user_id,
            "full_name": profile.display_name if profile else cert.user.get_full_name(),
            "rank": (profile.rank or profile.civilian_prefix) if profile else "",
            "unit": profile.unit if profile else "",
            "course_id": cert.course_id,
            "course_name": cert.course_name,
            "expiry_date": cert.expiry_date.isoformat(),
            "days_left": cert.days_until_expiry,
        })
    return JsonResponse({"count": len(results), "results": results})


@require_http_methods(["GET"])
@_require_admin
def api_reports_certificates_expired(request):
    """GET /military/api/v1/reports/certificates/expired/"""
    from certificate_expiry.models import UserCertificateExpiry
    from .models import MilitaryUserProfile
    certs = (UserCertificateExpiry.objects
             .filter(status="expired")
             .select_related("user")
             .order_by("-expiry_date"))
    results = []
    for cert in certs:
        profile = getattr(cert.user, "military_profile", None)
        results.append({
            "user_id": cert.user_id,
            "full_name": profile.display_name if profile else cert.user.get_full_name(),
            "rank": (profile.rank or profile.civilian_prefix) if profile else "",
            "unit": profile.unit if profile else "",
            "course_id": cert.course_id,
            "course_name": cert.course_name,
            "expiry_date": cert.expiry_date.isoformat(),
        })
    return JsonResponse({"count": len(results), "results": results})

