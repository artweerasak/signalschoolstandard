"""
certificate_expiry/signals.py

Hook into Open edX certificate generation signals to auto-create
UserCertificateExpiry records when a certificate is issued.
"""
import logging
from datetime import date
from dateutil.relativedelta import relativedelta

from django.dispatch import receiver

log = logging.getLogger(__name__)

# edX signal — emitted when a certificate is generated.
# Import path may differ slightly by edX version.
try:
    from lms.djangoapps.certificates.signals import CERTIFICATE_CREATED
except ImportError:
    CERTIFICATE_CREATED = None


def connect_signals():
    """Call this from AppConfig.ready() to connect signals safely."""
    if CERTIFICATE_CREATED is not None:
        CERTIFICATE_CREATED.connect(_on_certificate_created)
        log.info("certificate_expiry: connected to CERTIFICATE_CREATED signal.")


def _on_certificate_created(sender, user, course_key, **kwargs):
    """Create or update a UserCertificateExpiry record."""
    from .models import CourseCertificateConfig, UserCertificateExpiry

    course_id = str(course_key)

    try:
        config = CourseCertificateConfig.objects.get(course_id=course_id)
        validity_years = config.validity_years
    except CourseCertificateConfig.DoesNotExist:
        validity_years = 3  # default

    issued = date.today()
    expiry = issued + relativedelta(years=validity_years)

    obj, created = UserCertificateExpiry.objects.update_or_create(
        user=user,
        course_id=course_id,
        defaults={
            "issued_date": issued,
            "expiry_date": expiry,
            "status": UserCertificateExpiry.STATUS_ACTIVE,
        },
    )

    action = "created" if created else "updated"
    log.info(
        "certificate_expiry: %s expiry record for user=%s course=%s expiry=%s",
        action, user.id, course_id, expiry,
    )
