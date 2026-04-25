# คู่มือการ Debug ระบบการทดสอบความรู้กำลังพลเหล่า ส.

> ระบบ: Military eLearning บน Open edX (Tutor v21 / Ulmo)  
> URL: http://www.signalstandard.rta.mi.th  
> Admin: http://www.signalstandard.rta.mi.th/admin

---

## 1. ตรวจสอบสุขภาพระบบเบื้องต้น

### เช็ค Container ทั้งหมด
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep tutor
```

**ผลลัพธ์ที่ดี:** ทุกตัวต้องขึ้น `Up X minutes` ไม่มี `Restarting`

| Container | หน้าที่ |
|-----------|---------|
| `tutor_local-lms-1` | หน้าเว็บผู้เรียน (LMS) |
| `tutor_local-cms-1` | Studio สร้างคอร์ส |
| `tutor_local-caddy-1` | Reverse proxy / SSL |
| `tutor_local-mysql-1` | ฐานข้อมูล MySQL |
| `tutor_local-redis-1` | Cache / Session |
| `tutor_local-mongodb-1` | MongoDB (content) |
| `tutor_local-lms-worker-1` | Background tasks (email, cert) |
| `tutor_local-cms-worker-1` | Background tasks (studio) |
| `tutor_local-mfe-1` | React frontend (login, หน้าแรก) |
| `tutor_local-meilisearch-1` | ค้นหาคอร์ส |

### เช็ค URL ตอบรับ
```bash
curl -o /dev/null -w "%{http_code}\n" http://www.signalstandard.rta.mi.th/
```
- `200` → ปกติ ✅
- `500` → LMS crash → ดู log
- `502/504` → LMS ยังไม่พร้อม หรือ Restart อยู่

---

## 2. อ่าน Log หา Error

### ดู Error ล่าสุด (ใช้บ่อยที่สุด)
```bash
docker logs tutor_local-lms-1 2>&1 | grep -E "ERROR|CRITICAL" | grep -v "WARNING" | tail -20
```

### ดู Log แบบ Real-time (เปิดค้างไว้ขณะทดสอบ)
```bash
docker logs -f tutor_local-lms-1 2>&1 | grep -v "WARNING\|INFO"
```

### ดู Traceback เต็ม
```bash
docker logs tutor_local-lms-1 2>&1 | grep -A 20 "Traceback" | tail -40
```

> 💡 **วิธีอ่าน Traceback:** อ่าน **จากล่างขึ้นบน** บรรทัดสุดท้ายคือ root cause จริงๆ

---

## 3. ตาราง Error ที่พบบ่อย และวิธีแก้

### 3.1 หน้าเว็บขึ้น "Encountered error while rendering error page"

**สาเหตุ:** `Site.DoesNotExist` — ไม่มี Site record ในฐานข้อมูล

**แก้ไข:**
```bash
tutor local run lms ./manage.py lms shell -c "
from django.contrib.sites.models import Site
site, created = Site.objects.get_or_create(id=1, defaults={
    'domain': 'www.signalstandard.rta.mi.th',
    'name': 'Signal Standard'
})
if not created:
    site.domain = 'www.signalstandard.rta.mi.th'
    site.name = 'Signal Standard'
    site.save()
print('Done:', site.domain)
"
```

---

### 3.2 LMS Restart วนไม่หยุด (Status: Restarting)

**ตรวจสอบ:**
```bash
docker logs tutor_local-lms-1 2>&1 | tail -30
```

**สาเหตุที่พบ:**

| Error | วิธีแก้ |
|-------|---------|
| `ModuleNotFoundError: No module named 'military_auth'` | รัน `tutor local stop && tutor local start -d` เพื่อ recreate container ให้มี volume mount |
| `Table 'openedx.xxx' doesn't exist` | รัน `tutor local run lms ./manage.py lms migrate` |
| `BLOB/TEXT column used in key without length` | แก้ field จาก `TextField` เป็น `CharField(max_length=500)` ใน models.py แล้ว migrate ใหม่ |

---

### 3.3 Login ไม่ได้ / "We couldn't sign you in"

**ตรวจสอบ:**
```bash
docker logs tutor_local-lms-1 2>&1 | grep -E "login|profile|session|CRITICAL" | tail -10
```

**สาเหตุที่พบ:**

| Error | วิธีแก้ |
|-------|---------|
| `User has no profile` | สร้าง UserProfile (ดูด้านล่าง) |
| `Could not create session. Is memcached running?` | เช็ค Redis, restart LMS |
| `Site matching query does not exist` | แก้ตาม 3.1 |

**สร้าง UserProfile ให้ user:**
```bash
tutor local run lms ./manage.py lms shell -c "
from django.contrib.auth import get_user_model
from common.djangoapps.student.models import UserProfile
User = get_user_model()
user = User.objects.get(username='admin')  # เปลี่ยน username ได้
profile, created = UserProfile.objects.get_or_create(user=user, defaults={'name': 'Admin', 'meta': ''})
print('Profile created:', created)
"
```

---

### 3.4 หน้า Login Redirect ไปที่ `apps.xxx` แล้วค้าง

**สาเหตุ:** `/etc/hosts` ไม่มี subdomain `apps.`

**แก้ไข:**
```bash
sudo sh -c 'cat >> /etc/hosts << EOF
127.0.0.1 www.signalstandard.rta.mi.th
127.0.0.1 studio.www.signalstandard.rta.mi.th
127.0.0.1 apps.www.signalstandard.rta.mi.th
127.0.0.1 preview.www.signalstandard.rta.mi.th
EOF'
```

---

### 3.5 Migration Error

**ตรวจสอบว่า migration ครบไหม:**
```bash
tutor local run lms ./manage.py lms migrate --check
```

**รัน migration:**
```bash
tutor local run lms ./manage.py lms migrate
```

**ถ้าต้องการสร้าง migration ใหม่หลังแก้ models.py:**
```bash
tutor local run lms ./manage.py lms makemigrations <app_name>
tutor local run lms ./manage.py lms migrate
```
> เช่น `<app_name>` = `military_profile`, `certificate_expiry`, `military_reports`

---

### 3.6 Email ไม่ส่ง / Certificate ไม่ออก

**ดู Worker log:**
```bash
docker logs tutor_local-lms-worker-1 2>&1 | grep -E "ERROR|CRITICAL" | tail -20
```

**ทดสอบ Celery task:**
```bash
tutor local run lms ./manage.py lms shell -c "
from celery.app.control import Inspect
from lms.celery import app
i = Inspect(app=app)
active = i.active()
print('Active tasks:', active)
"
```

---

## 4. คำสั่ง Admin ที่ใช้บ่อย

### สร้าง Superuser (Admin)
```bash
tutor local run lms ./manage.py lms shell -c "
from django.contrib.auth import get_user_model
from common.djangoapps.student.models import UserProfile
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    u = User.objects.create_superuser('admin', 'admin@signalstandard.rta.mi.th', 'Admin@1234')
    UserProfile.objects.create(user=u, name='Admin', meta='')
    print('Created: admin / Admin@1234')
else:
    print('Already exists')
"
```

### Reset Password ของ User
```bash
tutor local run lms ./manage.py lms shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.get(username='admin')  # เปลี่ยนได้
u.set_password('NewPassword@123')
u.save()
print('Password changed')
"
```

### ดู Users ทั้งหมด
```bash
tutor local run lms ./manage.py lms shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
for u in User.objects.all().order_by('-date_joined')[:10]:
    print(u.id, u.username, u.email, 'superuser:', u.is_superuser)
"
```

---

## 5. Start / Stop / Restart ระบบ

```bash
# หยุดระบบ
tutor local stop

# เริ่มระบบ (detached / background)
tutor local start -d

# Restart เฉพาะ LMS
docker restart tutor_local-lms-1 tutor_local-lms-worker-1

# Restart ทั้งหมด
tutor local stop && tutor local start -d

# ดู log หลัง restart
docker logs -f tutor_local-lms-1
```

---

## 6. ขั้นตอน Debug แบบ Step-by-Step

```
เกิด Error บนหน้าเว็บ
        │
        ▼
เช็ค HTTP status: curl -o /dev/null -w "%{http_code}" http://www.signalstandard.rta.mi.th/
        │
        ├─ 500 → docker logs tutor_local-lms-1 2>&1 | grep "ERROR\|CRITICAL" | tail -20
        │         อ่าน Traceback จากล่างขึ้นบน → หา root cause
        │
        ├─ 502/504 → docker ps | grep tutor  (ดูว่า Restarting หรือเปล่า)
        │            docker logs tutor_local-lms-1 2>&1 | tail -30
        │
        └─ 301/302 → curl -sL -o /dev/null -w "%{url_effective}" URL  (ดูว่า redirect ไปไหน)
                     เช็ค /etc/hosts ว่ามี subdomain นั้นไหม
```

---

## 7. ไฟล์ที่สำคัญในโปรเจค

| ไฟล์/โฟลเดอร์ | หน้าที่ |
|----------------|---------|
| `military-edx-plugin/military_profile/models.py` | โมเดลข้อมูลทหาร (ยศ, หน่วย, เลขประจำตัว) |
| `military-edx-plugin/certificate_expiry/models.py` | โมเดลการหมดอายุใบประกาศ |
| `military-edx-plugin/military_reports/models.py` | โมเดลรายงาน |
| `military-edx-plugin/*/migrations/` | ไฟล์ migration ของแต่ละ app |
| `tutor-military-plugin/plugin.py` | Tutor plugin (inject settings, Dockerfile) |
| `~/.local/share/tutor/config.yml` | Config หลักของ Tutor (domain, keys) |

### ดู Tutor Config
```bash
tutor config printroot          # โฟลเดอร์ config อยู่ที่ไหน
tutor config printvalue LMS_HOST
tutor config printvalue ENABLE_HTTPS
```

---

## 8. URL สำคัญของระบบ

| URL | หน้าที่ |
|-----|---------|
| `http://www.signalstandard.rta.mi.th/` | หน้าแรก LMS |
| `http://www.signalstandard.rta.mi.th/admin/` | Django Admin |
| `http://apps.www.signalstandard.rta.mi.th/authn/login` | หน้า Login (MFE) |
| `http://studio.www.signalstandard.rta.mi.th/` | Studio (สร้างคอร์ส) |
| `http://www.signalstandard.rta.mi.th/military/dashboard/` | HR Dashboard |
| `http://www.signalstandard.rta.mi.th/military/reports/` | รายงาน |

---

*อัปเดตล่าสุด: เมษายน 2568*
