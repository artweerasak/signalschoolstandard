from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("military_auth", "0009_pendingregistration_personnel_type_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="RegistrationConfig",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("whitelist_enabled", models.BooleanField(default=False, verbose_name="บังคับ whitelist ตอนสมัคร")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "ค่าตั้งระบบสมัคร"},
        ),
        migrations.CreateModel(
            name="RegistrationWhitelist",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("national_id_hmac", models.CharField(db_index=True, max_length=64, unique=True, verbose_name="เลขบัตรประชาชน (HMAC)")),
                ("national_id_masked", models.CharField(blank=True, default="", max_length=20, verbose_name="เลขบัตร (ปิดบัง)")),
                ("label", models.CharField(blank=True, default="", max_length=255, verbose_name="ชื่อ/ระบุตัว")),
                ("note", models.CharField(blank=True, default="", max_length=255, verbose_name="หมายเหตุ/รุ่น")),
                ("is_active", models.BooleanField(db_index=True, default=True, verbose_name="เปิดใช้")),
                ("used_at", models.DateTimeField(blank=True, null=True, verbose_name="ใช้สมัครแล้วเมื่อ")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("added_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "รายชื่อผู้มีสิทธิ์สมัคร (Whitelist)", "verbose_name_plural": "รายชื่อผู้มีสิทธิ์สมัคร (Whitelist)", "ordering": ["-created_at"]},
        ),
    ]
