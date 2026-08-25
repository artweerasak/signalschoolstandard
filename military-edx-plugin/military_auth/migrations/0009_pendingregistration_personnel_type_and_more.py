from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_auth", "0008_pendingregistration_thaid_verified"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingregistration",
            name="personnel_type",
            field=models.CharField(blank=True, default="military", max_length=20, verbose_name="ประเภทบุคลากร"),
        ),
        migrations.AddField(
            model_name="pendingregistration",
            name="civilian_prefix",
            field=models.CharField(blank=True, default="", max_length=10, verbose_name="คำนำหน้า"),
        ),
    ]
