from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_auth", "0002_pendingregistration"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pendingregistration",
            name="email",
            field=models.EmailField(
                blank=True,
                default="",
                max_length=254,
                verbose_name="อีเมลติดต่อ",
            ),
        ),
        migrations.AddField(
            model_name="pendingregistration",
            name="phone_number",
            field=models.CharField(
                blank=True,
                default="",
                max_length=20,
                verbose_name="เบอร์โทรศัพท์",
            ),
        ),
    ]
