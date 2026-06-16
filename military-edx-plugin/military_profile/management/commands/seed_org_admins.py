"""
management/commands/seed_org_admins.py

สร้าง org_admin account อัตโนมัติ 1 account ต่อหน่วยงาน
username  = 100{seq:03d}  เช่น 100001, 100002, ..., 100154
password  = P@ssword{seq:03d}  เช่น P@ssword001, P@ssword154
email     = {username}@orgadmin.rta.local  (system placeholder)

Usage:
  python manage.py lms seed_org_admins               # สร้าง/ข้ามถ้ามีอยู่แล้ว
  python manage.py lms seed_org_admins --dry-run      # แสดงผลโดยไม่สร้างจริง
  python manage.py lms seed_org_admins --reset        # ลบของเก่าทั้งหมดแล้วสร้างใหม่
  python manage.py lms seed_org_admins --reset-password  # รีเซ็ตเฉพาะ password
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from military_profile.models import MilitaryUserProfile, Organization, encrypt_field, hmac_field

User = get_user_model()

_SYSTEM_EMAIL_SUFFIX = "@orgadmin.rta.local"
_PLACEHOLDER_NID_PREFIX = "00000000"  # 8 หลักนำ + 5 หลัก (seq) = 13 หลัก


def _make_username(seq: int) -> str:
    return f"100{seq:03d}"


def _make_password(seq: int) -> str:
    return f"P@ssword{seq:03d}"


def _make_email(username: str) -> str:
    return f"{username}{_SYSTEM_EMAIL_SUFFIX}"


def _placeholder_nid(seq: int) -> str:
    return _PLACEHOLDER_NID_PREFIX + str(seq).zfill(5)


class Command(BaseCommand):
    help = "สร้าง/รีเซ็ต org_admin system account 1 ต่อหน่วยงาน"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="แสดงโดยไม่บันทึก")
        parser.add_argument("--reset", action="store_true",
                            help="ลบ system org_admin ของเก่าทั้งหมดแล้วสร้างใหม่")
        parser.add_argument("--reset-password", action="store_true",
                            help="รีเซ็ตเฉพาะ password ของที่มีอยู่แล้ว")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        do_reset = options["reset"]
        reset_pw = options["reset_password"]

        if dry_run:
            self.stdout.write(self.style.WARNING("=== DRY RUN ===\n"))

        orgs = list(Organization.objects.filter(is_active=True).order_by("id"))

        # ── Reset: ลบ system accounts ของเก่า ───────────────────────────────
        if do_reset and not dry_run:
            old_users = User.objects.filter(email__endswith=_SYSTEM_EMAIL_SUFFIX)
            count = old_users.count()
            old_users.delete()
            self.stdout.write(self.style.WARNING(f"ลบ system org_admin เดิม {count} accounts\n"))

        created = []
        skipped = []
        pw_reset = []
        errors = []

        for seq, org in enumerate(orgs, start=1):
            username = _make_username(seq)
            password = _make_password(seq)
            email = _make_email(username)
            nid = _placeholder_nid(seq)

            existing = User.objects.filter(username=username).first()

            if existing:
                if reset_pw:
                    if not dry_run:
                        existing.set_password(password)
                        existing.save()
                    pw_reset.append((seq, username, password, org.name))
                else:
                    skipped.append((seq, username, org.name))
                continue

            if dry_run:
                created.append((seq, username, password, org.name))
                continue

            try:
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    password=password,
                    first_name=f"ผดม.{org.name}",
                )
                user.is_active = True
                user.is_staff = False
                user.save()

                MilitaryUserProfile.objects.create(
                    user=user,
                    national_id_encrypted=encrypt_field(nid),
                    national_id_hmac=hmac_field(nid),
                    military_id_encrypted=encrypt_field(username),
                    full_name_th=f"ผู้ดูแลหน่วย {org.name}",
                    rank="",
                    unit=org.name,
                    service_start_date="2000-01-01",
                    birth_date="2000-01-01",
                    role="org_admin",
                    organization=org,
                )
                created.append((seq, username, password, org.name))
            except Exception as exc:
                errors.append((seq, org.code, org.name, str(exc)))

        # ─── รายงาน ──────────────────────────────────────────────────────────
        self.stdout.write("\n" + "═" * 90)
        self.stdout.write(f"  org_admin accounts — {'DRY RUN' if dry_run else 'สร้างแล้ว'}")
        self.stdout.write("═" * 90)

        if created:
            self.stdout.write(self.style.SUCCESS(
                f"\n✅ {'จะสร้าง' if dry_run else 'สร้างสำเร็จ'} {len(created)} account\n"
            ))
            self.stdout.write(f"  {'#':<6} {'USERNAME':<12} {'PASSWORD':<16} {'หน่วยงาน'}")
            self.stdout.write("  " + "-" * 70)
            for seq, u, p, n in created:
                self.stdout.write(f"  {seq:<6} {u:<12} {p:<16} {n}")

        if pw_reset:
            self.stdout.write(self.style.WARNING(f"\n🔄 รีเซ็ต password {len(pw_reset)} account\n"))
            for seq, u, p, n in pw_reset:
                self.stdout.write(f"  {seq:<6} {u:<12} → {p:<16} ({n})")

        if skipped:
            self.stdout.write(self.style.WARNING(
                f"\n⏭  ข้ามไป {len(skipped)} (มีอยู่แล้ว — ใช้ --reset เพื่อสร้างใหม่)\n"
            ))

        if errors:
            self.stdout.write(self.style.ERROR(f"\n❌ ผิดพลาด {len(errors)}\n"))
            for seq, code, name, err in errors:
                self.stdout.write(f"  {seq} {code} {name}: {err}")

        self.stdout.write("\n" + "═" * 90)
        self.stdout.write(
            f"  สรุป: สร้าง {len(created)} | ข้าม {len(skipped)} | รีเซ็ต pw {len(pw_reset)} | Error {len(errors)}"
        )
        self.stdout.write("═" * 90 + "\n")
