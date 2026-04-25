"""
tests/test_filters.py

Unit tests for the extensible search filter engine.
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import date

from military_reports.filters.base import BaseSearchFilter
from military_reports.filters.name_filter import NameFilter
from military_reports.filters.rank_filter import RankFilter
from military_reports.filters.age_filter import AgeFilter
from military_reports.filters.service_years_filter import ServiceYearsFilter


class TestBaseSearchFilter:
    def test_get_form_fields_not_implemented(self):
        f = BaseSearchFilter()
        with pytest.raises(NotImplementedError):
            f.get_form_fields()

    def test_apply_not_implemented(self):
        f = BaseSearchFilter()
        with pytest.raises(NotImplementedError):
            f.apply(MagicMock(), {})

    def test_repr(self):
        f = BaseSearchFilter()
        f.filter_key = "test"
        assert "test" in repr(f)


class TestNameFilter:
    def test_filter_key(self):
        assert NameFilter.filter_key == "name"

    def test_apply_empty_param_returns_unchanged(self):
        qs = MagicMock()
        result = NameFilter().apply(qs, {"name": ""})
        qs.filter.assert_not_called()
        assert result is qs

    def test_apply_filters_queryset(self):
        qs = MagicMock()
        qs.filter.return_value = qs
        NameFilter().apply(qs, {"name": "สมชาย"})
        qs.filter.assert_called_once_with(full_name_th__icontains="สมชาย")


class TestRankFilter:
    def test_filter_key(self):
        assert RankFilter.filter_key == "rank"

    def test_apply_empty_returns_unchanged(self):
        qs = MagicMock()
        result = RankFilter().apply(qs, {"rank": ""})
        qs.filter.assert_not_called()
        assert result is qs

    def test_apply_filters_by_rank(self):
        qs = MagicMock()
        qs.filter.return_value = qs
        RankFilter().apply(qs, {"rank": "CPT"})
        qs.filter.assert_called_once_with(rank="CPT")


class TestAgeFilter:
    def test_filter_key(self):
        assert AgeFilter.filter_key == "age"

    def test_apply_no_params_unchanged(self):
        qs = MagicMock()
        result = AgeFilter().apply(qs, {})
        qs.filter.assert_not_called()
        assert result is qs

    def test_apply_age_min(self):
        qs = MagicMock()
        qs.filter.return_value = qs
        AgeFilter().apply(qs, {"age_min": 25})
        # Should filter birth_date to be old enough
        assert qs.filter.called

    def test_apply_age_max(self):
        qs = MagicMock()
        qs.filter.return_value = qs
        AgeFilter().apply(qs, {"age_max": 40})
        assert qs.filter.called


class TestServiceYearsFilter:
    def test_filter_key(self):
        assert ServiceYearsFilter.filter_key == "service_years"

    def test_apply_no_params_unchanged(self):
        qs = MagicMock()
        result = ServiceYearsFilter().apply(qs, {})
        qs.filter.assert_not_called()
        assert result is qs


class TestCustomFilterExtension:
    """Verify that custom filters can be created without modifying existing code."""

    def test_custom_filter_subclass(self):
        from django import forms

        class PositionFilter(BaseSearchFilter):
            filter_key = "position"
            display_name = "ตำแหน่ง"

            def get_form_fields(self):
                return {"position": forms.CharField(required=False)}

            def apply(self, queryset, params):
                val = params.get("position", "").strip()
                if val:
                    return queryset.filter(position__icontains=val)
                return queryset

        f = PositionFilter()
        assert f.filter_key == "position"
        assert "position" in f.get_form_fields()
        qs = MagicMock()
        result = f.apply(qs, {"position": ""})
        assert result is qs
