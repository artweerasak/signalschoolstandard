# tutor-military-plugin/plugin.py
#
# Tutor plugin ที่ patch Open edX LMS/CMS settings เพื่อเปิดใช้งาน
# ระบบ eLearning สำหรับองค์กรทหาร
#
# การใช้งาน:
#   pip3 install "tutor[full]" --break-system-packages
#   tutor config save
#   pip3 install -e ./tutor-military-plugin --break-system-packages
#   tutor plugins enable military
#   tutor mounts add /absolute/path/to/military-edx-plugin
#   MILITARY_KEY=$(python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())")
#   tutor config save --set MILITARY_ENCRYPTION_KEY="${MILITARY_KEY}"
#   tutor images build openedx
#   tutor local launch

import re
from tutor import hooks

########################################################################
# 1. Dockerfile patches — ติดตั้ง dependencies เข้า LMS/CMS container #
########################################################################

hooks.Filters.ENV_PATCHES.add_items([
    # ติดตั้ง Python packages เพิ่มเติม (หลัง edX requirements)
    # military-edx-plugin เองถูก mount ผ่าน `tutor mounts add` และถูก pip install
    # โดย Tutor Dockerfile template อัตโนมัติ (ผ่าน MOUNTED_DIRECTORIES)
    (
        "openedx-dockerfile-post-python-requirements",
        """
# ── Military eLearning Plugin — additional Python dependencies ─────
# (military-edx-plugin package itself is installed via tutor mounts)
RUN pip install --no-cache-dir \\
    cryptography>=41.0 \\
    openpyxl>=3.1 \\
    WeasyPrint>=60.0 \\
    python-dateutil>=2.8 \\
    openedx-authz>=1.0.0
""",
    ),

    # LMS Django Settings
    (
        "openedx-lms-common-settings",
        """
# ── Military eLearning Plugin ──────────────────────────────────────
INSTALLED_APPS += [
    "military_auth",
    "military_profile",
    "certificate_expiry",
    "certificate_renewal",
    "military_reports",
    "expiry_notifications",
]

AUTHENTICATION_BACKENDS = [
    "military_auth.backends.MilitaryAuthBackend",
    "django.contrib.auth.backends.ModelBackend",
]

MIDDLEWARE += [
    "military_auth.middleware.LoginRateLimitMiddleware",
    "military_auth.middleware.AuditLogMiddleware",
]

MILITARY_ENCRYPTION_KEY = "{{ MILITARY_ENCRYPTION_KEY }}"
MILITARY_HR_EMAILS = {{ MILITARY_HR_EMAILS | tojson }}
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = {{ LOGIN_RATE_LIMIT_MAX_ATTEMPTS }}
LOGIN_RATE_LIMIT_WINDOW_SECONDS = {{ LOGIN_RATE_LIMIT_WINDOW_SECONDS }}
AUDIT_LOG_PATHS = ["/login", "/military/", "/admin/"]

# ── Add military plugin root to sys.path so plugin_urls & military_custom_urls are importable ──
import sys as _sys
_military_plugin_path = "/mnt/military-edx-plugin"
if _military_plugin_path not in _sys.path:
    _sys.path.insert(0, _military_plugin_path)

# ── Add military plugin templates dir to Django TEMPLATES DIRS ────
for _tpl in TEMPLATES:
    if _tpl.get("BACKEND") == "django.template.backends.django.DjangoTemplates":
        _tpl.setdefault("DIRS", [])
        _military_tpl_dir = "/mnt/military-edx-plugin/templates"
        if _military_tpl_dir not in _tpl["DIRS"]:
            _tpl["DIRS"].insert(0, _military_tpl_dir)
        break

# ── Custom ROOT_URLCONF (inject military URLs without image rebuild) ──
ROOT_URLCONF = "military_custom_urls"

# ── Disable authn MFE redirect (ใช้ standard LMS login แทน MFE) ──
FEATURES['ENABLE_AUTHN_MICROFRONTEND'] = False

# ── Thai Language & Timezone ──────────────────────────────────────
LANGUAGE_CODE = "th"
TIME_ZONE = "Asia/Bangkok"
USE_I18N = True
USE_L10N = True
USE_TZ = True
ALL_LANGUAGES = ALL_LANGUAGES  # keep existing list
LANGUAGE_DICT = dict(ALL_LANGUAGES)

# ── CSRF / CORS for ngrok & custom domains ────────────────────────
CSRF_TRUSTED_ORIGINS = [
    "https://dill-sixth-scouting.ngrok-free.dev",
    "http://dill-sixth-scouting.ngrok-free.dev",
    "https://www.signalstandard.rta.mi.th",
    "http://www.signalstandard.rta.mi.th",
]
CORS_ORIGIN_WHITELIST = [
    "https://dill-sixth-scouting.ngrok-free.dev",
    "http://dill-sixth-scouting.ngrok-free.dev",
    "https://www.signalstandard.rta.mi.th",
    "http://www.signalstandard.rta.mi.th",
]

from celery.schedules import crontab
CELERYBEAT_SCHEDULE.update({
    "military-daily-expiry-check": {
        "task": "certificate_expiry.tasks.daily_expiry_check",
        "schedule": crontab(hour=6, minute=0),
    },
    "military-weekly-hr-summary": {
        "task": "expiry_notifications.tasks.weekly_hr_summary",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),
    },
})
""",
    ),

    # CMS Settings
    (
        "openedx-cms-common-settings",
        """
# ── Military eLearning Plugin (CMS) ──────────────────────────────
INSTALLED_APPS += [
    "certificate_expiry",
    "military_profile",
]
MILITARY_ENCRYPTION_KEY = "{{ MILITARY_ENCRYPTION_KEY }}"
""",
    ),

    # URL patch ถูกแทนที่ด้วย ROOT_URLCONF = "military_custom_urls" ใน settings
    # (lms-urls patch ต้องการ image rebuild จึงไม่ใช้)
])

########################################################################
# 2. Tutor Native Mount — ลงทะเบียน military-edx-plugin              #
#    ผู้ใช้รัน: tutor mounts add /absolute/path/to/military-edx-plugin #
########################################################################

@hooks.Filters.MOUNTED_DIRECTORIES.add()
def _register_military_plugin_mount(
    image_mounts: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    """Register military-edx-plugin for tutor mounts."""
    image_mounts.append(("openedx", "military-edx-plugin"))
    return image_mounts


@hooks.Filters.COMPOSE_MOUNTS.add()
def _register_military_compose_mount(
    volumes: list[tuple[str, str]], folder_name: str
) -> list[tuple[str, str]]:
    """Mount military-edx-plugin into relevant services at runtime."""
    if re.match(r"military-edx-plugin", folder_name):
        for service in ("lms", "cms", "lms-worker", "cms-worker"):
            volumes.append((service, f"/mnt/{folder_name}"))
    return list(set(volumes))


########################################################################
# 3. Tutor config variables                                           #
########################################################################

hooks.Filters.CONFIG_DEFAULTS.add_items([
    ("MILITARY_ENCRYPTION_KEY", "CHANGE_ME_32_byte_base64_encoded_key_here_=="),
    ("MILITARY_HR_EMAILS", ["hr@yourorg.mil.th"]),
    ("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 5),
    ("LOGIN_RATE_LIMIT_WINDOW_SECONDS", 300),
    ("MILITARY_CERT_DEFAULT_VALIDITY_YEARS", 3),
])

hooks.Filters.CONFIG_UNIQUE.add_items([
    ("MILITARY_ENCRYPTION_KEY", True),
])

########################################################################
# 4. Post-init: migrations + seed                                     #
########################################################################

hooks.Filters.CLI_DO_INIT_TASKS.add_items([
    (
        "lms",
        "python manage.py migrate --run-syncdb --no-input && "
        "python manage.py seed_demo_data",
    ),
])
