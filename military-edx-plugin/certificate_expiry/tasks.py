"""
certificate_expiry/tasks.py

Celery tasks:
  - daily_expiry_check : marks expired certs and queues notifications
"""
import logging
from datetime import date

from celery import shared_task
from django.utils import timezone

log = logging.getLogger(__name__)

# Thresholds (days before expiry) at which notifications are sent.
NOTIFICATION_THRESHOLDS = [90, 30, 7, 1]


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def daily_expiry_check(self):
    """
    Run daily (via Celery Beat) to:
    1. Mark certificates that have passed their expiry_date as 'expired'.
    2. Trigger notifications for certificates nearing expiry.
    """
    from .models import UserCertificateExpiry
    from expiry_notifications.tasks import send_expiry_notification

    today = date.today()

    # Mark newly expired records.
    newly_expired = UserCertificateExpiry.objects.filter(
        expiry_date__lt=today,
        status=UserCertificateExpiry.STATUS_ACTIVE,
    )
    count_expired = newly_expired.update(status=UserCertificateExpiry.STATUS_EXPIRED)
    log.info("daily_expiry_check: marked %d certificates as expired.", count_expired)

    # Send threshold notifications.
    for days in NOTIFICATION_THRESHOLDS:
        from datetime import timedelta
        target_date = today + timedelta(days=days)
        records = UserCertificateExpiry.objects.filter(
            expiry_date=target_date,
            status=UserCertificateExpiry.STATUS_ACTIVE,
        )
        for record in records:
            send_expiry_notification.delay(
                user_id=record.user_id,
                course_id=record.course_id,
                days_remaining=days,
            )
            log.info(
                "daily_expiry_check: queued %d-day notification for user=%s course=%s",
                days, record.user_id, record.course_id,
            )
