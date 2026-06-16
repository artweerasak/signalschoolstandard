"""
military_profile/models.py

Extended user profile for military personnel.
Sensitive fields (national_id, military_id) are stored AES-256 encrypted.
national_id_hmac is used for DB lookups (HMAC-SHA256, deterministic).
"""
import base64
import hashlib
import hmac as _hmac
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


def hmac_field(plaintext: str) -> str:
    """Return a deterministic HMAC-SHA256 hex digest for DB lookups.
    AES-GCM uses random nonce so the encrypted field cannot be used for
    equality lookups — this HMAC provides a safe, indexed lookup token.
    """
    key = _get_key()
    return _hmac.new(key, plaintext.encode(), hashlib.sha256).hexdigest()


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

# ยศที่อยู่ในระดับ นายทหารประทวน (Non-Commissioned Officers)
NCO_RANKS = {"CPL", "SGT3", "SGT2", "SSGT", "MSGT", "CSGT", "WO1", "WO2", "WO3"}

# ยศที่อยู่ในระดับ นายทหารสัญญาบัตร (Commissioned Officers)
OFFICER_RANKS = {"2LT", "1LT", "CPT", "MAJ", "LTCOL", "COL", "BGEN", "MGEN", "GEN"}

RANK_CLASS_CHOICES = [
    ("nco",        "นายทหารประทวน"),
    ("officer",    "นายทหารสัญญาบัตร"),
    ("pvt",        "พลทหาร"),
    ("civilian",   "ลูกจ้างประจำ"),
    ("government", "พนักงานราชการ"),
    ("all",        "ทุกระดับ"),
]

ARMY_REGION_CHOICES = [
    ("",    "ไม่ระบุ"),
    ("1",   "กองทัพภาคที่ 1"),
    ("2",   "กองทัพภาคที่ 2"),
    ("3",   "กองทัพภาคที่ 3"),
    ("4",   "กองทัพภาคที่ 4"),
]

PERSONNEL_TYPE_CHOICES = [
    ("military",    "ทหาร"),
    ("civilian",    "ลูกจ้างประจำ"),
    ("government",  "พนักงานราชการ"),
]

GENDER_CHOICES = [
    ("M", "ชาย"),
    ("F", "หญิง"),
]

CIVILIAN_PREFIX_CHOICES = [
    ("นาย",     "นาย"),
    ("นาง",     "นาง"),
    ("นางสาว",  "นางสาว"),
]

# ยศทหารที่มีคำลงท้าย หญิง เมื่อเพศ = F
FEMALE_RANK_SUFFIX_RANKS = {
    "CPL", "SGT3", "SGT2", "SSGT", "MSGT", "CSGT",
    "WO1", "WO2", "WO3",
    "2LT", "1LT", "CPT", "MAJ", "LTCOL", "COL",
    "BGEN", "MGEN", "GEN",
}


# ---------------------------------------------------------------------------
# Organization (หน่วยงาน) — Soft Delete
# ---------------------------------------------------------------------------

class Organization(models.Model):
    """หน่วยงานทหาร — Soft Delete ด้วย is_active แทนการลบจริง"""
    name      = models.CharField(max_length=200, unique=True, verbose_name="ชื่อหน่วยงาน")
    code      = models.CharField(max_length=50,  unique=True, verbose_name="รหัสหน่วยงาน")
    is_active = models.BooleanField(default=True, db_index=True, verbose_name="เปิดใช้งาน")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering        = ["name"]
        verbose_name        = "หน่วยงาน"
        verbose_name_plural = "หน่วยงาน"

    def __str__(self):
        return f"[{self.code}] {self.name}"


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
    national_id_encrypted = models.CharField(max_length=500)
    military_id_encrypted = models.CharField(max_length=500)

    # HMAC-SHA256 digest of national_id — used for deterministic DB lookups.
    # The encrypted field uses random nonce and cannot be used for equality queries.
    national_id_hmac = models.CharField(max_length=64, unique=True, db_index=True, null=True, blank=True)

    # Custom password hash — ถ้า None ให้ใช้ military_id เป็น default password
    custom_password_hash = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        default=None,
        verbose_name="รหัสผ่านที่กำหนดเอง (hashed)",
    )

    # Plain profile fields
    full_name_th = models.CharField(max_length=255, verbose_name="ชื่อ-นามสกุล (ภาษาไทย)")
    # ประเภทบุคลากร
    personnel_type = models.CharField(
        max_length=20,
        choices=PERSONNEL_TYPE_CHOICES,
        default="military",
        verbose_name="ประเภทบุคลากร",
        db_index=True,
    )

    # เพศ
    gender = models.CharField(
        max_length=1,
        choices=GENDER_CHOICES,
        default="M",
        verbose_name="เพศ",
    )

    # คำนำหน้า (สำหรับลูกจ้างประจำ / พนักงานราชการ ที่ไม่มียศ)
    civilian_prefix = models.CharField(
        max_length=10,
        choices=CIVILIAN_PREFIX_CHOICES,
        blank=True,
        default="",
        verbose_name="คำนำหน้า",
    )

    rank = models.CharField(max_length=10, choices=RANK_CHOICES, blank=True, default="", verbose_name="ชั้นยศ")
    unit = models.CharField(max_length=255, verbose_name="หน่วยต้นสังกัด")
    sub_unit = models.CharField(max_length=255, blank=True, default="", verbose_name="หน่วยรอง")
    service_start_date = models.DateField(verbose_name="วันเริ่มรับราชการ")
    birth_date = models.DateField(verbose_name="วันเกิด")

    # Contact information — สำหรับ admin ใช้ติดต่อ/ประชาสัมพันธ์
    contact_email = models.EmailField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="อีเมลติดต่อ",
    )
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        default="",
        verbose_name="เบอร์โทรศัพท์",
    )

    # สังกัดกองทัพภาค
    army_region = models.CharField(
        max_length=1,
        choices=ARMY_REGION_CHOICES,
        blank=True,
        default="",
        verbose_name="กองทัพภาค",
        db_index=True,
    )

    # FK → Organization (nullable เพื่อ backward-compat)
    organization = models.ForeignKey(
        "Organization",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="members",
        verbose_name="หน่วยงาน (FK)",
    )

    # Role-based access control
    ROLE_CHOICES = [
        ("admin",      "ผู้ดูแลระบบ"),
        ("org_admin",  "ผู้ดูแลหน่วย (ฝอ.1)"),
        ("instructor", "ครูอาจารย์"),
        ("student",    "กำลังพล"),
    ]
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="student",
        verbose_name="บทบาทในระบบ",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "ข้อมูลบุคลากรทหาร"
        verbose_name_plural = "ข้อมูลบุคลากรทหาร"
        indexes = [
            models.Index(fields=["unit"]),
            models.Index(fields=["rank"]),
            models.Index(fields=["army_region", "rank"]),
        ]

    def __str__(self):
        return f"{self.display_prefix} {self.full_name_th}".strip()

    @property
    def display_rank_name(self) -> str:
        """ชื่อยศที่แสดงผล — เพิ่มคำลงท้าย 'หญิง' ถ้าเป็นทหารหญิง"""
        if not self.rank:
            return ""
        rank_label = dict(RANK_CHOICES).get(self.rank, self.rank)
        if self.gender == "F" and self.rank in FEMALE_RANK_SUFFIX_RANKS:
            return rank_label + "หญิง"
        return rank_label

    @property
    def display_prefix(self) -> str:
        """คำนำหน้าสำหรับแสดงผล — ยศสำหรับทหาร, คำนำหน้าสำหรับพลเรือน"""
        if self.personnel_type == "military":
            return self.display_rank_name
        return self.civilian_prefix

    @property
    def display_full_name(self) -> str:
        """ชื่อเต็มพร้อมคำนำหน้า เช่น 'ร้อยตรีหญิง สมหญิง ใจดี'"""
        prefix = self.display_prefix
        if prefix:
            return f"{prefix} {self.full_name_th}"
        return self.full_name_th

    @property
    def rank_class(self) -> str:
        """ระดับชั้น: 'nco' | 'officer' | 'pvt' | 'civilian' | 'government'"""
        # พลเรือน/ลูกจ้าง ใช้ personnel_type เป็น rank_class
        if self.personnel_type == "civilian":
            return "civilian"
        if self.personnel_type == "government":
            return "government"
        # ทหาร → ใช้ยศ
        if self.rank in NCO_RANKS:
            return "nco"
        if self.rank in OFFICER_RANKS:
            return "officer"
        return "pvt"

    @property
    def rank_class_display(self) -> str:
        mapping = {
            "nco":        "นายทหารประทวน",
            "officer":    "นายทหารสัญญาบัตร",
            "pvt":        "พลทหาร",
            "civilian":   "ลูกจ้างประจำ",
            "government": "พนักงานราชการ",
        }
        return mapping.get(self.rank_class, "-")

    # ------------------------------------------------------------------
    # Encryption helpers (class-level)
    # ------------------------------------------------------------------

    @staticmethod
    def encrypt(value: str) -> str:
        return encrypt_field(value)

    @staticmethod
    def decrypt(value: str) -> str:
        return decrypt_field(value)

    @staticmethod
    def hmac_value(value: str) -> str:
        """Return HMAC-SHA256 digest for DB lookups (deterministic)."""
        return hmac_field(value)

    def save(self, *args, **kwargs):
        """Auto-compute national_id_hmac before saving."""
        if self.national_id_encrypted and not self.national_id_hmac:
            try:
                self.national_id_hmac = hmac_field(self.national_id)
            except Exception as _e:
                import logging as _log
                _log.getLogger(__name__).error("Failed to compute national_id_hmac: %s", _e)
                raise  # ไม่ swallow — ข้อมูลที่ไม่มี HMAC จะทำให้ unique check ล้มเหลว
        super().save(*args, **kwargs)

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
        """คำนวณอายุการรับราชการ (ปี) — ใช้ relativedelta เพื่อความแม่นยำ"""
        from datetime import date
        try:
            from dateutil.relativedelta import relativedelta
            return relativedelta(date.today(), self.service_start_date).years
        except ImportError:
            return (date.today() - self.service_start_date).days // 365

    @property
    def age(self) -> int:
        """คำนวณอายุ (ปี) — ใช้ relativedelta เพื่อความแม่นยำ"""
        from datetime import date
        try:
            from dateutil.relativedelta import relativedelta
            return relativedelta(date.today(), self.birth_date).years
        except ImportError:
            return (date.today() - self.birth_date).days // 365

    def set_custom_password(self, raw_password: str) -> None:
        """Hash and store a custom password."""
        from django.contrib.auth.hashers import make_password
        self.custom_password_hash = make_password(raw_password)
        self.save(update_fields=["custom_password_hash"])

    def check_custom_password(self, raw_password: str) -> bool:
        """Verify against stored custom password hash."""
        from django.contrib.auth.hashers import check_password
        if not self.custom_password_hash:
            return False
        return check_password(raw_password, self.custom_password_hash)

    def reset_to_default_password(self) -> None:
        """Reset custom password — user will auth with military_id again."""
        self.custom_password_hash = None
        self.save(update_fields=["custom_password_hash"])


# ---------------------------------------------------------------------------
# CourseRequirement — admin กำหนดว่า rank_class ไหนต้องเรียน course ไหน
# ---------------------------------------------------------------------------

class CourseRequirement(models.Model):
    """
    Maps rank_class → required course.
    Admin creates entries to define which courses each rank class must complete
    to be considered "passed standard" (ผ่านมาตรฐาน).
    """

    rank_class = models.CharField(
        max_length=10,
        choices=RANK_CLASS_CHOICES,
        verbose_name="ระดับชั้น",
        db_index=True,
    )
    course_id = models.CharField(
        max_length=255,
        verbose_name="Course ID (edX)",
        db_index=True,
    )
    course_name = models.CharField(
        max_length=500,
        verbose_name="ชื่อหลักสูตร",
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="เปิดใช้งาน",
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("rank_class", "course_id")
        verbose_name = "หลักสูตรที่กำหนดให้เรียน"
        verbose_name_plural = "หลักสูตรที่กำหนดให้เรียน"
        ordering = ["rank_class", "course_name"]

    def __str__(self):
        return f"{self.get_rank_class_display()} → {self.course_name}"


# ---------------------------------------------------------------------------
# CourseAccessPolicy — ประเภทหลักสูตร + การมองเห็น + วิชาบังคับก่อน
# ---------------------------------------------------------------------------

class CourseAccessPolicy(models.Model):
    """
    นโยบายการเข้าถึงต่อหลักสูตร:
      - general     : ทุกระดับมองเห็น/เข้าเรียนได้ทันที (ไม่มีเงื่อนไข)
      - conditional : บังคับ rank_class ที่มองเห็นได้ + วิชาบังคับก่อน
    """

    TYPE_GENERAL     = "general"
    TYPE_CONDITIONAL = "conditional"
    TYPE_CHOICES = [
        (TYPE_GENERAL,     "หลักสูตรทั่วไป"),
        (TYPE_CONDITIONAL, "หลักสูตรตามเงื่อนไข"),
    ]

    course_id = models.CharField(
        max_length=255, unique=True, db_index=True, verbose_name="Course ID (edX)",
    )
    course_type = models.CharField(
        max_length=20, choices=TYPE_CHOICES, default=TYPE_GENERAL,
        db_index=True, verbose_name="ประเภทหลักสูตร",
    )
    # rank_class ที่มองเห็น/สมัครได้ (เฉพาะ conditional) — คั่นด้วย comma, ว่าง = ทุกระดับ
    allowed_rank_classes = models.CharField(
        max_length=255, blank=True, default="", verbose_name="ระดับที่เข้าถึงได้",
    )
    # course_id วิชาบังคับก่อน (เฉพาะ conditional) — คั่นด้วย comma ต้องผ่านก่อนจึงปลดล็อก
    prerequisite_course_ids = models.TextField(
        blank=True, default="", verbose_name="วิชาบังคับก่อน",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = "นโยบายการเข้าถึงหลักสูตร"
        verbose_name_plural = "นโยบายการเข้าถึงหลักสูตร"

    def __str__(self):
        return f"{self.course_id} [{self.get_course_type_display()}]"

    @property
    def allowed_list(self):
        return [s.strip() for s in (self.allowed_rank_classes or "").split(",") if s.strip()]

    @property
    def prereq_list(self):
        return [s.strip() for s in (self.prerequisite_course_ids or "").split(",") if s.strip()]


# ─────────────────────────────────────────────────────────────
# ระบบอนุมัติใบประกาศแบบ Batch
# ─────────────────────────────────────────────────────────────

class CertificateApprovalBatch(models.Model):
    """รอบการอนุมัติใบประกาศ — admin สร้างรอบ กำหนดวันอนุมัติ"""

    STATUS_OPEN     = 'open'
    STATUS_APPROVED = 'approved'
    STATUS_CLOSED   = 'closed'
    STATUS_CHOICES  = [
        (STATUS_OPEN,     'รับสมัคร / รอผล'),
        (STATUS_APPROVED, 'อนุมัติแล้ว'),
        (STATUS_CLOSED,   'ปิดรอบ'),
    ]

    name = models.CharField(max_length=200, verbose_name='ชื่อรอบ')
    course_id = models.CharField(max_length=255, db_index=True, verbose_name='Course ID')
    course_name = models.CharField(max_length=500, blank=True, verbose_name='ชื่อหลักสูตร')
    enrollment_start = models.DateField(verbose_name='เปิดรับเรียน')
    enrollment_end   = models.DateField(verbose_name='ปิดรับเรียน / สอบ')
    approve_date     = models.DateField(verbose_name='วันที่อนุมัติใบประกาศ')
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    note             = models.TextField(blank=True, verbose_name='หมายเหตุ')
    created_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='cert_batches_created', verbose_name='สร้างโดย'
    )
    approved_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='cert_batches_approved', verbose_name='อนุมัติโดย'
    )
    approved_at      = models.DateTimeField(null=True, blank=True, verbose_name='เวลาที่อนุมัติ')
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = 'รอบการอนุมัติใบประกาศ'
        verbose_name_plural = 'รอบการอนุมัติใบประกาศ'
        ordering            = ['-approve_date']

    def __str__(self):
        return f'{self.name} ({self.approve_date})'


class CertificatePendingApproval(models.Model):
    """ผู้เรียนที่ผ่านแล้ว รอ admin อนุมัติในรอบนั้น"""

    STATUS_PENDING  = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES  = [
        (STATUS_PENDING,  'รออนุมัติ'),
        (STATUS_APPROVED, 'อนุมัติแล้ว'),
        (STATUS_REJECTED, 'ไม่ผ่าน / ปฏิเสธ'),
    ]

    batch  = models.ForeignKey(
        CertificateApprovalBatch, on_delete=models.CASCADE,
        related_name='pending_approvals', verbose_name='รอบ'
    )
    user   = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='cert_pending_approvals', verbose_name='ผู้เรียน'
    )
    passed_at     = models.DateTimeField(verbose_name='วันที่ผ่าน')
    score         = models.FloatField(null=True, blank=True, verbose_name='คะแนน (%)')
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    cert_uuid     = models.CharField(max_length=50, blank=True, verbose_name='UUID ใบประกาศ')
    unit_snapshot = models.CharField(max_length=255, blank=True, verbose_name='หน่วยงาน ณ วันสอบ')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together     = ('batch', 'user')
        verbose_name        = 'ผู้รออนุมัติใบประกาศ'
        verbose_name_plural = 'ผู้รออนุมัติใบประกาศ'
        ordering            = ['-created_at']

    def __str__(self):
        return f'{self.user.username} → {self.batch.name} [{self.status}]'


class VideoSharePermission(models.Model):
    """แชร์ทั้ง folder วิดีโอ (course_slug) ให้ shared_with มองเห็นทุกไฟล์ในนั้น"""
    uploader    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='video_shares_given', verbose_name='ผู้อัปโหลด'
    )
    course_slug = models.CharField(max_length=255, verbose_name='หมวดหมู่')
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='video_shares_received', verbose_name='ผู้รับสิทธิ์'
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('uploader', 'course_slug', 'shared_with')
        verbose_name = 'สิทธิ์แชร์วิดีโอ'
        verbose_name_plural = 'สิทธิ์แชร์วิดีโอ'

    def __str__(self):
        return f'{self.uploader.username}/{self.course_slug} → {self.shared_with.username}'


class DocSharePermission(models.Model):
    """แชร์ทั้ง folder เอกสาร (course_slug) ให้ shared_with มองเห็นทุกไฟล์ในนั้น"""
    uploader    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='doc_shares_given', verbose_name='ผู้อัปโหลด'
    )
    course_slug = models.CharField(max_length=255, verbose_name='หมวดหมู่')
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='doc_shares_received', verbose_name='ผู้รับสิทธิ์'
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('uploader', 'course_slug', 'shared_with')
        verbose_name = 'สิทธิ์แชร์เอกสาร'
        verbose_name_plural = 'สิทธิ์แชร์เอกสาร'

    def __str__(self):
        return f'{self.uploader.username}/{self.course_slug} → {self.shared_with.username}'
