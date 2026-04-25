"""
military_reports/management/commands/register_military_filters.py

Register (or update) all built-in search filters into SearchFilterRegistry.
Run after first deploy:
    python manage.py register_military_filters
"""
from django.core.management.base import BaseCommand

BUILTIN_FILTERS = [
    {
        "filter_key": "name",
        "display_name_th": "ชื่อ-นามสกุล",
        "python_class_path": "military_reports.filters.name_filter.NameFilter",
        "sort_order": 1,
    },
    {
        "filter_key": "rank",
        "display_name_th": "ชั้นยศ",
        "python_class_path": "military_reports.filters.rank_filter.RankFilter",
        "sort_order": 2,
    },
    {
        "filter_key": "unit",
        "display_name_th": "หน่วยต้นสังกัด",
        "python_class_path": "military_reports.filters.unit_filter.UnitFilter",
        "sort_order": 3,
    },
    {
        "filter_key": "age",
        "display_name_th": "ช่วงอายุ",
        "python_class_path": "military_reports.filters.age_filter.AgeFilter",
        "sort_order": 4,
    },
    {
        "filter_key": "service_years",
        "display_name_th": "อายุการรับราชการ",
        "python_class_path": "military_reports.filters.service_years_filter.ServiceYearsFilter",
        "sort_order": 5,
    },
    {
        "filter_key": "course_status",
        "display_name_th": "สถานะหลักสูตร/รายวิชา",
        "python_class_path": "military_reports.filters.course_status_filter.CourseStatusFilter",
        "sort_order": 6,
    },
]


class Command(BaseCommand):
    help = "Register all built-in military search filters into SearchFilterRegistry"

    def handle(self, *args, **options):
        from military_reports.models import SearchFilterRegistry

        created_count = 0
        updated_count = 0

        for entry in BUILTIN_FILTERS:
            obj, created = SearchFilterRegistry.objects.update_or_create(
                filter_key=entry["filter_key"],
                defaults={
                    "display_name_th": entry["display_name_th"],
                    "python_class_path": entry["python_class_path"],
                    "sort_order": entry["sort_order"],
                    "is_active": True,
                },
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"  ✅ Created: {entry['display_name_th']}"))
            else:
                updated_count += 1
                self.stdout.write(f"  🔄 Updated: {entry['display_name_th']}")

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone — {created_count} created, {updated_count} updated."
            )
        )
