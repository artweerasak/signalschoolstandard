from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("military_auth", "0005_pendingregistration_national_id_hmac"),
        ("military_profile", "0011_organization_militaryuserprofile_org_admin_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingregistration",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pending_registrations",
                to="military_profile.organization",
                verbose_name="หน่วยงาน (FK)",
            ),
        ),
    ]
