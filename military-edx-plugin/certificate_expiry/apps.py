from django.apps import AppConfig


class CertificateExpiryConfig(AppConfig):
    name = "certificate_expiry"
    verbose_name = "Certificate Expiry"

    def ready(self):
        from .signals import connect_signals
        connect_signals()
