"""Built-in filters — re-exported for convenience."""
from .name_filter import NameFilter
from .rank_filter import RankFilter
from .unit_filter import UnitFilter
from .age_filter import AgeFilter
from .service_years_filter import ServiceYearsFilter
from .course_status_filter import CourseStatusFilter

BUILTIN_FILTERS = [
    NameFilter,
    RankFilter,
    UnitFilter,
    AgeFilter,
    ServiceYearsFilter,
    CourseStatusFilter,
]
