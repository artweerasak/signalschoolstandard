"""
certificate_expiry/admin.py — Admin UI for certificate configuration and tracking.
"""
from django.contrib import admin
from django.utils.html import format_html

from .models import (
    CertificateRenewalHistory,
    CourseCertificateConfig,
    UserCertificateExpiry,
)


@admin.register(CourseCertificateConfig)
class CourseCertificateConfigAdmin(admin.ModelAdmin):
    list_display = (
        "course_name", "course_id", "validity_years",
        "allow_renewal_exam", "renewal_passing_score",
    )
    list_filter = ("allow_renewal_exam", "validity_years")
    search_fields = ("course_name", "course_id")
    list_editable = ("validity_years", "allow_renewal_exam", "renewal_passing_score")
    fieldsets = (
        ("ข้อมูลหลักสูตร", {
            "fields": ("course_id", "course_name"),
        }),
        ("การตั้งค่าใบประกาศ", {
            "fields": ("validity_years", "allow_renewal_exam", "renewal_exam_block_id", "renewal_passing_score"),
        }),
    )


@admin.register(UserCertificateExpiry)
class UserCertificateExpiryAdmin(admin.ModelAdmin):
    list_display = (
        "user", "course_id", "issued_date", "expiry_date",
        "status_badge", "days_remaining", "renewal_count",
    )
    list_filter = ("status", "course_id")
    search_fields = ("user__username", "user__first_name", "course_id")
    date_hierarchy = "expiry_date"
    readonly_fields = ("created_at", "updated_at", "days_remaining")
    ordering = ("expiry_date",)

    @admin.display(description="สถานะ")
    def status_badge(self, obj):
        colors = {
            "active":  ("#155724", "#d4edda"),
            "expired": ("#721c24", "#f8d7da"),
            "renewed": ("#004085", "#cce5ff"),
            "revoked": ("#383d41", "#e2e3e5"),
        }
        fg, bg = colors.get(obj.status, ("#000", "#fff"))
        return format_html(
            '<span style="color:{};background:{};padding:2px 8px;border-radius:4px;">{}</span>',
            fg, bg, obj.get_status_display(),
        )

    @admin.display(description="เหลือ (วัน)")
    def days_remaining(self, obj):
        d = obj.days_until_expiry
        color = "red" if d < 0 else "orange" if d <= 30 else "green"
        return format_html('<span style="color:{};">{}</span>', color, d)

    actions = ["mark_expired", "mark_revoked"]

    @admin.action(description="ทำเครื่องหมายว่าหมดอายุ")
    def mark_expired(self, request, queryset):
        updated = queryset.update(status=UserCertificateExpiry.STATUS_EXPIRED)
        self.message_user(request, f"อัปเดต {updated} รายการเป็นหมดอายุ")

    @admin.action(description="เพิกถอนใบประกาศ")
    def mark_revoked(self, request, queryset):
        updated = queryset.update(status=UserCertificateExpiry.STATUS_REVOKED)
        self.message_user(request, f"เพิกถอน {updated} รายการ")


@admin.register(CertificateRenewalHistory)
class CertificateRenewalHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "user", "course_id", "renewed_at", "method",
        "score", "previous_expiry_date", "new_expiry_date",
    )
    list_filter = ("method", "course_id")
    search_fields = ("user__username", "user__first_name", "course_id")
    date_hierarchy = "renewed_at"
    readonly_fields = ("renewed_at",)
