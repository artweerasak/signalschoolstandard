from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0015_militaryuserprofile_position"),
    ]

    operations = [
        migrations.AlterField(
            model_name="militaryuserprofile",
            name="birth_date",
            field=models.DateField(blank=True, null=True, verbose_name="วันเกิด"),
        ),
        migrations.AlterField(
            model_name="militaryuserprofile",
            name="service_start_date",
            field=models.DateField(blank=True, null=True, verbose_name="วันเริ่มรับราชการ"),
        ),
    ]
