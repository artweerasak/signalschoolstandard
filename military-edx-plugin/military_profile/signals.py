"""
military_profile/signals.py

Sync edX UserProfile full_name with MilitaryUserProfile.full_name_th on save.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="military_profile.MilitaryUserProfile")
def sync_edx_username(sender, instance, created, **kwargs):
    """Keep the edX User.first_name in sync with military profile full_name_th."""
    user = instance.user
    if user.first_name != instance.full_name_th:
        user.first_name = instance.full_name_th
        user.save(update_fields=["first_name"])
