"""
expiry_notifications/admin.py
"""
from datetime import date, timedelta

from django.contrib import admin, messages
from django.utils.html import format_html
from .models import NotificationLog


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ("user", "course_id", "days_remaining", "channel", "sent_at")
    list_filter = ("channel", "days_remaining")
    search_fields = ("user__username", "user__first_name", "course_id")
    date_hierarchy = "sent_at"
    readonly_fields = ("user", "course_id", "days_remaining", "channel", "sent_at")

    actions = ["trigger_expiry_scan"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.action(description="🔔 สแกนและส่งแจ้งเตือนใบหมดอายุตอนนี้ (dry-run, ใช้ email console)")
    def trigger_expiry_scan(self, request, queryset):
        """Trigger a manual expiry scan and send notifications via console email backend."""
        from certificate_expiry.models import UserCertificateExpiry
        today = date.today()
        thresholds = [90, 30, 7, 1, 0]  # 0 = already expired

        sent = 0
        for threshold in thresholds:
            if threshold > 0:
                target_date = today + timedelta(days=threshold)
                certs = UserCertificateExpiry.objects.filter(
                    status="active",
                    expiry_date=target_date,
                )
            else:
                certs = UserCertificateExpiry.objects.filter(status="expired")

            for cert in certs:
                try:
                    from .tasks import send_expiry_notification
                    send_expiry_notification.delay(
                        cert.user_id, cert.course_id, threshold
                    )
                    sent += 1
                except Exception as exc:
                    self.message_user(
                        request,
                        f"Error queuing notification for {cert.user}: {exc}",
                        level=messages.WARNING,
                    )

        self.message_user(
            request,
            format_html(
                "✅ Queued <strong>{}</strong> notification task(s). "
                "ดูผลใน console logs หรือ Celery worker.",
                sent,
            ),
            level=messages.SUCCESS,
        )
