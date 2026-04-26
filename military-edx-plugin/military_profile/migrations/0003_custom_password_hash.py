from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('military_profile', '0002_militaryuserprofile_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='militaryuserprofile',
            name='custom_password_hash',
            field=models.CharField(
                blank=True,
                default=None,
                max_length=255,
                null=True,
                verbose_name='รหัสผ่านที่กำหนดเอง (hashed)',
            ),
        ),
    ]
