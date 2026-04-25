"""
military_reports/filters/base.py

Base class for all search filters.  Developers can subclass BaseSearchFilter
to add custom search criteria without modifying existing code.

HOW TO ADD A NEW FILTER
───────────────────────
1. Create a new file in military_reports/filters/, e.g. position_filter.py
2. Subclass BaseSearchFilter and implement get_form_fields() and apply()
3. Register via Django management command or Django Admin:
     SearchFilterRegistry.objects.create(
         filter_key="position",
         display_name_th="ตำแหน่ง",
         python_class_path="military_reports.filters.position_filter.PositionFilter",
         is_active=True,
     )
The filter will automatically appear in the Report search UI.
"""
from __future__ import annotations

from typing import Any


class BaseSearchFilter:
    """
    Abstract base for pluggable search filters.

    Subclasses MUST define:
        filter_key   : str  — unique identifier (matches SearchFilterRegistry.filter_key)
        display_name : str  — Thai label shown in the UI

    Subclasses MUST implement:
        get_form_fields(self) -> dict
        apply(self, queryset, params) -> queryset
    """

    filter_key: str = ""
    display_name: str = ""

    def get_form_fields(self) -> dict[str, Any]:
        """
        Return a dict of {field_name: django.forms.Field} that will be
        rendered as inputs in the search form.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement get_form_fields()"
        )

    def apply(self, queryset, params: dict):
        """
        Apply this filter to queryset using the submitted form params.

        Parameters
        ----------
        queryset : Django QuerySet of MilitaryUserProfile (or annotated variant)
        params   : dict — cleaned form data

        Returns
        -------
        Filtered queryset
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement apply()"
        )

    def __repr__(self):
        return f"<{self.__class__.__name__} key={self.filter_key!r}>"
