"""
plugin_urls.py — Master URL config for the military eLearning plugin.

Add to Open edX LMS urlconf via Tutor plugin patch:

    # In your Tutor plugin:
    hooks.Filters.ENV_PATCHES.add_item((
        "lms-urls",
        "path('military/', include('plugin_urls')),",
    ))
"""
from django.urls import include, path

urlpatterns = [
    path("", include("certificate_renewal.urls")),
    path("", include("military_reports.urls")),
    path("", include("military_profile.urls")),
]
