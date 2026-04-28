"""
military_auth/models.py — AuditLog + PendingRegistration for sensitive user actions.
"""
from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class AuditLog(models.Model):
    """Immutable record of sensitive HTTP actions."""

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500)
    status_code = models.PositiveSmallIntegerField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["user", "timestamp"]),
            models.Index(fields=["path", "timestamp"]),
        ]

    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {self.user} {self.method} {self.path} → {self.status_code}"


# ---------------------------------------------------------------------------
# PendingRegistration — การสมัครสมาชิกที่รอ Admin อนุมัติ
# ---------------------------------------------------------------------------

class PendingRegistration(models.Model):
    """
    เก็บข้อมูลคำขอสมัครสมาชิก (self-registration) ก่อน Admin อนุมัติ
    ข้อมูลสำคัญ (national_id, military_id) เก็บ encrypted เหมือน MilitaryUserProfile
    """

    STATUS_CHOICES = [
        ("pending",  "รอการอนุมัติ"),
        ("approved", "อนุมัติแล้ว"),
        ("rejected", "ปฏิเสธ"),
    ]

    # ข้อมูลส่วนตัว
    full_name_th            = models.CharField(max_length=255, verbose_name="ชื่อ-นามสกุล")
    rank                    = models.CharField(max_length=10,  verbose_name="ชั้นยศ")
    unit                    = models.CharField(max_length=255, verbose_name="หน่วยต้นสังกัด")
    sub_unit                = models.CharField(max_length=255, blank=True, default="", verbose_name="หน่วยรอง")
    army_region             = models.CharField(max_length=1, blank=True, default="", verbose_name="ทัพภาค",
                                choices=[("","ไม่ระบุ"),("1","ทัพภาคที่ 1"),("2","ทัพภาคที่ 2"),("3","ทัพภาคที่ 3"),("4","ทัพภาคที่ 4")])
    birth_date              = models.DateField(verbose_name="วันเกิด")
    email                   = models.EmailField(blank=True, default="", verbose_name="อีเมลติดต่อ")
    phone_number            = models.CharField(max_length=20, blank=True, default="", verbose_name="เบอร์โทรศัพท์")

    # Encrypted — ใช้ encrypt_field() จาก military_profile.models
    national_id_encrypted   = models.CharField(max_length=500, verbose_name="เลขบัตรประชาชน (encrypted)")
    military_id_encrypted   = models.CharField(max_length=500, verbose_name="เลขประจำตัวทหาร (encrypted)")

    # Workflow
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    submitted_at    = models.DateTimeField(auto_now_add=True)
    reviewed_by     = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reviewed_registrations",
        verbose_name="ผู้อนุมัติ/ปฏิเสธ",
    )
    reviewed_at     = models.DateTimeField(null=True, blank=True)
    reject_reason   = models.TextField(blank=True, default="", verbose_name="เหตุผลที่ปฏิเสธ")

    # เก็บ user ที่สร้างหลัง approve
    approved_user   = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="registration_request",
        verbose_name="User ที่สร้างหลัง approve",
    )

    class Meta:
        verbose_name = "คำขอสมัครสมาชิก"
        verbose_name_plural = "คำขอสมัครสมาชิก"
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["status", "submitted_at"]),
        ]

    def __str__(self):
        return f"{self.full_name_th} [{self.get_status_display()}] — {self.submitted_at:%Y-%m-%d}"
