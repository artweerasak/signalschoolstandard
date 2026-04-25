"""
validators.py — Validate National ID and Military ID formats.
"""
import re


def validate_national_id(value: str) -> bool:
    """Validate Thai 13-digit National ID with checksum."""
    if not re.fullmatch(r"\d{13}", value):
        return False
    digits = [int(d) for d in value]
    total = sum((13 - i) * digits[i] for i in range(12))
    check = (11 - (total % 11)) % 10
    return check == digits[12]


def validate_military_id(value: str) -> bool:
    """Validate 10-digit military number (numeric only)."""
    return bool(re.fullmatch(r"\d{10}", value))
