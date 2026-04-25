"""
military_reports/models.py — SearchFilterRegistry
"""
from django.db import models


class SearchFilterRegistry(models.Model):
    """
    Allows developers to register custom filter classes via Django Admin
    or management commands without changing existing code.
    """

    filter_key = models.CharField(max_length=50, unique=True)
    display_name_th = models.CharField(max_length=100, verbose_name="ชื่อแสดงผล (ภาษาไทย)")
    python_class_path = models.CharField(
        max_length=255,
        help_text="e.g. military_reports.filters.rank_filter.RankFilter",
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "display_name_th"]
        verbose_name = "ตัวกรองการค้นหา"
        verbose_name_plural = "ตัวกรองการค้นหา"

    def __str__(self):
        return f"{self.display_name_th} ({self.filter_key})"

    def load_filter_class(self):
        """Dynamically import and return the filter class."""
        module_path, class_name = self.python_class_path.rsplit(".", 1)
        import importlib
        module = importlib.import_module(module_path)
        return getattr(module, class_name)
