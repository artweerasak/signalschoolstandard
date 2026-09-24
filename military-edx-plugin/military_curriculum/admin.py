"""
military_curriculum/admin.py — Django Admin สำหรับจัดการหลักสูตร/วิชา/
คำขอบรรจุ/คะแนน/แบบประเมิน ก่อนที่ frontend (Next.js) จะพร้อมใช้งานจริง
"""
from django.contrib import admin

from .models import (
    Curriculum,
    CurriculumRegionQuota,
    CurriculumCourse,
    CurriculumEnrollmentRequest,
    CurriculumCourseInstructor,
    ManualGradeEntry,
    FinalCourseResult,
    EvaluationForm,
    EvaluationResponse,
)


class CurriculumRegionQuotaInline(admin.TabularInline):
    model = CurriculumRegionQuota
    extra = 1


class CurriculumCourseInline(admin.TabularInline):
    model = CurriculumCourse
    extra = 1
    fields = ("course_id", "display_name", "sequence_order", "credit_hours", "credits", "assessment_type", "is_required")


@admin.register(Curriculum)
class CurriculumAdmin(admin.ModelAdmin):
    list_display = ("name", "batch_code", "academic_year", "organization", "status", "quota_total", "created_by")
    list_filter = ("status", "academic_year", "organization")
    search_fields = ("name", "batch_code")
    inlines = [CurriculumRegionQuotaInline, CurriculumCourseInline]
    readonly_fields = ("created_at", "updated_at", "submitted_at")


@admin.register(CurriculumEnrollmentRequest)
class CurriculumEnrollmentRequestAdmin(admin.ModelAdmin):
    list_display = ("student", "curriculum", "status", "requested_by", "created_at", "processed_at")
    list_filter = ("status", "curriculum")
    search_fields = ("student__username", "student__first_name")
    readonly_fields = ("created_at", "processed_at", "result_detail")


@admin.register(CurriculumCourseInstructor)
class CurriculumCourseInstructorAdmin(admin.ModelAdmin):
    list_display = ("user", "curriculum_course", "is_owner", "added_by", "created_at")
    list_filter = ("is_owner",)
    search_fields = ("user__username",)


@admin.register(ManualGradeEntry)
class ManualGradeEntryAdmin(admin.ModelAdmin):
    list_display = ("student", "curriculum_course", "component_name", "score", "max_score", "weight", "entered_by", "entered_at")
    list_filter = ("curriculum_course__curriculum",)
    search_fields = ("student__username", "component_name")
    readonly_fields = ("entered_at",)


@admin.register(FinalCourseResult)
class FinalCourseResultAdmin(admin.ModelAdmin):
    list_display = ("student", "curriculum_course", "final_score", "passed", "computed_by", "computed_at")
    list_filter = ("passed", "curriculum_course__curriculum")
    search_fields = ("student__username",)
    readonly_fields = ("computed_at",)


@admin.register(EvaluationForm)
class EvaluationFormAdmin(admin.ModelAdmin):
    list_display = ("title", "level", "curriculum", "curriculum_course", "is_required", "is_active", "created_by")
    list_filter = ("level", "is_required", "is_active")
    search_fields = ("title",)


@admin.register(EvaluationResponse)
class EvaluationResponseAdmin(admin.ModelAdmin):
    list_display = ("student", "form", "submitted_at")
    list_filter = ("form",)
    search_fields = ("student__username",)
    readonly_fields = ("submitted_at", "answers")
