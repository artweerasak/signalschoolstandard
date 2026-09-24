# Hand-written (ไม่ใช้ auto-generate) — เจตนาเฉพาะเพิ่ม role choices ใหม่ 3
# ตัว (prep_school/prep_personnel/evaluator) สำหรับ military_curriculum app
#
# หมายเหตุ: `makemigrations` อัตโนมัติในสภาพแวดล้อมทดสอบ standalone (Postgres)
# แนบ AlterField สำหรับ id (AutoField→BigAutoField) ของอีก 8 โมเดลที่ไม่
# เกี่ยวข้องมาด้วย — เป็น artifact จาก DEFAULT_AUTO_FIELD ที่ตั้งต่างจาก
# ตอนสร้าง migration เดิมของโมเดลเหล่านั้น ไม่ใช่การเปลี่ยนแปลงที่ตั้งใจ จึง
# เขียนไฟล์นี้เองแบบ minimal แทน เพื่อไม่ให้กระทบ PK ของตารางเดิมบน production
# โดยไม่จำเป็น (choices เปลี่ยนเป็น Python-level validation อย่างเดียว ไม่มี
# ALTER TABLE จริงที่ DB level)
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('military_profile', '0020_militaryuserprofile_thaid_verified'),
    ]

    operations = [
        migrations.AlterField(
            model_name='militaryuserprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'ผู้ดูแลระบบ'),
                    ('org_admin', 'ผู้ดูแลหน่วย (ฝอ.1)'),
                    ('instructor', 'ครูอาจารย์'),
                    ('student', 'กำลังพล'),
                    ('prep_school', 'แผนกเตรียมการ รร.สส.'),
                    ('prep_personnel', 'แผนกเตรียมพล กพ.'),
                    ('evaluator', 'แผนกประเมินผล'),
                ],
                default='student',
                max_length=20,
                verbose_name='บทบาทในระบบ',
            ),
        ),
    ]
