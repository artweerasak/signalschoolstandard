from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0005_contact_email_phone_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="militaryuserprofile",
            name="army_region",
            field=models.CharField(
                blank=True,
                choices=[
                    ("", "ไม่ระบุ"),
                    ("1", "กองทัพภาคที่ 1"),
                    ("2", "กองทัพภาคที่ 2"),
                    ("3", "กองทัพภาคที่ 3"),
                    ("4", "กองทัพภาคที่ 4"),
                ],
                db_index=True,
                default="",
                max_length=1,
                verbose_name="กองทัพภาค",
            ),
        ),
        migrations.AlterIndexTogether(
            name="militaryuserprofile",
            index_together={("army_region", "rank")},
        ),
    ]
