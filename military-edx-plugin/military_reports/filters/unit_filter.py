"""Filter: ค้นหาจากหน่วยต้นสังกัด"""
from django import forms
from .base import BaseSearchFilter


class UnitFilter(BaseSearchFilter):
    filter_key = "unit"
    display_name = "หน่วยต้นสังกัด"

    def get_form_fields(self):
        return {
            "unit": forms.CharField(
                label="หน่วยต้นสังกัด",
                required=False,
                widget=forms.TextInput(attrs={"placeholder": "ชื่อหน่วย..."}),
            ),
            "sub_unit": forms.CharField(
                label="หน่วยรอง",
                required=False,
                widget=forms.TextInput(attrs={"placeholder": "หน่วยรอง (ถ้ามี)"}),
            ),
        }

    def apply(self, queryset, params):
        unit = params.get("unit", "").strip()
        sub_unit = params.get("sub_unit", "").strip()
        if unit:
            queryset = queryset.filter(unit__icontains=unit)
        if sub_unit:
            queryset = queryset.filter(sub_unit__icontains=sub_unit)
        return queryset
