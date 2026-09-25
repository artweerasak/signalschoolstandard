"""
military_curriculum/grading_views.py

Hybrid Grading & Co-Instructor (instructor) — Sprint 3

Object-level permission: การเข้าถึงวิชาหนึ่งๆ ต้องเป็น owner หรือ
co-instructor ของวิชานั้นจริง (เช็คผ่าน CurriculumCourseInstructor ไม่ใช่
แค่ role="instructor" เฉยๆ) — เพิ่ม/ลบ co-instructor สงวนไว้เฉพาะ owner
"""
import json

from django.contrib.auth import get_user_model
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

from military_profile.permissions import (
    require_role, ROLE_ADMIN, ROLE_INSTRUCTOR,
    user_is_course_instructor, user_owns_curriculum_course,
)

from .models import CurriculumCourse, CurriculumCourseInstructor, ManualGradeEntry, FinalCourseResult
from .services.grading_service import sync_course_access_role, finalize_course

User = get_user_model()


def _get_course_scoped(request, curriculum_course_id):
    """คืน CurriculumCourse ถ้า user เป็น owner/co-instructor หรือ admin"""
    try:
        cc = CurriculumCourse.objects.select_related("curriculum").get(pk=curriculum_course_id)
    except CurriculumCourse.DoesNotExist:
        return None, JsonResponse({"error": "Not found"}, status=404)

    profile = getattr(request.user, "military_profile", None)
    is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if not is_admin and not user_is_course_instructor(request.user, cc):
        return None, JsonResponse({"error": "Forbidden"}, status=403)

    return cc, None


@require_role([ROLE_INSTRUCTOR, ROLE_ADMIN])
def api_my_courses(request):
    """GET /military/api/v1/curriculum/my-courses/
    รายวิชาที่ user เป็นเจ้าของ/ผู้ช่วยสอน"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    assignments = CurriculumCourseInstructor.objects.filter(
        user=request.user
    ).select_related("curriculum_course__curriculum")

    results = [
        {
            "id": a.curriculum_course.id,
            "course_id": a.curriculum_course.course_id,
            "display_name": a.curriculum_course.display_name,
            "curriculum_name": a.curriculum_course.curriculum.name,
            "is_owner": a.is_owner,
            "student_count": a.curriculum_course.final_results.count(),
        }
        for a in assignments
    ]
    return JsonResponse({"results": results, "count": len(results)})


@require_role([ROLE_INSTRUCTOR, ROLE_ADMIN])
def api_course_roster(request, curriculum_course_id: int):
    """GET /military/api/v1/curriculum/my-courses/{id}/roster/
    รายชื่อนักเรียน + คะแนนสรุป (FinalCourseResult ล่าสุดถ้ามี) + จำนวน
    manual grade entries ต่อคน"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    cc, err = _get_course_scoped(request, curriculum_course_id)
    if err:
        return err

    final_results = {r.student_id: r for r in cc.final_results.all()}
    manual_counts: dict[int, int] = {}
    for e in cc.manual_grades.values_list("student_id", flat=True):
        manual_counts[e] = manual_counts.get(e, 0) + 1

    # นักเรียนที่ผูกกับวิชานี้ผ่าน CurriculumEnrollmentRequest ที่สำเร็จแล้ว
    student_ids = set(
        cc.curriculum.enrollment_requests.filter(status__in=["completed", "partial_failed"])
        .values_list("student_id", flat=True)
    )
    students = User.objects.filter(id__in=student_ids).select_related("military_profile")

    results = []
    for s in students:
        profile = getattr(s, "military_profile", None)
        fr = final_results.get(s.id)
        results.append({
            "student_id": s.id,
            "username": s.username,
            "full_name": profile.full_name_th if profile else s.username,
            "manual_grade_count": manual_counts.get(s.id, 0),
            "final_score": str(fr.final_score) if fr and fr.final_score is not None else None,
            "passed": fr.passed if fr else None,
        })
    return JsonResponse({"results": results, "count": len(results)})


@csrf_exempt
@require_role([ROLE_INSTRUCTOR, ROLE_ADMIN])
def api_manual_grades(request, curriculum_course_id: int):
    """POST /military/api/v1/curriculum/my-courses/{id}/manual-grades/
    {"student_id", "component_name", "score", "max_score", "weight", "notes"}"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    cc, err = _get_course_scoped(request, curriculum_course_id)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    student_id = data.get("student_id")
    component_name = (data.get("component_name") or "").strip()
    if not student_id or not component_name:
        return JsonResponse({"error": "student_id, component_name required"}, status=400)
    try:
        student = User.objects.get(pk=student_id)
    except User.DoesNotExist:
        return JsonResponse({"error": "student not found"}, status=404)

    entry = ManualGradeEntry.objects.create(
        curriculum_course=cc, student=student, component_name=component_name,
        score=data.get("score") or 0, max_score=data.get("max_score") or 100,
        weight=data.get("weight") or 100, entered_by=request.user,
        notes=(data.get("notes") or "").strip(),
    )
    return JsonResponse({"id": entry.id, "component_name": entry.component_name, "score": str(entry.score)}, status=201)


@csrf_exempt
@require_role([ROLE_INSTRUCTOR, ROLE_ADMIN])
def api_manual_grade_detail(request, curriculum_course_id: int, grade_id: int):
    """PATCH /military/api/v1/curriculum/my-courses/{id}/manual-grades/{grade_id}/"""
    if request.method != "PATCH":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    cc, err = _get_course_scoped(request, curriculum_course_id)
    if err:
        return err

    try:
        entry = cc.manual_grades.get(pk=grade_id)
    except ManualGradeEntry.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    for field in ("component_name", "notes"):
        if field in data:
            setattr(entry, field, (data[field] or "").strip())
    for field in ("score", "max_score", "weight"):
        if field in data:
            setattr(entry, field, data[field])
    entry.save()
    return JsonResponse({"id": entry.id, "score": str(entry.score), "max_score": str(entry.max_score)})


@csrf_exempt
@require_role([ROLE_INSTRUCTOR, ROLE_ADMIN])
def api_course_finalize(request, curriculum_course_id: int):
    """POST /military/api/v1/curriculum/my-courses/{id}/finalize/
    คำนวณ FinalCourseResult ของทุกคนที่ enroll วิชานี้ (auto + manual ผสม)"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    cc, err = _get_course_scoped(request, curriculum_course_id)
    if err:
        return err

    results = finalize_course(cc)
    for r in results:
        r.computed_by = request.user
        r.save(update_fields=["computed_by"])

    return JsonResponse({"finalized_count": len(results)})


@require_role([ROLE_INSTRUCTOR, ROLE_ADMIN])
def api_co_instructors(request, curriculum_course_id: int):
    """
    GET  /military/api/v1/curriculum/my-courses/{id}/co-instructors/
    POST /military/api/v1/curriculum/my-courses/{id}/co-instructors/  {"user_id"}  → owner เท่านั้น
    """
    cc, err = _get_course_scoped(request, curriculum_course_id)
    if err:
        return err

    if request.method == "GET":
        results = [
            {"user_id": a.user_id, "username": a.user.username, "is_owner": a.is_owner}
            for a in cc.instructors.select_related("user")
        ]
        return JsonResponse({"results": results})

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    profile = getattr(request.user, "military_profile", None)
    is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if not is_admin and not user_owns_curriculum_course(request.user, cc):
        return JsonResponse({"error": "เฉพาะเจ้าของวิชาเท่านั้นที่เพิ่มผู้ช่วยสอนได้"}, status=403)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    user_id = data.get("user_id")
    try:
        target_user = User.objects.get(pk=user_id)
    except (User.DoesNotExist, TypeError, ValueError):
        return JsonResponse({"error": "user not found"}, status=404)

    if CurriculumCourseInstructor.objects.filter(curriculum_course=cc, user=target_user).exists():
        return JsonResponse({"error": "ผู้ใช้นี้เป็นผู้สอนวิชานี้อยู่แล้ว"}, status=409)

    CurriculumCourseInstructor.objects.create(
        curriculum_course=cc, user=target_user, is_owner=False, added_by=request.user,
    )
    sync_course_access_role(cc.course_id, target_user, add=True)
    return JsonResponse({"user_id": target_user.id, "username": target_user.username}, status=201)


@csrf_exempt
@require_role([ROLE_INSTRUCTOR, ROLE_ADMIN])
def api_co_instructor_detail(request, curriculum_course_id: int, user_id: int):
    """DELETE /military/api/v1/curriculum/my-courses/{id}/co-instructors/{user_id}/  → owner เท่านั้น"""
    if request.method != "DELETE":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    cc, err = _get_course_scoped(request, curriculum_course_id)
    if err:
        return err

    profile = getattr(request.user, "military_profile", None)
    is_admin = request.user.is_staff or (profile and profile.role == ROLE_ADMIN)
    if not is_admin and not user_owns_curriculum_course(request.user, cc):
        return JsonResponse({"error": "เฉพาะเจ้าของวิชาเท่านั้นที่ลบผู้ช่วยสอนได้"}, status=403)

    try:
        assignment = CurriculumCourseInstructor.objects.get(curriculum_course=cc, user_id=user_id)
    except CurriculumCourseInstructor.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if assignment.is_owner:
        return JsonResponse({"error": "ลบเจ้าของวิชาไม่ได้"}, status=409)

    target_user = assignment.user
    assignment.delete()
    sync_course_access_role(cc.course_id, target_user, add=False)
    return JsonResponse({"deleted": True})
