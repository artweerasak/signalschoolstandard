"""
military_reports/pdx_views.py

Endpoints สำหรับส่งออกฟอร์ม PDX (นำเข้าระบบ PDX ของ ทบ.)
  - api_units_list   : รายชื่อหน่วยจริง (autocomplete) กรองตามทัพภาค
  - api_export_count : จำนวนคนที่จะ export (พร้อมยอดผ่าน/ไม่ผ่าน) — พรีวิวก่อนดาวน์โหลด
  - api_export_pdx   : ส่งออกไฟล์ .xlsx (4 คอลัมน์ตามฟอร์ม PDX)

filter ที่รองรับ: army_region (ทัพภาค) · units (หลายหน่วย คั่นด้วยเครื่องหมายจุลภาค ,)
"""
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .api_views import _PERSONNEL_QS, _require_admin
from military_profile.permissions import _require_org_admin, get_org_scope
from military_profile.compliance import army_region_q, bulk_get_compliance_statuses
from .exporters.pdx_exporter import export_pdx


def _pdx_queryset(request, org_id=None):
    """คิว MilitaryUserProfile ตาม filter: ทัพภาค + หลายหน่วย (ชื่อตรงเป๊ะ)
    + org_id (บังคับสำหรับ org_admin — ดู get_org_scope)"""
    qs = _PERSONNEL_QS()
    if org_id is not None:
        qs = qs.filter(organization_id=org_id)
    region = request.GET.get("army_region", "").strip()
    if region:
        qs = qs.filter(army_region_q(region))
    units_raw = request.GET.get("units", "").strip()
    if units_raw:
        unit_list = [u.strip() for u in units_raw.split(",") if u.strip()]
        if unit_list:
            qs = qs.filter(unit__in=unit_list)
    return qs


@require_GET
@_require_org_admin
def api_units_list(request):
    """รายชื่อหน่วยจริงในระบบ (autocomplete) — กรองตามทัพภาคได้
    org_admin เห็นแค่หน่วยตัวเอง (list จะมีแค่ 1 รายการ)"""
    is_unscoped, org_id = get_org_scope(request)
    if not is_unscoped and org_id is None:
        return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)
    qs = _PERSONNEL_QS()
    if org_id is not None:
        qs = qs.filter(organization_id=org_id)
    region = request.GET.get("army_region", "").strip()
    if region:
        qs = qs.filter(army_region_q(region))
    units = list(qs.exclude(unit="").values_list("unit", flat=True).distinct().order_by("unit"))
    return JsonResponse({"units": units, "count": len(units)})


@require_GET
@_require_org_admin
def api_export_count(request):
    """จำนวนคนที่จะ export ตาม filter ปัจจุบัน (พร้อมยอดผ่าน/ไม่ผ่าน) ไว้พรีวิว
    org_admin เห็นแค่หน่วยตัวเอง"""
    is_unscoped, org_id = get_org_scope(request)
    if not is_unscoped and org_id is None:
        return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)
    profiles = list(_pdx_queryset(request, org_id))
    statuses = bulk_get_compliance_statuses(profiles)
    passed = sum(1 for p in profiles if statuses.get(p.user_id) == "passed")
    total = len(profiles)
    return JsonResponse({"count": total, "passed": passed, "not_passed": total - passed})


@require_GET
@_require_org_admin
def api_export_pdx(request):
    """ส่งออกไฟล์ .xlsx ตามฟอร์ม PDX (เลขบัตร | ยศ ชื่อ-สกุล | สังกัด | ผลการศึกษา)
    org_admin export ได้แค่หน่วยตัวเอง

    filter เพิ่ม: result = "passed" (เฉพาะผ่าน) | "not_passed" (เฉพาะไม่ผ่าน) | "" (ทั้งหมด)
    """
    is_unscoped, org_id = get_org_scope(request)
    if not is_unscoped and org_id is None:
        return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)
    qs = _pdx_queryset(request, org_id).select_related("user").order_by("unit", "rank", "full_name_th")
    profiles = list(qs)
    statuses = bulk_get_compliance_statuses(profiles)

    result_filter = request.GET.get("result", "").strip()  # passed | not_passed | ""

    rows = []
    for p in profiles:
        is_passed = statuses.get(p.user_id) == "passed"
        # กรองตามผลการศึกษาที่เลือก
        if result_filter == "passed" and not is_passed:
            continue
        if result_filter == "not_passed" and is_passed:
            continue
        try:
            nid = p.national_id  # decrypt
        except Exception:
            nid = ""
        rows.append({
            "national_id": nid,
            "rank_name": f"{p.get_rank_display()} {p.full_name_th}".strip(),
            "unit": p.unit or "",
            "result": "ผ่าน" if is_passed else "ไม่ผ่าน",
        })
    return export_pdx(rows)
