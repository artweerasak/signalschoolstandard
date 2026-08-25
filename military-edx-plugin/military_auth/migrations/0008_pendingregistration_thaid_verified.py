from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_auth", "0007_pendingregistration_address_gender"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingregistration",
            name="thaid_verified",
            field=models.BooleanField(default=False, verbose_name="ยืนยันตัวตนผ่าน ThaID"),
        ),
    ]
