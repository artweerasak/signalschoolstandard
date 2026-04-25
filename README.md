# Military eLearning System — Open edX

ระบบ eLearning สำหรับองค์กรทหาร/ราชการ พัฒนาบน Open edX

> **Login**: username = เลขบัตรประชาชน 13 หลัก | password = เลขทหาร 10 หลัก

---

## โครงสร้างโปรเจค

```
standartsignal/
├── military-edx-plugin/        # Django plugin หลัก
│   ├── military_auth/          # Custom auth (National ID + Military ID)
│   ├── military_profile/       # ข้อมูลบุคลากรทหาร (ยศ, หน่วย, อายุราชการ)
│   ├── certificate_expiry/     # ระบบอายุใบประกาศ + Celery tasks
│   ├── certificate_renewal/    # แบบทดสอบต่ออายุใบประกาศ
│   ├── military_reports/       # รายงาน + Extensible filter engine
│   └── expiry_notifications/   # ระบบแจ้งเตือน (Email + Platform)
├── tutor-military-plugin/      # Tutor plugin สำหรับ deploy บน Open edX
├── docker-compose.test.yml     # สำหรับทดสอบ standalone (ไม่ต้องมี edX)
├── docker-compose.override.yml # ใช้กับ Tutor local dev (volume mount)
└── requirements/               # Python requirements
```

---

## ทดสอบแบบ Standalone (ไม่ต้องติดตั้ง Open edX)

```bash
# Start server ที่ localhost:8080
docker compose -f docker-compose.test.yml up app

# รัน unit tests
docker compose -f docker-compose.test.yml run --rm test

# Seed ข้อมูลตัวอย่างใหม่
docker compose -f docker-compose.test.yml exec app \
    python manage.py seed_demo_data --flush
```

**Test credentials**: `admin` / `admin1234`

ข้อมูล demo: ทหาร 5 นาย, 3 หลักสูตร, 10 ใบประกาศ (mix active/expired)

---

## ติดตั้งบน Open edX จริง (Tutor)

### ข้อกำหนด

| Component | รายละเอียด |
|-----------|-----------|
| RAM | 8 GB ขึ้นไป |
| Disk | 30 GB ขึ้นไป |
| OS | Ubuntu 20.04+ หรือ macOS |
| Python | 3.8+ |
| Tutor | v17+ (Sumac/Redwood) |

### ขั้นตอน

```bash
# 1. ติดตั้ง Tutor (บน macOS ใช้ pip3)
pip3 install "tutor[full]" --break-system-packages

# 2. สร้าง Tutor config เริ่มต้น (ครั้งแรก)
tutor config save

# 3. ติดตั้ง military plugin ผ่าน pip3 แล้ว enable
pip3 install -e ./tutor-military-plugin --break-system-packages
tutor plugins enable military

# 4. ตั้งค่า Encryption Key (ต้องสร้างใหม่ — ห้ามใช้ค่า default ใน production)
MILITARY_KEY=$(python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())")
tutor config save \
    --set MILITARY_ENCRYPTION_KEY="${MILITARY_KEY}" \
    --set MILITARY_HR_EMAILS='["hr@yourorg.mil.th"]'

# 5. Build Docker image (รวม military-edx-plugin)
#    !!! ต้องอยู่ใน directory ที่มีโฟลเดอร์ military-edx-plugin !!!
tutor images build openedx

# 6. Launch Open edX (ครั้งแรกใช้เวลา 15-30 นาที)
tutor local launch

# 7. รัน migrations และ seed ข้อมูลตัวอย่าง
tutor local run lms python manage.py migrate --no-input
tutor local run lms python manage.py seed_demo_data
```

### Local Development (volume mount — ไม่ต้อง rebuild image)

```bash
# ใช้ docker-compose.override.yml ร่วมกับ Tutor
export TUTOR_ROOT=$(tutor config printroot)
docker compose \
    -f ${TUTOR_ROOT}/env/local/docker-compose.yml \
    -f docker-compose.override.yml \
    up -d lms cms
```

---

## หน้าที่สำคัญ (URLs)

| URL | คำอธิบาย | สิทธิ์ |
|-----|---------|--------|
| `/military/dashboard/` | Dashboard สรุปภาพรวม | Staff |
| `/military/reports/` | ค้นหาและ export รายงาน | Staff |
| `/military/renewal/` | ต่ออายุใบประกาศ | Learner |
| `/admin/` | Django Admin | Admin |

---

## การเพิ่ม Search Filter ใหม่ (สำหรับนักพัฒนา)

```python
# สร้างไฟล์ใหม่: military_reports/filters/position_filter.py
from django import forms
from military_reports.filters.base import BaseSearchFilter

class PositionFilter(BaseSearchFilter):
    filter_key = "position"
    display_name = "ตำแหน่ง"

    def get_form_fields(self):
        return {
            "position": forms.CharField(label="ตำแหน่ง", required=False)
        }

    def apply(self, queryset, params):
        position = params.get("position", "").strip()
        if position:
            queryset = queryset.filter(position__icontains=position)
        return queryset
```

Register ผ่าน Django Admin → SearchFilterRegistry หรือ management command:

```python
from military_reports.models import SearchFilterRegistry
SearchFilterRegistry.objects.create(
    filter_key="position",
    display_name_th="ตำแหน่ง",
    python_class_path="military_reports.filters.position_filter.PositionFilter",
    sort_order=10,
    is_active=True,
)
```

## การเพิ่ม Search Filter ใหม่ (สำหรับนักพัฒนา)

```python
# สร้างไฟล์ใหม่ใน military_reports/filters/position_filter.py
from django import forms
from military_reports.filters.base import BaseSearchFilter

class PositionFilter(BaseSearchFilter):
    filter_key = "position"
    display_name = "ตำแหน่ง"

    def get_form_fields(self):
        return {
            "position": forms.CharField(label="ตำแหน่ง", required=False)
        }

    def apply(self, queryset, params):
        position = params.get("position", "").strip()
        if position:
            queryset = queryset.filter(position__icontains=position)
        return queryset
```

จากนั้น register ผ่าน Django Admin → SearchFilterRegistry หรือ:

```python
from military_reports.models import SearchFilterRegistry
SearchFilterRegistry.objects.create(
    filter_key="position",
    display_name_th="ตำแหน่ง",
    python_class_path="military_reports.filters.position_filter.PositionFilter",
    is_active=True,
)
```

---

## ความปลอดภัย

- เลขบัตรประชาชนและเลขทหาร **เข้ารหัส AES-256-GCM** ก่อนบันทึกลงฐานข้อมูล
- HTTPS บังคับทุก endpoint (ผ่าน Nginx ที่ Tutor จัดการ)
- Rate limiting สำหรับ login endpoint (5 ครั้ง/5 นาที ต่อ IP)
- Audit log ทุก action ที่เกี่ยวกับข้อมูลส่วนบุคคล
- `MILITARY_ENCRYPTION_KEY` ต้องสร้างใหม่และไม่ commit ลง git

---

## ระบบแจ้งเตือน

| วันก่อนหมดอายุ | ผู้รับ |
|---|---|
| 90 วัน | ผู้เรียน (Email + Platform) |
| 30 วัน | ผู้เรียน + HR |
| 7 วัน | ผู้เรียน + HR + Admin |
| 1 วัน | ผู้เรียน + ผู้บังคับบัญชา |
| หมดอายุ | HR + Admin (รายสัปดาห์) |
