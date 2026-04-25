from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('military_auth', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PendingRegistration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('full_name_th', models.CharField(max_length=255, verbose_name='ชื่อ-นามสกุล')),
                ('rank', models.CharField(max_length=10, verbose_name='ชั้นยศ')),
                ('unit', models.CharField(max_length=255, verbose_name='หน่วยต้นสังกัด')),
                ('birth_date', models.DateField(verbose_name='วันเกิด')),
                ('email', models.EmailField(blank=True, default='', verbose_name='อีเมล')),
                ('national_id_encrypted', models.CharField(max_length=500, verbose_name='เลขบัตรประชาชน (encrypted)')),
                ('military_id_encrypted', models.CharField(max_length=500, verbose_name='เลขประจำตัวทหาร (encrypted)')),
                ('status', models.CharField(
                    choices=[('pending', 'รอการอนุมัติ'), ('approved', 'อนุมัติแล้ว'), ('rejected', 'ปฏิเสธ')],
                    db_index=True, default='pending', max_length=20,
                )),
                ('submitted_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('reject_reason', models.TextField(blank=True, default='', verbose_name='เหตุผลที่ปฏิเสธ')),
                ('reviewed_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviewed_registrations',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='ผู้อนุมัติ/ปฏิเสธ',
                )),
                ('approved_user', models.OneToOneField(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='registration_request',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='User ที่สร้างหลัง approve',
                )),
            ],
            options={
                'verbose_name': 'คำขอสมัครสมาชิก',
                'verbose_name_plural': 'คำขอสมัครสมาชิก',
                'ordering': ['-submitted_at'],
                'indexes': [
                    models.Index(fields=['status', 'submitted_at'], name='pending_reg_status_idx'),
                ],
            },
        ),
    ]
