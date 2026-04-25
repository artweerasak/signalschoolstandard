"""
certificate_renewal/views.py

Views for the certificate renewal flow:
  1. RenewalStatusView  — shows the learner their expired certs and options
  2. RenewalExamView    — presents the renewal exam
  3. RenewalSubmitView  — scores the exam and issues a renewed certificate
"""
import logging
from datetime import date

from dateutil.relativedelta import relativedelta
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect
from django.views.generic import TemplateView, View

from certificate_expiry.models import (
    CourseCertificateConfig,
    CertificateRenewalHistory,
    UserCertificateExpiry,
)

log = logging.getLogger(__name__)


class RenewalStatusView(LoginRequiredMixin, TemplateView):
    """Shows the learner all their expired / near-expiry certificates."""

    template_name = "certificate_renewal/renewal_status.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        user = self.request.user
        ctx["expired_certs"] = UserCertificateExpiry.objects.filter(
            user=user,
            status=UserCertificateExpiry.STATUS_EXPIRED,
        )
        ctx["near_expiry_certs"] = UserCertificateExpiry.objects.filter(
            user=user,
            status=UserCertificateExpiry.STATUS_ACTIVE,
            expiry_date__lte=date.today() + relativedelta(days=30),
        )
        return ctx


class RenewalExamView(LoginRequiredMixin, TemplateView):
    """
    Presents the renewal exam for a specific course.
    The actual exam content is an edX problem block embedded via XBlock URL.
    """

    template_name = "certificate_renewal/renewal_exam.html"

    def get(self, request, course_id, *args, **kwargs):
        cert_expiry = get_object_or_404(
            UserCertificateExpiry,
            user=request.user,
            course_id=course_id,
            status=UserCertificateExpiry.STATUS_EXPIRED,
        )
        config = get_object_or_404(CourseCertificateConfig, course_id=course_id)

        if not config.allow_renewal_exam:
            messages.error(request, "หลักสูตรนี้ไม่อนุญาตให้ทำแบบทดสอบต่ออายุ กรุณาเรียนซ้ำทั้งหลักสูตร")
            return redirect("certificate_renewal:status")

        ctx = {
            "cert_expiry": cert_expiry,
            "config": config,
            "course_id": course_id,
        }
        return self.render_to_response(ctx)


class RenewalSubmitView(LoginRequiredMixin, View):
    """
    Processes renewal exam submission.

    In production this is called by the edX grading signal after the learner
    completes the exam problem block.  It can also be triggered via a webhook
    from the LMS grader.
    """

    def post(self, request, course_id, *args, **kwargs):
        cert_expiry = get_object_or_404(
            UserCertificateExpiry,
            user=request.user,
            course_id=course_id,
            status=UserCertificateExpiry.STATUS_EXPIRED,
        )
        config = get_object_or_404(CourseCertificateConfig, course_id=course_id)

        # Score submitted by the LMS grader (0–100).
        try:
            score = float(request.POST.get("score", 0))
        except ValueError:
            score = 0.0

        if score >= config.renewal_passing_score:
            # Issue renewed certificate.
            previous_expiry = cert_expiry.expiry_date
            new_expiry = date.today() + relativedelta(years=config.validity_years)

            cert_expiry.issued_date = date.today()
            cert_expiry.expiry_date = new_expiry
            cert_expiry.status = UserCertificateExpiry.STATUS_RENEWED
            cert_expiry.renewal_count += 1
            cert_expiry.save()

            CertificateRenewalHistory.objects.create(
                user=request.user,
                course_id=course_id,
                method=CertificateRenewalHistory.METHOD_EXAM,
                score=score,
                previous_expiry_date=previous_expiry,
                new_expiry_date=new_expiry,
            )

            messages.success(
                request,
                f"ยินดีด้วย! คุณผ่านแบบทดสอบ ({score:.0f}%) ใบประกาศของคุณได้รับการต่ออายุถึง {new_expiry.strftime('%d/%m/%Y')}",
            )
            log.info(
                "RenewalSubmitView: user=%s course=%s renewed → expiry=%s score=%.1f",
                request.user.id, course_id, new_expiry, score,
            )
        else:
            messages.error(
                request,
                f"คะแนนของคุณ {score:.0f}% ต่ำกว่าเกณฑ์ผ่าน {config.renewal_passing_score}% "
                f"กรุณาลองใหม่อีกครั้งหรือเรียนซ้ำทั้งหลักสูตร",
            )
            log.info(
                "RenewalSubmitView: user=%s course=%s FAILED score=%.1f threshold=%d",
                request.user.id, course_id, score, config.renewal_passing_score,
            )

        return redirect("certificate_renewal:status")
