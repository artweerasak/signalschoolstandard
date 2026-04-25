"""
expiry_notifications/channels/platform.py

Sends in-platform notifications via Open edX's UserNotification framework.
Falls back gracefully if the notifications app is unavailable.
"""
import logging

log = logging.getLogger(__name__)


def send_platform_notification(context: dict):
    """Create an in-platform notification for the learner."""
    user = context["user"]
    days = context["days_remaining"]
    course_id = context["course_id"]

    if days <= 0:
        msg = f"ใบประกาศสำหรับหลักสูตร {course_id} ของคุณหมดอายุแล้ว กรุณาต่ออายุโดยเร็ว"
    else:
        msg = f"ใบประกาศสำหรับหลักสูตร {course_id} จะหมดอายุใน {days} วัน"

    try:
        from openedx.core.djangoapps.notifications.models import Notification
        Notification.objects.create(
            user=user,
            app_name="certificate_expiry",
            notification_type="expiry_warning",
            content_context={"message": msg, "course_id": course_id},
        )
    except ImportError:
        log.warning("platform channel: edX Notification model unavailable — skipping.")
    except Exception as exc:
        log.error("platform channel: failed to create notification — %s", exc)
