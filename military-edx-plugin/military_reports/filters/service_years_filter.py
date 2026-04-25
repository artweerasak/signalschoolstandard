"""Filter: ค้นหาจากอายุการรับราชการ"""
from django import forms
from datetime import date
from dateutil.relativedelta import relativedelta
from .base import BaseSearchFilter


class ServiceYearsFilter(BaseSearchFilter):
    filter_key = "service_years"
    display_name = "อายุการรับราชการ"

    def get_form_fields(self):
        return {
            "service_years_min": forms.IntegerField(
                label="อายุราชการต่ำสุด (ปี)", required=False, min_value=0
            ),
            "service_years_max": forms.IntegerField(
                label="อายุราชการสูงสุด (ปี)", required=False, min_value=0
            ),
        }

    def apply(self, queryset, params):
        sv_min = params.get("service_years_min")
        sv_max = params.get("service_years_max")
        today = date.today()
        if sv_max is not None:
            # service_start_date >= today - sv_max years
            earliest_start = today - relativedelta(years=sv_max)
            queryset = queryset.filter(service_start_date__gte=earliest_start)
        if sv_min is not None:
            # service_start_date <= today - sv_min years
            latest_start = today - relativedelta(years=sv_min)
            queryset = queryset.filter(service_start_date__lte=latest_start)
        return queryset
