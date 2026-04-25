"""
tests/test_validators.py

Unit tests for National ID and Military ID validators.
"""
import pytest
from military_auth.validators import validate_national_id, validate_military_id


class TestNationalIdValidator:
    def test_valid_national_id(self):
        # A structurally valid Thai ID (checksum verified)
        assert validate_national_id("3100600871634") is True

    def test_wrong_checksum(self):
        assert validate_national_id("3100600871635") is False

    def test_too_short(self):
        assert validate_national_id("123456789012") is False

    def test_too_long(self):
        assert validate_national_id("31006008716350") is False

    def test_non_numeric(self):
        assert validate_national_id("310060087163X") is False

    def test_empty_string(self):
        assert validate_national_id("") is False


class TestMilitaryIdValidator:
    def test_valid_10_digits(self):
        assert validate_military_id("1234567890") is True

    def test_too_short(self):
        assert validate_military_id("123456789") is False

    def test_too_long(self):
        assert validate_military_id("12345678901") is False

    def test_non_numeric(self):
        assert validate_military_id("123456789X") is False

    def test_empty_string(self):
        assert validate_military_id("") is False
