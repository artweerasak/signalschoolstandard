"""Filter: ค้นหาจากชื่อ-นามสกุล"""
from django import forms
from .base import BaseSearchFilter


class NameFilter(BaseSearchFilter):
    filter_key = "name"
    display_name = "ชื่อ-นามสกุล"

    def get_form_fields(self):
        return {
            "name": forms.CharField(
                label="ชื่อ-นามสกุล",
                required=False,
                widget=forms.TextInput(attrs={"placeholder": "ค้นหาชื่อ..."}),
            )
        }

    def apply(self, queryset, params):
        name = params.get("name", "").strip()
        if name:
            queryset = queryset.filter(full_name_th__icontains=name)
        return queryset
