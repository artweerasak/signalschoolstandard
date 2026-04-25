"""
military_profile/management/commands/create_military_user.py

Create a military eLearning user from the command line.
Used for onboarding or bulk imports.

Usage:
    python manage.py create_military_user \\
        --national-id 3100600871634 \\
        --military-id 1234567890 \\
        --full-name "ร้อยเอก สมชาย ใจดี" \\
        --rank CPT \\
        --unit "กองพันทหารราบที่ 1" \\
        --service-start 2010-04-01 \\
        --birth-date 1985-06-15 \\
        --email somchai@mil.th
"""
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = "Create a military eLearning user"

    def add_arguments(self, parser):
        parser.add_argument("--national-id",  required=True, help="เลขบัตรประชาชน 13 หลัก")
        parser.add_argument("--military-id",  required=True, help="เลขทหาร 10 หลัก")
        parser.add_argument("--full-name",    required=True, help="ชื่อ-นามสกุล ภาษาไทย")
        parser.add_argument("--rank",         required=True, help="ชั้นยศ (เช่น CPT)")
        parser.add_argument("--unit",         required=True, help="หน่วยต้นสังกัด")
        parser.add_argument("--sub-unit",     default="",   help="หน่วยรอง (optional)")
        parser.add_argument("--service-start", required=True, help="วันเริ่มรับราชการ YYYY-MM-DD")
        parser.add_argument("--birth-date",   required=True, help="วันเกิด YYYY-MM-DD")
        parser.add_argument("--email",        default="",   help="Email (optional)")

    def handle(self, *args, **options):
        from military_auth.validators import validate_national_id, validate_military_id
        from military_profile.models import MilitaryUserProfile

        national_id = options["national_id"]
        military_id = options["military_id"]

        if not validate_national_id(national_id):
            raise CommandError(f"เลขบัตรประชาชน '{national_id}' ไม่ถูกต้อง")
        if not validate_military_id(military_id):
            raise CommandError(f"เลขทหาร '{military_id}' ไม่ถูกต้อง (ต้องการ 10 หลัก)")

        if MilitaryUserProfile.objects.filter(
            national_id_encrypted=MilitaryUserProfile.encrypt(national_id)
        ).exists():
            raise CommandError("เลขบัตรประชาชนนี้มีในระบบแล้ว")

        # Use national_id as edX username (unique, no PII visible in URL)
        username = f"mil_{national_id}"
        email = options["email"] or f"{national_id}@noemail.local"

        user = User.objects.create_user(
            username=username,
            email=email,
            password=None,  # No direct password — login via MilitaryAuthBackend
            first_name=options["full_name"],
        )
        user.set_unusable_password()
        user.save()

        MilitaryUserProfile.objects.create(
            user=user,
            national_id_encrypted=MilitaryUserProfile.encrypt(national_id),
            military_id_encrypted=MilitaryUserProfile.encrypt(military_id),
            full_name_th=options["full_name"],
            rank=options["rank"],
            unit=options["unit"],
            sub_unit=options.get("sub_unit", ""),
            service_start_date=options["service_start"],
            birth_date=options["birth_date"],
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ สร้างผู้ใช้สำเร็จ: {options['full_name']} (username: {username})"
            )
        )
