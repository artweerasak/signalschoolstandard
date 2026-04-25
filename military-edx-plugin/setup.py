from setuptools import setup, find_packages

setup(
    name="military-edx-plugin",
    version="1.0.0",
    description="Open edX plugin for military/government eLearning system",
    packages=find_packages(),
    install_requires=[
        "Django>=3.2",
        "celery>=5.0",
        "openpyxl>=3.0",
        "WeasyPrint>=53.0",
        "cryptography>=3.4",
    ],
    entry_points={
        "lms.djangoapp": [
            "military_auth = military_auth.apps:MilitaryAuthConfig",
            "military_profile = military_profile.apps:MilitaryProfileConfig",
            "certificate_expiry = certificate_expiry.apps:CertificateExpiryConfig",
            "certificate_renewal = certificate_renewal.apps:CertificateRenewalConfig",
            "military_reports = military_reports.apps:MilitaryReportsConfig",
            "expiry_notifications = expiry_notifications.apps:ExpiryNotificationsConfig",
        ],
        "cms.djangoapp": [
            "certificate_expiry = certificate_expiry.apps:CertificateExpiryConfig",
            "military_profile = military_profile.apps:MilitaryProfileConfig",
        ],
    },
)
