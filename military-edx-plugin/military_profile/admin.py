"""
military_profile/admin.py — Django Admin UI for military personnel profiles.
"""
from django.contrib import admin

from .models import MilitaryUserProfile


@admin.register(MilitaryUserProfile)
class MilitaryUserProfileAdmin(admin.ModelAdmin):
    list_display = (
        "full_name_th",
        "get_rank_display_name",
        "unit",
        "sub_unit",
        "service_start_date",
        "service_years",
        "age",
    )
    list_filter = ("rank", "unit")
    search_fields = ("full_name_th", "unit", "user__email")
    readonly_fields = (
        "created_at",
        "updated_at",
        "service_years",
        "age",
    )
    fieldsets = (
        ("ข้อมูลบัญชี", {
            "fields": ("user",),
        }),
        ("ข้อมูลส่วนตัว", {
            "fields": ("full_name_th", "birth_date", "age"),
        }),
        ("ข้อมูลราชการ", {
            "fields": ("rank", "unit", "sub_unit", "service_start_date", "service_years"),
        }),
        ("ข้อมูลระบบ", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )

    def get_rank_display_name(self, obj):
        return obj.get_rank_display()
    get_rank_display_name.short_description = "ชั้นยศ"

    # Sensitive fields (national_id_encrypted, military_id_encrypted) are
    # intentionally excluded from the Admin UI for security.
