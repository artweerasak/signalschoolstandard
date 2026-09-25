from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_curriculum", "0003_curriculumorgquota"),
    ]

    operations = [
        migrations.AddField(
            model_name="curriculum",
            name="start_date",
            field=models.DateField(blank=True, null=True, verbose_name="วันเริ่มหลักสูตร"),
        ),
        migrations.AddField(
            model_name="curriculum",
            name="end_date",
            field=models.DateField(blank=True, null=True, verbose_name="วันจบหลักสูตร"),
        ),
    ]
