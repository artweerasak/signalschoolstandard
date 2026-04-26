from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0003_custom_password_hash"),
    ]

    operations = [
        # Drop the old unique constraint on national_id_encrypted (random nonce means
        # equality lookups never matched anyway; uniqueness is now enforced via HMAC).
        migrations.AlterField(
            model_name="militaryuserprofile",
            name="national_id_encrypted",
            field=models.CharField(max_length=500),
        ),
        # Add the deterministic HMAC lookup field.
        migrations.AddField(
            model_name="militaryuserprofile",
            name="national_id_hmac",
            field=models.CharField(
                max_length=64,
                unique=True,
                db_index=True,
                null=True,
                blank=True,
                verbose_name="National ID HMAC (สำหรับ lookup)",
            ),
        ),
    ]
