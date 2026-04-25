"""
conftest.py — Configure minimal Django settings for standalone tests.

- Local dev (no DJANGO_SETTINGS_MODULE): configures SQLite in-memory.
- Docker (DJANGO_SETTINGS_MODULE=settings_docker): skips self-configuration;
  pytest-django picks up the module automatically.
"""
import os

import django
from django.conf import settings


def pytest_configure(config):
    # In Docker, DJANGO_SETTINGS_MODULE is already set — let pytest-django handle it.
    if os.environ.get("DJANGO_SETTINGS_MODULE"):
        return

    if not settings.configured:
        settings.configure(
            DATABASES={
                "default": {
                    "ENGINE": "django.db.backends.sqlite3",
                    "NAME": ":memory:",
                }
            },
            INSTALLED_APPS=[
                "django.contrib.contenttypes",
                "django.contrib.auth",
                "military_auth",
                "military_profile",
                "certificate_expiry",
                "military_reports",
                "expiry_notifications",
            ],
            USE_TZ=True,
            DEFAULT_AUTO_FIELD="django.db.models.BigAutoField",
            # Dummy 32-byte key (base64) for encryption tests
            MILITARY_ENCRYPTION_KEY="dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleT0=",
            MILITARY_HR_EMAILS=["hr@test.mil.th"],
            CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
        )
        django.setup()
