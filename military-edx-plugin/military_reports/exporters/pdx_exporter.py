"""
military_reports/exporters/pdx_exporter.py

ส่งออกรายชื่อกำลังพลเป็นไฟล์ Excel ตามฟอร์ม "PDX" ของ ทบ. (เพื่อนำเข้าระบบ PDX)
รูปแบบตรงตาม template: 4 คอลัมน์ ในชีตแรกชื่อ "sheet1"
    A: เลขบัตรประชาชน   B: ยศ ชื่อ-สกุล   C: สังกัด   D: ผลการศึกษา
"""
import io
from datetime import date

from django.http import HttpResponse
import openpyxl


def export_pdx(rows) -> HttpResponse:
    """
    rows: iterable ของ dict {national_id, rank_name, unit, result}
    คืน HttpResponse เป็นไฟล์ .xlsx ตามฟอร์ม PDX
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "sheet1"  # PDX อ่านชีตแรก — ห้ามเปลี่ยนชื่อ/ลำดับคอลัมน์

    # หัวตาราง (ต้องตรงกับ template ที่ PDX นำเข้า)
    ws.append(["เลขบัตรประชาชน", "ยศ ชื่อ-สกุล", "สังกัด", "ผลการศึกษา"])

    for r in rows:
        ws.append([
            str(r.get("national_id", "")),
            r.get("rank_name", ""),
            r.get("unit", ""),
            r.get("result", ""),
        ])

    # บังคับคอลัมน์ A (เลขบัตร) เป็นข้อความ กัน Excel ตัดเลข 0 นำหน้า/แปลงเป็น scientific
    for cell in ws["A"]:
        cell.number_format = "@"

    # ความกว้างพอดีอ่าน
    widths = {"A": 18, "B": 32, "C": 28, "D": 14}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"pdx_export_{date.today().isoformat()}.xlsx"
    response = HttpResponse(
        buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
