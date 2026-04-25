from django.apps import AppConfig


class MilitaryProfileConfig(AppConfig):
    name = "military_profile"
    verbose_name = "Military Profile"

    def ready(self):
        # Import signal handlers so they register on startup.
        import military_profile.signals  # noqa: F401
