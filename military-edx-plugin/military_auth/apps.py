from django.apps import AppConfig


class MilitaryAuthConfig(AppConfig):
    name = "military_auth"
    verbose_name = "Military Authentication"

    def ready(self):
        self._patch_login_redirect()

    def _patch_login_redirect(self):
        """
        Patch get_next_url_for_login_page to handle None return value.
        Needed because ROOT_URLCONF is overridden to 'military_custom_urls',
        which bypasses the default /dashboard redirect in edx-platform's helpers.py.
        """
        try:
            import common.djangoapps.student.helpers as student_helpers
            _original = student_helpers.get_next_url_for_login_page

            def _patched(request, include_host=False):
                result = _original(request, include_host)
                if result is None:
                    from django.urls import reverse, NoReverseMatch
                    try:
                        return reverse('dashboard')
                    except NoReverseMatch:
                        return '/dashboard'
                return result

            student_helpers.get_next_url_for_login_page = _patched
        except Exception:
            pass  # CMS context หรือ test — ไม่ต้องทำอะไร

