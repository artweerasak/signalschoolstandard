from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0004_national_id_hmac"),
    ]

    operations = [
        migrations.AddField(
            model_name="militaryuserprofile",
            name="contact_email",
            field=models.EmailField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="อีเมลติดต่อ",
            ),
        ),
        migrations.AddField(
            model_name="militaryuserprofile",
            name="phone_number",
            field=models.CharField(
                blank=True,
                default="",
                max_length=20,
                verbose_name="เบอร์โทรศัพท์",
            ),
        ),
    ]
