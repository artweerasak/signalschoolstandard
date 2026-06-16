"""
military_profile/signals.py

Sync edX UserProfile full_name with MilitaryUserProfile.full_name_th on save.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


def _ensure_honor_mode(course_key, **kwargs):
    """Auto-add honor mode to any newly published course that doesn't have one yet."""
    try:
        from common.djangoapps.course_modes.models import CourseMode
        if not CourseMode.objects.filter(course_id=course_key, mode_slug='honor').exists():
            CourseMode.objects.create(
                course_id=course_key,
                mode_slug='honor',
                mode_display_name='Honor',
                min_price=0,
            )
    except Exception:
        pass


try:
    from xmodule.modulestore.django import SignalHandler
    SignalHandler.course_published.connect(_ensure_honor_mode)
except Exception:
    pass


@receiver(post_save, sender="military_profile.MilitaryUserProfile")
def sync_edx_username(sender, instance, created, **kwargs):
    """Keep the edX User.first_name in sync with military profile full_name_th."""
    user = instance.user
    if user.first_name != instance.full_name_th:
        user.first_name = instance.full_name_th
        user.save(update_fields=["first_name"])
