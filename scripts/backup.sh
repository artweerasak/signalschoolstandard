#!/bin/bash
# backup.sh — สำรองข้อมูลระบบ eLearning กรมการทหารสื่อสาร
# ใช้งาน: bash backup.sh [backup_dir]
# Cron ตัวอย่าง: 0 2 * * * /opt/signalstandard/scripts/backup.sh >> /var/log/backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${1:-/opt/backups}"
DATE=$(date +%Y%m%d_%H%M%S)
DEST="${BACKUP_DIR}/${DATE}"
KEEP_DAYS=30

echo "[$(date)] ===== เริ่ม Backup ====="
mkdir -p "$DEST"

# ── 1. MySQL Database ─────────────────────────────────────────────
echo "[$(date)] Backup MySQL..."
MYSQL_CONTAINER="tutor_local-mysql-1"
MYSQL_USER=$(docker exec "$MYSQL_CONTAINER" bash -c 'echo $MYSQL_ROOT_PASSWORD' 2>/dev/null || echo "")
docker exec "$MYSQL_CONTAINER" sh -c \
    'mysqldump --single-transaction --routines --triggers -u root openedx 2>/dev/null' \
    | gzip > "${DEST}/mysql_openedx.sql.gz"
echo "[$(date)] MySQL: $(du -sh ${DEST}/mysql_openedx.sql.gz | cut -f1)"

# ── 2. MongoDB ────────────────────────────────────────────────────
echo "[$(date)] Backup MongoDB..."
docker exec tutor_local-mongodb-1 sh -c \
    'mongodump --db openedx --archive 2>/dev/null' \
    | gzip > "${DEST}/mongodb_openedx.archive.gz"
echo "[$(date)] MongoDB: $(du -sh ${DEST}/mongodb_openedx.archive.gz | cut -f1)"

# ── 3. Video files ────────────────────────────────────────────────
echo "[$(date)] Backup Videos..."
VIDEO_DIR="/home/adminrta/.local/share/tutor/data/openedx-media/videos"
if [ -d "$VIDEO_DIR" ]; then
    tar -czf "${DEST}/videos.tar.gz" -C "$(dirname $VIDEO_DIR)" "$(basename $VIDEO_DIR)" 2>/dev/null || true
    echo "[$(date)] Videos: $(du -sh ${DEST}/videos.tar.gz | cut -f1)"
fi

# ── 4. Plugin code ────────────────────────────────────────────────
echo "[$(date)] Backup Plugin code..."
tar -czf "${DEST}/signalstandard_code.tar.gz" \
    -C /opt signalstandard signal-frontend \
    --exclude="*/node_modules" \
    --exclude="*/__pycache__" \
    --exclude="*/.next" \
    --exclude="*/\*.egg-info" \
    2>/dev/null || true
echo "[$(date)] Code: $(du -sh ${DEST}/signalstandard_code.tar.gz | cut -f1)"

# ── 5. Tutor config ───────────────────────────────────────────────
echo "[$(date)] Backup Tutor config..."
cp /home/adminrta/.local/share/tutor/config.yml "${DEST}/tutor_config.yml" 2>/dev/null || true

# ── 6. สร้าง checksum ─────────────────────────────────────────────
cd "$DEST" && sha256sum * > checksums.sha256
echo "[$(date)] Checksums created"

# ── 7. ลบ backup เก่าเกิน 30 วัน ──────────────────────────────────
echo "[$(date)] ลบ backup เก่ากว่า ${KEEP_DAYS} วัน..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +${KEEP_DAYS} -exec rm -rf {} + 2>/dev/null || true

# ── สรุป ───────────────────────────────────────────────────────────
TOTAL=$(du -sh "$DEST" | cut -f1)
echo "[$(date)] ===== Backup เสร็จสิ้น ====="
echo "[$(date)] ที่จัดเก็บ: ${DEST}"
echo "[$(date)] ขนาดรวม: ${TOTAL}"
