"""
military_curriculum/transcript_views.py

Learner Transcript (student) — Sprint 5
Org-wide personnel completion history (org_admin) — Sprint 2 (2026-09)

ทุกคนเข้าถึงได้เฉพาะข้อมูลของตัวเอง (self only) — ใช้ _require_login เฉยๆ
ไม่ผูก role เฉพาะ (กำลังพลทุกคนเป็น student ได้เสมอ)
"""
from django.contrib.auth import get_user_model
from django.http import JsonResponse

from military_profile.permissions import _require_login, _require_org_admin, get_org_scope

from .services.gatekeeper_service import get_gated_transcript

User = get_user_model()


@_require_login
def api_my_transcript(request):
    """GET /military/api/v1/curriculum/my/transcript/
    ระเบียนประวัติการเรียน (หลักสูตรที่เรียน, วิชา, เกรด — ผ่าน gatekeeper
    filter, ใบประกาศพร้อมดาวน์โหลดหรือไม่)"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    curricula = get_gated_transcript(request.user)
    total_credits = sum(
        float(c["credits"]) for entry in curricula for c in entry["courses"]
        if c["grade_visible"] and c["passed"]
    )
    return JsonResponse({"curricula": curricula, "total_credits_earned": total_credits})


@_require_login
def api_my_certificate(request, curriculum_id: int):
    """GET /military/api/v1/curriculum/my/transcript/{curriculum_id}/certificate/

    ⚠️ ยังไม่ generate ไฟล์ใบประกาศจริง (ต้องตัดสินใจร่วมกับทีมว่าจะ reuse
    ระบบ certificate_expiry/WeasyPrint ที่มีอยู่แล้วหรือทำใหม่ — เป็น policy/
    design decision นอก scope ของ Sprint 5 ตามที่ระบุไว้ในแผน) ตอนนี้คืนแค่
    สถานะว่าพร้อมดาวน์โหลดหรือยัง ตาม gate — ถ้า cert_available=false ต้อง
    บอกเหตุผล (ยังไม่ผ่าน gate หรือยังไม่ผ่านหลักสูตร) ก่อน hook เข้าระบบ
    generate ไฟล์จริงในอนาคต"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    curricula = get_gated_transcript(request.user)
    entry = next((c for c in curricula if c["curriculum_id"] == curriculum_id), None)
    if entry is None:
        return JsonResponse({"error": "ไม่พบหลักสูตรนี้ในระเบียนของคุณ"}, status=404)

    if not entry["certificate_available"]:
        reason = entry["gate_reason"] or "หลักสูตรยังไม่เสร็จสมบูรณ์"
        return JsonResponse({"available": False, "reason": reason}, status=403)

    # TODO: hook เข้าระบบ generate ใบประกาศจริง (ดู certificate_expiry app
    # ที่มี WeasyPrint อยู่แล้ว) — ต้องตัดสินใจ policy ก่อนว่าจะ reuse
    # หรือทำ template ใหม่เฉพาะ curriculum
    return JsonResponse({"available": True, "curriculum_name": entry["curriculum_name"]})


@_require_org_admin
def api_org_completions(request):
    """
    GET /military/api/v1/curriculum/org/completions/
    ประวัติการเรียนของกำลังพลในหน่วย — org_admin เห็นเฉพาะหน่วยตัวเอง เสมอ
    (ไม่สน ?org_id= ที่ส่งมา ป้องกันดูข้ามหน่วย), admin เต็มเห็นทุกหน่วย
    หรือกรองด้วย ?org_id= ได้ — จุดแรกที่ military_curriculum ใช้
    get_org_scope() (แทน inline comparison เดิมของแอปนี้เอง)

    reuse get_gated_transcript() ต่อกำลังพลแต่ละคนในหน่วย (เหมือน
    /my/transcript/ ของ student คนนั้นเป๊ะ — เห็นแค่สิ่งที่ผ่าน gate แล้ว)
    ไม่มี curriculum-level completed date เก็บอยู่จริงในระบบ (มีแค่ระดับวิชา
    ผ่าน FinalCourseResult.computed_at) จึงคืนละเอียดระดับวิชาให้ frontend
    จัดกลุ่มแสดงเอง
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    from military_profile.models import MilitaryUserProfile

    is_unscoped_admin, org_id = get_org_scope(request)
    if not is_unscoped_admin and not org_id:
        return JsonResponse({"error": "ยังไม่ได้ผูกหน่วยงาน"}, status=400)

    qs = MilitaryUserProfile.objects.exclude(role__in=("admin", "org_admin"))
    if org_id:
        qs = qs.filter(organization_id=org_id)

    results = []
    for p in qs.select_related("user").order_by("full_name_th"):
        curricula = get_gated_transcript(p.user)
        if not curricula:
            continue
        results.append({
            "student_id": p.user_id,
            "full_name": p.full_name_th,
            "rank_display": p.get_rank_display(),
            "curricula": curricula,
        })

    return JsonResponse({"results": results, "count": len(results)})
