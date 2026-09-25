from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0021_militaryuserprofile_new_curriculum_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="militaryuserprofile",
            name="rank_effective_date",
            field=models.DateField(blank=True, null=True, verbose_name="วันที่มีผลของยศปัจจุบัน"),
        ),
    ]
