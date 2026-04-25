"""
military_reports/exporters/csv_exporter.py
"""
import csv
from datetime import date

from django.http import HttpResponse


def export_csv(queryset) -> HttpResponse:
    filename = f"report_{date.today().isoformat()}.csv"
    response = HttpResponse(content_type="text/csv; charset=utf-8-sig")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    writer = csv.writer(response)
    writer.writerow([
        "ลำดับ", "ชื่อ-นามสกุล", "ชั้นยศ", "หน่วยต้นสังกัด", "หน่วยรอง",
        "อายุ (ปี)", "อายุราชการ (ปี)", "วันเริ่มรับราชการ",
    ])

    for idx, profile in enumerate(queryset, start=1):
        writer.writerow([
            idx,
            profile.full_name_th,
            profile.get_rank_display(),
            profile.unit,
            profile.sub_unit,
            profile.age,
            profile.service_years,
            profile.service_start_date.strftime("%d/%m/%Y"),
        ])

    return response
