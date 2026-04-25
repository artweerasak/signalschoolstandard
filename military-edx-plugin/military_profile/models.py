"""
military_profile/models.py

Extended user profile for military personnel.
Sensitive fields (national_id, military_id) are stored AES-256 encrypted.
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------

def _get_key() -> bytes:
    """Return 32-byte AES key from settings."""
    key_b64 = getattr(settings, "MILITARY_ENCRYPTION_KEY", None)
    if not key_b64:
        raise RuntimeError("MILITARY_ENCRYPTION_KEY is not set in settings.")
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise RuntimeError("MILITARY_ENCRYPTION_KEY must be 32 bytes (base64-encoded).")
    return key


def encrypt_field(plaintext: str) -> str:
    """Encrypt a string with AES-256-GCM; return base64 ciphertext."""
    key = _get_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt_field(ciphertext_b64: str) -> str:
    """Decrypt a base64 AES-256-GCM ciphertext."""
    key = _get_key()
    raw = base64.b64decode(ciphertext_b64)
    nonce, ct = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode()


# ---------------------------------------------------------------------------
# Rank choices (สามารถขยายได้)
# ---------------------------------------------------------------------------

RANK_CHOICES = [
    # ทหารบก
    ("PVT", "พลทหาร"),
    ("CPL", "สิบตรี"),
    ("SGT3", "สิบโท"),
    ("SGT2", "สิบเอก"),
    ("SSGT", "จ่าสิบตรี"),
    ("MSGT", "จ่าสิบโท"),
    ("CSGT", "จ่าสิบเอก"),
    ("WO1", "พันจ่าตรี"),
    ("WO2", "พันจ่าโท"),
    ("WO3", "พันจ่าเอก"),
    ("2LT", "ร้อยตรี"),
    ("1LT", "ร้อยโท"),
    ("CPT", "ร้อยเอก"),
    ("MAJ", "พันตรี"),
    ("LTCOL", "พันโท"),
    ("COL", "พันเอก"),
    ("BGEN", "พลตรี"),
    ("MGEN", "พลโท"),
    ("GEN", "พลเอก"),
]


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class MilitaryUserProfile(models.Model):
    """One-to-one extension of the edX User for military personnel."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="military_profile",
    )

    # Encrypted sensitive fields — CharField for MySQL index compatibility
    national_id_encrypted = models.CharField(max_length=500, unique=True, db_index=True)
    military_id_encrypted = models.CharField(max_length=500)

    # Plain profile fields
    full_name_th = models.CharField(max_length=255, verbose_name="ชื่อ-นามสกุล (ภาษาไทย)")
    rank = models.CharField(max_length=10, choices=RANK_CHOICES, verbose_name="ชั้นยศ")
    unit = models.CharField(max_length=255, verbose_name="หน่วยต้นสังกัด")
    sub_unit = models.CharField(max_length=255, blank=True, default="", verbose_name="หน่วยรอง")
    service_start_date = models.DateField(verbose_name="วันเริ่มรับราชการ")
    birth_date = models.DateField(verbose_name="วันเกิด")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "ข้อมูลบุคลากรทหาร"
        verbose_name_plural = "ข้อมูลบุคลากรทหาร"
        indexes = [
            models.Index(fields=["unit"]),
            models.Index(fields=["rank"]),
        ]

    def __str__(self):
        return f"{self.get_rank_display()} {self.full_name_th}"

    # ------------------------------------------------------------------
    # Encryption helpers (class-level)
    # ------------------------------------------------------------------

    @staticmethod
    def encrypt(value: str) -> str:
        return encrypt_field(value)

    @staticmethod
    def decrypt(value: str) -> str:
        return decrypt_field(value)

    # ------------------------------------------------------------------
    # Convenience properties (decrypt on access)
    # ------------------------------------------------------------------

    @property
    def national_id(self) -> str:
        return decrypt_field(self.national_id_encrypted)

    @property
    def military_id(self) -> str:
        return decrypt_field(self.military_id_encrypted)

    def check_military_id(self, raw_military_id: str) -> bool:
        """Constant-time comparison of provided military ID."""
        import hmac
        stored = self.military_id.encode()
        provided = raw_military_id.encode()
        return hmac.compare_digest(stored, provided)

    @property
    def service_years(self) -> int:
        """คำนวณอายุการรับราชการ (ปี)"""
        from datetime import date
        delta = date.today() - self.service_start_date
        return delta.days // 365

    @property
    def age(self) -> int:
        """คำนวณอายุ (ปี)"""
        from datetime import date
        delta = date.today() - self.birth_date
        return delta.days // 365
