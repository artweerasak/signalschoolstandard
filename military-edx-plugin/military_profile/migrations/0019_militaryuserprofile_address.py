from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0018_alter_militaryuserprofile_army_region_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="militaryuserprofile",
            name="address",
            field=models.CharField(blank=True, default="", max_length=500, verbose_name="ที่อยู่ตามบัตรประชาชน"),
        ),
    ]
