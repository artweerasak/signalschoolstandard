"""
military_profile/thaid_views.py

ThaID (OpenID Connect) — endpoint ฝั่ง Open edX
รับ assertion ที่เซ็นแล้วจาก Next.js callback (หลังยืนยันตัวตนกับ ThaID สำเร็จ)
แล้ว:
  • thaid_complete : ถ้าเลขบัตร (PID) มีในระบบ → สร้าง edx session (login ไม่ใช้รหัสผ่าน)
                     ถ้าไม่มี → พาไปหน้าสมัคร โดยส่ง assertion ใหม่ให้ prefill
  • thaid_prefill  : คืนข้อมูลที่ ThaID ยืนยันแล้ว ให้หน้าสมัครเติมและ "ล็อก" เลขบัตร

assertion = compact token HS256 (รูปแบบเดียวกับ lib/thaid.ts ฝั่ง Next.js)
secret ใช้ร่วมกันผ่าน settings.MILITARY_THAID_ASSERTION_SECRET
"""
import base64
import hashlib
import hmac
import json
import time
import uuid

from django.conf import settings
from django.contrib.auth import login as auth_login
from django.core.cache import cache
from django.http import JsonResponse, HttpResponseRedirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import MilitaryUserProfile

_AUTH_BACKEND = "military_auth.backends.MilitaryAuthBackend"


# ── HS256 compact token (เข้ากันได้กับ signAssertion/verifyAssertion ใน lib/thaid.ts) ──
def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _secret() -> str:
    return getattr(settings, "MILITARY_THAID_ASSERTION_SECRET", "") or ""


def sign_assertion(payload: dict, ttl: int = 600) -> str:
    now = int(time.time())
    body = {"iat": now, "exp": now + ttl, "jti": str(uuid.uuid4()), **payload}
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    pl = _b64url(json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = _b64url(hmac.new(_secret().encode(), f"{header}.{pl}".encode(), hashlib.sha256).digest())
    return f"{header}.{pl}.{sig}"


def verify_assertion(token: str):
    secret = _secret()
    if not secret or not token:
        return None
    try:
        header, pl, sig = token.split(".")
    except ValueError:
        return None
    expected = _b64url(hmac.new(secret.encode(), f"{header}.{pl}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        body = json.loads(_b64url_decode(pl))
    except Exception:
        return None
    if int(time.time()) > int(body.get("exp", 0)):
        return None
    if body.get("src") != "thaid":
        return None
    return body


def _consume_jti(jti: str) -> bool:
    """คืน True ถ้าใช้ได้ (ยังไม่เคยใช้); ป้องกัน replay ของ assertion เดิม"""
    if not jti:
        return False
    key = f"thaid_jti:{jti}"
    # cache.add คืน False ถ้ามี key อยู่แล้ว (เคยใช้ไปแล้ว)
    return cache.add(key, 1, timeout=180)


def _prefill_payload(data: dict) -> dict:
    return {
        "pid": data.get("pid", ""),
        "name": data.get("name", ""),
        "given_name": data.get("given_name", ""),
        "family_name": data.get("family_name", ""),
        "prefix": data.get("prefix", ""),
        "gender": data.get("gender", ""),
        "birthdate": data.get("birthdate", ""),
        "address": data.get("address", ""),
    }


# ── Endpoints ────────────────────────────────────────────────────────────────
@csrf_exempt
@require_GET
def api_thaid_complete(request):
    """
    GET /military/api/v1/auth/thaid-complete/?a=<assertion>
    มี PID ในระบบ → login แล้ว redirect /my ; ไม่มี → redirect /register?thaid=...
    """
    data = verify_assertion(request.GET.get("a", ""))
    if not data:
        return HttpResponseRedirect("/login?error=thaid_invalid")

    if not _consume_jti(str(data.get("jti", ""))):
        return HttpResponseRedirect("/login?error=thaid_replay")

    pid = str(data.get("pid", "")).strip()
    if not (pid.isdigit() and len(pid) == 13):
        return HttpResponseRedirect("/login?error=thaid_no_pid")

    profile = MilitaryUserProfile.objects.filter(
        national_id_hmac=MilitaryUserProfile.hmac_value(pid)
    ).select_related("user").first()

    if profile and profile.user:
        user = profile.user
        if not user.is_active:
            return HttpResponseRedirect("/login?error=account_inactive")
        # login โดยไม่ใช้รหัสผ่าน — ตัวตนถูกยืนยันแล้วโดย ThaID
        auth_login(request, user, backend=_AUTH_BACKEND)
        return HttpResponseRedirect("/my")

    # Pre-whitelist: ถ้าเปิดบังคับ และเลขบัตรไม่อยู่ในรายชื่อ → ไม่ให้ไปหน้าสมัคร
    from military_auth.models import RegistrationConfig, RegistrationWhitelist
    if RegistrationConfig.get_solo().whitelist_enabled:
        _h = MilitaryUserProfile.hmac_value(pid)
        if not RegistrationWhitelist.objects.filter(national_id_hmac=_h, is_active=True).exists():
            return HttpResponseRedirect("/login?error=not_authorized")

    # ยังไม่มีบัญชี → ออก assertion ใหม่ (อายุ 10 นาที) ให้หน้าสมัคร prefill
    fresh = sign_assertion({**_prefill_payload(data), "src": "thaid"}, ttl=600)
    return HttpResponseRedirect(f"/register?thaid={fresh}")


@csrf_exempt
@require_POST
def api_thaid_prefill(request):
    """
    POST /military/api/v1/auth/thaid-prefill/  body: {"assertion": "..."}
    คืนข้อมูลที่ ThaID ยืนยันแล้ว สำหรับเติมในฟอร์มสมัคร (เลขบัตรจะถูกล็อก)
    ไม่ consume jti — ฟอร์มอาจโหลดซ้ำได้ภายในอายุ assertion
    """
    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid_json"}, status=400)

    data = verify_assertion(str(body.get("assertion", "")))
    if not data:
        return JsonResponse({"error": "invalid_or_expired"}, status=400)

    out = _prefill_payload(data)
    out["verified"] = True
    return JsonResponse(out)
