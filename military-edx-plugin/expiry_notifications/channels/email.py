"""
expiry_notifications/channels/email.py

Email notification helpers using Django's email framework.
Templates are stored in expiry_notifications/templates/.
"""
import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

log = logging.getLogger(__name__)

ADMIN_EMAILS = getattr(settings, "MILITARY_HR_EMAILS", [])


def _send(subject: str, template_name: str, context: dict, recipients: list):
    if not recipients:
        log.warning("email channel: no recipients for template %s", template_name)
        return
    text_body = render_to_string(f"expiry_notifications/{template_name}.txt", context)
    html_body = render_to_string(f"expiry_notifications/{template_name}.html", context)
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipients,
    )
    msg.attach_alternative(html_body, "text/html")
    try:
        msg.send()
    except Exception as exc:
        log.error("email channel: failed to send %s — %s", template_name, exc)


def send_learner_expiry_email(context: dict):
    user = context["user"]
    days = context["days_remaining"]
    if days <= 0:
        subject = "⚠️ ใบประกาศของคุณหมดอายุแล้ว"
        template = "learner_expired"
    elif days <= 7:
        subject = f"⚠️ ใบประกาศของคุณจะหมดอายุใน {days} วัน"
        template = "learner_expiring_soon"
    else:
        subject = f"แจ้งเตือน: ใบประกาศจะหมดอายุใน {days} วัน"
        template = "learner_expiring"
    _send(subject, template, context, [user.email])


def send_hr_expiry_email(context: dict):
    days = context["days_remaining"]
    subject = f"[HR] แจ้งเตือนใบประกาศใกล้หมดอายุ ({days} วัน)"
    _send(subject, "hr_expiry_alert", context, ADMIN_EMAILS)


def send_hr_weekly_summary():
    """Compile and send weekly summary of near-expiry and expired certs."""
    from datetime import date, timedelta
    from certificate_expiry.models import UserCertificateExpiry

    today = date.today()
    threshold = today + timedelta(days=30)

    near_expiry = UserCertificateExpiry.objects.filter(
        expiry_date__range=(today, threshold),
        status=UserCertificateExpiry.STATUS_ACTIVE,
    ).select_related("user", "user__military_profile")

    expired = UserCertificateExpiry.objects.filter(
        status=UserCertificateExpiry.STATUS_EXPIRED,
    ).select_related("user", "user__military_profile")

    context = {
        "near_expiry": near_expiry,
        "expired": expired,
        "report_date": today,
    }
    subject = f"[HR รายสัปดาห์] สถานะใบประกาศ — {today}"
    _send(subject, "hr_weekly_summary", context, ADMIN_EMAILS)
