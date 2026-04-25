"""Filter: ค้นหาตามสถานะการผ่าน/ไม่ผ่านหลักสูตร"""
from django import forms
from .base import BaseSearchFilter


PASS_STATUS_CHOICES = [
    ("", "-- ทั้งหมด --"),
    ("passed", "ผ่านหลักสูตร"),
    ("failed", "ไม่ผ่านหลักสูตร"),
    ("not_enrolled", "ยังไม่ได้ลงทะเบียน"),
    ("expired", "ใบประกาศหมดอายุ"),
]


class CourseStatusFilter(BaseSearchFilter):
    filter_key = "course_status"
    display_name = "สถานะหลักสูตร/รายวิชา"

    def get_form_fields(self):
        return {
            "course_id": forms.CharField(
                label="Course ID หรือชื่อหลักสูตร",
                required=False,
                widget=forms.TextInput(attrs={"placeholder": "course-v1:Org+Course+Run"}),
            ),
            "pass_status": forms.ChoiceField(
                label="สถานะ",
                choices=PASS_STATUS_CHOICES,
                required=False,
            ),
        }

    def apply(self, queryset, params):
        """
        Annotates queryset with course enrollment/certificate status.
        Filters MilitaryUserProfile queryset by joining with edX tables.
        """
        from django.db.models import OuterRef, Subquery, Exists
        from certificate_expiry.models import UserCertificateExpiry

        course_id = params.get("course_id", "").strip()
        pass_status = params.get("pass_status", "").strip()

        if not course_id or not pass_status:
            return queryset

        cert_qs = UserCertificateExpiry.objects.filter(
            user=OuterRef("user"),
            course_id=course_id,
        )

        if pass_status == "passed":
            queryset = queryset.filter(
                Exists(cert_qs.filter(status__in=["active", "renewed"]))
            )
        elif pass_status == "expired":
            queryset = queryset.filter(
                Exists(cert_qs.filter(status="expired"))
            )
        elif pass_status == "failed":
            # Has enrollment but no certificate.
            try:
                from lms.djangoapps.coursewarehistoryextended.models import StudentModuleHistory
                from student.models import CourseEnrollment
                enrolled_qs = CourseEnrollment.objects.filter(
                    user=OuterRef("user"),
                    course_id=course_id,
                    is_active=True,
                )
                queryset = queryset.filter(
                    Exists(enrolled_qs)
                ).exclude(
                    Exists(cert_qs)
                )
            except ImportError:
                pass
        elif pass_status == "not_enrolled":
            try:
                from student.models import CourseEnrollment
                enrolled_qs = CourseEnrollment.objects.filter(
                    user=OuterRef("user"),
                    course_id=course_id,
                )
                queryset = queryset.exclude(Exists(enrolled_qs))
            except ImportError:
                pass

        return queryset
