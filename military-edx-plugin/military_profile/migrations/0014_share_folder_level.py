from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("military_profile", "0013_docsharepermission"),
    ]

    operations = [
        # VideoSharePermission: drop filename, update unique_together
        migrations.AlterUniqueTogether(
            name="videosharepermission",
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name="videosharepermission",
            name="filename",
        ),
        migrations.AlterUniqueTogether(
            name="videosharepermission",
            unique_together={("uploader", "course_slug", "shared_with")},
        ),
        # DocSharePermission: drop filename, update unique_together
        migrations.AlterUniqueTogether(
            name="docsharepermission",
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name="docsharepermission",
            name="filename",
        ),
        migrations.AlterUniqueTogether(
            name="docsharepermission",
            unique_together={("uploader", "course_slug", "shared_with")},
        ),
    ]
