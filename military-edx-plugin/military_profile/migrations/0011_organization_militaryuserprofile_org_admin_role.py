from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0010_courseaccesspolicy_and_more"),
    ]

    operations = [
        # 1. สร้างตาราง Organization
        migrations.CreateModel(
            name="Organization",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=200, unique=True, verbose_name="ชื่อหน่วยงาน")),
                ("code", models.CharField(max_length=50, unique=True, verbose_name="รหัสหน่วยงาน")),
                ("is_active", models.BooleanField(db_index=True, default=True, verbose_name="เปิดใช้งาน")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "หน่วยงาน",
                "verbose_name_plural": "หน่วยงาน",
                "ordering": ["name"],
            },
        ),
        # 2. เพิ่ม FK organization ใน MilitaryUserProfile
        migrations.AddField(
            model_name="militaryuserprofile",
            name="organization",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="members",
                to="military_profile.organization",
                verbose_name="หน่วยงาน (FK)",
            ),
        ),
        # 3. เพิ่ม role org_admin
        migrations.AlterField(
            model_name="militaryuserprofile",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin",      "ผู้ดูแลระบบ"),
                    ("org_admin",  "ผู้ดูแลหน่วย (ฝอ.1)"),
                    ("instructor", "ครูอาจารย์"),
                    ("student",    "กำลังพล"),
                ],
                default="student",
                max_length=20,
                verbose_name="บทบาทในระบบ",
            ),
        ),
        # 4. เพิ่ม unit_snapshot ใน CertificatePendingApproval
        migrations.AddField(
            model_name="certificatependingapproval",
            name="unit_snapshot",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="หน่วยงาน ณ วันสอบ"),
            preserve_default=False,
        ),
    ]
