from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0011_organization_militaryuserprofile_org_admin_role"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="VideoSharePermission",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("course_slug", models.CharField(max_length=255, verbose_name="หมวดหมู่")),
                ("filename", models.CharField(max_length=500, verbose_name="ชื่อไฟล์")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("uploader", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="video_shares_given",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="ผู้อัปโหลด",
                )),
                ("shared_with", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="video_shares_received",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="ผู้รับสิทธิ์",
                )),
            ],
            options={
                "verbose_name": "สิทธิ์แชร์วิดีโอ",
                "verbose_name_plural": "สิทธิ์แชร์วิดีโอ",
                "unique_together": {("uploader", "course_slug", "filename", "shared_with")},
            },
        ),
    ]
