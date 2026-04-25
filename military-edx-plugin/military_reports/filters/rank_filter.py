"""Filter: ค้นหาจากชั้นยศ"""
from django import forms
from military_profile.models import RANK_CHOICES
from .base import BaseSearchFilter


class RankFilter(BaseSearchFilter):
    filter_key = "rank"
    display_name = "ชั้นยศ"

    def get_form_fields(self):
        return {
            "rank": forms.ChoiceField(
                label="ชั้นยศ",
                choices=[("", "-- ทุกยศ --")] + list(RANK_CHOICES),
                required=False,
            )
        }

    def apply(self, queryset, params):
        rank = params.get("rank", "").strip()
        if rank:
            queryset = queryset.filter(rank=rank)
        return queryset
