#!/bin/bash
# backup.sh — สำรองข้อมูลระบบ eLearning กรมการทหารสื่อสาร
#
# เขียนใหม่ 2026-07-17 หลัง incident ดิสก์เต็ม และพบว่าไม่เคยมี backup เลย 46 วัน
# ต้นฉบับเดิมเก็บไว้ที่ backup.sh.orig-20260717
# รายละเอียดบั๊กเดิม: ~/BACKUP-ISSUES.md
#
# บั๊กเดิมที่แก้แล้ว 3 จุด (แต่ละจุดพอตัวเดียวก็ทำให้ backup เป็นศูนย์):
#   1. mysqldump ไม่ส่ง password -> Access denied (เอา password ไปใส่ตัวแปรชื่อ MYSQL_USER)
#   2. BACKUP_DIR=/opt/backups แต่ adminrta สร้างไม่ได้ -> mkdir ตายก่อนถึงขั้น dump
#   3. find -maxdepth 1 -type d ไม่มี -mindepth 1 -> จะ rm -rf ตัว BACKUP_DIR เอง
#
# ขอบเขต: ฐานข้อมูลเท่านั้น (MySQL + MongoDB + config)
#   วิดีโอ 17G ถูก "ตัดออกโดยตั้งใจ" — ของเดิม tar ทุกคืน x KEEP_DAYS=30 = 510GB บนดิสก์ 97G
#   วิดีโอเป็นไฟล์นิ่ง ควรใช้ rsync แยกต่างหาก ไม่ใช่ tar ใหม่ทุกคืน
#
# ใช้งาน: bash backup.sh [backup_dir]
# Cron  : 0 2 * * * /opt/signalstandard/scripts/backup.sh >> /home/adminrta/logs/backup.log 2>&1
#         ^ ห้ามใส่ชื่อ user ใน user crontab เด็ดขาด (บั๊กเดิม)

set -euo pipefail

BACKUP_DIR="${1:-/home/adminrta/backups}"
DATE=$(date +%Y%m%d_%H%M%S)
DEST="${BACKUP_DIR}/${DATE}"
KEEP_DAYS=30
MIN_FREE_GB=5

MYSQL_CONTAINER="tutor_local-mysql-1"
MONGO_CONTAINER="tutor_local-mongodb-1"

log()  { echo "[$(date "+%F %T")] $*"; }
fail() { echo "[$(date "+%F %T")] ERROR: $*" >&2; exit 1; }

log "===== เริ่ม Backup (DB only) ====="

mkdir -p "$BACKUP_DIR" || fail "สร้าง $BACKUP_DIR ไม่ได้"

# ── guard: พื้นที่ไม่พอ ห้ามเริ่ม (บทเรียนจาก 17 ก.ค. — backup ต้องไม่เป็นคนทำดิสก์เต็มเสียเอง)
AVAIL_GB=$(df -BG --output=avail "$BACKUP_DIR" | tail -1 | tr -dc "0-9")
[ "${AVAIL_GB:-0}" -ge "$MIN_FREE_GB" ] || fail "พื้นที่เหลือ ${AVAIL_GB}G < ${MIN_FREE_GB}G — ยกเลิก"
log "พื้นที่ว่าง ${AVAIL_GB}G — ผ่าน"

mkdir -p "$DEST"

# ── 1. MySQL ───────────────────────────────────────────────────────
# ใช้ $MYSQL_ROOT_PASSWORD จาก env *ภายในคอนเทนเนอร์*
# -> รหัสผ่านไม่โผล่ใน ps บน host และไม่โผล่ใน command line เลย
log "Backup MySQL..."
docker exec "$MYSQL_CONTAINER" sh -c \
    "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysqldump \
        --single-transaction --quick --routines --triggers --events \
        --source-data=2 -u root openedx" \
    | gzip > "${DEST}/mysql_openedx.sql.gz"

SZ=$(stat -c %s "${DEST}/mysql_openedx.sql.gz")
[ "$SZ" -gt 1000000 ] || fail "MySQL dump เล็กผิดปกติ (${SZ} bytes) — dump ไม่สำเร็จ"
gunzip -t "${DEST}/mysql_openedx.sql.gz" || fail "MySQL dump เสีย (gzip ไม่ผ่าน)"

# ตรวจเนื้อใน: นับตารางทั้งหมด + ยืนยันว่ามีตาราง grades
# หมายเหตุ: ใช้ awk อ่านจนจบสตรีม ห้ามใช้ grep -q เพราะมันออกกลางคัน
#   -> zcat โดน SIGPIPE -> pipefail เห็นเป็น exit 141 -> fail ทั้งที่ dump ดี (เจอ 2026-07-17)
COUNTS=$(zcat "${DEST}/mysql_openedx.sql.gz" \
    | awk "/^CREATE TABLE/{t++} /grades_persistentcoursegrade/{g++} END{printf \"%d %d\", t+0, g+0}")
TABLES=${COUNTS%% *}
GRADES=${COUNTS##* }
[ "${TABLES:-0}" -gt 100 ] || fail "MySQL dump มีแค่ ${TABLES} ตาราง — น่าจะไม่ครบ"
[ "${GRADES:-0}" -gt 0 ]   || fail "MySQL dump ไม่มีตาราง grades — ข้อมูลไม่ครบ"
log "MySQL OK: $(du -h "${DEST}/mysql_openedx.sql.gz" | cut -f1) (${TABLES} ตาราง, ยืนยันมี grades)"

# ── 2. MongoDB ─────────────────────────────────────────────────────
log "Backup MongoDB..."
docker exec "$MONGO_CONTAINER" mongodump --quiet --db=openedx --archive \
    | gzip > "${DEST}/mongodb_openedx.archive.gz"
SZ=$(stat -c %s "${DEST}/mongodb_openedx.archive.gz")
[ "$SZ" -gt 10000 ] || fail "MongoDB dump เล็กผิดปกติ (${SZ} bytes)"
gunzip -t "${DEST}/mongodb_openedx.archive.gz" || fail "MongoDB dump เสีย"
log "MongoDB OK: $(du -h "${DEST}/mongodb_openedx.archive.gz" | cut -f1)"

# ── 3. Tutor config ────────────────────────────────────────────────
cp /home/adminrta/.local/share/tutor/config.yml "${DEST}/tutor_config.yml" \
    || fail "คัดลอก tutor config ไม่ได้"
log "Tutor config OK"

# ── 4. checksum ────────────────────────────────────────────────────
( cd "$DEST" && sha256sum mysql_openedx.sql.gz mongodb_openedx.archive.gz tutor_config.yml > checksums.sha256 )
log "Checksums OK"

# ── 5. ลบ backup เก่า ──────────────────────────────────────────────
# FIX: เพิ่ม -mindepth 1 กันไม่ให้ match ตัว BACKUP_DIR เอง (เดิมจะ rm -rf ทั้งโฟลเดอร์)
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +${KEEP_DAYS} -exec rm -rf {} + 2>/dev/null || true
log "ลบ backup เก่ากว่า ${KEEP_DAYS} วันแล้ว"

# ── 6. TODO: ส่งออกนอกเครื่อง ──────────────────────────────────────
# !! backup ยังอยู่ดิสก์เดียวกับต้นฉบับ = กันดิสก์พัง / VM หายไม่ได้ !!
# เมื่อรู้ปลายทางแล้วใส่ตรงนี้ เช่น:
#   rsync -az --delete "$DEST" backup-host:/backups/signalstandard/
# ดู ~/BACKUP-ISSUES.md

TOTAL=$(du -sh "$DEST" | cut -f1)
log "===== Backup เสร็จสิ้น ====="
log "ที่จัดเก็บ: ${DEST}  (${TOTAL})"
log "!! เตือน: ยังไม่มีสำเนานอกเครื่องนี้ — ดู BACKUP-ISSUES.md"
