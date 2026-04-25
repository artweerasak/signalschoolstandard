"""
military_auth/admin.py — Read-only AuditLog admin.
"""
from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "user", "method", "path", "status_code", "ip_address")
    list_filter = ("method", "status_code")
    search_fields = ("user__username", "path", "ip_address")
    date_hierarchy = "timestamp"
    readonly_fields = ("user", "method", "path", "status_code", "ip_address", "timestamp")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False  # Audit logs must not be deleted via Admin
