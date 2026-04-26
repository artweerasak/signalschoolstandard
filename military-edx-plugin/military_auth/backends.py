"""
backends.py — Custom authentication backend for military eLearning system.

Username : เลขบัตรประชาชน 13 หลัก (National ID)
Password : เลขทหาร 10 หลัก (Military ID)
"""
import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

from .validators import validate_military_id, validate_national_id

User = get_user_model()
log = logging.getLogger(__name__)


class MilitaryAuthBackend(ModelBackend):
    """
    Authenticate users by Thai National ID (username) and 10-digit
    military number (password).  Falls back gracefully so that the
    standard edX admin / staff accounts still work through the default
    backend.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        # OpenEdX login_ajax calls authenticate(username=user.username, password=...)
        # after looking up the user by email/username.  When no Django User is found
        # (national_id is not stored as email/username), it passes username="" — so we
        # fall back to reading the raw POST field that the frontend submitted.
        if request and hasattr(request, "POST"):
            raw = (
                request.POST.get("email")
                or request.POST.get("email_or_username")
                or username
                or ""
            )
        else:
            raw = username or ""

        if not raw or not password:
            return None

        national_id = raw.strip()
        military_id = password.strip()

        if not validate_national_id(national_id):
            log.debug("MilitaryAuthBackend: invalid national_id format, skipping.")
            return None

        # Note: we no longer pre-validate military_id format here because
        # users may have set a custom password that isn't 10 digits.

        try:
            # MilitaryUserProfile stores national_id mapped to a User.
            from military_profile.models import MilitaryUserProfile

            profile = MilitaryUserProfile.objects.select_related("user").get(
                national_id_hmac=MilitaryUserProfile.hmac_value(national_id)
            )
            user = profile.user

            # Verify password: custom hash takes priority, falls back to military_id.
            if profile.custom_password_hash:
                # User has set a custom password — verify against bcrypt hash.
                if not profile.check_custom_password(military_id):
                    log.warning(
                        "MilitaryAuthBackend: wrong custom password for national_id=%s",
                        national_id[:4] + "XXXXXXXXX",
                    )
                    return None
            else:
                # Default: password must be the 10-digit military ID.
                if not validate_military_id(military_id):
                    log.debug("MilitaryAuthBackend: password not military_id format, skipping.")
                    return None
                if not profile.check_military_id(military_id):
                    log.warning(
                        "MilitaryAuthBackend: wrong military_id for national_id=%s",
                        national_id[:4] + "XXXXXXXXX",
                    )
                    return None

            if not self.user_can_authenticate(user):
                return None

            return user

        except MilitaryUserProfile.DoesNotExist:
            log.debug("MilitaryAuthBackend: no profile for given national_id.")
            return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
