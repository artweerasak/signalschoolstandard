"""
expiry_notifications/models.py
"""
from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class NotificationLog(models.Model):
    """Records every notification sent for audit purposes."""

    CHANNEL_EMAIL = "email"
    CHANNEL_PLATFORM = "platform"

    CHANNEL_CHOICES = [
        (CHANNEL_EMAIL, "Email"),
        (CHANNEL_PLATFORM, "Platform (in-site)"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    course_id = models.CharField(max_length=255)
    days_remaining = models.IntegerField()
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default=CHANNEL_EMAIL)
    sent_at = models.DateTimeField()

    class Meta:
        verbose_name = "ประวัติการแจ้งเตือน"
        verbose_name_plural = "ประวัติการแจ้งเตือน"
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.user} | {self.course_id} | {self.days_remaining}d | {self.sent_at.date()}"
