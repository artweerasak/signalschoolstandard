"""
management/commands/seed_demo_data.py

สร้างข้อมูล demo สำหรับทดสอบระบบ:
- Superuser admin
- กำลังพล 5 นาย พร้อม MilitaryUserProfile
- หลักสูตร 3 วิชา
- ใบประกาศ 10 ใบ (active/expired ผสมกัน)
- SearchFilterRegistry ทั้ง 6 filters

Usage:
    python manage.py seed_demo_data
    python manage.py seed_demo_data --flush   # ลบข้อมูลเดิมก่อน
"""
import base64
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from certificate_expiry.models import (
    CourseCertificateConfig,
    UserCertificateExpiry,
)
from military_profile.models import MilitaryUserProfile
from military_reports.models import SearchFilterRegistry

User = get_user_model()


COURSES = [
    ("course-v1:MIL+SEC101+2024", "ความปลอดภัยไซเบอร์", 3),
    ("course-v1:MIL+LEAD202+2024", "ภาวะผู้นำทางทหาร", 2),
    ("course-v1:MIL+FIRE303+2024", "การใช้อาวุธปืนใหญ่", 1),
]

SOLDIERS = [
    # national_id, military_id, name, unit, rank_code, birth, enlist
    ("3100600871634", "1234567890", "ร.อ.สมชาย ใจดี",     "พัน.1 รอ.",    "1LT",  date(1985, 3, 15), date(2010, 4, 1)),
    ("3200100123456", "0987654321", "ร.ต.สมหญิง กล้าหาญ", "พัน.2 รอ.",    "2LT",  date(1992, 7, 22), date(2015, 6, 1)),
    ("3101500234567", "1122334455", "ส.อ.วิชาญ รักชาติ",  "ร้อย.ก พัน.1", "CSGT", date(1988, 11, 5), date(2008, 3, 15)),
    ("3300200345678", "5544332211", "พ.ต.ประเสริฐ ชัยชนะ", "กรม ทพ.11",   "MAJ",  date(1978, 1, 20), date(2000, 7, 1)),
    ("3400100456789", "9988776655", "ส.ต.มนัส ศรีสุข",    "ร้อย.ข พัน.3", "CPL",  date(1998, 5, 10), date(2020, 5, 1)),
]

CERT_DATA = [
    # soldier_idx, course_id, days_since_issued
    (0, "course-v1:MIL+SEC101+2024",  -400),
    (0, "course-v1:MIL+LEAD202+2024", -800),
    (1, "course-v1:MIL+SEC101+2024",  -20),
    (1, "course-v1:MIL+FIRE303+2024", -340),
    (2, "course-v1:MIL+SEC101+2024",  -1050),
    (2, "course-v1:MIL+LEAD202+2024", -10),
    (3, "course-v1:MIL+SEC101+2024",  -100),
    (3, "course-v1:MIL+LEAD202+2024", -200),
    (3, "course-v1:MIL+FIRE303+2024", -350),
    (4, "course-v1:MIL+LEAD202+2024", -700),
]

FILTERS = [
    ("name",         "ชื่อ-นามสกุล",       "military_reports.filters.name_filter.NameFilter"),
    ("rank",         "ชั้นยศ",              "military_reports.filters.rank_filter.RankFilter"),
    ("unit",         "หน่วยต้นสังกัด",      "military_reports.filters.unit_filter.UnitFilter"),
    ("age",          "ช่วงอายุ",            "military_reports.filters.age_filter.AgeFilter"),
    ("service_years","อายุการรับราชการ",    "military_reports.filters.service_years_filter.ServiceYearsFilter"),
    ("course_status","สถานะหลักสูตร/รายวิชา","military_reports.filters.course_status_filter.CourseStatusFilter"),
]


class Command(BaseCommand):
    help = "Seed demo data for development / testing"

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete existing demo data before seeding",
        )

    def handle(self, *args, **options):
        if options["flush"]:
            self._flush()

        self._seed_superuser()
        courses_map = self._seed_courses()
        soldiers = self._seed_soldiers()
        self._seed_certificates(soldiers, courses_map)
        self._seed_filters()

        self.stdout.write(self.style.SUCCESS(
            f"\n✅ Demo data seeded: "
            f"{len(soldiers)} soldiers, "
            f"{len(courses_map)} courses, "
            f"{len(CERT_DATA)} certificates, "
            f"{len(FILTERS)} search filters"
        ))

    def _flush(self):
        self.stdout.write("🗑  Flushing existing demo data...")
        UserCertificateExpiry.objects.all().delete()
        MilitaryUserProfile.objects.filter(
            national_id_encrypted__isnull=False
        ).delete()
        User.objects.filter(username__startswith="mil_").delete()
        CourseCertificateConfig.objects.all().delete()
        SearchFilterRegistry.objects.all().delete()

    def _seed_superuser(self):
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@test.mil.th", "admin1234")
            self.stdout.write("  👤 Created superuser admin / admin1234")
        else:
            self.stdout.write("  👤 Superuser admin already exists")

    def _seed_courses(self):
        courses_map = {}
        for course_id, name, years in COURSES:
            cfg, created = CourseCertificateConfig.objects.get_or_create(
                course_id=course_id,
                defaults={
                    "validity_years": years,
                    "allow_renewal_exam": True,
                    "renewal_passing_score": 70,
                },
            )
            courses_map[course_id] = cfg
            verb = "Created" if created else "OK"
            self.stdout.write(f"  📚 {verb}: {name} ({years}ปี)")
        return courses_map

    def _seed_soldiers(self):
        today = date.today()
        soldiers = []
        for nat_id, mil_id, name, unit, rank, dob, enlist in SOLDIERS:
            username = f"mil_{nat_id}"
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"first_name": name, "email": f"{username}@test.mil.th"},
            )
            profile, created = MilitaryUserProfile.objects.get_or_create(
                user=user,
                defaults={
                    "full_name_th": name,
                    "national_id_encrypted": MilitaryUserProfile.encrypt(nat_id),
                    "military_id_encrypted": MilitaryUserProfile.encrypt(mil_id),
                    "unit": unit,
                    "rank": rank,
                    "birth_date": dob,
                    "service_start_date": enlist,
                },
            )
            soldiers.append((user, profile))
            verb = "Created" if created else "OK"
            self.stdout.write(f"  🪖 {verb}: {name} | {rank} | {unit}")
        return soldiers

    def _seed_certificates(self, soldiers, courses_map):
        today = date.today()
        count = 0
        for u_idx, course_id, days_ago in CERT_DATA:
            user, _ = soldiers[u_idx]
            cfg = courses_map[course_id]
            issued = today + timedelta(days=days_ago)
            expiry = issued + timedelta(days=cfg.validity_years * 365)
            status = "expired" if expiry < today else "active"
            _, created = UserCertificateExpiry.objects.get_or_create(
                user=user,
                course_id=course_id,
                defaults={"issued_date": issued, "expiry_date": expiry, "status": status},
            )
            if created:
                count += 1
        self.stdout.write(f"  📜 Created {count} new certificates")

    def _seed_filters(self):
        count = 0
        for order, (key, name_th, class_path) in enumerate(FILTERS):
            _, created = SearchFilterRegistry.objects.get_or_create(
                filter_key=key,
                defaults={
                    "display_name_th": name_th,
                    "python_class_path": class_path,
                    "is_active": True,
                    "sort_order": order,
                },
            )
            if created:
                count += 1
        self.stdout.write(f"  🔍 Registered {count} new search filters")
