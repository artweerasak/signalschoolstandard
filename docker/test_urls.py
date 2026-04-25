"""
test_urls.py — Minimal URL conf for Docker test server.
Placed in /app/ by Dockerfile.
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("military/", include("plugin_urls")),
]
