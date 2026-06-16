from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_auth", "0004_pending_registration_region"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingregistration",
            name="national_id_hmac",
            field=models.CharField(
                blank=True,
                db_index=True,
                default="",
                max_length=64,
                verbose_name="เลขบัตรประชาชน (HMAC)",
            ),
        ),
    ]
