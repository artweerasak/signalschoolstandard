"""
military_profile/api_views.py

JSON API endpoints สำหรับ student portal (กำลังพลทั่วไป)
+ Admin user management
+ Instructor course/student/grade views
"""
import json
from datetime import date, datetime

from django.contrib.auth import get_user_model
from django.db import connection, IntegrityError
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import MilitaryUserProfile, Organization, RANK_CHOICES, ARMY_REGION_CHOICES, encrypt_field, decrypt_field, hmac_field
from certificate_expiry.models import UserCertificateExpiry, CourseCertificateConfig
from military_auth.models import PendingRegistration

try:
    from common.djangoapps.student.models import UserProfile as EdxUserProfile
except ImportError:
    EdxUserProfile = None

User = get_user_model()

# บทบาทที่ถือว่าเป็น "กำลังพล" — admin/org_admin เป็น system accounts ไม่นับ
_SYSTEM_ROLES = ("admin", "org_admin")  # system accounts ไม่ใช่กำลังพล
_PERSONNEL_ROLES = ("instructor", "student")  # บทบาทกำลังพลจริง

def _parse_date(value) -> date:
    """Parse a date string ('YYYY-MM-DD') or date object to datetime.date."""
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    return date.fromisoformat(str(value).strip())


def _grant_course_creator(user) -> None:
    """Grant CourseCreator status:
    1. course_creators_coursecreator  (Studio homepage badge / status display)
    2. student_courseaccessrole role='course_creator_group'  (actual gate checked by CourseCreatorRole)
    """
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with connection.cursor() as cur:
            # ---- 1. Studio badge table ----
            cur.execute(
                "INSERT INTO course_creators_coursecreator "
                "(user_id, state, note, state_changed, all_organizations) "
                "VALUES (%s, 'granted', '', %s, 1) "
                "ON DUPLICATE KEY UPDATE state='granted', state_changed=%s, all_organizations=1",
                [user.id, now_str, now_str],
            )
            # ---- 2. CourseCreatorRole (global) in student_courseaccessrole ----
            cur.execute(
                "INSERT IGNORE INTO student_courseaccessrole (user_id, org, course_id, role) "
                "VALUES (%s, '', '', 'course_creator_group')",
                [user.id],
            )
    except Exception:
        pass  # non-fatal in dev


def _revoke_course_creator(user) -> None:
    """Revoke CourseCreator: update badge table + remove from role"""
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with connection.cursor() as cur:
            cur.execute(
                "UPDATE course_creators_coursecreator SET state='denied', state_changed=%s WHERE user_id=%s",
                [now_str, user.id],
            )
            cur.execute(
                "DELETE FROM student_courseaccessrole "
                "WHERE user_id=%s AND role='course_creator_group' AND org='' AND course_id=''",
                [user.id],
            )
    except Exception:
        pass


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


def _require_org_admin(view_func):
    """ต้องเป็น admin หรือ org_admin เท่านั้น"""
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        profile = getattr(request.user, "military_profile", None)
        if not (request.user.is_staff or (profile and profile.role in ("admin", "org_admin"))):
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


def _derive_gender_from_prefix(prefix: str) -> str:
    """นาย→M, นาง/นางสาว→F (สำหรับพลเรือน/พนักงานราชการ)"""
    return "M" if prefix == "นาย" else "F"


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
        "organization_id": profile.organization_id if profile else None,
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
    # ค่าเริ่มต้น: ยกเว้น org_admin system accounts — แสดงได้ด้วย ?role=org_admin
    if not request.GET.get("role"):
        qs = qs.exclude(role__in=("admin", "org_admin"))

    search = request.GET.get("search", "").strip()
    if search:
        qs = qs.filter(Q(full_name_th__icontains=search) | Q(unit__icontains=search))

    unit = request.GET.get("unit", "").strip()
    if unit:
        qs = qs.filter(unit__icontains=unit)

    role = request.GET.get("role", "").strip()
    if role:
        qs = qs.filter(role=role)

    try:
        page = max(1, int(request.GET.get("page", 1)))
        page_size = min(100, int(request.GET.get("page_size", 20)))
    except (ValueError, TypeError):
        page, page_size = 1, 20
    total = qs.count()
    start = (page - 1) * page_size
    profiles = qs[start:start + page_size]

    return JsonResponse({
        "count": total,
        "page": page,
        "page_size": page_size,
        "results": [_profile_to_dict(p) for p in profiles],
    })


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

    _valid_roles = {r[0] for r in MilitaryUserProfile.ROLE_CHOICES}
    _req_role = body.get("role", "student")
    if _req_role not in _valid_roles:
        return JsonResponse({"error": f"role ไม่ถูกต้อง ต้องเป็นหนึ่งใน: {', '.join(sorted(_valid_roles))}"}, status=400)
    if _req_role == "admin" and not request.user.is_superuser:
        return JsonResponse({"error": "ต้องการสิทธิ์ superuser ในการสร้าง admin"}, status=403)

    try:
        user = User.objects.create_user(
            username=body["username"],
            email=national_id,
            password=body.get("password") or body.get("military_id") or body.get("national_id"),
            first_name=body["full_name_th"],
        )
        # Force active — Open edX post-save signals may set is_active=False
        # for users created programmatically (email verification flow).
        user.is_active = True
        user.is_staff = _req_role == "admin"
        user.save()

        profile = MilitaryUserProfile.objects.create(
            user=user,
            national_id_encrypted=encrypt_field(body["national_id"]),
            military_id_encrypted=encrypt_field(body.get("military_id", "")),
            full_name_th=body["full_name_th"],
            rank=body.get("rank", ""),
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
        _valid_roles = {r[0] for r in MilitaryUserProfile.ROLE_CHOICES}
        if new_role not in _valid_roles:
            return JsonResponse({"error": f"role ไม่ถูกต้อง"}, status=400)
        if new_role == "admin" and not request.user.is_superuser:
            return JsonResponse({"error": "ต้องการสิทธิ์ superuser ในการเลื่อนเป็น admin"}, status=403)
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


@require_http_methods(["DELETE"])
@_require_admin
def api_admin_hard_delete_user(request, user_id: int):
    """
    DELETE /military/api/v1/admin/users/<user_id>/hard-delete/
    ลบ user ออกจากระบบถาวร (hard delete) — ต้องส่ง ?force=1
    """
    if request.GET.get("force") != "1":
        return JsonResponse({"error": "ต้องระบุ ?force=1 เพื่อยืนยันการลบถาวร"}, status=400)
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

    # ป้องกัน duplicate — ใช้ HMAC (deterministic) ไม่ใช่ AES-GCM (random nonce)
    enc_national_id = encrypt_field(national_id)
    national_id_hmac = hmac_field(national_id)
    dup = PendingRegistration.objects.filter(
        national_id_hmac=national_id_hmac,
        status__in=("pending", "approved"),
    ).first()
    if dup:
        return JsonResponse(
            {"error": "มีคำขอสมัครสมาชิกที่ใช้เลขบัตรประชาชนนี้อยู่แล้ว"},
            status=409,
        )

    # ถ้าผู้สมัครเลือกจาก dropdown ให้ผูก organization FK ทันที
    _org_id = body.get("organization_id")
    _org_obj = None
    if _org_id:
        try:
            _org_obj = Organization.objects.get(pk=_org_id, is_active=True)
        except Organization.DoesNotExist:
            _org_obj = None

    pending = PendingRegistration.objects.create(
        full_name_th=body["full_name_th"],
        rank=body["rank"],
        unit=body["unit"],
        birth_date=body["birth_date"],
        email=body.get("email", ""),
        phone_number=body.get("phone_number", ""),
        national_id_encrypted=enc_national_id,
        national_id_hmac=national_id_hmac,
        military_id_encrypted=encrypt_field(military_id),
        organization=_org_obj,
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
            national_id_hmac=reg.national_id_hmac,
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
            organization=reg.organization,  # สืบทอด FK จากขั้นตอนสมัคร
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
        from django.conf import settings as _dj_settings
        _session_key = _dj_settings.SESSION_COOKIE_NAME
        _session_val = request.COOKIES.get(_session_key, "")
        _cookie_str = f"{_session_key}={_session_val}" if _session_val else ""
        headers = {"Cookie": _cookie_str}
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
        from django.conf import settings as _dj_settings
        _session_key = _dj_settings.SESSION_COOKIE_NAME
        _session_val = request.COOKIES.get(_session_key, "")
        _cookie_str = f"{_session_key}={_session_val}" if _session_val else ""
        headers = {"Cookie": _cookie_str}
        req = urlreq.Request(api_url, headers=headers)
        with urlreq.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        return JsonResponse(data)
    except Exception as exc:
        return JsonResponse({"error": str(exc), "results": [], "count": 0}, status=200)



# ── Password Management ────────────────────────────────────────────────────

@require_POST
@_require_login
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


@csrf_exempt
@require_POST
def api_reset_password_request(request):
    """
    POST /military/api/v1/reset-password/request/
    สาธารณะ — รับ national_id แล้วสร้าง pending reset request แจ้ง HR/Admin
    ไม่รีเซ็ตทันที เพื่อความปลอดภัย — admin ต้องยืนยันก่อน
    """
    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    national_id = data.get("national_id", "").strip()
    if not national_id or not national_id.isdigit() or len(national_id) != 13:
        return JsonResponse({"error": "กรุณากรอกเลขบัตรประชาชน 13 หลัก"}, status=400)

    try:
        from .models import MilitaryUserProfile
        from django.contrib.auth import get_user_model
        _User = get_user_model()

        # ค้นหา user จาก national_id ผ่าน HMAC (deterministic lookup)
        profile = MilitaryUserProfile.objects.filter(national_id_hmac=hmac_field(national_id)).first()
        if not profile:
            # ไม่แสดงว่าไม่พบ เพื่อป้องกัน user enumeration
            pass
        else:
            from django.conf import settings as _s
            hr_emails = getattr(_s, 'MILITARY_HR_EMAILS', [])
            if hr_emails:
                from django.core.mail import send_mail
                send_mail(
                    subject="[ระบบ eLearning] คำขอรีเซ็ตรหัสผ่าน",
                    message=(
                        f"มีคำขอรีเซ็ตรหัสผ่านจาก:\n"
                        f"ชื่อ: {profile.full_name_th}\n"
                        f"ยศ: {profile.get_rank_display()}\n"
                        f"หน่วย: {profile.unit}\n\n"
                        f"กรุณาเข้าระบบ Admin เพื่อรีเซ็ตรหัสผ่านให้กับบุคลากรท่านนี้"
                    ),
                    from_email="noreply@signalstandard.rta.mi.th",
                    recipient_list=hr_emails,
                    fail_silently=True,
                )
    except Exception:
        pass

    # คืน success เสมอ ไม่ว่าจะพบ user หรือไม่ (ป้องกัน user enumeration)
    return JsonResponse({"success": True, "message": "ส่งคำขอเรียบร้อยแล้ว"})


def _user_rank_class(user):
    """คืน rank_class ของผู้ใช้ ('' ถ้าไม่มี profile)"""
    try:
        return user.military_profile.rank_class
    except Exception:
        return ''


def _passed_course_ids(user, course_ids):
    """คืน set ของ course_id ที่ user สอบผ่านแล้ว (จาก CourseGradeFactory)"""
    if not course_ids:
        return set()
    from lms.djangoapps.grades.api import CourseGradeFactory
    from opaque_keys.edx.keys import CourseKey
    passed = set()
    for cid in course_ids:
        try:
            grade = CourseGradeFactory().read(user, course_key=CourseKey.from_string(cid))
            if grade.passed:
                passed.add(cid)
        except Exception:
            pass
    return passed


def _evaluate_policy(policy, rank_class, passed_ids):
    """คืน (visible, locked, lock_reason) ตามนโยบายหลักสูตร"""
    if policy is None or policy.course_type == 'general':
        return True, False, ''
    # conditional — ตรวจระดับที่มองเห็นได้
    allowed = policy.allowed_list
    if allowed and 'all' not in allowed and rank_class not in allowed:
        return False, False, ''
    # ตรวจวิชาบังคับก่อน
    unmet = [p for p in policy.prereq_list if p not in passed_ids]
    if unmet:
        return True, True, f'ต้องผ่านหลักสูตรบังคับก่อน {len(unmet)} วิชาจึงจะปลดล็อก'
    return True, False, ''


@require_GET
@_require_login
def api_courses_catalog(request):
    """
    GET /military/api/v1/courses/
    Return course catalog using Django ORM directly (avoids HTTP self-call deadlock).
    """
    from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
    from common.djangoapps.student.models import CourseEnrollment, CourseAccessRole
    from opaque_keys.edx.keys import CourseKey
    from .models import CourseAccessPolicy

    search = request.GET.get('search_term', '')
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 24))

    is_priv = request.user.is_staff or request.user.is_superuser
    rank_class = _user_rank_class(request.user)
    policies = {p.course_id: p for p in CourseAccessPolicy.objects.all()}

    qs = CourseOverview.objects.filter(
        catalog_visibility__in=['both', 'about'],
    ).order_by('display_name')

    if search:
        qs = qs.filter(display_name__icontains=search)

    # ซ่อนหลักสูตร conditional ที่ระดับบุคลากรของผู้ใช้มองไม่เห็น (admin เห็นทุกหลักสูตร)
    if not is_priv:
        hidden = []
        for cid, p in policies.items():
            if p.course_type == 'conditional':
                allowed = p.allowed_list
                if allowed and 'all' not in allowed and rank_class not in allowed:
                    try:
                        hidden.append(CourseKey.from_string(cid))
                    except Exception:
                        pass
        if hidden:
            qs = qs.exclude(id__in=hidden)

    total = qs.count()
    offset = (page - 1) * page_size
    courses = qs[offset:offset + page_size]

    # คำนวณวิชาบังคับก่อนที่ต้องตรวจสถานะผ่าน (เฉพาะหลักสูตรในหน้านี้)
    prereq_needed = set()
    if not is_priv:
        for c in courses:
            p = policies.get(str(c.id))
            if p and p.course_type == 'conditional':
                prereq_needed.update(p.prereq_list)
    passed_ids = _passed_course_ids(request.user, prereq_needed)

    enrolled_ids = set(
        str(e.course_id)
        for e in CourseEnrollment.objects.filter(user=request.user, is_active=True)
    )

    # หลักสูตรที่ user เป็น staff/instructor (สำหรับเปิดโหมดนักเรียน)
    if is_priv:
        staff_course_ids = {str(c.id) for c in courses}
    else:
        staff_course_ids = set(
            str(r.course_id)
            for r in CourseAccessRole.objects.filter(
                user=request.user,
                role__in=['staff', 'instructor'],
            )
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
        policy = policies.get(str(c.id))
        _visible, locked, lock_reason = _evaluate_policy(policy, rank_class, passed_ids)
        if is_priv:
            locked, lock_reason = False, ''
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
            'is_course_staff': str(c.id) in staff_course_ids,
            'category': '',
            'enrollment_count': _enroll_counts.get(c.id, 0),
            'course_type': policy.course_type if policy else 'general',
            'locked': locked,
            'lock_reason': lock_reason,
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

        # บังคับนโยบายหลักสูตรตามเงื่อนไข (admin ข้ามได้)
        if not (request.user.is_staff or request.user.is_superuser):
            from .models import CourseAccessPolicy
            try:
                policy = CourseAccessPolicy.objects.get(course_id=course_id)
            except CourseAccessPolicy.DoesNotExist:
                policy = None
            if policy and policy.course_type == 'conditional':
                rank_class = _user_rank_class(request.user)
                allowed = policy.allowed_list
                if allowed and 'all' not in allowed and rank_class not in allowed:
                    return JsonResponse({"error": "หลักสูตรนี้ไม่เปิดให้ระดับบุคลากรของท่าน"}, status=403)
                passed_ids = _passed_course_ids(request.user, policy.prereq_list)
                unmet = [p for p in policy.prereq_list if p not in passed_ids]
                if unmet:
                    return JsonResponse({"error": "ต้องผ่านหลักสูตรบังคับก่อนจึงจะลงทะเบียนหลักสูตรนี้ได้"}, status=403)

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
def api_goto_course_as_student(request):
    """
    GET /military/api/v1/goto-course/?course_id=course-v1:...

    Sets masquerade='student' directly in the Django session (server-side),
    then redirects to the courseware URL. Django's SessionMiddleware saves
    the modified session and refreshes the cookie before the browser follows
    the redirect, so the Learning MFE sees role='student' immediately.

    Non-staff users are redirected directly without masquerade.
    """
    import urllib.parse as _up
    from django.http import HttpResponseRedirect, HttpResponseBadRequest
    from opaque_keys.edx.keys import CourseKey
    from common.djangoapps.student.models import CourseEnrollment
    from common.djangoapps.student.role_helpers import has_staff_roles
    from lms.djangoapps.courseware.masquerade import MASQUERADE_SETTINGS_KEY, CourseMasquerade

    course_id = request.GET.get('course_id', '').strip()
    if not course_id:
        return HttpResponseBadRequest('course_id required')

    try:
        course_key = CourseKey.from_string(course_id)
    except Exception:
        return HttpResponseBadRequest('Invalid course_id')

    is_course_staff = (
        request.user.is_staff
        or request.user.is_superuser
        or has_staff_roles(request.user, course_key)
    )

    safe_id = _up.quote(str(course_key), safe=':+')
    courseware_url = f'/courses/{safe_id}/courseware'

    if not is_course_staff:
        return HttpResponseRedirect(courseware_url)

    # Auto-enroll if needed so grades are recorded
    if not CourseEnrollment.is_enrolled(request.user, course_key):
        from common.djangoapps.course_modes.models import CourseMode
        if not CourseMode.objects.filter(course_id=course_key).exists():
            CourseMode.objects.create(
                course_id=course_key, mode_slug='audit',
                mode_display_name='Audit', min_price=0,
            )
        CourseEnrollment.enroll(request.user, course_key, check_access=False)

    import logging as _log
    from django.conf import settings as _djsettings
    from importlib import import_module as _impmod

    _logger = _log.getLogger(__name__)

    _masq_obj = CourseMasquerade(
        course_key, role='student',
        user_partition_id=None, group_id=None, user_name=None,
    )

    # Store in the current (possibly cycled) session
    masquerade_settings = request.session.get(MASQUERADE_SETTINGS_KEY, {})
    masquerade_settings[course_key] = _masq_obj
    request.session[MASQUERADE_SETTINGS_KEY] = masquerade_settings

    # The session may have been cycled by JWT middleware — also write to the session
    # that is stored in the browser cookie, which is what all MFE API calls use.
    _cookie_key = request.COOKIES.get(_djsettings.SESSION_COOKIE_NAME)
    _logger.warning(
        'GOTO-COURSE-DEBUG cookie_session=%s view_session=%s same=%s',
        _cookie_key, request.session.session_key,
        _cookie_key == request.session.session_key,
    )
    if _cookie_key and _cookie_key != request.session.session_key:
        _SessionStore = _impmod(_djsettings.SESSION_ENGINE).SessionStore
        _orig = _SessionStore(_cookie_key)
        _orig_masq = _orig.get(MASQUERADE_SETTINGS_KEY, {})
        _orig_masq[course_key] = _masq_obj
        _orig[MASQUERADE_SETTINGS_KEY] = _orig_masq
        _orig.save()
        _logger.warning('GOTO-COURSE-DEBUG also wrote masquerade to cookie session %s', _cookie_key)

    resp = HttpResponseRedirect(courseware_url)
    resp['Cache-Control'] = 'no-store'
    return resp


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


@require_GET
@_require_login
def api_my_notifications(request):
    """
    GET /military/api/v1/my/notifications/
    แจ้งเตือน in-app สำหรับผู้ใช้: ใบประกาศใกล้หมดอายุ, หมดอายุแล้ว
    """
    from datetime import date, timedelta
    today = date.today()
    soon = today + timedelta(days=30)
    notifications = []

    # ใบประกาศใกล้หมดอายุ (30 วัน)
    near = UserCertificateExpiry.objects.filter(
        user=request.user, status="active",
        expiry_date__lte=soon, expiry_date__gte=today
    ).select_related()
    for cert in near:
        days = (cert.expiry_date - today).days
        try:
            config = CourseCertificateConfig.objects.get(course_id=cert.course_id)
            name = config.course_name
        except CourseCertificateConfig.DoesNotExist:
            name = str(cert.course_id)
        notifications.append({
            "id": f"cert-near-{cert.id}",
            "type": "warning",
            "title": "ใบประกาศใกล้หมดอายุ",
            "message": f"{name} จะหมดอายุในอีก {days} วัน",
            "link": "/my/certificates",
            "created_at": cert.expiry_date.isoformat(),
        })

    # ใบประกาศที่หมดอายุแล้ว
    expired = UserCertificateExpiry.objects.filter(
        user=request.user, status="expired"
    ).select_related()[:5]
    for cert in expired:
        try:
            config = CourseCertificateConfig.objects.get(course_id=cert.course_id)
            name = config.course_name
        except CourseCertificateConfig.DoesNotExist:
            name = str(cert.course_id)
        notifications.append({
            "id": f"cert-exp-{cert.id}",
            "type": "error",
            "title": "ใบประกาศหมดอายุแล้ว",
            "message": f"{name} หมดอายุแล้ว กรุณาต่ออายุ",
            "link": "/my/certificates",
            "created_at": cert.expiry_date.isoformat() if cert.expiry_date else None,
        })

    return JsonResponse({"notifications": notifications, "unread": len(notifications)})


@require_GET
@_require_login
def api_my_certificate_download(request, cert_id):
    """
    GET /military/api/v1/my/certificates/<cert_id>/download/
    สร้าง PDF ใบประกาศแล้วส่งกลับ (ใช้ WeasyPrint)
    """
    from django.http import HttpResponse
    try:
        cert = UserCertificateExpiry.objects.get(id=cert_id, user=request.user)
    except UserCertificateExpiry.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    try:
        config = CourseCertificateConfig.objects.get(course_id=cert.course_id)
        course_name = config.course_name
    except CourseCertificateConfig.DoesNotExist:
        course_name = str(cert.course_id)

    import html as _html
    try:
        from military_profile.models import MilitaryUserProfile
        profile = MilitaryUserProfile.objects.get(user=request.user)
        rank = _html.escape(profile.get_rank_display())
        full_name = _html.escape(profile.full_name_th)
        unit = _html.escape(profile.unit)
    except Exception:
        rank = full_name = unit = ''

    issued_str = cert.issued_date.strftime('%d/%m/%Y') if cert.issued_date else '-'
    expiry_str = cert.expiry_date.strftime('%d/%m/%Y') if cert.expiry_date else 'ไม่มีวันหมดอายุ'
    _cert_year = cert.issued_date.year + 543 if cert.issued_date and 1900 < cert.issued_date.year < 2100 else 'xxxx'
    cert_no = f"สส.{_cert_year}-{cert.id:04d}"
    course_name = _html.escape(course_name)

    html_content = f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
  body {{ font-family: 'Sarabun', sans-serif; margin: 0; padding: 40px; background: #fff; }}
  .cert {{ border: 8px double #4A1A6B; padding: 40px; max-width: 700px; margin: auto; text-align: center; }}
  .logo {{ font-size: 48px; margin-bottom: 8px; }}
  .org {{ color: #4A1A6B; font-size: 22px; font-weight: 700; }}
  .title {{ font-size: 28px; font-weight: 700; color: #2D0F42; margin: 24px 0 8px; }}
  .subtitle {{ color: #666; margin-bottom: 32px; }}
  .recipient {{ font-size: 20px; font-weight: 600; color: #1a1a1a; margin: 8px 0; }}
  .course {{ font-size: 18px; color: #4A1A6B; font-weight: 600; margin: 16px 0; }}
  .detail {{ color: #555; font-size: 14px; margin: 4px 0; }}
  .cert-no {{ color: #888; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px; }}
  .gold {{ color: #C9A84C; }}
</style>
</head>
<body>
<div class="cert">
  <div class="logo">🏆</div>
  <div class="org">กรมการทหารสื่อสาร</div>
  <div class="title">ใบประกาศนียบัตร</div>
  <div class="subtitle">CERTIFICATE OF COMPLETION</div>
  <p class="detail">ขอมอบให้แก่</p>
  <p class="recipient">{rank} {full_name}</p>
  <p class="detail">สังกัด {unit}</p>
  <p class="detail" style="margin-top:16px">ได้ผ่านการศึกษาหลักสูตร</p>
  <p class="course">"{course_name}"</p>
  <p class="detail">วันที่ออกใบประกาศ: {issued_str}</p>
  <p class="detail">วันที่หมดอายุ: {expiry_str}</p>
  <div class="cert-no">เลขที่ใบประกาศ: {cert_no}</div>
</div>
</body>
</html>"""

    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content, base_url=None).write_pdf()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="certificate_{cert_no}.pdf"'
        return response
    except ImportError:
        # Fallback: ส่ง HTML ถ้าไม่มี WeasyPrint
        response = HttpResponse(html_content, content_type='text/html; charset=utf-8')
        response['Content-Disposition'] = f'inline; filename="certificate_{cert_no}.html"'
        return response


@require_GET
@_require_admin
def api_audit_log(request):
    """
    GET /military/api/v1/admin/audit-log/?page=1&per_page=50&search=&action=
    แสดง audit log การกระทำที่สำคัญในระบบ
    """
    try:
        from military_auth.models import AuditLog
    except ImportError:
        return JsonResponse({"results": [], "count": 0, "error": "AuditLog model not available"})

    import math
    qs = AuditLog.objects.select_related("user").order_by("-created_at")

    search = request.GET.get("search", "").strip()
    action = request.GET.get("action", "").strip()
    if search:
        from django.db.models import Q
        qs = qs.filter(Q(user__username__icontains=search) | Q(path__icontains=search))
    if action:
        qs = qs.filter(method=action.upper())

    page = max(1, int(request.GET.get("page", 1)))
    per_page = min(100, max(10, int(request.GET.get("per_page", 50))))
    total = qs.count()
    start = (page - 1) * per_page
    records = qs[start:start + per_page]

    results = []
    for log in records:
        results.append({
            "id": log.id,
            "username": log.user.username if log.user else "—",
            "full_name": getattr(getattr(log.user, "military_profile", None), "full_name_th", ""),
            "method": log.method,
            "path": log.path,
            "status_code": getattr(log, "status_code", None),
            "ip_address": getattr(log, "ip_address", ""),
            "created_at": log.created_at.isoformat(),
        })

    return JsonResponse({
        "results": results,
        "count": len(results),
        "total": total,
        "page": page,
        "total_pages": math.ceil(total / per_page),
    })


@require_GET
@_require_admin
def api_system_health(request):
    """
    GET /military/api/v1/admin/system-health/
    ข้อมูล server resources สำหรับ Admin dashboard
    """
    import shutil, time
    import os as _os2

    # Disk usage
    disk = shutil.disk_usage("/")
    disk_total_gb = round(disk.total / (1024**3), 1)
    disk_used_gb  = round(disk.used  / (1024**3), 1)
    disk_pct      = round(disk.used / disk.total * 100, 1)

    # Memory
    try:
        import resource
        with open("/proc/meminfo") as f:
            mem_info = {}
            for line in f:
                k, v = line.split(":")
                mem_info[k.strip()] = int(v.strip().split()[0])
        mem_total_gb = round(mem_info.get("MemTotal", 0) / (1024**2), 1)
        mem_avail_gb = round(mem_info.get("MemAvailable", 0) / (1024**2), 1)
        mem_used_gb  = round(mem_total_gb - mem_avail_gb, 1)
        mem_pct      = round(mem_used_gb / mem_total_gb * 100, 1) if mem_total_gb else 0
    except Exception:
        mem_total_gb = mem_used_gb = mem_avail_gb = mem_pct = 0

    # Video storage
    from .api_views_helpers import _get_video_dir_safe
    video_dir = getattr(__import__("django.conf", fromlist=["settings"]).settings,
                        "MILITARY_VIDEO_DIR", "/openedx/media/videos")
    try:
        video_size = sum(
            _os2.path.getsize(_os2.path.join(root, f))
            for root, _, files in _os2.walk(video_dir)
            for f in files
        )
        video_size_gb = round(video_size / (1024**3), 2)
    except Exception:
        video_size_gb = 0

    # Active users (sessions in last 30 min)
    try:
        from django.contrib.sessions.models import Session
        from datetime import datetime, timedelta, timezone as tz
        cutoff = datetime.now(tz.utc) - timedelta(minutes=30)
        active_sessions = Session.objects.filter(expire_date__gte=cutoff).count()
    except Exception:
        active_sessions = 0

    # DB counts
    from .models import MilitaryUserProfile
    from certificate_expiry.models import UserCertificateExpiry

    return JsonResponse({
        "disk": {"total_gb": disk_total_gb, "used_gb": disk_used_gb, "pct": disk_pct},
        "memory": {"total_gb": mem_total_gb, "used_gb": mem_used_gb, "pct": mem_pct},
        "video_storage_gb": video_size_gb,
        "active_sessions": active_sessions,
        "total_personnel": MilitaryUserProfile.objects.exclude(role__in=("admin", "org_admin")).count(),
        "total_certificates": UserCertificateExpiry.objects.count(),
        "expired_certificates": UserCertificateExpiry.objects.filter(status="expired").count(),
    })


@require_GET
@_require_admin
def api_concurrent_status(request):
    """
    GET /military/api/v1/admin/concurrent-users/
    ส่งกลับจำนวน active users ปัจจุบันจาก Redis sorted set
    """
    import time as _time
    from django.conf import settings as _djsettings
    limit = getattr(_djsettings, "CONCURRENT_USER_LIMIT", 300)
    try:
        from django_redis import get_redis_connection
        r = get_redis_connection("default")
        cutoff = _time.time() - 300   # 5 นาที inactivity = ออกจากระบบ
        r.zremrangebyscore("mil:active_users", 0, cutoff)
        active = int(r.zcard("mil:active_users"))
    except Exception:
        active = None

    pct = round(active / limit * 100, 1) if active is not None else None
    return JsonResponse({"active": active, "limit": limit, "pct": pct})


# --- Admin Course Management ---

@require_GET
@_require_admin
def api_admin_courses(request):
    try:
        from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
        from common.djangoapps.student.models import CourseAccessRole, CourseEnrollment
        from django.contrib.auth import get_user_model
        from military_profile.models import MilitaryUserProfile, CourseAccessPolicy
        from certificate_expiry.models import CourseCertificateConfig
        User = get_user_model()
        policies = {p.course_id: p for p in CourseAccessPolicy.objects.all()}
        cert_configs = {c.course_id: c for c in CourseCertificateConfig.objects.all()}
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
            pol = policies.get(str(course.id))
            cfg = cert_configs.get(str(course.id))
            display_name = (cfg.course_name if cfg and cfg.course_name else None) or course.display_name or str(course.id)
            result.append({
                "id": str(course.id),
                "name": display_name,
                "start": course.start.isoformat() if course.start else None,
                "end": course.end.isoformat() if course.end else None,
                "enrollment_count": enrollment_count,
                "instructors": instructor_list,
                "course_type": pol.course_type if pol else "general",
                "allowed_rank_classes": pol.allowed_list if pol else [],
                "prerequisite_course_ids": pol.prereq_list if pol else [],
            })
        return JsonResponse({"results": result, "count": len(result)})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@_require_admin
def api_admin_course_assign_instructor(request, course_id: str):
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
            _grant_course_creator(user)
            msg = "Assigned " + user.username + " as instructor"
        else:
            CourseAccessRole.objects.filter(
                user=user, course_id=course_key, role__in=["instructor", "staff"]
            ).delete()
            msg = "Removed " + user.username + " from course"
        return JsonResponse({"success": True, "message": msg})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


def _is_course_instructor(user, course_id: str) -> bool:
    """True ถ้า user เป็นครูเจ้าของวิชา (instructor/staff role ในวิชานั้น)"""
    try:
        from opaque_keys.edx.keys import CourseKey
        from common.djangoapps.student.models import CourseAccessRole
        ck = CourseKey.from_string(course_id)
        return CourseAccessRole.objects.filter(
            user=user, course_id=ck, role__in=["instructor", "staff"]
        ).exists()
    except Exception:
        return False


def api_admin_course_policy(request, course_id: str):
    """
    GET/POST /military/api/v1/(admin|instructor)/courses/<course_id>/policy/
    สิทธิ์: แอดมิน + อาจารย์เจ้าของวิชา กำหนดได้เต็มเหมือนกัน
      - ประเภทหลักสูตร (course_type)
      - ระดับที่มองเห็นได้ (allowed_rank_classes)
      - วิชาบังคับก่อน (prerequisite_course_ids)
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Forbidden"}, status=403)
    is_admin = bool(request.user.is_staff or request.user.is_superuser)
    is_owner = is_admin or _is_course_instructor(request.user, course_id)
    if not is_owner:
        return JsonResponse({"error": "ไม่มีสิทธิ์จัดการเงื่อนไขของหลักสูตรนี้"}, status=403)

    from .models import CourseAccessPolicy

    if request.method == "GET":
        existing = CourseAccessPolicy.objects.filter(course_id=course_id).first()
        from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
        course_options = [
            {"id": str(c.id), "name": c.display_name or str(c.id)}
            for c in CourseOverview.objects.all().order_by("display_name")
            if str(c.id) != course_id
        ]
        return JsonResponse({
            "course_id": course_id,
            "course_type": existing.course_type if existing else "general",
            "allowed_rank_classes": existing.allowed_list if existing else [],
            "prerequisite_course_ids": existing.prereq_list if existing else [],
            "can_edit_visibility": True,   # เจ้าของวิชา + แอดมิน แก้การมองเห็นได้
            "course_options": course_options,
        })

    if request.method == "POST":
        import json
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        # แอดมิน + อาจารย์เจ้าของวิชา — แก้ได้ทุกอย่างเหมือนกัน
        prereqs = data.get("prerequisite_course_ids") or []
        if isinstance(prereqs, list):
            prereqs = ",".join(str(x).strip() for x in prereqs if str(x).strip())
        course_type = data.get("course_type", "general")
        if course_type not in (CourseAccessPolicy.TYPE_GENERAL, CourseAccessPolicy.TYPE_CONDITIONAL):
            return JsonResponse({"error": "course_type ไม่ถูกต้อง"}, status=400)
        allowed = data.get("allowed_rank_classes") or []
        if isinstance(allowed, list):
            allowed = ",".join(str(x).strip() for x in allowed if str(x).strip())
        # หลักสูตรทั่วไป — ล้างเงื่อนไขทิ้งกันสับสน
        if course_type == CourseAccessPolicy.TYPE_GENERAL:
            allowed, prereqs = "", ""

        p, _created = CourseAccessPolicy.objects.update_or_create(
            course_id=course_id,
            defaults={
                "course_type": course_type,
                "allowed_rank_classes": allowed,
                "prerequisite_course_ids": prereqs,
            },
        )
        return JsonResponse({
            "success": True, "course_id": course_id, "course_type": p.course_type,
            "allowed_rank_classes": p.allowed_list, "prerequisite_course_ids": p.prereq_list,
            "can_edit_visibility": True,
        })

    return JsonResponse({"error": "Method not allowed"}, status=405)


@require_http_methods(["PATCH"])
@_require_admin
def api_admin_course_rename(request, course_id: str):
    """
    PATCH /military/api/v1/admin/courses/<course_id>/rename/
    อัปเดตชื่อ course ทุกที่พร้อมกัน:
      1. Modulestore (MongoDB) — ชื่อจริงของ course
      2. CourseOverview (MySQL cache) — ที่นักเรียนเห็น
      3. CourseCertificateConfig — ชื่อบนใบประกาศ
    Body: {"course_name": "ชื่อใหม่"}
    """
    import json as _json
    from certificate_expiry.models import CourseCertificateConfig
    from opaque_keys.edx.keys import CourseKey
    from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
    from xmodule.modulestore.django import modulestore

    try:
        body = _json.loads(request.body)
    except Exception:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (body.get("course_name") or "").strip()
    if not name:
        return JsonResponse({"error": "course_name ห้ามว่าง"}, status=400)

    try:
        course_key = CourseKey.from_string(course_id)
    except Exception:
        return JsonResponse({"error": f"course_id ไม่ถูกต้อง: {course_id}"}, status=400)

    errors = []

    # 1. Modulestore (แหล่งข้อมูลหลัก — MongoDB)
    try:
        store = modulestore()
        course_block = store.get_course(course_key)
        if course_block is None:
            errors.append("ไม่พบ course ใน modulestore")
        else:
            with store.bulk_operations(course_key):
                course_block.display_name = name
                store.update_item(course_block, request.user.id)
    except Exception as e:
        errors.append(f"modulestore: {e}")

    # 2. CourseOverview cache (MySQL) — อัปเดตทันทีโดยไม่ต้องรอ signal
    try:
        CourseOverview.objects.filter(id=course_key).update(display_name=name)
    except Exception as e:
        errors.append(f"CourseOverview: {e}")

    # 3. CourseCertificateConfig (ชื่อบนใบประกาศ)
    try:
        config, _ = CourseCertificateConfig.objects.get_or_create(
            course_id=course_id,
            defaults={"course_name": name, "validity_years": 3},
        )
        if config.course_name != name:
            config.course_name = name
            config.save(update_fields=["course_name"])
    except Exception as e:
        errors.append(f"CourseCertificateConfig: {e}")

    if errors:
        return JsonResponse({"success": False, "errors": errors}, status=500)

    return JsonResponse({"success": True, "course_name": name})


@require_http_methods(["DELETE"])
@_require_admin
def api_admin_delete_course(request, course_id: str):
    if not request.user.is_superuser:
        return JsonResponse({"error": "ต้องการสิทธิ์ superuser"}, status=403)
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
# Import Questions from Word/Docx/Txt/Pdf API
# ============================================================

_SUPPORTED_EXTS = {".txt", ".docx", ".doc"}


def _extract_lines_from_file(file_bytes, filename):
    """Convert any supported document to a list of text lines for the question parser."""
    import io, re, subprocess, tempfile, os

    ext = os.path.splitext(filename.lower())[1]
    raw_text = None

    if ext == ".txt":
        for enc in ("utf-8-sig", "utf-8", "cp874", "tis-620", "latin-1"):
            try:
                raw_text = file_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue

    elif ext == ".docx":
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        parts = []
        for para in doc.paragraphs:
            t = para.text.strip()
            if t:
                parts.append(t)
            else:
                parts.append("")
        raw_text = "\n".join(parts)

    elif ext == ".doc":
        # antiword first (installed); fallback to catdoc
        with tempfile.NamedTemporaryFile(suffix=".doc", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            for cmd in [["antiword", "-t", tmp_path], ["catdoc", tmp_path]]:
                try:
                    result = subprocess.run(
                        cmd, capture_output=True, timeout=30
                    )
                    if result.returncode == 0 and result.stdout:
                        for enc in ("utf-8", "cp874", "latin-1"):
                            try:
                                raw_text = result.stdout.decode(enc)
                                break
                            except UnicodeDecodeError:
                                continue
                        if raw_text:
                            break
                except (FileNotFoundError, subprocess.TimeoutExpired):
                    continue
        finally:
            os.unlink(tmp_path)

        # Last resort: try opening as docx (some .doc are actually OOXML)
        if not raw_text:
            try:
                from docx import Document
                doc = Document(io.BytesIO(file_bytes))
                parts = [para.text.strip() for para in doc.paragraphs]
                raw_text = "\n".join(parts)
            except Exception:
                pass

    if not raw_text:
        return []

    # Normalise line endings and split
    lines = []
    for line in raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        sl = line.strip()
        lines.append(sl if sl else "")
    return lines


def _parse_questions_from_lines(all_lines):
    """Parse question data from a flat list of text lines."""
    import re
    questions = []
    errors = []
    CHOICE_MAP = {"ก": "A", "ข": "B", "ค": "C", "ง": "D", "จ": "E"}

    def normalize_letter(s):
        s = s.strip().upper()
        return CHOICE_MAP.get(s, s)

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

    current = None
    line_num = 0

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
        import os
        ext = os.path.splitext(f.name.lower())[1]
        if ext not in _SUPPORTED_EXTS:
            return JsonResponse({"error": f"รองรับไฟล์: {', '.join(sorted(_SUPPORTED_EXTS))}"}, status=400)
        file_bytes = f.read()
        lines = _extract_lines_from_file(file_bytes, f.name)
        if not lines:
            return JsonResponse({"error": "ไม่สามารถอ่านเนื้อหาไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์"}, status=400)
        questions, errors = _parse_questions_from_lines(lines)
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
        import os
        ext = os.path.splitext(f.name.lower())[1]
        if ext not in _SUPPORTED_EXTS:
            return JsonResponse({"error": f"รองรับไฟล์: {', '.join(sorted(_SUPPORTED_EXTS))}"}, status=400)
        file_bytes = f.read()
        lines = _extract_lines_from_file(file_bytes, f.name)
        if not lines:
            return JsonResponse({"error": "ไม่สามารถอ่านเนื้อหาไฟล์ได้"}, status=400)
        questions, parse_errors = _parse_questions_from_lines(lines)

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

        # ล้าง Meilisearch index — ป้องกันข้อสอบเก่าปรากฎหลังสร้าง Library ใหม่ key เดิม
        try:
            from django.conf import settings
            import urllib.request, json as _json
            _ms_url = getattr(settings, "MEILISEARCH_URL", "http://meilisearch:7700")
            _ms_key = getattr(settings, "MEILISEARCH_API_KEY", "")
            _ms_prefix = getattr(settings, "MEILISEARCH_INDEX_PREFIX", "")
            _index = f"{_ms_prefix}studio_content"
            _search_body = _json.dumps({
                "filter": f'context_key = "{library_key_str}"',
                "limit": 1000,
                "attributesToRetrieve": ["id"],
            }).encode()
            _req = urllib.request.Request(
                f"{_ms_url}/indexes/{_index}/search",
                data=_search_body,
                headers={"Authorization": f"Bearer {_ms_key}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(_req, timeout=10) as _resp:
                _result = _json.loads(_resp.read())
            _ids = [h["id"] for h in _result.get("hits", [])]
            if _ids:
                _del_req = urllib.request.Request(
                    f"{_ms_url}/indexes/{_index}/documents/delete-batch",
                    data=_json.dumps(_ids).encode(),
                    method="POST",
                    headers={"Authorization": f"Bearer {_ms_key}", "Content-Type": "application/json"},
                )
                urllib.request.urlopen(_del_req, timeout=10)
        except Exception:
            pass

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
            _allowed_import_roles = {"student", "instructor", "org_admin"}
            _import_role = u.get("role", "student")
            if _import_role not in _allowed_import_roles:
                _import_role = "student"
            user.is_active = True
            user.is_staff = False  # bulk import ห้ามสร้าง admin — ต้องตั้งผ่าน admin panel
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
                role=_import_role,
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
            profile = getattr(p.user, 'military_profile', None)
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
                # บันทึกหน่วยงาน ณ วันที่อนุมัติ
                _uprof = getattr(p.user, 'military_profile', None)
                p.unit_snapshot = _uprof.unit if _uprof else ''
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


def _encode_video_url(base_url: str, *path_parts) -> str:
    """สร้าง URL-encoded path สำหรับไฟล์วิดีโอ — ป้องกัน 404 เมื่อชื่อมีภาษาไทยหรือ space"""
    from urllib.parse import quote as _quote
    encoded = '/'.join(_quote(p, safe='') for p in path_parts)
    return f"{base_url}/{encoded}"


@_require_instructor
def api_video_subjects(request):
    """
    GET  /military/api/v1/videos/subjects/   → list subjects ของ user ปัจจุบัน
    POST /military/api/v1/videos/subjects/   → สร้าง subject ใหม่ (body: {name})
    PATCH /military/api/v1/videos/subjects/  → แก้ชื่อ subject (body: {old_name, new_name})
    DELETE /military/api/v1/videos/subjects/ → ลบ subject (body: {name})
    """
    user_dir = _os.path.join(_get_video_dir(), request.user.username)

    if request.method == 'GET':
        subjects = []
        if _os.path.isdir(user_dir):
            for name in sorted(_os.listdir(user_dir)):
                sub_dir = _os.path.join(user_dir, name)
                if _os.path.isdir(sub_dir):
                    count = sum(1 for f in _os.listdir(sub_dir) if _os.path.isfile(_os.path.join(sub_dir, f)))
                    subjects.append({'name': name, 'file_count': count})
        return JsonResponse({'subjects': subjects})

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        name = data.get('name', '').strip()
        safe = _re.sub(r'[^\w\-ก-๙ ]', '_', name).strip()
        if not safe:
            return JsonResponse({'error': 'ชื่อไม่ถูกต้อง'}, status=400)
        sub_dir = _os.path.join(user_dir, safe)
        _os.makedirs(sub_dir, exist_ok=True)
        return JsonResponse({'success': True, 'name': safe})

    if request.method == 'PATCH':
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        old_name = _os.path.basename(data.get('old_name', '').strip())
        new_raw = data.get('new_name', '').strip()
        new_name = _re.sub(r'[^\w\-ก-๙ ]', '_', new_raw).strip()
        if not old_name or not new_name:
            return JsonResponse({'error': 'ระบุ old_name และ new_name'}, status=400)

        old_dir = _os.path.join(user_dir, old_name)
        new_dir = _os.path.join(user_dir, new_name)
        if not _os.path.isdir(old_dir):
            return JsonResponse({'error': f'ไม่พบหมวดหมู่ "{old_name}"'}, status=404)
        if old_name == new_name:
            return JsonResponse({'success': True, 'name': new_name})
        if _os.path.isdir(new_dir):
            return JsonResponse({'error': f'มีหมวดหมู่ "{new_name}" อยู่แล้ว'}, status=409)

        # rename directory → ไฟล์วิดีโอทั้งหมดข้างในย้ายตามอัตโนมัติ
        # (URL จะเปลี่ยนเป็น /media/videos/{user}/{new_name}/... )
        _os.rename(old_dir, new_dir)
        return JsonResponse({'success': True, 'name': new_name})

    if request.method == 'DELETE':
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        name = _os.path.basename(data.get('name', '').strip())
        if not name:
            return JsonResponse({'error': 'ระบุชื่อ subject'}, status=400)
        sub_dir = _os.path.join(user_dir, name)
        if not _os.path.isdir(sub_dir):
            return JsonResponse({'error': 'ไม่พบ subject นี้'}, status=404)
        # ลบทั้ง directory และไฟล์ข้างใน
        import shutil as _shutil
        _shutil.rmtree(sub_dir)
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@_require_instructor
def api_video_list(request):
    """
    GET /military/api/v1/videos/?course_slug=<slug>
    - ไฟล์ของตัวเอง + ทุกไฟล์ใน folder ที่คนอื่น share ให้ (is_shared_with_me=true)
    - Admin เห็นทุกไฟล์ของทุกคน
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        from .models import VideoSharePermission
        base_dir = _get_video_dir()
        base_url = _get_video_base_url()
        is_admin = request.user.is_staff or request.user.is_superuser
        filter_course = request.GET.get('course_slug', '').strip()
        files = []

        # folder-level share counts สำหรับไฟล์ของตัวเอง
        own_share_counts = {}
        if not is_admin:
            for row in VideoSharePermission.objects.filter(uploader=request.user).values('course_slug').annotate(
                cnt=__import__('django.db.models', fromlist=['Count']).Count('id')
            ):
                own_share_counts[row['course_slug']] = row['cnt']

        def _scan_folder(uname, course_slug, is_shared_with_me=False):
            course_dir = _os.path.join(base_dir, uname, course_slug)
            if not _os.path.isdir(course_dir):
                return
            share_count = own_share_counts.get(course_slug, 0) if not is_shared_with_me else 0
            for fname in sorted(_os.listdir(course_dir)):
                fpath = _os.path.join(course_dir, fname)
                if not _os.path.isfile(fpath):
                    continue
                stat = _os.stat(fpath)
                files.append({
                    'name': fname,
                    'size': stat.st_size,
                    'url': _encode_video_url(base_url, uname, course_slug, fname),
                    'modified': stat.st_mtime,
                    'course_slug': course_slug,
                    'uploader': uname,
                    'is_shared_with_me': is_shared_with_me,
                    'share_count': share_count,
                })

        if is_admin:
            scan_users = [d for d in _os.listdir(base_dir)
                          if _os.path.isdir(_os.path.join(base_dir, d))] if _os.path.exists(base_dir) else []
            for uname in scan_users:
                udir = _os.path.join(base_dir, uname)
                for slug in sorted(_os.listdir(udir)):
                    if filter_course and slug != filter_course:
                        continue
                    _scan_folder(uname, slug)
        else:
            # ไฟล์ของตัวเอง
            udir = _os.path.join(base_dir, request.user.username)
            if _os.path.isdir(udir):
                for slug in sorted(_os.listdir(udir)):
                    if filter_course and slug != filter_course:
                        continue
                    _scan_folder(request.user.username, slug)
            # folder ที่คนอื่น share ให้ทั้ง folder
            shared_folders = VideoSharePermission.objects.filter(
                shared_with=request.user
            ).values('uploader__username', 'course_slug')
            for sf in shared_folders:
                uname, slug = sf['uploader__username'], sf['course_slug']
                if filter_course and slug != filter_course:
                    continue
                _scan_folder(uname, slug, is_shared_with_me=True)

        return JsonResponse({'files': files})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@_require_instructor
def api_video_share(request):
    """
    GET  /military/api/v1/videos/share/?course_slug=X
         คืนรายชื่อครูที่ folder นี้ถูก share ให้แล้ว + รายชื่อครูทั้งหมด
    POST /military/api/v1/videos/share/
         body: {course_slug, username} — แชร์ทั้ง folder ให้ user นั้น
    DELETE /military/api/v1/videos/share/
         body: {course_slug, username} — ยกเลิกแชร์
    """
    from .models import VideoSharePermission
    User = get_user_model()

    if request.method == 'GET':
        course_slug = request.GET.get('course_slug', '').strip()
        if not course_slug:
            return JsonResponse({'error': 'ต้องระบุ course_slug'}, status=400)
        shared = list(
            VideoSharePermission.objects.filter(
                uploader=request.user, course_slug=course_slug
            ).select_related('shared_with').values('shared_with__username', 'shared_with__id')
        )
        from .models import MilitaryUserProfile
        instructors = list(
            MilitaryUserProfile.objects.filter(role__in=('instructor',))
            .exclude(user=request.user)
            .select_related('user')
            .values('user__id', 'user__username', 'full_name_th')
        )
        shared_ids = {s['shared_with__id'] for s in shared}
        return JsonResponse({
            'instructors': [
                {
                    'id': i['user__id'],
                    'username': i['user__username'],
                    'full_name': i['full_name_th'],
                    'already_shared': i['user__id'] in shared_ids,
                }
                for i in instructors
            ],
        })

    import json as _json
    try:
        body = _json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    course_slug = (body.get('course_slug') or '').strip()
    username    = (body.get('username') or '').strip()
    if not course_slug or not username:
        return JsonResponse({'error': 'ต้องระบุ course_slug และ username'}, status=400)
    target = User.objects.filter(username=username).first()
    if not target:
        return JsonResponse({'error': f'ไม่พบผู้ใช้ {username}'}, status=404)
    if target == request.user:
        return JsonResponse({'error': 'ไม่สามารถแชร์ให้ตัวเองได้'}, status=400)

    folder_path = _os.path.join(_get_video_dir(), request.user.username, course_slug)
    if not _os.path.isdir(folder_path):
        return JsonResponse({'error': 'ไม่พบ folder'}, status=404)

    if request.method == 'POST':
        VideoSharePermission.objects.get_or_create(
            uploader=request.user, course_slug=course_slug, shared_with=target,
        )
        return JsonResponse({'success': True})

    if request.method == 'DELETE':
        VideoSharePermission.objects.filter(
            uploader=request.user, course_slug=course_slug, shared_with=target,
        ).delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@_require_instructor
def api_video_upload(request):
    """
    POST /military/api/v1/videos/upload/
    บันทึกไฟล์ที่ videos/{username}/{course_slug}/
    ต้องส่ง course_slug มาด้วย
    """
    import logging as _logging
    _vlog = _logging.getLogger('military.video_upload')

    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    if 'file' not in request.FILES:
        _vlog.warning('upload: no file in request.FILES (user=%s)', request.user.username)
        return JsonResponse({'error': 'No file provided'}, status=400)

    course_slug = request.POST.get('course_slug', '').strip()
    if not course_slug:
        return JsonResponse({'error': 'กรุณาระบุ course_slug'}, status=400)

    # ตรวจว่า subject มีอยู่จริง — ห้ามสร้างใหม่อัตโนมัติ
    user_dir = _os.path.join(_get_video_dir(), request.user.username)
    dest_dir = _os.path.join(user_dir, course_slug)
    if not _os.path.isdir(dest_dir):
        _vlog.error('upload: subject dir not found: %s', dest_dir)
        return JsonResponse({'error': f'ไม่พบหมวดหมู่ "{course_slug}" กรุณาสร้างก่อนอัปโหลด'}, status=400)

    _VIDEO_ALLOWED_EXTS = {'.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv'}
    uploaded_file = request.FILES['file']
    _orig_ext = _os.path.splitext(uploaded_file.name)[1].lower()
    if _orig_ext not in _VIDEO_ALLOWED_EXTS:
        return JsonResponse({'error': f'ไม่รองรับไฟล์ประเภท "{_orig_ext}" กรุณาอัปโหลดไฟล์วิดีโอเท่านั้น'}, status=400)
    safe_name = _re.sub(r'[^\w\-_.]', '_', uploaded_file.name) or f"video_{_uuid_mod.uuid4().hex}"

    file_path = _os.path.join(dest_dir, safe_name)
    base, ext = _os.path.splitext(safe_name)
    counter = 1
    while _os.path.exists(file_path):
        safe_name = f"{base}_{counter}{ext}"
        file_path = _os.path.join(dest_dir, safe_name)
        counter += 1

    _vlog.info('upload: start user=%s subject=%s file=%s size=%d dest=%s',
               request.user.username, course_slug, safe_name,
               uploaded_file.size, file_path)
    try:
        bytes_written = 0
        with open(file_path, 'wb+') as dest:
            for chunk in uploaded_file.chunks(chunk_size=8 * 1024 * 1024):
                dest.write(chunk)
                bytes_written += len(chunk)

        # ตรวจสอบว่าไฟล์เขียนครบจริง
        if not _os.path.exists(file_path):
            _vlog.error('upload: file missing after write! dest=%s', file_path)
            return JsonResponse({'error': 'บันทึกไฟล์ไม่สำเร็จ — ไฟล์หายหลัง write'}, status=500)

        actual_size = _os.path.getsize(file_path)
        if actual_size == 0:
            _os.remove(file_path)
            _vlog.error('upload: zero-byte file written, dest=%s', file_path)
            return JsonResponse({'error': 'บันทึกไฟล์ไม่สำเร็จ — ได้รับข้อมูล 0 bytes'}, status=500)

        if uploaded_file.size and actual_size < uploaded_file.size:
            _os.remove(file_path)
            _vlog.error('upload: incomplete write %d/%d bytes, dest=%s',
                        actual_size, uploaded_file.size, file_path)
            return JsonResponse({
                'error': f'ไฟล์ถูกบันทึกไม่ครบ ({actual_size}/{uploaded_file.size} bytes)'
            }, status=500)

        # ตั้งสิทธิ์ให้ nginx อ่านได้
        _os.chmod(file_path, 0o644)

        url = _encode_video_url(_get_video_base_url(), request.user.username, course_slug, safe_name)
        _vlog.info('upload: success user=%s file=%s size=%d url=%s',
                   request.user.username, safe_name, actual_size, url)
        return JsonResponse({
            'success': True,
            'filename': safe_name,
            'url': url,
            'size': actual_size,
        })
    except OSError as e:
        _vlog.error('upload: OSError writing file=%s: %s', file_path, e, exc_info=True)
        if _os.path.exists(file_path):
            _os.remove(file_path)
        return JsonResponse({'error': f'ระบบไฟล์ผิดพลาด: {e}'}, status=500)
    except Exception as e:
        _vlog.error('upload: unexpected error file=%s: %s', file_path, e, exc_info=True)
        if _os.path.exists(file_path):
            _os.remove(file_path)
        return JsonResponse({'error': str(e)}, status=500)


def _resolve_video_path(base_dir, uname, course_slug, fname):
    """รวม path อย่างปลอดภัย — basename กันอักขระ /.. และตรวจว่าอยู่ใต้ user dir
    คืน (file_path, user_root) ; ใช้ basename เพื่อคง Thai/space ของชื่อจริงไว้ ไม่ mangle"""
    safe_course = _os.path.basename((course_slug or '').strip())
    safe_fname  = _os.path.basename((fname or '').strip())
    user_root   = _os.path.realpath(_os.path.join(base_dir, uname))
    file_path   = _os.path.realpath(_os.path.join(user_root, safe_course, safe_fname))
    return file_path, user_root, safe_course, safe_fname


@_require_instructor
def api_video_delete(request):
    """
    DELETE /military/api/v1/videos/delete/
    body: {course_slug, filename, uploader?}
    ลบไฟล์ของตัวเอง (admin ลบของผู้อื่นได้โดยส่ง uploader)
    ── ใช้ JSON body แทนการแนบ path ภาษาไทยใน URL เพื่อเลี่ยงปัญหา encoding/404 ──
    """
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    course_slug = (data.get('course_slug', '') or '').strip()
    fname       = (data.get('filename', '') or '').strip()
    if not course_slug or not fname:
        return JsonResponse({'error': 'ระบุ course_slug และ filename'}, status=400)

    is_admin = request.user.is_staff or request.user.is_superuser
    uname    = data.get('uploader', request.user.username) if is_admin else request.user.username

    base_dir = _get_video_dir()
    file_path, user_root, _sc, _fn = _resolve_video_path(base_dir, uname, course_slug, fname)
    if not file_path.startswith(user_root + _os.sep):
        return JsonResponse({'error': 'path ไม่ถูกต้อง'}, status=400)
    if not _os.path.isfile(file_path):
        return JsonResponse({'error': 'ไม่พบไฟล์'}, status=404)
    try:
        _os.remove(file_path)
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@_require_instructor
def api_video_move(request):
    """
    PATCH /military/api/v1/videos/move/
    body: {course_slug, filename, new_course_slug, uploader?}
    ย้ายวิดีโอไปยังหมวดหมู่ใหม่ (ต้องเป็นหมวดหมู่ที่มีอยู่แล้ว — ห้ามสร้างใหม่)
    """
    if request.method != 'PATCH':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    course_slug = (data.get('course_slug', '') or '').strip()
    fname       = (data.get('filename', '') or '').strip()
    new_slug    = (data.get('new_course_slug', '') or '').strip()
    if not (course_slug and fname and new_slug):
        return JsonResponse({'error': 'ระบุ course_slug, filename, new_course_slug'}, status=400)
    if new_slug == course_slug:
        return JsonResponse({'error': 'หมวดหมู่ปลายทางเหมือนเดิม'}, status=400)

    is_admin = request.user.is_staff or request.user.is_superuser
    uname    = data.get('uploader', request.user.username) if is_admin else request.user.username

    base_dir = _get_video_dir()
    src, user_root, _sc, safe_fname = _resolve_video_path(base_dir, uname, course_slug, fname)
    new_dir = _os.path.realpath(_os.path.join(user_root, _os.path.basename(new_slug)))
    # ป้องกัน path traversal ทั้งต้นทาง/ปลายทาง
    if not src.startswith(user_root + _os.sep) or not new_dir.startswith(user_root + _os.sep):
        return JsonResponse({'error': 'path ไม่ถูกต้อง'}, status=400)
    if not _os.path.isfile(src):
        return JsonResponse({'error': 'ไม่พบไฟล์ต้นทาง'}, status=404)
    if not _os.path.isdir(new_dir):
        return JsonResponse({'error': f'ไม่พบหมวดหมู่ปลายทาง "{new_slug}" กรุณาสร้างก่อน'}, status=404)

    # กันชื่อซ้ำที่ปลายทาง
    dst = _os.path.join(new_dir, safe_fname)
    base, ext = _os.path.splitext(safe_fname)
    counter = 1
    while _os.path.exists(dst):
        dst = _os.path.join(new_dir, f"{base}_{counter}{ext}")
        counter += 1
    try:
        import shutil as _shutil
        _shutil.move(src, dst)
        new_name = _os.path.basename(dst)
        return JsonResponse({
            'success': True,
            'course_slug': _os.path.basename(new_slug),
            'filename': new_name,
            'url': _encode_video_url(_get_video_base_url(), uname, _os.path.basename(new_slug), new_name),
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ─────────────────────────────────────────────────────────────────────
# Document / PDF library — เก็บที่ documents/{username}/{subject}/{file}
# เสิร์ฟผ่าน nginx-videos location /media/documents/ — มี progress bar ฝั่ง FE
# ─────────────────────────────────────────────────────────────────────

def _get_doc_dir():
    return getattr(_djsettings, 'MILITARY_DOC_DIR', '/openedx/media/documents')


def _get_doc_base_url():
    return getattr(_djsettings, 'MILITARY_DOC_BASE_URL', '/media/documents')


# นามสกุลไฟล์เอกสารที่อนุญาต — Office จะถูกแปลงเป็น PDF อัตโนมัติก่อนบันทึก
_DOC_ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'}
_OFFICE_EXTS = {'.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'}


def _convert_office_to_pdf(tmp_path: str, original_name: str) -> bytes:
    """แปลง Office document เป็น PDF ผ่าน Gotenberg (LibreOffice)"""
    import requests as _req
    url = getattr(_djsettings, 'GOTENBERG_URL', 'http://gotenberg:3000') + '/forms/libreoffice/convert'
    with open(tmp_path, 'rb') as fh:
        resp = _req.post(
            url,
            files={'files': (original_name, fh, 'application/octet-stream')},
            timeout=120,
        )
    if resp.status_code != 200:
        raise Exception(f'แปลงไฟล์ไม่สำเร็จ (status {resp.status_code}): {resp.text[:300]}')
    return resp.content


# ── Font normalization + binary-format upgrade ─────────────────────────────
# ขั้นตอนก่อนส่ง Gotenberg:
#   1. ถ้าเป็น .ppt/.doc/.xls (binary) → แปลงเป็น .pptx/.docx/.xlsx ก่อน
#   2. แทนที่ font ทั้งหมดด้วย TH SarabunPSK
#   3. ส่ง Gotenberg แปลงเป็น PDF
_FONT_REPLACE_TARGET = "TH SarabunPSK"
_BINARY_TO_MODERN = {'.ppt': '.pptx', '.doc': '.docx', '.xls': '.xlsx'}


def _convert_binary_to_modern(src_path: str, ext: str) -> tuple:
    """แปลง .ppt/.doc/.xls → .pptx/.docx/.xlsx ผ่าน converter_server ใน Gotenberg
    คืน (bytes_of_modern_file, new_ext) หรือ (None, ext) ถ้าล้มเหลว"""
    import requests as _req
    target_ext = _BINARY_TO_MODERN.get(ext)
    if not target_ext:
        return None, ext
    base_url = getattr(_djsettings, 'GOTENBERG_URL', 'http://gotenberg:3000')
    converter_url = base_url.replace(':3000', ':2004') + '/convert-to-modern'
    with open(src_path, 'rb') as fh:
        resp = _req.post(
            converter_url,
            files={'file': ('input' + ext, fh, 'application/octet-stream')},
            timeout=120,
        )
    if resp.status_code != 200:
        import logging as _l2
        _l2.getLogger('military.doc_upload').warning(
            'binary-to-modern failed ext=%s status=%d: %s',
            ext, resp.status_code, resp.text[:200])
        return None, ext
    return resp.content, target_ext

def _normalize_fonts_docx(xml: str) -> str:
    """แทนที่ font ใน DOCX XML (word/document.xml, styles.xml, theme/theme1.xml ...)"""
    import re as _re2
    # แทนที่ w:rFonts attributes (document body, styles, headers, footers)
    for attr in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        xml = _re2.sub(rf'{attr}="[^"]*"', f'{attr}="{_FONT_REPLACE_TARGET}"', xml)
    # ลบ theme-font refs ที่ override การตั้งค่าข้างต้น
    xml = _re2.sub(r'\s+w:(?:ascii|hAnsi|cs|eastAsia)Theme="[^"]*"', '', xml)
    # แทนที่ DrawingML typeface ใน word/theme/theme1.xml (a:latin, a:cs, a:ea, a:font)
    def _rep_typeface(m):
        val = m.group(1)
        if val.startswith('+'):   # theme font ref → ไม่แตะ
            return m.group(0)
        return f'typeface="{_FONT_REPLACE_TARGET}"'
    xml = _re2.sub(r'typeface="([^"]*)"', _rep_typeface, xml)
    return xml

def _normalize_fonts_pptx(xml: str) -> str:
    """แทนที่ font ใน PPTX XML (slides, layouts, masters, theme)
    หมายเหตุ: แทนที่ค่าว่าง typeface="" ด้วย เพื่อ force CS/EA font ใน theme scheme
    ให้ชี้ไปที่ TH SarabunPSK แทนการ fallback ไป OS default
    """
    import re as _re2
    def _replace(m):
        val = m.group(1)
        if val.startswith('+'):   # +mn-lt, +mj-cs ฯลฯ = theme font ref → ไม่แตะ
            return m.group(0)
        # แทนที่ทุกค่า รวมถึงค่าว่าง (เพื่อ force <a:cs typeface="TH SarabunPSK"/>)
        return f'typeface="{_FONT_REPLACE_TARGET}"'
    xml = _re2.sub(r'typeface="([^"]*)"', _replace, xml)
    return xml

def _normalize_fonts_xlsx(xml: str) -> str:
    """แทนที่ font ใน XLSX styles.xml"""
    import re as _re2
    xml = _re2.sub(r'(<name\s+val=")[^"]*(")', rf'\g<1>{_FONT_REPLACE_TARGET}\g<2>', xml)
    return xml

def _normalize_fonts(src_path: str, ext: str) -> str:
    """สร้าง ZIP ใหม่ที่ font ทุกตัวถูกแทนที่ด้วย TH SarabunPSK
    คืน path ของ temp file ที่ผู้เรียกต้องลบเอง
    รองรับ .docx / .pptx / .xlsx เท่านั้น (.doc/.ppt/.xls → copy ผ่าน)
    """
    import zipfile as _zf
    import tempfile as _tf2

    out = _tf2.NamedTemporaryFile(delete=False, suffix=ext)
    out.close()
    out_path = out.name

    if ext == '.docx':
        prefix = 'word/'
        fn_replace = _normalize_fonts_docx
    elif ext == '.pptx':
        prefix = 'ppt/'
        fn_replace = _normalize_fonts_pptx
    elif ext == '.xlsx':
        prefix = 'xl/'
        fn_replace = _normalize_fonts_xlsx
    else:
        # binary format (.doc/.ppt/.xls) — ไม่ parse ได้ ส่ง copy ผ่าน
        import shutil as _sh2
        _sh2.copy2(src_path, out_path)
        return out_path

    try:
        with _zf.ZipFile(src_path, 'r') as zin, \
             _zf.ZipFile(out_path, 'w', _zf.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename.startswith(prefix) and item.filename.endswith('.xml'):
                    try:
                        text = fn_replace(data.decode('utf-8'))
                        data = text.encode('utf-8')
                    except Exception:
                        pass  # XML decode error → ใช้ต้นฉบับ
                zout.writestr(item, data)
    except Exception:
        # ZIP error → คืน copy ต้นฉบับ
        import shutil as _sh2
        _sh2.copy2(src_path, out_path)

    return out_path


@_require_instructor
def api_doc_subjects(request):
    """GET/POST/PATCH/DELETE /military/api/v1/documents/subjects/ — หมวดหมู่เอกสาร (mirror วิดีโอ)"""
    user_dir = _os.path.join(_get_doc_dir(), request.user.username)

    if request.method == 'GET':
        subjects = []
        if _os.path.isdir(user_dir):
            for name in sorted(_os.listdir(user_dir)):
                sub_dir = _os.path.join(user_dir, name)
                if _os.path.isdir(sub_dir):
                    count = sum(1 for f in _os.listdir(sub_dir) if _os.path.isfile(_os.path.join(sub_dir, f)))
                    subjects.append({'name': name, 'file_count': count})
        return JsonResponse({'subjects': subjects})

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        safe = _re.sub(r'[^\w\-ก-๙ ]', '_', data.get('name', '').strip()).strip()
        if not safe:
            return JsonResponse({'error': 'ชื่อไม่ถูกต้อง'}, status=400)
        _os.makedirs(_os.path.join(user_dir, safe), exist_ok=True)
        return JsonResponse({'success': True, 'name': safe})

    if request.method == 'PATCH':
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        old_name = _os.path.basename(data.get('old_name', '').strip())
        new_name = _re.sub(r'[^\w\-ก-๙ ]', '_', data.get('new_name', '').strip()).strip()
        if not old_name or not new_name:
            return JsonResponse({'error': 'ระบุ old_name และ new_name'}, status=400)
        old_dir = _os.path.join(user_dir, old_name)
        new_dir = _os.path.join(user_dir, new_name)
        if not _os.path.isdir(old_dir):
            return JsonResponse({'error': f'ไม่พบหมวดหมู่ "{old_name}"'}, status=404)
        if old_name == new_name:
            return JsonResponse({'success': True, 'name': new_name})
        if _os.path.isdir(new_dir):
            return JsonResponse({'error': f'มีหมวดหมู่ "{new_name}" อยู่แล้ว'}, status=409)
        _os.rename(old_dir, new_dir)
        return JsonResponse({'success': True, 'name': new_name})

    if request.method == 'DELETE':
        try:
            data = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        name = _os.path.basename(data.get('name', '').strip())
        if not name:
            return JsonResponse({'error': 'ระบุชื่อ subject'}, status=400)
        sub_dir = _os.path.join(user_dir, name)
        if not _os.path.isdir(sub_dir):
            return JsonResponse({'error': 'ไม่พบ subject นี้'}, status=404)
        import shutil as _shutil
        _shutil.rmtree(sub_dir)
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@_require_instructor
def api_doc_list(request):
    """GET /military/api/v1/documents/?course_slug=<slug>
    ไฟล์ของตัวเอง + ทุกไฟล์ใน folder ที่คนอื่น share ให้ (is_shared_with_me=true)
    Admin เห็นทุกคน
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        from .models import DocSharePermission
        base_dir = _get_doc_dir()
        base_url = _get_doc_base_url()
        is_admin = request.user.is_staff or request.user.is_superuser
        filter_course = request.GET.get('course_slug', '').strip()
        files = []

        own_share_counts = {}
        if not is_admin:
            for row in DocSharePermission.objects.filter(uploader=request.user).values('course_slug').annotate(
                cnt=__import__('django.db.models', fromlist=['Count']).Count('id')
            ):
                own_share_counts[row['course_slug']] = row['cnt']

        def _scan_folder(uname, course_slug, is_shared_with_me=False):
            cdir = _os.path.join(base_dir, uname, course_slug)
            if not _os.path.isdir(cdir):
                return
            share_count = own_share_counts.get(course_slug, 0) if not is_shared_with_me else 0
            for fname in sorted(_os.listdir(cdir)):
                fpath = _os.path.join(cdir, fname)
                if not _os.path.isfile(fpath):
                    continue
                stat = _os.stat(fpath)
                files.append({
                    'name': fname,
                    'size': stat.st_size,
                    'url': _encode_video_url(base_url, uname, course_slug, fname),
                    'modified': stat.st_mtime,
                    'course_slug': course_slug,
                    'uploader': uname,
                    'is_shared_with_me': is_shared_with_me,
                    'share_count': share_count,
                })

        if is_admin:
            scan_users = [d for d in _os.listdir(base_dir)
                          if _os.path.isdir(_os.path.join(base_dir, d))] if _os.path.exists(base_dir) else []
            for uname in scan_users:
                udir = _os.path.join(base_dir, uname)
                for slug in sorted(_os.listdir(udir)):
                    if filter_course and slug != filter_course:
                        continue
                    _scan_folder(uname, slug)
        else:
            udir = _os.path.join(base_dir, request.user.username)
            if _os.path.isdir(udir):
                for slug in sorted(_os.listdir(udir)):
                    if filter_course and slug != filter_course:
                        continue
                    _scan_folder(request.user.username, slug)
            shared_folders = DocSharePermission.objects.filter(
                shared_with=request.user
            ).values('uploader__username', 'course_slug')
            for sf in shared_folders:
                uname, slug = sf['uploader__username'], sf['course_slug']
                if filter_course and slug != filter_course:
                    continue
                _scan_folder(uname, slug, is_shared_with_me=True)

        return JsonResponse({'files': files})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@_require_instructor
def api_doc_share(request):
    """
    GET  /military/api/v1/documents/share/?course_slug=X
         คืนรายชื่อครูที่ folder นี้ถูก share ให้แล้ว + รายชื่อครูทั้งหมด
    POST /military/api/v1/documents/share/
         body: {course_slug, username} — แชร์ทั้ง folder
    DELETE /military/api/v1/documents/share/
         body: {course_slug, username} — ยกเลิกแชร์
    """
    from .models import DocSharePermission
    User = get_user_model()

    if request.method == 'GET':
        course_slug = request.GET.get('course_slug', '').strip()
        if not course_slug:
            return JsonResponse({'error': 'ต้องระบุ course_slug'}, status=400)
        shared = list(
            DocSharePermission.objects.filter(
                uploader=request.user, course_slug=course_slug
            ).select_related('shared_with').values('shared_with__username', 'shared_with__id')
        )
        from .models import MilitaryUserProfile
        instructors = list(
            MilitaryUserProfile.objects.filter(role__in=('instructor',))
            .exclude(user=request.user)
            .select_related('user')
            .values('user__id', 'user__username', 'full_name_th')
        )
        shared_ids = {s['shared_with__id'] for s in shared}
        return JsonResponse({
            'instructors': [
                {
                    'id': i['user__id'],
                    'username': i['user__username'],
                    'full_name': i['full_name_th'],
                    'already_shared': i['user__id'] in shared_ids,
                }
                for i in instructors
            ],
        })

    import json as _json
    try:
        body = _json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    course_slug = (body.get('course_slug') or '').strip()
    username    = (body.get('username') or '').strip()
    if not course_slug or not username:
        return JsonResponse({'error': 'ต้องระบุ course_slug และ username'}, status=400)
    target = User.objects.filter(username=username).first()
    if not target:
        return JsonResponse({'error': f'ไม่พบผู้ใช้ {username}'}, status=404)
    if target == request.user:
        return JsonResponse({'error': 'ไม่สามารถแชร์ให้ตัวเองได้'}, status=400)

    folder_path = _os.path.join(_get_doc_dir(), request.user.username, course_slug)
    if not _os.path.isdir(folder_path):
        return JsonResponse({'error': 'ไม่พบ folder'}, status=404)

    if request.method == 'POST':
        DocSharePermission.objects.get_or_create(
            uploader=request.user, course_slug=course_slug, shared_with=target,
        )
        return JsonResponse({'success': True})

    if request.method == 'DELETE':
        DocSharePermission.objects.filter(
            uploader=request.user, course_slug=course_slug, shared_with=target,
        ).delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@_require_instructor
def api_doc_upload(request):
    """POST /military/api/v1/documents/upload/ — บันทึก PDF/เอกสารที่ documents/{user}/{slug}/
    Office files (.doc .docx .ppt .pptx .xls .xlsx) จะถูกแปลงเป็น PDF ผ่าน Gotenberg อัตโนมัติ
    """
    import logging as _logging
    import tempfile as _tempfile
    import shutil as _shutil
    _dlog = _logging.getLogger('military.doc_upload')

    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    if 'file' not in request.FILES:
        return JsonResponse({'error': 'No file provided'}, status=400)

    course_slug = request.POST.get('course_slug', '').strip()
    if not course_slug:
        return JsonResponse({'error': 'กรุณาระบุ course_slug'}, status=400)

    user_dir = _os.path.join(_get_doc_dir(), request.user.username)
    dest_dir = _os.path.join(user_dir, _os.path.basename(course_slug))
    if not _os.path.isdir(dest_dir):
        return JsonResponse({'error': f'ไม่พบหมวดหมู่ "{course_slug}" กรุณาสร้างก่อนอัปโหลด'}, status=400)

    uploaded_file = request.FILES['file']
    _ext = _os.path.splitext(uploaded_file.name)[1].lower()
    if _ext not in _DOC_ALLOWED_EXTS:
        return JsonResponse({'error': f'รองรับเฉพาะไฟล์ {", ".join(sorted(_DOC_ALLOWED_EXTS))}'}, status=400)

    safe_name = _re.sub(r'[^\w\-_.]', '_', uploaded_file.name) or f"doc_{_uuid_mod.uuid4().hex}{_ext}"

    # ถ้าเป็น Office file → แปลงเป็น PDF (เปลี่ยนนามสกุลเป็น .pdf)
    need_convert = _ext in _OFFICE_EXTS
    if need_convert:
        safe_name = _os.path.splitext(safe_name)[0] + '.pdf'

    base, final_ext = _os.path.splitext(safe_name)
    file_path = _os.path.join(dest_dir, safe_name)
    counter = 1
    while _os.path.exists(file_path):
        safe_name = f"{base}_{counter}{final_ext}"
        file_path = _os.path.join(dest_dir, safe_name)
        counter += 1

    tmp_path = None
    try:
        # เขียนไฟล์ต้นฉบับลง temp ก่อนเสมอ
        with _tempfile.NamedTemporaryFile(delete=False, suffix=_ext) as tmp:
            tmp_path = tmp.name
            for chunk in uploaded_file.chunks(chunk_size=4 * 1024 * 1024):
                tmp.write(chunk)

        if not _os.path.exists(tmp_path) or _os.path.getsize(tmp_path) == 0:
            return JsonResponse({'error': 'บันทึกไฟล์ไม่สำเร็จ — ได้รับข้อมูล 0 bytes'}, status=500)

        if need_convert:
            work_ext  = _ext
            work_path = tmp_path

            # step 1: binary format (.ppt/.doc/.xls) → modern XML format ก่อน
            if work_ext in _BINARY_TO_MODERN:
                _dlog.info('doc convert: user=%s file=%s → upgrade binary→modern',
                           request.user.username, uploaded_file.name)
                modern_bytes, modern_ext = _convert_binary_to_modern(work_path, work_ext)
                if modern_bytes:
                    modern_tmp = _tempfile.NamedTemporaryFile(
                        delete=False, suffix=modern_ext)
                    modern_tmp.write(modern_bytes)
                    modern_tmp.close()
                    work_path = modern_tmp.name
                    work_ext  = modern_ext
                    _dlog.info('doc convert: upgraded %s→%s (%d bytes)',
                               _ext, modern_ext, len(modern_bytes))
                else:
                    _dlog.warning('doc convert: binary upgrade failed, proceeding without font normalization')

            # step 2: แทนที่ font ทุกตัวด้วย TH SarabunPSK
            _dlog.info('doc convert: user=%s file=%s ext=%s → normalize fonts',
                       request.user.username, uploaded_file.name, work_ext)
            normalized_path = _normalize_fonts(work_path, work_ext)
            if work_path != tmp_path:
                _os.remove(work_path)   # ลบ temp modern file

            try:
                # step 3: ส่ง Gotenberg แปลงเป็น PDF
                pdf_data = _convert_office_to_pdf(normalized_path, uploaded_file.name)
            finally:
                if normalized_path and _os.path.exists(normalized_path):
                    _os.remove(normalized_path)

            with open(file_path, 'wb') as f:
                f.write(pdf_data)
            actual_size = len(pdf_data)
        else:
            _shutil.move(tmp_path, file_path)
            tmp_path = None
            actual_size = _os.path.getsize(file_path)

        _os.chmod(file_path, 0o644)
        url = _encode_video_url(_get_doc_base_url(), request.user.username,
                                _os.path.basename(course_slug), safe_name)
        _dlog.info('doc upload: success user=%s file=%s size=%d converted=%s',
                   request.user.username, safe_name, actual_size, need_convert)
        return JsonResponse({
            'success': True,
            'filename': safe_name,
            'url': url,
            'size': actual_size,
            'converted': need_convert,
        })
    except Exception as e:
        if file_path and _os.path.exists(file_path):
            _os.remove(file_path)
        _dlog.error('doc upload: error file=%s: %s', file_path, e, exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)
    finally:
        if tmp_path and _os.path.exists(tmp_path):
            _os.remove(tmp_path)


@_require_instructor
def api_doc_delete(request):
    """DELETE /military/api/v1/documents/delete/  body:{course_slug, filename, uploader?}"""
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    course_slug = (data.get('course_slug', '') or '').strip()
    fname = (data.get('filename', '') or '').strip()
    if not course_slug or not fname:
        return JsonResponse({'error': 'ระบุ course_slug และ filename'}, status=400)
    is_admin = request.user.is_staff or request.user.is_superuser
    uname = data.get('uploader', request.user.username) if is_admin else request.user.username
    file_path, user_root, _sc, _fn = _resolve_video_path(_get_doc_dir(), uname, course_slug, fname)
    if not file_path.startswith(user_root + _os.sep):
        return JsonResponse({'error': 'path ไม่ถูกต้อง'}, status=400)
    if not _os.path.isfile(file_path):
        return JsonResponse({'error': 'ไม่พบไฟล์'}, status=404)
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
    qs = MilitaryUserProfile.objects.filter(user__is_active=True).exclude(role__in=("admin", "org_admin")).select_related("user")
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
               .filter(user__is_active=True).exclude(role__in=("admin", "org_admin"))
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
        all_profiles = MilitaryUserProfile.objects.filter(user__is_active=True).exclude(role__in=("admin", "org_admin")).select_related("user")
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
    for profile in MilitaryUserProfile.objects.filter(user__is_active=True).exclude(role__in=("admin", "org_admin")).select_related("user"):
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
    qs = MilitaryUserProfile.objects.filter(user__is_active=True).exclude(role__in=("admin", "org_admin"))
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

    qs = MilitaryUserProfile.objects.filter(user__is_active=True).exclude(role__in=("admin", "org_admin")).select_related("user")
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



# ─────────────────────────────────────────────────────────────────────────────
# Organization Management (Super Admin)
# ─────────────────────────────────────────────────────────────────────────────

@require_http_methods(["GET", "POST"])
@_require_admin
def api_admin_organizations(request):
    """GET: รายการหน่วยงานทั้งหมด | POST: สร้างหน่วยงานใหม่"""
    if request.method == "GET":
        qs = Organization.objects.all()
        if request.GET.get("active_only") == "1":
            qs = qs.filter(is_active=True)
        q = request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(name__icontains=q) | qs.filter(code__icontains=q)
        results = [{
            "id": o.id, "name": o.name, "code": o.code,
            "is_active": o.is_active,
            "member_count": o.members.count(),
        } for o in qs.order_by("name")]
        return JsonResponse({"count": len(results), "results": results})

    # POST — create
    data = json.loads(request.body)
    name = data.get("name", "").strip()
    code = data.get("code", "").strip()
    if not name or not code:
        return JsonResponse({"error": "name และ code จำเป็นต้องระบุ"}, status=400)
    if Organization.objects.filter(name=name).exists():
        return JsonResponse({"error": "ชื่อหน่วยงานซ้ำ"}, status=400)
    if Organization.objects.filter(code=code).exists():
        return JsonResponse({"error": "รหัสหน่วยงานซ้ำ"}, status=400)
    org = Organization.objects.create(name=name, code=code, is_active=True)
    return JsonResponse({"id": org.id, "name": org.name, "code": org.code, "is_active": org.is_active}, status=201)


@require_http_methods(["PATCH", "DELETE"])
@_require_admin
def api_admin_organization_detail(request, org_id):
    """PATCH: แก้ไขชื่อ/รหัส/สถานะ | DELETE: Soft-delete (is_active=False)"""
    try:
        org = Organization.objects.get(pk=org_id)
    except Organization.DoesNotExist:
        return JsonResponse({"error": "ไม่พบหน่วยงาน"}, status=404)

    if request.method == "DELETE":
        org.is_active = False
        org.save(update_fields=["is_active", "updated_at"])
        return JsonResponse({"status": "deactivated"})

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    if "name" in data:
        org.name = data["name"].strip()
    if "code" in data:
        org.code = data["code"].strip()
    if "is_active" in data:
        org.is_active = bool(data["is_active"])
    try:
        org.save()
    except IntegrityError:
        return JsonResponse({"error": "ชื่อหรือรหัสหน่วยงานซ้ำกับหน่วยอื่นในระบบ"}, status=409)
    return JsonResponse({"id": org.id, "name": org.name, "code": org.code, "is_active": org.is_active})


@require_POST
@_require_admin
def api_admin_organization_bulk_transfer(request, org_id):
    """ย้ายกำลังพลทั้งหมดจาก org_id → target_org_id"""
    try:
        src = Organization.objects.get(pk=org_id)
    except Organization.DoesNotExist:
        return JsonResponse({"error": "ไม่พบหน่วยงานต้นทาง"}, status=404)
    data = json.loads(request.body)
    target_id = data.get("target_org_id")
    if not target_id:
        return JsonResponse({"error": "ต้องระบุ target_org_id"}, status=400)
    try:
        dst = Organization.objects.get(pk=target_id)
    except Organization.DoesNotExist:
        return JsonResponse({"error": "ไม่พบหน่วยงานปลายทาง"}, status=404)

    if src.pk == dst.pk:
        return JsonResponse({"error": "หน่วยงานต้นทางและปลายทางต้องไม่ใช่หน่วยเดียวกัน"}, status=400)
    if not dst.is_active:
        return JsonResponse({"error": "ไม่สามารถโอนย้ายไปยังหน่วยงานที่ปิดใช้งานแล้ว"}, status=400)

    moved = MilitaryUserProfile.objects.filter(organization=src).update(
        organization=dst,
    )
    return JsonResponse({"moved": moved, "from": src.name, "to": dst.name})


# ─────────────────────────────────────────────────────────────────────────────
# Public org list — ใช้ใน Signup dropdown
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
def api_organizations_public(request):
    """คืนรายชื่อหน่วยงาน Active ทั้งหมด สำหรับ Dropdown สมัครสมาชิก"""
    orgs = Organization.objects.filter(is_active=True).order_by("name").values("id", "code", "name")
    return JsonResponse({"results": list(orgs)})


# ─────────────────────────────────────────────────────────────────────────────
# Org Admin Dashboard
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
@_require_org_admin
def api_org_admin_dashboard(request):
    """สรุปสถิติสำหรับ Org Admin — scoped ตาม organization ของตัวเอง"""
    profile = getattr(request.user, 'military_profile', None)
    if not profile:
        return JsonResponse({"error": "ไม่พบข้อมูลผู้ใช้"}, status=403)
    is_super = request.user.is_staff or profile.role == "admin"

    if is_super:
        org_id = request.GET.get("org_id")
        if org_id:
            members = MilitaryUserProfile.objects.filter(organization_id=org_id).exclude(role__in=("admin", "org_admin"))
            org_name = Organization.objects.filter(pk=org_id).values_list("name", flat=True).first() or ""
        else:
            members = MilitaryUserProfile.objects.exclude(role__in=("admin", "org_admin"))
            org_name = "ทุกหน่วยงาน"
    else:
        if not profile.organization_id:
            return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)
        members = MilitaryUserProfile.objects.filter(organization_id=profile.organization_id).exclude(role__in=("admin", "org_admin"))
        org_name = profile.organization.name if profile.organization else ""

    user_ids = list(members.values_list("user_id", flat=True))
    total = len(user_ids)

    # ผู้ที่มีใบประกาศ active
    today = date.today()
    passed_ids = set(
        UserCertificateExpiry.objects.filter(
            user_id__in=user_ids,
            expiry_date__gte=today,
        ).values_list("user_id", flat=True)
    )
    expired_ids = set(
        UserCertificateExpiry.objects.filter(
            user_id__in=user_ids,
            expiry_date__lt=today,
        ).values_list("user_id", flat=True)
    ) - passed_ids
    not_tested_count = total - len(passed_ids) - len(expired_ids)

    passed_count = len(passed_ids)
    expired_count = len(expired_ids)

    def pct(n):
        return round(n / total * 100, 1) if total else 0

    # รายชื่อผู้ผ่านและผู้หมดอายุ
    def _user_rows(uid_set):
        rows = []
        for p in MilitaryUserProfile.objects.filter(user_id__in=uid_set).select_related("user", "organization"):
            cert = UserCertificateExpiry.objects.filter(user_id=p.user_id).order_by("-expiry_date").first()
            rows.append({
                "user_id": p.user_id,
                "full_name": p.display_full_name,
                "rank": p.display_rank_name,
                "unit": p.organization.name if p.organization else p.unit,
                "expiry_date": cert.expiry_date.isoformat() if cert else None,
                "course_name": cert.course_name if cert else None,
            })
        return rows

    return JsonResponse({
        "org_name": org_name,
        "total": total,
        "passed": passed_count,
        "expired": expired_count,
        "not_tested": not_tested_count,
        "pct_passed": pct(passed_count),
        "pct_expired": pct(expired_count),
        "pct_not_tested": pct(not_tested_count),
        "passed_list": _user_rows(passed_ids),
        "expired_list": _user_rows(expired_ids),
    })


@require_GET
@_require_org_admin
def api_org_admin_users(request):
    """รายชื่อกำลังพลในหน่วยงานของ Org Admin"""
    profile = getattr(request.user, 'military_profile', None)
    if not profile:
        return JsonResponse({"error": "ไม่พบข้อมูลผู้ใช้"}, status=403)
    is_super = request.user.is_staff or profile.role == "admin"

    if is_super:
        org_id = request.GET.get("org_id")
        qs = MilitaryUserProfile.objects.filter(organization_id=org_id).exclude(role__in=("admin", "org_admin")) if org_id else MilitaryUserProfile.objects.exclude(role__in=("admin", "org_admin"))
    else:
        if not profile.organization_id:
            return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)
        qs = MilitaryUserProfile.objects.filter(organization_id=profile.organization_id).exclude(role__in=("admin", "org_admin"))

    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(full_name_th__icontains=q)

    today = date.today()
    results = []
    for p in qs.select_related("user", "organization").order_by("full_name_th"):
        cert = UserCertificateExpiry.objects.filter(user_id=p.user_id).order_by("-expiry_date").first()
        if cert:
            if cert.expiry_date >= today:
                cert_status = "passed"
            else:
                cert_status = "expired"
        else:
            cert_status = "not_tested"
        results.append({
            "user_id": p.user_id,
            "username": p.user.username,
            "full_name": p.display_full_name,
            "rank": p.display_rank_name,
            "unit": p.organization.name if p.organization else p.unit,
            "cert_status": cert_status,
            "expiry_date": cert.expiry_date.isoformat() if cert else None,
        })

    return JsonResponse({"count": len(results), "results": results})
