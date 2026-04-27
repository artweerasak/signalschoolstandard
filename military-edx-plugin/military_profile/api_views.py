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

from .models import MilitaryUserProfile, RANK_CHOICES, encrypt_field, decrypt_field
from certificate_expiry.models import UserCertificateExpiry, CourseCertificateConfig
from military_auth.models import PendingRegistration

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
        "unit": profile.unit,
        "sub_unit": profile.sub_unit,
        "service_start_date": ssd.isoformat() if hasattr(ssd, "isoformat") else str(ssd),
        "birth_date": bd.isoformat() if hasattr(bd, "isoformat") else str(bd),
        "created_at": profile.created_at.isoformat(),
    }


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
            password=body.get("password") or User.objects.make_random_password(),
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
        )

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
    for field in ("full_name_th", "rank", "unit", "sub_unit"):
        if field in body:
            setattr(profile, field, body[field])
    for date_field in ("service_start_date", "birth_date"):
        if date_field in body:
            setattr(profile, date_field, _parse_date(body[date_field]))

    if "role" in body:
        old_role = profile.role
        profile.role = body["role"]
        profile.user.is_staff = body["role"] == "admin"
        profile.user.save()
        # Grant CourseCreator when promoting to instructor
        if body["role"] == "instructor" and old_role != "instructor":
            _grant_course_creator(profile.user)

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
    password = body.get("password") or User.objects.make_random_password()

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
        )

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
    รายการ course ที่ผู้ใช้เป็น instructor
    โดยดึงจาก Open edX CourseInstructorRole (ผ่าน student API)
    """
    # ใช้ Open edX built-in API
    import urllib.request as urlreq
    lms_url = "http://localhost:8000"  # internal LMS URL
    api_url = f"{lms_url}/api/courses/v1/courses/?username={request.user.username}&role=staff"

    try:
        headers = {"Cookie": request.META.get("HTTP_COOKIE", "")}
        req = urlreq.Request(api_url, headers=headers)
        with urlreq.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        return JsonResponse(data)
    except Exception as exc:
        # Fallback: ส่งแค่ error message (ใช้ mock ใน frontend)
        return JsonResponse({"error": str(exc), "results": [], "count": 0}, status=200)


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
