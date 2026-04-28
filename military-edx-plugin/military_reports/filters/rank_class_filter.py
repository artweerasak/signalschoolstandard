"""Filter: ค้นหาจากระดับชั้น (ประทวน/สัญญาบัตร/พลทหาร)"""
from django import forms
from military_profile.models import NCO_RANKS, OFFICER_RANKS
from .base import BaseSearchFilter

RANK_CLASS_FILTER_CHOICES = [
    ("", "-- ทุกระดับ --"),
    ("nco", "นายทหารประทวน"),
    ("officer", "นายทหารสัญญาบัตร"),
    ("pvt", "พลทหาร"),
]


class RankClassFilter(BaseSearchFilter):
    filter_key = "rank_class"
    display_name = "ระดับชั้น"

    def get_form_fields(self):
        return {
            "rank_class": forms.ChoiceField(
                label="ระดับชั้น",
                choices=RANK_CLASS_FILTER_CHOICES,
                required=False,
            )
        }

    def apply(self, queryset, params):
        rank_class = params.get("rank_class", "").strip()
        if rank_class == "nco":
            queryset = queryset.filter(rank__in=list(NCO_RANKS))
        elif rank_class == "officer":
            queryset = queryset.filter(rank__in=list(OFFICER_RANKS))
        elif rank_class == "pvt":
            queryset = queryset.filter(rank="PVT")
        return queryset
