# Celery Beat schedule — add this to your Open edX LMS settings
# (e.g., lms/envs/production.py or via Tutor plugin patch)

from celery.schedules import crontab

CELERYBEAT_SCHEDULE = {
    # เวลาเป็น UTC — ตั้งไว้ดึก/เช้ามืดเวลาไทย (UTC+7) เพื่อไม่แย่ง CPU กับ
    # นักเรียนช่วงกลางวัน (เดิม 06:00 UTC = 13:00 น. ไทย ตรงกับพีค แก้แล้ว)
    "daily-expiry-check": {
        "task": "certificate_expiry.tasks.daily_expiry_check",
        "schedule": crontab(hour=19, minute=0),  # 19:00 UTC = 02:00 น. ไทย
    },
    # ทุกวันจันทร์ 19:30 UTC = 02:30 น. วันอังคารเวลาไทย
    "weekly-hr-summary": {
        "task": "expiry_notifications.tasks.weekly_hr_summary",
        "schedule": crontab(hour=19, minute=30, day_of_week=1),
    },
}
