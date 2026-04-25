"""
docker/settings_docker.py — Django settings for Docker test environment.

Uses PostgreSQL + Redis (from docker-compose service names).
"""
import os

SECRET_KEY = "docker-test-secret-key-not-for-production"
DEBUG = True
ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "military_test"),
        "USER": os.environ.get("DB_USER", "military"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "military"),
        "HOST": os.environ.get("DB_HOST", "db"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": f"redis://{os.environ.get('REDIS_HOST', 'redis')}:6379/1",
    }
}

CELERY_BROKER_URL = f"redis://{os.environ.get('REDIS_HOST', 'redis')}:6379/0"
CELERY_RESULT_BACKEND = CELERY_BROKER_URL

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Military plugin apps
    "military_auth",
    "military_profile",
    "certificate_expiry",
    "certificate_renewal",
    "military_reports",
    "expiry_notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "military_auth.middleware.LoginRateLimitMiddleware",
    "military_auth.middleware.AuditLogMiddleware",
]

AUTHENTICATION_BACKENDS = [
    "military_auth.backends.MilitaryAuthBackend",
    "django.contrib.auth.backends.ModelBackend",
]

ROOT_URLCONF = "test_urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"

# AES-256 key — test-only, 32 bytes base64
MILITARY_ENCRYPTION_KEY = os.environ.get(
    "MILITARY_ENCRYPTION_KEY",
    "dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleT0=",
)

MILITARY_HR_EMAILS = os.environ.get("MILITARY_HR_EMAILS", "hr@test.mil.th").split(",")

# Rate limiting (low for tests)
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5
LOGIN_RATE_LIMIT_WINDOW_SECONDS = 300
AUDIT_LOG_PATHS = ["/admin/", "/military/"]

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
