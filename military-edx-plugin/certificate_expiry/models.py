"""
certificate_expiry/models.py

Tracks certificate validity configuration per course and issued expiry
dates per user-course pair.
"""
from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

User = get_user_model()


class CourseCertificateConfig(models.Model):
    """Admin-configurable settings for certificate validity per course."""

    course_id = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        verbose_name="Course ID (edX)",
    )
    course_name = models.CharField(max_length=500, verbose_name="ชื่อหลักสูตร/รายวิชา")
    validity_years = models.PositiveSmallIntegerField(
        default=3,
        verbose_name="อายุใบประกาศ (ปี)",
    )
    allow_renewal_exam = models.BooleanField(
        default=True,
        verbose_name="อนุญาตให้ทำแบบทดสอบต่ออายุ",
    )
    renewal_exam_block_id = models.CharField(
        max_length=500,
        blank=True,
        default="",
        verbose_name="Block ID ของแบบทดสอบต่ออายุ",
    )
    renewal_passing_score = models.PositiveSmallIntegerField(
        default=80,
        verbose_name="คะแนนผ่านแบบทดสอบต่ออายุ (%)",
    )

    class Meta:
        verbose_name = "การตั้งค่าอายุใบประกาศ"
        verbose_name_plural = "การตั้งค่าอายุใบประกาศ"

    def __str__(self):
        return f"{self.course_name} ({self.validity_years} ปี)"


class UserCertificateExpiry(models.Model):
    """Tracks each user's certificate expiry for a specific course."""

    STATUS_ACTIVE = "active"
    STATUS_EXPIRED = "expired"
    STATUS_RENEWED = "renewed"
    STATUS_REVOKED = "revoked"

    STATUS_CHOICES = [
        (STATUS_ACTIVE, "ยังไม่หมดอายุ"),
        (STATUS_EXPIRED, "หมดอายุแล้ว"),
        (STATUS_RENEWED, "ต่ออายุแล้ว"),
        (STATUS_REVOKED, "ถูกเพิกถอน"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="certificate_expiries")
    course_id = models.CharField(max_length=255, db_index=True)
    issued_date = models.DateField(verbose_name="วันที่ออกใบประกาศ")
    expiry_date = models.DateField(verbose_name="วันหมดอายุ", db_index=True)
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
        db_index=True,
    )
    renewal_count = models.PositiveSmallIntegerField(default=0, verbose_name="จำนวนครั้งที่ต่ออายุ")
    last_notified_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "course_id")
        verbose_name = "วันหมดอายุใบประกาศของผู้เรียน"
        verbose_name_plural = "วันหมดอายุใบประกาศของผู้เรียน"
        indexes = [
            models.Index(fields=["expiry_date", "status"]),
            models.Index(fields=["course_id", "status"]),
        ]

    def __str__(self):
        return f"{self.user} | {self.course_id} | expires {self.expiry_date}"

    @property
    def is_expired(self) -> bool:
        from datetime import date as _date
        return self.expiry_date < _date.today()

    @property
    def days_until_expiry(self) -> int:
        from datetime import date as _date
        delta = self.expiry_date - _date.today()
        return delta.days


class CertificateRenewalHistory(models.Model):
    """Records every renewal event for audit and reporting."""

    METHOD_EXAM = "exam"
    METHOD_RETAKE = "retake"

    METHOD_CHOICES = [
        (METHOD_EXAM, "แบบทดสอบต่ออายุ"),
        (METHOD_RETAKE, "เรียนใหม่ทั้งหลักสูตร"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    course_id = models.CharField(max_length=255)
    renewed_at = models.DateTimeField(auto_now_add=True)
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    score = models.FloatField(null=True, blank=True, verbose_name="คะแนนแบบทดสอบ (%)")
    previous_expiry_date = models.DateField()
    new_expiry_date = models.DateField()

    class Meta:
        verbose_name = "ประวัติการต่ออายุใบประกาศ"
        verbose_name_plural = "ประวัติการต่ออายุใบประกาศ"
        ordering = ["-renewed_at"]

    def __str__(self):
        return f"{self.user} | {self.course_id} renewed {self.renewed_at.date()}"
