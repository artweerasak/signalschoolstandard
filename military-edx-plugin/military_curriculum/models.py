"""
military_curriculum/models.py

วงรอบหลักสูตรประจำปี/รุ่น: Curriculum (parent) → CurriculumCourse (child, วิชา
ย่อยผูกกับ course_id ของ edX) → CurriculumEnrollmentRequest (audit/command
สำหรับ cascade enrollment) → ManualGradeEntry/FinalCourseResult (hybrid
grading) → EvaluationForm/EvaluationResponse (gatekeeper)

หลักการสำคัญ: ไม่สร้าง enrollment/grade model ใหม่ซ้ำกับของ edX เดิม —
enrollment จริงยังอยู่ที่ student.models.course_enrollment.CourseEnrollment
เสมอ (native), เกรดจริงยังอยู่ที่ lms.djangoapps.grades.models เสมอ โมเดลใน
ไฟล์นี้เป็นแค่ชั้นเสริม (audit/policy/snapshot) ไม่ใช่ source of truth ของ
enrollment/grade — ดู services/enrollment_service.py และ
services/gatekeeper_service.py

course_id เป็น CharField (ไม่ใช่ FK) เพราะ course content อยู่ใน modulestore
(Mongo/Split) ไม่ใช่ SQL — ตาม pattern เดียวกับ military_profile.CourseRequirement
"""
from django.contrib.auth import get_user_model
from django.db import models

from military_profile.models import RANK_CHOICES, PERSONNEL_TYPE_CHOICES

User = get_user_model()

# "นนส." (นักเรียนนายสิบ) ไม่ใช่ยศจริง (ยังไม่ได้รับการบรรจุยศ) จึงไม่อยู่ใน
# RANK_CHOICES กลางของ military_profile (ซึ่งผูกกับ MilitaryUserProfile.rank
# ของกำลังพลจริง) — เพิ่มเป็น choice เฉพาะสำหรับ dropdown คุณสมบัติผู้เข้ารับ
# การฝึกอบรมของ Curriculum เท่านั้น อยู่ลำดับต่ำสุด (ก่อน พลทหาร)
CURRICULUM_RANK_CHOICES = [("NNS", "นนส. (นักเรียนนายสิบ)")] + list(RANK_CHOICES)

# ลำดับชั้นยศจาก CURRICULUM_RANK_CHOICES (เรียงจากต่ำสุด→สูงสุด) — ใช้เทียบ
# ช่วงยศ (eligible_rank_min/max) โดยไม่ต้อง hardcode ลำดับซ้ำที่นี่
RANK_ORDER = {code: i for i, (code, _) in enumerate(CURRICULUM_RANK_CHOICES)}


def ranks_in_range(rank_min: str, rank_max: str) -> list:
    """คืนรายการรหัสยศทั้งหมดที่อยู่ในช่วง [rank_min, rank_max] (รวมขอบ) —
    ว่างทั้งคู่ = ไม่จำกัดช่วงยศ (คืนทุกยศ), ว่างด้านเดียว = ไม่จำกัดด้านนั้น"""
    lo = RANK_ORDER.get(rank_min, 0) if rank_min else 0
    hi = RANK_ORDER.get(rank_max, len(CURRICULUM_RANK_CHOICES) - 1) if rank_max else len(CURRICULUM_RANK_CHOICES) - 1
    return [code for code, idx in RANK_ORDER.items() if lo <= idx <= hi]


# ประเภทหลักสูตร (independent จากชื่อ/รุ่น/ปี ที่อาจสะกด/ตั้งชื่อต่างกันไปในแต่
# ละปี เช่น "นายสิบชั้นต้นผ่านสื่อฯ" vs "นายสิบชั้นต้นเร่งรัด" ก็เป็นประเภท
# nco_basic เหมือนกัน) — ใช้เป็นเงื่อนไข prerequisite ข้ามหลักสูตร (ดู
# Curriculum.eligible_prerequisite_categories) เพิ่มตัวเลือกใหม่ได้ทีหลังง่ายๆ
# แค่แก้ list นี้ ไม่ต้อง migration เพราะเก็บเป็น CharField ธรรมดา
CURRICULUM_CATEGORY_CHOICES = [
    ("nco_basic", "นายสิบชั้นต้น"),
    ("nco_senior", "นายสิบชั้นสูง (อาวุโส)"),
    ("officer_company", "นายทหารสัญญาบัตร ชั้นนายร้อย"),
    ("officer_field", "นายทหารสัญญาบัตร ชั้นนายพัน"),
    ("officer_senior", "นายทหารสัญญาบัตร ชั้นนายพล/เสนาธิการ"),
    ("other", "อื่นๆ"),
]
CURRICULUM_CATEGORY_CODES = {code for code, _ in CURRICULUM_CATEGORY_CHOICES}

# ประเภทหลักสูตรตามเกณฑ์ของแผนกเตรียมการ (คนละเรื่องกับ CURRICULUM_CATEGORY_
# CHOICES ข้างบน ซึ่งเป็น key ภายในไว้จับคู่ prerequisite เท่านั้น) — ใช้แค่
# แสดง/กรองตามเกณฑ์การจัดหลักสูตรของแผนกเตรียมการ ไม่ผูกกับ logic อื่นใด
TRAINING_PURPOSE_CHOICES = [
    ("production", "หลักสูตรผลิต"),
    ("career_track", "หลักสูตรตามแนวทางรับราชการ"),
    ("skill_enrichment", "หลักสูตรเพิ่มพูนความรู้"),
    ("special_external_budget", "หลักสูตรพิเศษ (ใช้งบประมาณจากภายนอก)"),
]
TRAINING_PURPOSE_CODES = {code for code, _ in TRAINING_PURPOSE_CHOICES}

ELIGIBLE_BRANCH_CHOICES = [
    ("signal", "เหล่า ส."),
    ("any", "ไม่จำกัดเหล่า"),
    ("unspecified", "ไม่ระบุ"),
]
ELIGIBLE_BRANCH_CODES = {code for code, _ in ELIGIBLE_BRANCH_CHOICES}


def personnel_type_display(codes) -> list:
    """eligible_personnel_type เป็น JSONField list ของ code แล้ว (เดิมเป็น
    CharField เดี่ยวที่มี get_eligible_personnel_type_display() ให้ใช้ฟรีจาก
    Django) — ฟังก์ชันนี้ทำหน้าที่แทนสำหรับ list"""
    labels = dict(PERSONNEL_TYPE_CHOICES)
    return [labels.get(code, code) for code in (codes or [])]


def prerequisite_categories_display(prerequisites) -> list:
    """eligible_prerequisite_categories เป็น list ของ {"category","min_years_since"}
    แล้ว (เดิมเป็น list[str] เฉยๆ) — คืน list ของ {"category_display","min_years_since"}"""
    labels = dict(CURRICULUM_CATEGORY_CHOICES)
    return [
        {
            "category": req.get("category"),
            "category_display": labels.get(req.get("category"), req.get("category")),
            "min_years_since": req.get("min_years_since"),
        }
        for req in (prerequisites or [])
    ]


def has_completed_curriculum_category(student, prerequisites) -> bool:
    """เช็ค*คนเดียว* ว่าผ่านเกณฑ์ prerequisites ข้อใดข้อหนึ่งไหม (OR ระหว่าง
    entry) — ใช้กับเคสเดี่ยวๆ เท่านั้น ดู student_ids_completed_curriculum_category
    สำหรับเช็คหลายคนพร้อมกันแบบมีประสิทธิภาพ (รายงาน/ค้นหา)

    prerequisites: list ของ {"category": str, "min_years_since": int|None}"""
    if not prerequisites:
        return True
    return student.id in student_ids_completed_curriculum_category(prerequisites)


def student_ids_completed_curriculum_category(prerequisites) -> set:
    """เช็คหลายคนพร้อมกัน คืน set ของ student_id ที่ผ่านเกณฑ์ข้อใดข้อหนึ่งใน
    prerequisites (OR ระหว่าง entry เหมือนพฤติกรรมเดิมตอน category_codes ยัง
    เป็น list[str] เฉยๆ)

    หมายเหตุเรื่อง "ผ่านมาแล้วกี่ปี": ไม่มี field วันที่ผ่านจริงเก็บแยกใน
    FinalCourseResult (computed_at เป็นแค่เวลาคำนวณ/คำนวณซ้ำล่าสุด ไม่ใช่วันที่
    ผ่าน) จึงใช้ Curriculum.end_date ของหลักสูตรที่ผ่านเป็นวันอ้างอิงแทน —
    หลักสูตรที่ไม่มี end_date ถือว่าไม่ทราบวันที่ผ่าน ไม่นับเข้าเกณฑ์ที่มี
    min_years_since กำกับ ส่วน LegacyCurriculumCompletion ไม่มีวันที่เก็บเลย
    จึงนับเป็นผ่านเฉพาะเกณฑ์ที่ไม่มีเงื่อนไขปี (min_years_since ว่าง/None)"""
    from datetime import date

    from django.db.models import Count

    if not prerequisites:
        return set()

    qualifying: set = set()
    for req in prerequisites:
        category = req.get("category")
        min_years_since = req.get("min_years_since")
        if not category:
            continue

        if not min_years_since:
            qualifying.update(
                LegacyCurriculumCompletion.objects.filter(category=category)
                .values_list("student_id", flat=True)
            )

        for c in Curriculum.objects.filter(category=category).prefetch_related("courses"):
            if min_years_since:
                if not c.end_date:
                    continue
                years_since = (date.today() - c.end_date).days / 365.25
                if years_since < min_years_since:
                    continue
            course_ids = list(c.courses.values_list("id", flat=True))
            if not course_ids:
                continue
            passed_all_ids = (
                FinalCourseResult.objects
                .filter(curriculum_course_id__in=course_ids, passed=True)
                .values("student_id")
                .annotate(n=Count("curriculum_course_id", distinct=True))
                .filter(n=len(course_ids))
                .values_list("student_id", flat=True)
            )
            qualifying.update(passed_all_ids)
    return qualifying


# ---------------------------------------------------------------------------
# Curriculum (กรอบหลักสูตรประจำปี/รุ่น)
# ---------------------------------------------------------------------------

class Curriculum(models.Model):
    """กรอบหลักสูตรประจำปี/รุ่น — สร้างโดย prep_school แล้วส่งต่อให้ prep_personnel
    บรรจุกำลังพล (draft → submitted → active → closed)"""

    STATUS_CHOICES = [
        ("draft", "ร่าง"),
        ("submitted", "ส่งให้แผนกเตรียมพล"),
        ("active", "ใช้งาน"),
        ("closed", "ปิดรุ่น"),
    ]

    name = models.CharField(max_length=255, verbose_name="ชื่อหลักสูตร")
    batch_code = models.CharField(max_length=50, verbose_name="รุ่นที่")
    academic_year = models.PositiveIntegerField(db_index=True, verbose_name="ปีการศึกษา (พ.ศ.)")
    start_date = models.DateField(null=True, blank=True, verbose_name="วันเริ่มหลักสูตร")
    end_date = models.DateField(null=True, blank=True, verbose_name="วันจบหลักสูตร")
    organization = models.ForeignKey(
        "military_profile.Organization",
        on_delete=models.PROTECT,
        related_name="curricula",
        verbose_name="หน่วยงานผู้จัด",
    )
    # เดิมเป็น CharField (คำอธิบายเดียว) — เปลี่ยนเป็น list ของคุณสมบัติทีละข้อ
    # ตามที่แผนกเตรียมการขอ เพื่อให้แผนกเตรียมพลกรอกข้อมูลประกอบการพิจารณาได้
    # ง่ายกว่าอ่านข้อความก้อนเดียว (ดู migration 0007 สำหรับการแปลงข้อมูลเดิม)
    # ยังคงเป็นคำอธิบายเสริมเท่านั้น ไม่ใช้กรองข้อมูลกำลังพล (ดู field
    # eligible_rank_min/eligible_rank_max ด้านล่างสำหรับเกณฑ์ที่ query ได้จริง)
    eligible_rank_class = models.JSONField(
        default=list, blank=True,
        verbose_name="คุณสมบัติผู้รับการฝึกอบรม (รายข้อ)",
        help_text='list ของคำอธิบายแต่ละข้อ เช่น ["ผ่านการฝึกภาคสนามมาก่อน"]',
    )
    eligible_rank_min = models.CharField(
        max_length=10, choices=CURRICULUM_RANK_CHOICES, blank=True, default="",
        verbose_name="ยศต่ำสุดที่มีสิทธิ์",
    )
    eligible_rank_max = models.CharField(
        max_length=10, choices=CURRICULUM_RANK_CHOICES, blank=True, default="",
        verbose_name="ยศสูงสุดที่มีสิทธิ์",
    )
    eligible_min_years_in_rank = models.PositiveSmallIntegerField(
        null=True, blank=True,
        verbose_name="ระยะเวลาครองยศขั้นต่ำ (ปี)",
        help_text="ไม่แสดงในฟอร์มสร้าง/แก้ไขแล้วตามคำขอของแผนกเตรียมการ "
                   "(ไม่ได้ใช้งานจริง) แต่คงไว้เพราะรายงานความคับคั่งยังอ้างอิงอยู่",
    )
    eligible_branch = models.CharField(
        max_length=20, choices=ELIGIBLE_BRANCH_CHOICES, blank=True, default="",
        verbose_name="เหล่าที่มีสิทธิ์",
    )
    # เดิมเป็น CharField เดี่ยว — เปลี่ยนเป็น list ตามคำขอของแผนกเตรียมการ
    # (เลือกได้หลายประเภทบุคลากรต่อหลักสูตร) ดู migration 0007
    eligible_personnel_type = models.JSONField(
        default=list, blank=True,
        verbose_name="ประเภทบุคลากรที่มีสิทธิ์",
        help_text='list ของ PERSONNEL_TYPE_CHOICES code เช่น ["military","civilian"]',
    )
    category = models.CharField(
        max_length=30, choices=CURRICULUM_CATEGORY_CHOICES, blank=True, default="",
        verbose_name="ประเภทหลักสูตร (สำหรับจับคู่ prerequisite)",
        help_text="ใช้จับคู่ว่าหลักสูตรนี้เป็นประเภทเดียวกับหลักสูตรอื่นไหม "
                   "(ชื่อ/รุ่นต่างกันได้ แต่ category เดียวกัน) สำหรับ prerequisite "
                   "เท่านั้น — คนละเรื่องกับ training_purpose ด้านล่าง",
    )
    training_purpose = models.CharField(
        max_length=30, choices=TRAINING_PURPOSE_CHOICES, blank=True, default="",
        verbose_name="ประเภทหลักสูตร (แผนกเตรียมการ)",
        help_text="การจัดประเภทตามเกณฑ์ของแผนกเตรียมการ (ผลิต/ตามแนวทางรับราชการ/"
                   "เพิ่มพูนความรู้/พิเศษ) — ไม่เกี่ยวกับ category ด้านบน",
    )
    eligible_prerequisite_categories = models.JSONField(
        default=list, blank=True,
        verbose_name="ต้องผ่านหลักสูตรประเภทใดมาก่อน",
        help_text='list ของ {"category": code, "min_years_since": int|None} เช่น '
                   '[{"category": "nco_basic", "min_years_since": 2}] — '
                   "min_years_since ว่าง/None = ไม่มีเงื่อนไขปี, list ว่าง = ไม่มีเงื่อนไขนี้เลย",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="draft", db_index=True,
        verbose_name="สถานะ",
    )
    quota_total = models.PositiveIntegerField(
        default=0, verbose_name="ยอดผู้เข้ารับการฝึกอบรมตามแผน",
    )
    created_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="curricula_created",
        verbose_name="ผู้สร้าง",
    )
    submitted_at = models.DateTimeField(null=True, blank=True, verbose_name="วันที่ส่งให้แผนกเตรียมพล")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("name", "batch_code", "academic_year")]
        indexes = [models.Index(fields=["academic_year", "status"])]
        ordering = ["-academic_year", "name"]
        verbose_name = "หลักสูตรประจำปี/รุ่น"
        verbose_name_plural = "หลักสูตรประจำปี/รุ่น"

    def __str__(self):
        return f"{self.name} รุ่น {self.batch_code} ({self.academic_year})"


class CurriculumRegionQuota(models.Model):
    """โควตาแยกตามกองทัพภาค — child ของ Curriculum ใช้คู่กับรายงานเปรียบเทียบ
    ยอดขอ vs โควตา (quota-demand report)"""

    curriculum = models.ForeignKey(
        Curriculum, on_delete=models.CASCADE, related_name="region_quotas",
    )
    army_region = models.CharField(max_length=10, verbose_name="กองทัพภาค")
    quota = models.PositiveIntegerField(default=0, verbose_name="โควตา")

    class Meta:
        unique_together = [("curriculum", "army_region")]
        verbose_name = "โควตาตามกองทัพภาค"
        verbose_name_plural = "โควตาตามกองทัพภาค"

    def __str__(self):
        return f"{self.curriculum} — {self.army_region}: {self.quota}"


class CurriculumOrgQuota(models.Model):
    """โควตาแยกตามหน่วยงาน (organization) — สิ่งที่ prep_personnel ใช้จริงในการ
    แบ่งโควตาให้แต่ละหน่วย (เช่น กรมการทหารสื่อสาร 5 นาย, รร.ส.สส. 2 นาย,
    ส.1 2 นาย) ตั้ง/แก้ไขได้ตลอดผ่าน api_curriculum_org_quotas (ต่างจาก
    CurriculumRegionQuota เดิมที่ตั้งได้แค่ตอนสร้างหลักสูตรเท่านั้นและไม่เคยมี
    UI แก้ไขจริง — คงโมเดลเดิมไว้เพื่อไม่ทำลายข้อมูลเก่า แต่ฟีเจอร์ใหม่ใช้โมเดลนี้แทน"""

    curriculum = models.ForeignKey(
        Curriculum, on_delete=models.CASCADE, related_name="org_quotas",
    )
    organization = models.ForeignKey(
        "military_profile.Organization", on_delete=models.CASCADE, related_name="curriculum_quotas",
    )
    quota = models.PositiveIntegerField(default=0, verbose_name="โควตา")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("curriculum", "organization")]
        verbose_name = "โควตาตามหน่วยงาน"
        verbose_name_plural = "โควตาตามหน่วยงาน"

    def __str__(self):
        return f"{self.curriculum} — {self.organization}: {self.quota}"


class CurriculumCourse(models.Model):
    """วิชาย่อยในหลักสูตร — ผูกกับ course_id ของ edX (ไม่ duplicate ตัวคอร์ส)"""

    ASSESSMENT_TYPE_CHOICES = [
        ("score", "คะแนน/เกรด"),
        ("pass_fail", "ผ่าน/ไม่ผ่าน"),
    ]

    curriculum = models.ForeignKey(Curriculum, on_delete=models.CASCADE, related_name="courses")
    course_id = models.CharField(max_length=255, db_index=True, verbose_name="Course ID (edX)")
    display_name = models.CharField(max_length=255, verbose_name="ชื่อวิชา")
    sequence_order = models.PositiveIntegerField(default=0, verbose_name="ลำดับในหลักสูตร")
    credit_hours = models.DecimalField(max_digits=5, decimal_places=1, verbose_name="จำนวนชั่วโมง")
    credits = models.DecimalField(max_digits=4, decimal_places=1, verbose_name="หน่วยกิต")
    assessment_type = models.CharField(
        max_length=20, choices=ASSESSMENT_TYPE_CHOICES, default="score",
        verbose_name="ประเภทการวัดผล",
    )
    passing_score = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        verbose_name="คะแนนผ่าน (ใช้เมื่อ assessment_type=score)",
    )
    is_required = models.BooleanField(default=True, verbose_name="วิชาบังคับ")

    class Meta:
        unique_together = [("curriculum", "course_id")]
        ordering = ["sequence_order"]
        verbose_name = "วิชาในหลักสูตร"
        verbose_name_plural = "วิชาในหลักสูตร"

    def __str__(self):
        return f"{self.curriculum} — {self.display_name}"


# ---------------------------------------------------------------------------
# Cascade Enrollment (prep_personnel)
# ---------------------------------------------------------------------------

class CurriculumEnrollmentRequest(models.Model):
    """คำขอบรรจุนักเรียนเข้าหลักสูตร โดย prep_personnel — trigger cascade
    enrollment ผ่าน services/enrollment_service.py

    เป็นแค่ audit/command record — enrollment จริงอยู่ที่ CourseEnrollment
    (native edX) เสมอ ดู result_detail สำหรับผลลัพธ์ต่อวิชา"""

    STATUS_CHOICES = [
        ("pending", "รอดำเนินการ"),
        ("processing", "กำลังลงทะเบียน"),
        ("completed", "สำเร็จ"),
        ("partial_failed", "สำเร็จบางส่วน"),
        ("failed", "ล้มเหลว"),
    ]

    curriculum = models.ForeignKey(
        Curriculum, on_delete=models.PROTECT, related_name="enrollment_requests",
    )
    student = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="curriculum_enrollment_requests",
    )
    requested_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="curriculum_enrollments_requested",
        verbose_name="ผู้สั่งบรรจุ",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True,
    )
    result_detail = models.JSONField(
        default=dict, blank=True,
        help_text='{"course_id": "enrolled" | "failed: <เหตุผล>"}',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("curriculum", "student")]
        indexes = [models.Index(fields=["status", "created_at"])]
        verbose_name = "คำขอบรรจุเข้าหลักสูตร"
        verbose_name_plural = "คำขอบรรจุเข้าหลักสูตร"

    def __str__(self):
        return f"{self.student} → {self.curriculum} ({self.status})"


# ---------------------------------------------------------------------------
# Hybrid Grading & Co-Instructor (instructor)
# ---------------------------------------------------------------------------

class CurriculumCourseInstructor(models.Model):
    """ผู้สอน/ผู้ช่วยสอนของวิชาในหลักสูตร (app-level record) — sync กับ
    native CourseAccessRole ของ edX ทุกครั้งที่เปลี่ยน (ดู
    services/grading_service.py:sync_course_access_role) เพื่อให้เครื่องมือ
    ของ edX เอง (Studio, instructor dashboard) เห็น permission ตรงกัน"""

    curriculum_course = models.ForeignKey(
        CurriculumCourse, on_delete=models.CASCADE, related_name="instructors",
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="co_instructor_assignments")
    is_owner = models.BooleanField(default=False, verbose_name="เจ้าของวิชา")
    topic_note = models.CharField(
        max_length=255, blank=True, default="",
        verbose_name="หัวข้อ/ความรับผิดชอบ",
        help_text="ป้ายกำกับอิสระ ไม่ผูกกับสิทธิ์การเข้าถึงจริง (ผู้ช่วยสอนทุกคน"
                   "ยังเห็น/ให้คะแนนได้ทุกคนในวิชานี้เท่ากันหมด) — ใช้ตอนวิชาเดียว"
                   "รวมหลายหัวข้อย่อยที่มีผู้รับผิดชอบต่างกัน เพื่อให้รู้ว่าใคร"
                   "ดูแลส่วนไหนโดยไม่ต้องแยกวิชาจริงในระบบ",
    )
    added_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="co_instructors_added",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("curriculum_course", "user")]
        verbose_name = "ผู้สอนประจำวิชา"
        verbose_name_plural = "ผู้สอนประจำวิชา"

    def __str__(self):
        role = "เจ้าของวิชา" if self.is_owner else "ผู้ช่วยสอน"
        return f"{self.user} — {self.curriculum_course} ({role})"


class ManualGradeEntry(models.Model):
    """คะแนนที่ครูกรอกเอง (ส่วนที่ไม่ได้มาจาก e-Learning อัตโนมัติ) —
    hybrid grading ผสมกับคะแนนจาก PersistentSubsectionGrade ของ edX"""

    curriculum_course = models.ForeignKey(
        CurriculumCourse, on_delete=models.CASCADE, related_name="manual_grades",
    )
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="manual_grades")
    component_name = models.CharField(max_length=255, verbose_name="รายการคะแนน")
    score = models.DecimalField(max_digits=6, decimal_places=2, verbose_name="คะแนนที่ได้")
    max_score = models.DecimalField(max_digits=6, decimal_places=2, verbose_name="คะแนนเต็ม")
    weight = models.DecimalField(
        max_digits=5, decimal_places=2, default=100,
        verbose_name="น้ำหนัก % เทียบกับคะแนนอัตโนมัติ",
    )
    entered_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="manual_grades_entered",
    )
    entered_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["curriculum_course", "student"])]
        verbose_name = "คะแนนกรอกเอง"
        verbose_name_plural = "คะแนนกรอกเอง"

    def __str__(self):
        return f"{self.student} — {self.component_name}: {self.score}/{self.max_score}"


class FinalCourseResult(models.Model):
    """ผลรวมสุดท้ายต่อวิชา (auto + manual ผสมแล้ว) — เป็น cache/snapshot
    สำหรับ transcript และ gatekeeper เท่านั้น ไม่ใช่ source of truth ของ
    คะแนนดิบ (นั่นคือ PersistentSubsectionGrade ของ edX + ManualGradeEntry
    ข้างบน) คำนวณผ่าน services/grading_service.py:finalize_course"""

    curriculum_course = models.ForeignKey(
        CurriculumCourse, on_delete=models.CASCADE, related_name="final_results",
    )
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="final_course_results")
    final_score = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="คะแนนสรุป",
    )
    passed = models.BooleanField(null=True, verbose_name="ผ่าน (None = ยังไม่ตัดสิน)")
    computed_at = models.DateTimeField(auto_now=True)
    computed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="final_results_computed",
    )

    class Meta:
        unique_together = [("curriculum_course", "student")]
        verbose_name = "ผลการเรียนสรุปรายวิชา"
        verbose_name_plural = "ผลการเรียนสรุปรายวิชา"

    def __str__(self):
        return f"{self.student} — {self.curriculum_course}: {self.final_score}"


class LegacyCurriculumCompletion(models.Model):
    """บันทึกว่ากำลังพลเคยผ่านหลักสูตรประเภทนี้มาก่อนที่ระบบนี้จะมีข้อมูล
    อิเล็กทรอนิกส์ (ก่อน digitize) — ไม่ผูกกับ Curriculum row จริงเพราะไม่มี
    ข้อมูลย้อนหลังให้ผูก ใช้เป็น fallback คู่กับ FinalCourseResult ตอนเช็ค
    eligible_prerequisite_categories (ดู has_completed_curriculum_category)
    กันไม่ให้คนที่ผ่านหลักสูตรจริงแต่เรียนมาก่อนระบบนี้เกิด ถูกตัดสิทธิ์ผิดๆ

    กำลังพลกรอกเองได้ (self-report เหมือน rank_effective_date ใน
    military_profile) หรือเจ้าหน้าที่ (org_admin/prep_personnel) กรอกแทนให้
    ก็ได้ — recorded_by เก็บว่าใครบันทึกไว้ เพื่อตรวจสอบย้อนหลังได้"""

    student = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="legacy_curriculum_completions",
    )
    category = models.CharField(
        max_length=30, choices=CURRICULUM_CATEGORY_CHOICES,
        verbose_name="ประเภทหลักสูตรที่เคยผ่าน",
    )
    note = models.CharField(
        max_length=255, blank=True, default="",
        verbose_name="หมายเหตุ", help_text="เช่น ปีที่จบ/ชื่อหลักสูตรที่เรียนตอนนั้น",
    )
    recorded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="legacy_completions_recorded", verbose_name="ผู้บันทึก",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("student", "category")]
        verbose_name = "ประวัติผ่านหลักสูตรก่อนมีระบบ"
        verbose_name_plural = "ประวัติผ่านหลักสูตรก่อนมีระบบ"

    def __str__(self):
        return f"{self.student} — {self.get_category_display()}"


# ---------------------------------------------------------------------------
# Evaluation Gatekeeper (evaluator)
# ---------------------------------------------------------------------------

class EvaluationForm(models.Model):
    """แบบประเมิน 2 ระดับ: รายวิชา / หลักสูตรรวม — สร้างโดย evaluator
    is_required=True = ใช้เป็น gate (ต้องตอบก่อนเห็นคะแนน/ใบประกาศ)"""

    LEVEL_CHOICES = [
        ("course", "รายวิชา"),
        ("curriculum", "หลักสูตรรวม"),
    ]

    curriculum = models.ForeignKey(Curriculum, on_delete=models.CASCADE, related_name="evaluation_forms")
    curriculum_course = models.ForeignKey(
        CurriculumCourse, on_delete=models.CASCADE, null=True, blank=True,
        related_name="evaluation_forms",
        help_text="null เมื่อ level=curriculum",
    )
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES, verbose_name="ระดับการประเมิน")
    title = models.CharField(max_length=255, verbose_name="ชื่อแบบประเมิน")
    schema = models.JSONField(verbose_name="โครงสร้างคำถาม")
    is_required = models.BooleanField(
        default=True, verbose_name="บังคับประเมิน (ใช้เป็น gate)",
    )
    created_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="evaluation_forms_created",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(level="curriculum", curriculum_course__isnull=True)
                | models.Q(level="course", curriculum_course__isnull=False),
                name="evaluation_form_level_consistency",
            )
        ]
        verbose_name = "แบบประเมิน"
        verbose_name_plural = "แบบประเมิน"

    def __str__(self):
        return f"{self.title} ({self.get_level_display()})"


class EvaluationResponse(models.Model):
    """คำตอบของนักเรียนต่อแบบประเมิน — การมี record นี้ = ประเมินแล้ว
    (ใช้เป็น gate flag โดยตรง ดู services/gatekeeper_service.py)"""

    form = models.ForeignKey(EvaluationForm, on_delete=models.CASCADE, related_name="responses")
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="evaluation_responses")
    answers = models.JSONField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("form", "student")]
        indexes = [models.Index(fields=["student", "form"])]
        verbose_name = "คำตอบแบบประเมิน"
        verbose_name_plural = "คำตอบแบบประเมิน"

    def __str__(self):
        return f"{self.student} — {self.form}"
