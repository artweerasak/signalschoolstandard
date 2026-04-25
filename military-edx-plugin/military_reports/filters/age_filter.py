"""Filter: ค้นหาจากช่วงอายุ"""
from django import forms
from datetime import date
from dateutil.relativedelta import relativedelta
from .base import BaseSearchFilter


class AgeFilter(BaseSearchFilter):
    filter_key = "age"
    display_name = "ช่วงอายุ"

    def get_form_fields(self):
        return {
            "age_min": forms.IntegerField(
                label="อายุต่ำสุด (ปี)", required=False, min_value=0, max_value=99
            ),
            "age_max": forms.IntegerField(
                label="อายุสูงสุด (ปี)", required=False, min_value=0, max_value=99
            ),
        }

    def apply(self, queryset, params):
        age_min = params.get("age_min")
        age_max = params.get("age_max")
        today = date.today()
        if age_max is not None:
            # birth_date >= today - age_max years
            min_birth = today - relativedelta(years=age_max)
            queryset = queryset.filter(birth_date__gte=min_birth)
        if age_min is not None:
            # birth_date <= today - age_min years
            max_birth = today - relativedelta(years=age_min)
            queryset = queryset.filter(birth_date__lte=max_birth)
        return queryset
