"""
expiry_notifications/tasks.py

Celery tasks for sending certificate expiry notifications.
"""
import logging

from celery import shared_task

log = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_expiry_notification(self, user_id: int, course_id: str, days_remaining: int):
    """Send expiry notification to learner and relevant HR/Admin."""
    from django.contrib.auth import get_user_model
    from .channels.email import send_learner_expiry_email, send_hr_expiry_email
    from .channels.platform import send_platform_notification

    User = get_user_model()
    try:
        user = User.objects.select_related("military_profile").get(pk=user_id)
    except User.DoesNotExist:
        log.warning("send_expiry_notification: user_id=%d not found.", user_id)
        return

    context = {
        "user": user,
        "course_id": course_id,
        "days_remaining": days_remaining,
    }

    # Always notify the learner.
    send_learner_expiry_email(context)
    send_platform_notification(context)

    # Notify HR/Admin when close to expiry (≤ 30 days) or already expired.
    if days_remaining <= 30:
        send_hr_expiry_email(context)

    # Log the notification.
    from .models import NotificationLog
    NotificationLog.objects.create(
        user_id=user_id,
        course_id=course_id,
        days_remaining=days_remaining,
        sent_at=__import__("django.utils.timezone", fromlist=["timezone"]).timezone.now(),
    )


@shared_task
def weekly_hr_summary():
    """
    Runs weekly — sends HR/Admin a summary report of all certificates
    that have expired or will expire within the next 30 days.
    """
    from .channels.email import send_hr_weekly_summary
    send_hr_weekly_summary()
