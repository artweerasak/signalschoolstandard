"""
tests/test_certificate_expiry.py

Unit tests for certificate expiry model logic.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from certificate_expiry.models import (
    CourseCertificateConfig,
    UserCertificateExpiry,
)


class TestUserCertificateExpiry:
    def _make_expiry(self, expiry_date):
        obj = UserCertificateExpiry()
        obj.expiry_date = expiry_date
        return obj

    def test_is_expired_past_date(self):
        cert = self._make_expiry(date.today() - timedelta(days=1))
        assert cert.is_expired is True

    def test_is_not_expired_future_date(self):
        cert = self._make_expiry(date.today() + timedelta(days=1))
        assert cert.is_expired is False

    def test_days_until_expiry_positive(self):
        cert = self._make_expiry(date.today() + timedelta(days=30))
        assert cert.days_until_expiry == 30

    def test_days_until_expiry_negative_when_expired(self):
        cert = self._make_expiry(date.today() - timedelta(days=5))
        assert cert.days_until_expiry == -5


class TestCourseCertificateConfigDefaults:
    def test_default_validity_years(self):
        config = CourseCertificateConfig(
            course_id="course-v1:Org+Test+Run",
            course_name="ทดสอบ",
        )
        assert config.validity_years == 3

    def test_default_allow_renewal_exam(self):
        config = CourseCertificateConfig()
        assert config.allow_renewal_exam is True

    def test_default_renewal_passing_score(self):
        config = CourseCertificateConfig()
        assert config.renewal_passing_score == 80
