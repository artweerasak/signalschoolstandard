from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0014_share_folder_level"),
    ]

    operations = [
        migrations.AddField(
            model_name="militaryuserprofile",
            name="position",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="ตำแหน่ง"),
        ),
    ]
