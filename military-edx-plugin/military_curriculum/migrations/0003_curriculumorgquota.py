import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0022_militaryuserprofile_rank_effective_date"),
        ("military_curriculum", "0002_curriculum_eligibility_criteria"),
    ]

    operations = [
        migrations.CreateModel(
            name="CurriculumOrgQuota",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("quota", models.PositiveIntegerField(default=0, verbose_name="โควตา")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("curriculum", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="org_quotas", to="military_curriculum.curriculum")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="curriculum_quotas", to="military_profile.organization")),
            ],
            options={
                "verbose_name": "โควตาตามหน่วยงาน",
                "verbose_name_plural": "โควตาตามหน่วยงาน",
            },
        ),
        migrations.AlterUniqueTogether(
            name="curriculumorgquota",
            unique_together={("curriculum", "organization")},
        ),
    ]
