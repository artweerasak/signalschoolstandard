"""
military_reports/exporters/pdf_exporter.py

Generates PDF using WeasyPrint from an HTML template.
"""
from datetime import date

from django.http import HttpResponse
from django.template.loader import render_to_string


def export_pdf(queryset) -> HttpResponse:
    context = {
        "results": queryset,
        "report_date": date.today(),
    }
    html_content = render_to_string("military_reports/report_pdf.html", context)

    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content).write_pdf()
    except ImportError:
        return HttpResponse(
            "WeasyPrint ยังไม่ได้ติดตั้ง กรุณารัน: pip install WeasyPrint",
            status=503,
        )

    filename = f"report_{date.today().isoformat()}.pdf"
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
