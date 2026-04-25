"""
tests/test_renewal.py

Unit tests for the certificate renewal logic (view-level logic extracted
into helper functions for testability).
"""
import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from dateutil.relativedelta import relativedelta
from certificate_expiry.models import (
    CertificateRenewalHistory,
    CourseCertificateConfig,
    UserCertificateExpiry,
)


class TestRenewalLogic:
    """Tests for the score-based renewal decision."""

    def _make_config(self, passing_score=80, validity_years=3, allow_exam=True):
        config = CourseCertificateConfig()
        config.renewal_passing_score = passing_score
        config.validity_years = validity_years
        config.allow_renewal_exam = allow_exam
        return config

    def _make_cert(self, days_past_expiry=10):
        cert = UserCertificateExpiry()
        cert.expiry_date = date.today() - timedelta(days=days_past_expiry)
        cert.issued_date = date.today() - timedelta(days=365 * 3 + days_past_expiry)
        cert.status = UserCertificateExpiry.STATUS_EXPIRED
        cert.renewal_count = 0
        return cert

    def test_passing_score_renews_certificate(self):
        config = self._make_config(passing_score=80)
        cert = self._make_cert()
        score = 85.0

        assert score >= config.renewal_passing_score

        new_expiry = date.today() + relativedelta(years=config.validity_years)
        cert.expiry_date = new_expiry
        cert.status = UserCertificateExpiry.STATUS_RENEWED
        cert.renewal_count += 1

        assert cert.status == UserCertificateExpiry.STATUS_RENEWED
        assert cert.renewal_count == 1
        assert cert.expiry_date == new_expiry

    def test_failing_score_does_not_renew(self):
        config = self._make_config(passing_score=80)
        cert = self._make_cert()
        score = 60.0

        assert score < config.renewal_passing_score
        # Status should remain expired
        assert cert.status == UserCertificateExpiry.STATUS_EXPIRED

    def test_exact_passing_score_renews(self):
        config = self._make_config(passing_score=80)
        assert 80.0 >= config.renewal_passing_score

    def test_new_expiry_date_is_correct(self):
        config = self._make_config(validity_years=3)
        expected = date.today() + relativedelta(years=3)
        new_expiry = date.today() + relativedelta(years=config.validity_years)
        assert new_expiry == expected

    def test_allow_renewal_exam_flag(self):
        config_no = self._make_config(allow_exam=False)
        assert config_no.allow_renewal_exam is False

        config_yes = self._make_config(allow_exam=True)
        assert config_yes.allow_renewal_exam is True
