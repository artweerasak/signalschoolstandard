"""
military_auth/middleware.py

Two middleware components:
  1. LoginRateLimitMiddleware  — blocks brute-force login attempts
  2. AuditLogMiddleware        — logs sensitive actions to AuditLog model
"""
import hashlib
import logging
import time

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseForbidden

log = logging.getLogger(__name__)

# ── Login Rate Limiting ────────────────────────────────────────────────────────

MAX_ATTEMPTS = getattr(settings, "LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 5)
WINDOW_SECONDS = getattr(settings, "LOGIN_RATE_LIMIT_WINDOW_SECONDS", 300)  # 5 min


class LoginRateLimitMiddleware:
    """
    Blocks excessive POST requests to the login endpoint.
    Uses Django cache (Redis in production) for distributed counting.
    """

    LOGIN_URL = "/login"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "POST" and request.path.startswith(self.LOGIN_URL):
            ip = self._get_client_ip(request)
            cache_key = f"login_attempts:{hashlib.sha256(ip.encode()).hexdigest()}"

            attempts = cache.get(cache_key, 0)
            if attempts >= MAX_ATTEMPTS:
                log.warning("LoginRateLimit: blocked IP %s after %d attempts", ip, attempts)
                return HttpResponseForbidden(
                    "มีการพยายาม Login มากเกินไป กรุณารอ 5 นาทีแล้วลองใหม่"
                )

            response = self.get_response(request)

            # Increment counter only on failed login (no session created)
            if response.status_code in (200, 302) and not request.user.is_authenticated:
                cache.set(cache_key, attempts + 1, timeout=WINDOW_SECONDS)

            # Clear counter on successful login
            if request.user.is_authenticated:
                cache.delete(cache_key)

            return response

        return self.get_response(request)

    @staticmethod
    def _get_client_ip(request) -> str:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")


# ── Audit Logging ──────────────────────────────────────────────────────────────

AUDITED_PATHS = getattr(settings, "AUDIT_LOG_PATHS", [
    "/login",
    "/military/reports/",
    "/military/renewal/",
    "/admin/",
])


class AuditLogMiddleware:
    """
    Records sensitive HTTP actions to the AuditLog model.
    Only logs authenticated requests to AUDITED_PATHS.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if request.user.is_authenticated and self._should_audit(request):
            self._write_log(request, response)

        return response

    def _should_audit(self, request) -> bool:
        return any(request.path.startswith(p) for p in AUDITED_PATHS)

    def _write_log(self, request, response):
        try:
            from .models import AuditLog
            AuditLog.objects.create(
                user=request.user,
                method=request.method,
                path=request.path[:500],
                status_code=response.status_code,
                ip_address=LoginRateLimitMiddleware._get_client_ip(request),
            )
        except Exception as exc:
            log.error("AuditLogMiddleware: failed to write log — %s", exc)


# ── Username → Email Login Resolver ───────────────────────────────────────────

class UsernameLoginMiddleware:
    LOGIN_AJAX_URL = "/login_ajax"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "POST" and request.path.startswith(self.LOGIN_AJAX_URL):
            request = self._resolve_username_to_email(request)
        return self.get_response(request)

    @staticmethod
    def _resolve_username_to_email(request):
        """If POST email has no @, look up by username and inject real email."""
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            submitted = request.POST.get("email", "").strip()
            if submitted and "@" not in submitted:
                user = User.objects.filter(username=submitted).first()
                if user and user.email:
                    mutable = request.POST.copy()
                    mutable["email"] = user.email
                    request.POST = mutable
                    log.debug("UsernameLoginMiddleware: resolved %s -> %s", submitted, user.email)
        except Exception as exc:
            log.error("UsernameLoginMiddleware error: %s", exc)
        return request
