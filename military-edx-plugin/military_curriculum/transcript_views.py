"""
military_curriculum/transcript_views.py

Learner Transcript (student) — Sprint 5

ทุกคนเข้าถึงได้เฉพาะข้อมูลของตัวเอง (self only) — ใช้ _require_login เฉยๆ
ไม่ผูก role เฉพาะ (กำลังพลทุกคนเป็น student ได้เสมอ)
"""
from django.http import JsonResponse

from military_profile.permissions import _require_login

from .services.gatekeeper_service import get_gated_transcript


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
