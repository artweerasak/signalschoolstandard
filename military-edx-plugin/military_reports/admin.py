"""
military_reports/admin.py — Admin UI for Search Filter Registry.
Sets custom admin index template to show military quick-links.
"""
from django.contrib import admin
from .models import SearchFilterRegistry

# Override admin index page with military quick-links panel
admin.site.index_template = "admin/military_index.html"
admin.site.site_header = "ระบบ eLearning กำลังพล — Signal Standard"
admin.site.site_title = "Signal Standard Admin"
admin.site.index_title = "จัดการระบบ"


@admin.register(SearchFilterRegistry)
class SearchFilterRegistryAdmin(admin.ModelAdmin):
    list_display = ("display_name_th", "filter_key", "python_class_path", "sort_order", "is_active")
    list_filter = ("is_active",)
    list_editable = ("sort_order", "is_active")
    search_fields = ("filter_key", "display_name_th")
    ordering = ("sort_order",)
    fieldsets = (
        (None, {
            "fields": ("filter_key", "display_name_th", "python_class_path", "sort_order", "is_active"),
        }),
    )
    readonly_fields = ("filter_key",)
