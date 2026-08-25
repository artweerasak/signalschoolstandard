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
# หมายเหตุ: ในเวอร์ชันนี้ lms.djangoapps.certificates.signals ไม่มี CERTIFICATE_CREATED
# แล้ว (ย้ายไปเป็น openedx_events แบบ .send_event() ซึ่ง signature ไม่ตรงกับ handler
# ด้านล่าง) — ใช้ COURSE_CERT_AWARDED แทน ซึ่งเป็น Django Signal ธรรมดาที่ยังยิงด้วย
# user=/course_key= ตรงกับ handler นี้พอดี (ดู GeneratedCertificate.mark_notpassing/
# _update_certificate ใน lms/djangoapps/certificates/models.py ที่เรียก
# COURSE_CERT_AWARDED.send_robust(...) เฉพาะตอนสถานะเป็น passing เท่านั้น)
try:
    from openedx.core.djangoapps.signals.signals import COURSE_CERT_AWARDED as CERTIFICATE_CREATED
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

    # ถ้าหลักสูตรนี้ใช้ระบบ "รอบอนุมัติใบประกาศ" (CertificateApprovalBatch) ให้ยึด
    # วันที่อนุมัติของรอบ (approve_date) เป็น issued_date เสมอ ไม่ใช่วันที่ signal
    # นี้ทำงานจริง (ซึ่งอาจเหลื่อมกันหลักวินาที/นาทีต่อคนเพราะประมวลผลผ่าน celery)
    # เพื่อให้กำลังพลทุกคนในรอบเดียวกันมีวันหมดอายุตรงกันตามที่ผู้ดูแลระบบตั้งใจไว้
    issued = date.today()
    try:
        from military_profile.models import CertificatePendingApproval
        pending = (
            CertificatePendingApproval.objects
            .filter(user=user, batch__course_id=course_id, status='approved')
            .select_related('batch')
            .order_by('-batch__approve_date')
            .first()
        )
        if pending:
            issued = pending.batch.approve_date
    except Exception:
        log.exception("certificate_expiry: could not resolve approval batch date for user=%s course=%s",
                      user.id, course_id)

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
