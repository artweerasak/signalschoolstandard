from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("military_curriculum", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="curriculum",
            name="eligible_rank_class",
            field=models.CharField(blank=True, default="", max_length=100, verbose_name="ช่วงชั้นยศที่มีสิทธิ์ (คำอธิบาย)"),
        ),
        migrations.AddField(
            model_name="curriculum",
            name="eligible_rank_min",
            field=models.CharField(
                blank=True, default="", max_length=10, verbose_name="ยศต่ำสุดที่มีสิทธิ์",
                choices=[
                    ("PVT", "พลทหาร"), ("CPL", "สิบตรี"), ("SGT3", "สิบโท"), ("SGT2", "สิบเอก"),
                    ("SSGT", "จ่าสิบตรี"), ("MSGT", "จ่าสิบโท"), ("CSGT", "จ่าสิบเอก"), ("CSGT_S", "จ่าสิบเอกพิเศษ"),
                    ("WO1", "พันจ่าตรี"), ("WO2", "พันจ่าโท"), ("WO3", "พันจ่าเอก"),
                    ("2LT", "ร้อยตรี"), ("1LT", "ร้อยโท"), ("CPT", "ร้อยเอก"),
                    ("MAJ", "พันตรี"), ("LTCOL", "พันโท"), ("COL", "พันเอก"), ("COL_S", "พันเอกพิเศษ"),
                    ("BGEN", "พลตรี"), ("MGEN", "พลโท"), ("GEN", "พลเอก"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="curriculum",
            name="eligible_rank_max",
            field=models.CharField(
                blank=True, default="", max_length=10, verbose_name="ยศสูงสุดที่มีสิทธิ์",
                choices=[
                    ("PVT", "พลทหาร"), ("CPL", "สิบตรี"), ("SGT3", "สิบโท"), ("SGT2", "สิบเอก"),
                    ("SSGT", "จ่าสิบตรี"), ("MSGT", "จ่าสิบโท"), ("CSGT", "จ่าสิบเอก"), ("CSGT_S", "จ่าสิบเอกพิเศษ"),
                    ("WO1", "พันจ่าตรี"), ("WO2", "พันจ่าโท"), ("WO3", "พันจ่าเอก"),
                    ("2LT", "ร้อยตรี"), ("1LT", "ร้อยโท"), ("CPT", "ร้อยเอก"),
                    ("MAJ", "พันตรี"), ("LTCOL", "พันโท"), ("COL", "พันเอก"), ("COL_S", "พันเอกพิเศษ"),
                    ("BGEN", "พลตรี"), ("MGEN", "พลโท"), ("GEN", "พลเอก"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="curriculum",
            name="eligible_min_years_in_rank",
            field=models.PositiveSmallIntegerField(blank=True, null=True, verbose_name="ระยะเวลาครองยศขั้นต่ำ (ปี)"),
        ),
        migrations.AlterField(
            model_name="curriculum",
            name="eligible_personnel_type",
            field=models.CharField(
                blank=True, default="", max_length=100, verbose_name="ประเภทบุคลากรที่มีสิทธิ์",
                choices=[
                    ("military", "ทหาร"), ("civilian", "ลูกจ้างประจำ"), ("government", "พนักงานราชการ"),
                ],
            ),
        ),
    ]
