"""Filter: ค้นหาจากกองทัพภาค"""
from django import forms
from military_profile.models import ARMY_REGION_CHOICES
from .base import BaseSearchFilter


class ArmyRegionFilter(BaseSearchFilter):
    filter_key = "army_region"
    display_name = "กองทัพภาค"

    def get_form_fields(self):
        return {
            "army_region": forms.ChoiceField(
                label="กองทัพภาค",
                choices=ARMY_REGION_CHOICES,
                required=False,
            )
        }

    def apply(self, queryset, params):
        region = params.get("army_region", "").strip()
        if region:
            queryset = queryset.filter(army_region=region)
        return queryset
