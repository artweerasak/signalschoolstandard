"""
test_urls.py — Minimal URL conf for Docker test server.
Placed in /app/ by Dockerfile.
"""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("military/", include("plugin_urls")),
    # Redirect root and /accounts/profile/ to reports page after login
    path("", RedirectView.as_view(url="/military/reports/", permanent=False)),
    path("accounts/profile/", RedirectView.as_view(url="/military/reports/", permanent=False)),
]
