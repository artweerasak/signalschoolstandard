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
        "pdfminer.six>=20221105",
        "olefile>=0.47",
        "mammoth>=1.6",
        "python-docx>=1.0",
    ],
    entry_points={
        "lms.djangoapp": [
            "military_auth = military_auth.apps:MilitaryAuthConfig",
            "military_profile = military_profile.apps:MilitaryProfileConfig",
            "certificate_expiry = certificate_expiry.apps:CertificateExpiryConfig",
            "certificate_renewal = certificate_renewal.apps:CertificateRenewalConfig",
            "military_reports = military_reports.apps:MilitaryReportsConfig",
            "expiry_notifications = expiry_notifications.apps:ExpiryNotificationsConfig",
            "military_curriculum = military_curriculum.apps:MilitaryCurriculumConfig",
        ],
        "cms.djangoapp": [
            "certificate_expiry = certificate_expiry.apps:CertificateExpiryConfig",
            "military_profile = military_profile.apps:MilitaryProfileConfig",
        ],
        "xblock.v1": [
            "military-pdf-viewer = military_pdf_viewer.xblock:MilitaryPdfViewerXBlock",
        ],
        "openedx.block_structure_transformer": [
            "military_itembank_grading = military_profile.itembank_grading_transformer:ItemBankGradingTransformer",
        ],
    },
)
