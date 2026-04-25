from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('military_profile', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='militaryuserprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'ผู้ดูแลระบบ'),
                    ('instructor', 'ครูอาจารย์'),
                    ('student', 'กำลังพล'),
                ],
                default='student',
                max_length=20,
                verbose_name='บทบาทในระบบ',
            ),
        ),
    ]
