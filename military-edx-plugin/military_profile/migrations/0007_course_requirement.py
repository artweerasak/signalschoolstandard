from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0006_army_region"),
    ]

    operations = [
        migrations.CreateModel(
            name="CourseRequirement",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                (
                    "rank_class",
                    models.CharField(
                        choices=[
                            ("nco", "นายทหารประทวน"),
                            ("officer", "นายทหารสัญญาบัตร"),
                            ("pvt", "พลทหาร"),
                            ("all", "ทุกระดับ"),
                        ],
                        db_index=True,
                        max_length=10,
                        verbose_name="ระดับชั้น",
                    ),
                ),
                (
                    "course_id",
                    models.CharField(db_index=True, max_length=255, verbose_name="Course ID (edX)"),
                ),
                (
                    "course_name",
                    models.CharField(max_length=500, verbose_name="ชื่อหลักสูตร"),
                ),
                (
                    "is_active",
                    models.BooleanField(db_index=True, default=True, verbose_name="เปิดใช้งาน"),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "หลักสูตรที่กำหนดให้เรียน",
                "verbose_name_plural": "หลักสูตรที่กำหนดให้เรียน",
                "ordering": ["rank_class", "course_name"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="courserequirement",
            unique_together={("rank_class", "course_id")},
        ),
    ]
