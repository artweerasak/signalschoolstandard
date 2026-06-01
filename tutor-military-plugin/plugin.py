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
    "military_auth.middleware.ApiRateLimitMiddleware",
]

# ── Performance: DB Connection Pooling ──────────────────────────
# CONN_MAX_AGE=0 (default) เปิด connection ใหม่ทุก request → ช้า
# ตั้งเป็น 60 วินาที ลด latency ได้มาก
DATABASES['default']['CONN_MAX_AGE'] = 60
DATABASES['default']['CONN_HEALTH_CHECKS'] = True

MILITARY_ENCRYPTION_KEY = "{{ MILITARY_ENCRYPTION_KEY }}"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "None"
SESSION_COOKIE_DOMAIN = ".rta.mi.th"
CSRF_COOKIE_DOMAIN = ".rta.mi.th"
# SHARED_COOKIE_DOMAIN drives JWT cookie domain (set by derive_settings() from SESSION_COOKIE_DOMAIN
# in lms/envs/production.py BEFORE tutor/production.py overrides SESSION_COOKIE_DOMAIN, so we must
# also override SHARED_COOKIE_DOMAIN explicitly here)
SHARED_COOKIE_DOMAIN = ".rta.mi.th"
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

# ── CSRF / CORS — HTTPS เท่านั้น สำหรับ production ────────────────
# ลบ: HTTP origins (ไม่ปลอดภัย), ngrok URL (ใช้เฉพาะ dev เท่านั้น)
CSRF_TRUSTED_ORIGINS = [
    "https://signalstandard.rta.mi.th",
    "https://www.signalstandard.rta.mi.th",
    "https://apps-signalstandard.rta.mi.th",
    "https://studio-signalstandard.rta.mi.th",
    "https://meilisearch-signalstandard.rta.mi.th",
]
CORS_ORIGIN_WHITELIST = [
    "https://signalstandard.rta.mi.th",
    "https://www.signalstandard.rta.mi.th",
    "https://apps-signalstandard.rta.mi.th",
    "https://studio-signalstandard.rta.mi.th",
    "https://meilisearch-signalstandard.rta.mi.th",
]
CORS_ALLOW_CREDENTIALS = True

# Video storage settings
MILITARY_VIDEO_DIR = "/openedx/media/videos"
MILITARY_VIDEO_BASE_URL = "/media/videos"
DATA_UPLOAD_MAX_MEMORY_SIZE = None        # ไม่จำกัด — จัดการโดย Caddy
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024  # 50MB temp buffer
FILE_UPLOAD_HANDLERS = [
    "django.core.files.uploadhandler.TemporaryFileUploadHandler",  # เขียน disk ทันที ไม่ค้าง RAM
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
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "None"
SESSION_COOKIE_DOMAIN = ".rta.mi.th"
CSRF_COOKIE_DOMAIN = ".rta.mi.th"
SHARED_COOKIE_DOMAIN = ".rta.mi.th"
MEILISEARCH_PUBLIC_URL = "https://meilisearch-signalstandard.rta.mi.th"
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
    (
        "cms",
        "python3 /mnt/military-edx-plugin/patch_cms_asset_handler.py",
    ),
])

########################################################################
# MILITARY_PATCH: Meilisearch domain fix                              #
# Use meilisearch-signalstandard.rta.mi.th (dash) — same DNS level   #
# as studio-signalstandard and apps-signalstandard                    #
########################################################################
hooks.Filters.ENV_PATCHES.add_items([
    (
        'openedx-lms-production-settings',
        '''
# ── Fix Meilisearch public URL (DNS level constraint — use dash not dot) ──
MEILISEARCH_PUBLIC_URL = "https://meilisearch-signalstandard.rta.mi.th"
''',
    ),
])

########################################################################
# MILITARY_PATCH: Caddy wildcard TLS cert configuration               #
# Use DigiCert wildcard cert *.rta.mi.th stored in /data/certs/       #
# Certificate valid until 2026-11-15                                  #
########################################################################
hooks.Filters.ENV_PATCHES.add_items([
    # Add TLS snippet using wildcard cert to Caddyfile global section
    (
        "caddyfile-global",
        """
# ── Wildcard TLS snippet *.rta.mi.th (DigiCert, expires 2026-11-15) ─
# The cert file is manually placed at /data/caddy/certs/signalstandard.crt
""",
    ),
    # Inject LMS-site routing: explicit path handlers so catch-all goes to Next.js
    # NOTE: Template must have {{ patch("caddyfile-lms") }} BEFORE import proxy "lms:8000"
    (
        "caddyfile-lms",
        """
# ── Video upload (body size ใหญ่ — timeout จัดการที่ uWSGI) ──────────────
# ใช้ plain reverse_proxy (ไม่ import proxy snippet ที่มี log) เพื่อให้ valid ใน handle
handle /military/api/v1/videos/upload/ {
    request_body {
        max_size 10GB
    }
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /login_refresh {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /login_ajax {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /military/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /user_api/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /asset-v1:* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /theming/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /courses/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /preview/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /oauth2/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /static/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /xblock/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /admin/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /csrf/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /logout {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /auth/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /api/* {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /admin {
    reverse_proxy lms:8000 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}

# ── MFE paths (embedded in main domain) ───────────────────────────────────
handle /learner-dashboard* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /course-authoring* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /discussions* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /authoring* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /gradebook* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /learning* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /account* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}
handle /profile* {
    reverse_proxy mfe:8002 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}

# ── Video files ────────────────────────────────────────────────────────────
handle /media/videos/* {
    reverse_proxy nginx-videos:80 {
        header_up X-Forwarded-Port 443
        header_up X-Forwarded-Proto https
    }
}

# ── Root path → Next.js (เจาะจง / เพราะ base template handle_path /* ดัก root) ──
handle / {
    encode gzip
    reverse_proxy 172.18.0.1:3000 {
        header_up X-Forwarded-Port 443
    }
}

# ── Catch-all → Military Next.js frontend ─────────────────────────────────
handle {
    encode gzip
    reverse_proxy 172.18.0.1:3000 {
        header_up X-Forwarded-Port 443
    }
}

tls /data/certs/signalstandard.crt /data/certs/signalstandard.key
""",
    ),
    # Inject tls directive into CMS (Studio) site block
    (
        "caddyfile-cms",
        "tls /data/certs/signalstandard.crt /data/certs/signalstandard.key",
    ),
])

########################################################################
# MILITARY_PATCH: Meilisearch Caddy block                             #
########################################################################
hooks.Filters.ENV_PATCHES.add_items([
    (
        "caddyfile",
        """
meilisearch-signalstandard.rta.mi.th {
    tls /data/certs/signalstandard.crt /data/certs/signalstandard.key
    import proxy "meilisearch:7700"
}
""",
    ),
])
########################################################################
# MILITARY_PATCH: MFE config - Meilisearch public URL                 #
# MEILISEARCH_PUBLIC_URL was missing from MFE_CONFIG causing           #
# learner-dashboard MFE to crash with 'An unexpected error occurred'  #
########################################################################
hooks.Filters.ENV_PATCHES.add_items([
    (
        'openedx-lms-production-settings',
        '''
# Expose Meilisearch settings to all MFEs
MFE_CONFIG["MEILISEARCH_PUBLIC_URL"] = MEILISEARCH_PUBLIC_URL
MFE_CONFIG["MEILISEARCH_INDEX_PREFIX"] = MEILISEARCH_INDEX_PREFIX
MFE_CONFIG["MEILISEARCH_API_KEY"] = MEILISEARCH_API_KEY
MFE_CONFIG["ENABLE_HOME_PAGE_COURSE_API_V2"] = False
''',
    ),
])

########################################################################
# MILITARY_PATCH: เปิดใช้งาน PDF Viewer XBlock ใน LMS และ CMS        #
########################################################################
hooks.Filters.ENV_PATCHES.add_items([
    (
        "openedx-lms-common-settings",
        """
# ── Military PDF Viewer XBlock ────────────────────────────────────
XBLOCK_SETTINGS.setdefault("military-pdf-viewer", {})
""",
    ),
    (
        "openedx-cms-common-settings",
        """
# ── Military PDF Viewer XBlock ────────────────────────────────────
XBLOCK_SETTINGS.setdefault("military-pdf-viewer", {})
""",
    ),
])

########################################################################
# MILITARY_PATCH: Performance — เพิ่ม uWSGI workers LMS/CMS          #
# Server: 4 CPU cores, 16GB RAM — optimal workers = 6                 #
########################################################################
hooks.Filters.CONFIG_DEFAULTS.add_items([
    ("OPENEDX_LMS_UWSGI_WORKERS", 6),
    ("OPENEDX_CMS_UWSGI_WORKERS", 6),
])

########################################################################
# MILITARY_PATCH: uWSGI performance + video upload tuning             #
# Root cause: [uwsgi-body-read] Timeout — uWSGI body buffer timeout   #
# Fix: http-timeout + socket-timeout = 3600s สำหรับ upload ไฟล์ใหญ่  #
########################################################################
hooks.Filters.ENV_PATCHES.add_items([
    (
        "uwsgi-config",
        """
harakiri = 3600
max-requests = 1000
listen = 512
buffer-size = 32768
http-timeout = 3600
socket-timeout = 3600
""",
    ),
])
