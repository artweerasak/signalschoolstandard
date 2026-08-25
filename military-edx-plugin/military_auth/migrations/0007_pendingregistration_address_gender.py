from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_auth", "0006_pendingregistration_organization"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingregistration",
            name="address",
            field=models.CharField(blank=True, default="", max_length=500, verbose_name="ที่อยู่ตามบัตรประชาชน"),
        ),
        migrations.AddField(
            model_name="pendingregistration",
            name="gender",
            field=models.CharField(blank=True, default="", max_length=1, verbose_name="เพศ"),
        ),
    ]
