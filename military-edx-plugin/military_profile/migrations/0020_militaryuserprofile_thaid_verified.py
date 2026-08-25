from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0019_militaryuserprofile_address"),
    ]

    operations = [
        migrations.AddField(
            model_name="militaryuserprofile",
            name="thaid_verified",
            field=models.BooleanField(default=False, verbose_name="ยืนยันตัวตนผ่าน ThaID"),
        ),
    ]
