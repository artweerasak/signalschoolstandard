# Celery Beat schedule — add this to your Open edX LMS settings
# (e.g., lms/envs/production.py or via Tutor plugin patch)

from celery.schedules import crontab

CELERYBEAT_SCHEDULE = {
    # Run daily at 06:00 (server time) — checks for expired certs & queues notifications
    "daily-expiry-check": {
        "task": "certificate_expiry.tasks.daily_expiry_check",
        "schedule": crontab(hour=6, minute=0),
    },
    # Run every Monday at 08:00 — sends HR weekly summary
    "weekly-hr-summary": {
        "task": "expiry_notifications.tasks.weekly_hr_summary",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),
    },
}
