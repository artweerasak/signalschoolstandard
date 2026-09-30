# Hand-written (not from makemigrations verbatim) — see docstring below.
#
# eligible_personnel_type และ eligible_rank_class เปลี่ยนจาก CharField (string
# เดี่ยว) เป็น JSONField (list) เหมือน 0007 เดิมที่ถูกแยกออก แต่ทำผ่านวิธี
# add-new-column -> populate -> drop-old-column -> rename แทนการ AlterField
# ตรงๆ (CharField -> JSONField บน column เดิม) เพราะทดสอบจริงบน production
# (MySQL/MariaDB ผ่าน tutor) แล้วพบว่า ALTER TABLE ... MODIFY COLUMN ... JSON
# ของ MySQL **ไม่** auto-cast ค่า string เดิม (เช่น "military") ให้กลายเป็น
# JSON scalar แบบที่ Postgres ทำด้วย USING to_jsonb() — MySQL ต้องการให้เนื้อหา
# เดิมเป็น JSON syntax ที่ถูกต้องอยู่แล้วก่อน ALTER ถึงจะสำเร็จ ไม่งั้น error
# "Invalid JSON text" ทันที (เจอจริงตอน deploy 0007 เดิมบน production —
# migration ล้มเหลวกลางคันแต่ปลอดภัย เพราะ MySQL DDL auto-commit ทีละคำสั่ง
# และ field นี้เป็น operation แรกที่พัง ข้อมูลเดิมของ field นี้เลยไม่ถูกแตะเลย)
#
# วิธี add-new/remove-old/rename นี้เขียนค่าลง column ใหม่ (JSON ตั้งแต่สร้าง)
# ผ่าน ORM ตรงๆ แทนที่จะให้ DB engine ต้อง cast bytes เดิม จึงพกความเข้ากันได้
# ข้ามฐานข้อมูล (ใช้ได้ทั้ง MySQL และ Postgres ที่ห้อง test ใช้อยู่) โดยไม่ต้อง
# พึ่งพฤติกรรม cast เฉพาะของแต่ละ DB เลย
#
# หมายเหตุเรื่อง reverse: RemoveField ย้อนกลับอัตโนมัติได้แค่สร้าง column เปล่า
# คืนให้ (ข้อมูลที่แปลงไปแล้วกู้คืนไม่ได้ 100% อยู่ดีไม่ว่าจะเขียน RunPython
# reverse ซับซ้อนแค่ไหน) จึงปล่อยให้ RunPython เป็น noop ตอน reverse เพื่อความ
# ชัดเจน — ถ้าต้อง rollback จริงๆ ให้กู้จาก backup แทน

from django.db import migrations, models


def _populate_personnel_type_new(apps, schema_editor):
    """อ่านจาก column เดิม (eligible_personnel_type, ยังเป็น CharField ตอนนี้
    เพราะ RemoveField ยังไม่รัน) เขียนลง column ใหม่ (JSONField ที่เพิ่งเพิ่ม)"""
    Curriculum = apps.get_model("military_curriculum", "Curriculum")
    for c in Curriculum.objects.all().iterator():
        raw = c.eligible_personnel_type
        Curriculum.objects.filter(pk=c.pk).update(
            eligible_personnel_type_new_json=[raw] if raw else []
        )


def _populate_rank_class_new(apps, schema_editor):
    """อ่านจาก column เดิม (eligible_rank_class, ยังเป็น CharField ตอนนี้)
    เขียนลง column ใหม่ (JSONField ที่เพิ่งเพิ่ม)"""
    Curriculum = apps.get_model("military_curriculum", "Curriculum")
    for c in Curriculum.objects.all().iterator():
        raw = c.eligible_rank_class
        Curriculum.objects.filter(pk=c.pk).update(
            eligible_rank_class_new_json=[raw] if raw else []
        )


def _prerequisite_categories_to_dicts(apps, schema_editor):
    Curriculum = apps.get_model("military_curriculum", "Curriculum")
    for c in Curriculum.objects.all().iterator():
        raw = c.eligible_prerequisite_categories or []
        if raw and isinstance(raw[0], dict):
            continue
        new_value = [{"category": code, "min_years_since": None} for code in raw]
        Curriculum.objects.filter(pk=c.pk).update(eligible_prerequisite_categories=new_value)


def _prerequisite_categories_to_strings(apps, schema_editor):
    Curriculum = apps.get_model("military_curriculum", "Curriculum")
    for c in Curriculum.objects.all().iterator():
        raw = c.eligible_prerequisite_categories or []
        if raw and isinstance(raw[0], dict):
            new_value = [item.get("category") for item in raw if item.get("category")]
            Curriculum.objects.filter(pk=c.pk).update(eligible_prerequisite_categories=new_value)


class Migration(migrations.Migration):

    dependencies = [
        ('military_curriculum', '0007_curriculum_branch_and_training_purpose'),
    ]

    operations = [
        # ── metadata-only alterations (ไม่เปลี่ยนชนิดข้อมูล ปลอดภัยทุก DB) ──
        migrations.AlterField(
            model_name='curriculum',
            name='category',
            field=models.CharField(blank=True, choices=[('nco_basic', 'นายสิบชั้นต้น'), ('nco_senior', 'นายสิบชั้นสูง (อาวุโส)'), ('officer_company', 'นายทหารสัญญาบัตร ชั้นนายร้อย'), ('officer_field', 'นายทหารสัญญาบัตร ชั้นนายพัน'), ('officer_senior', 'นายทหารสัญญาบัตร ชั้นนายพล/เสนาธิการ'), ('other', 'อื่นๆ')], default='', help_text='ใช้จับคู่ว่าหลักสูตรนี้เป็นประเภทเดียวกับหลักสูตรอื่นไหม (ชื่อ/รุ่นต่างกันได้ แต่ category เดียวกัน) สำหรับ prerequisite เท่านั้น — คนละเรื่องกับ training_purpose ด้านล่าง', max_length=30, verbose_name='ประเภทหลักสูตร (สำหรับจับคู่ prerequisite)'),
        ),
        migrations.AlterField(
            model_name='curriculum',
            name='eligible_min_years_in_rank',
            field=models.PositiveSmallIntegerField(blank=True, help_text='ไม่แสดงในฟอร์มสร้าง/แก้ไขแล้วตามคำขอของแผนกเตรียมการ (ไม่ได้ใช้งานจริง) แต่คงไว้เพราะรายงานความคับคั่งยังอ้างอิงอยู่', null=True, verbose_name='ระยะเวลาครองยศขั้นต่ำ (ปี)'),
        ),
        migrations.AlterField(
            model_name='curriculum',
            name='eligible_rank_max',
            field=models.CharField(blank=True, choices=[('NNS', 'นนส. (นักเรียนนายสิบ)'), ('PVT', 'พลทหาร'), ('CPL', 'สิบตรี'), ('SGT3', 'สิบโท'), ('SGT2', 'สิบเอก'), ('SSGT', 'จ่าสิบตรี'), ('MSGT', 'จ่าสิบโท'), ('CSGT', 'จ่าสิบเอก'), ('CSGT_S', 'จ่าสิบเอกพิเศษ'), ('WO1', 'พันจ่าตรี'), ('WO2', 'พันจ่าโท'), ('WO3', 'พันจ่าเอก'), ('2LT', 'ร้อยตรี'), ('1LT', 'ร้อยโท'), ('CPT', 'ร้อยเอก'), ('MAJ', 'พันตรี'), ('LTCOL', 'พันโท'), ('COL', 'พันเอก'), ('COL_S', 'พันเอกพิเศษ'), ('BGEN', 'พลตรี'), ('MGEN', 'พลโท'), ('GEN', 'พลเอก')], default='', max_length=10, verbose_name='ยศสูงสุดที่มีสิทธิ์'),
        ),
        migrations.AlterField(
            model_name='curriculum',
            name='eligible_rank_min',
            field=models.CharField(blank=True, choices=[('NNS', 'นนส. (นักเรียนนายสิบ)'), ('PVT', 'พลทหาร'), ('CPL', 'สิบตรี'), ('SGT3', 'สิบโท'), ('SGT2', 'สิบเอก'), ('SSGT', 'จ่าสิบตรี'), ('MSGT', 'จ่าสิบโท'), ('CSGT', 'จ่าสิบเอก'), ('CSGT_S', 'จ่าสิบเอกพิเศษ'), ('WO1', 'พันจ่าตรี'), ('WO2', 'พันจ่าโท'), ('WO3', 'พันจ่าเอก'), ('2LT', 'ร้อยตรี'), ('1LT', 'ร้อยโท'), ('CPT', 'ร้อยเอก'), ('MAJ', 'พันตรี'), ('LTCOL', 'พันโท'), ('COL', 'พันเอก'), ('COL_S', 'พันเอกพิเศษ'), ('BGEN', 'พลตรี'), ('MGEN', 'พลโท'), ('GEN', 'พลเอก')], default='', max_length=10, verbose_name='ยศต่ำสุดที่มีสิทธิ์'),
        ),
        migrations.AlterField(
            model_name='curriculum',
            name='quota_total',
            field=models.PositiveIntegerField(default=0, verbose_name='ยอดผู้เข้ารับการฝึกอบรมตามแผน'),
        ),

        # ── eligible_prerequisite_categories: JSONField -> JSONField ทั้งก่อน
        # และหลัง (ไม่มีการเปลี่ยนชนิด column เลย) แค่ reshape เนื้อหา list[str]
        # -> list[dict] ปลอดภัยทุก DB ─────────────────────────────────────
        migrations.AlterField(
            model_name='curriculum',
            name='eligible_prerequisite_categories',
            field=models.JSONField(blank=True, default=list, help_text='list ของ {"category": code, "min_years_since": int|None} เช่น [{"category": "nco_basic", "min_years_since": 2}] — min_years_since ว่าง/None = ไม่มีเงื่อนไขปี, list ว่าง = ไม่มีเงื่อนไขนี้เลย', verbose_name='ต้องผ่านหลักสูตรประเภทใดมาก่อน'),
        ),
        migrations.RunPython(_prerequisite_categories_to_dicts, _prerequisite_categories_to_strings),

        # ── eligible_personnel_type: CharField -> JSONField ผ่าน add-new/
        # remove-old/rename (ดู docstring บนสุดของไฟล์) ───────────────────
        migrations.AddField(
            model_name='curriculum',
            name='eligible_personnel_type_new_json',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(_populate_personnel_type_new, migrations.RunPython.noop),
        migrations.RemoveField(model_name='curriculum', name='eligible_personnel_type'),
        migrations.RenameField(
            model_name='curriculum',
            old_name='eligible_personnel_type_new_json',
            new_name='eligible_personnel_type',
        ),
        migrations.AlterField(
            model_name='curriculum',
            name='eligible_personnel_type',
            field=models.JSONField(blank=True, default=list, help_text='list ของ PERSONNEL_TYPE_CHOICES code เช่น ["military","civilian"]', verbose_name='ประเภทบุคลากรที่มีสิทธิ์'),
        ),

        # ── eligible_rank_class: CharField -> JSONField ผ่าน add-new/
        # remove-old/rename เช่นเดียวกัน ──────────────────────────────────
        migrations.AddField(
            model_name='curriculum',
            name='eligible_rank_class_new_json',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(_populate_rank_class_new, migrations.RunPython.noop),
        migrations.RemoveField(model_name='curriculum', name='eligible_rank_class'),
        migrations.RenameField(
            model_name='curriculum',
            old_name='eligible_rank_class_new_json',
            new_name='eligible_rank_class',
        ),
        migrations.AlterField(
            model_name='curriculum',
            name='eligible_rank_class',
            field=models.JSONField(blank=True, default=list, help_text='list ของคำอธิบายแต่ละข้อ เช่น ["ผ่านการฝึกภาคสนามมาก่อน"]', verbose_name='คุณสมบัติผู้รับการฝึกอบรม (รายข้อ)'),
        ),
    ]
