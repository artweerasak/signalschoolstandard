"""
military_reports/views.py

Report search view + Admin/HR Dashboard.
Supports GET-based search (form method="GET") so that search URLs are bookmarkable.
"""
import json
import logging
from datetime import date, timedelta

from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import TemplateView
from django import forms
from django.http import HttpResponse

from military_profile.models import MilitaryUserProfile, RANK_CHOICES
from certificate_expiry.models import UserCertificateExpiry, CourseCertificateConfig
from .models import SearchFilterRegistry

log = logging.getLogger(__name__)


class ReportSearchView(LoginRequiredMixin, TemplateView):
    """
    Dynamic report search page.
    Uses GET params for search so URLs are bookmarkable/shareable.
    Loads all active filters from SearchFilterRegistry dynamically.
    """

    template_name = "military_reports/report_search.html"
    login_url = "/admin/login/"

    def _get_active_filters(self):
        filters = []
        for entry in SearchFilterRegistry.objects.filter(is_active=True):
            try:
                filters.append(entry.load_filter_class()())
            except Exception as exc:
                log.error("ReportSearchView: failed to load filter %s — %s",
                          entry.filter_key, exc)
        return filters

    def _build_form_class(self, active_filters):
        field_dict = {}
        for f in active_filters:
            field_dict.update(f.get_form_fields())
        field_dict["export_format"] = forms.ChoiceField(
            label="รูปแบบรายงาน",
            choices=[
                ("html", "แสดงบนหน้าจอ"),
                ("excel", "Excel"),
                ("pdf", "PDF"),
                ("csv", "CSV"),
            ],
            required=False,
            initial="html",
        )
        return type("DynamicReportForm", (forms.Form,), field_dict)

    def get(self, request, *args, **kwargs):
        active_filters = self._get_active_filters()
        FormClass = self._build_form_class(active_filters)

        # Only run search when the form has been submitted (any param present)
        has_params = any(
            k for k in request.GET if k not in ("export_format", "csrfmiddlewaretoken")
        )
        export_format = request.GET.get("export_format", "html")
        # Also treat export request as search trigger
        is_export = export_format in ("excel", "pdf", "csv")

        results = None
        form = FormClass(request.GET if (has_params or is_export) else None)

        if (has_params or is_export) and form.is_valid():
            params = form.cleaned_data
            queryset = MilitaryUserProfile.objects.select_related("user").all()
            for f in active_filters:
                queryset = f.apply(queryset, params)

            if is_export:
                return self._export(queryset, export_format)

            results = queryset

        if form is None:
            form = FormClass()

        context = self.get_context_data(form=form, results=results)
        return self.render_to_response(context)

    def _export(self, queryset, export_format):
        if export_format == "excel":
            from .exporters.excel_exporter import export_excel
            return export_excel(queryset)
        elif export_format == "pdf":
            from .exporters.pdf_exporter import export_pdf
            return export_pdf(queryset)
        elif export_format == "csv":
            from .exporters.csv_exporter import export_csv
            return export_csv(queryset)
        return HttpResponse("Unknown export format", status=400)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardView(LoginRequiredMixin, TemplateView):
    """
    Admin / HR dashboard — summary stats, per-course chart, and expiry alerts.
    """

    template_name = "military_reports/dashboard.html"
    login_url = "/admin/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        today = date.today()
        soon = today + timedelta(days=30)

        # ── Summary counts ──────────────────────────────────────────────────
        total_personnel = MilitaryUserProfile.objects.count()
        all_certs = UserCertificateExpiry.objects.all()
        active_count = all_certs.filter(status="active").count()
        expired_count = all_certs.filter(status="expired").count()
        renewed_count = all_certs.filter(status="renewed").count()
        near_expiry_count = all_certs.filter(
            status="active", expiry_date__lte=soon, expiry_date__gte=today
        ).count()

        ctx["total_personnel"] = total_personnel
        ctx["active_count"] = active_count
        ctx["expired_count"] = expired_count
        ctx["renewed_count"] = renewed_count
        ctx["near_expiry_count"] = near_expiry_count

        # ── Chart: status per course ────────────────────────────────────────
        courses = CourseCertificateConfig.objects.all()
        chart_labels = []
        chart_active = []
        chart_expired = []
        chart_renewed = []
        for course in courses:
            short_id = course.course_id.split("+")[-2] if "+" in course.course_id else course.course_id
            chart_labels.append(short_id)
            certs = all_certs.filter(course_id=course.course_id)
            chart_active.append(certs.filter(status="active").count())
            chart_expired.append(certs.filter(status="expired").count())
            chart_renewed.append(certs.filter(status="renewed").count())

        ctx["chart_labels_json"] = json.dumps(chart_labels, ensure_ascii=False)
        ctx["chart_active_json"] = json.dumps(chart_active)
        ctx["chart_expired_json"] = json.dumps(chart_expired)
        ctx["chart_renewed_json"] = json.dumps(chart_renewed)

        # ── Alert table: expiring within 30 days ───────────────────────────
        expiring_soon = (
            all_certs.filter(status="active", expiry_date__lte=soon, expiry_date__gte=today)
            .select_related("user__military_profile")
            .order_by("expiry_date")[:50]
        )
        ctx["expiring_soon"] = expiring_soon

        # ── Expired (no action yet) ─────────────────────────────────────────
        recently_expired = (
            all_certs.filter(status="expired")
            .select_related("user__military_profile")
            .order_by("-expiry_date")[:20]
        )
        ctx["recently_expired"] = recently_expired

        # ── Rank distribution ───────────────────────────────────────────────
        rank_stats = []
        rank_lookup = dict(RANK_CHOICES)
        for code, label in RANK_CHOICES:
            count = MilitaryUserProfile.objects.filter(rank=code).count()
            if count:
                rank_stats.append({"code": code, "label": label, "count": count})
        ctx["rank_stats"] = rank_stats

        return ctx
