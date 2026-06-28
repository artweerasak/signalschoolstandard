"""
military_profile/concurrent_limit.py

จำกัดผู้ใช้งานพร้อมกัน (concurrent users) ด้วย Redis sorted set
- score = Unix timestamp ของ request ล่าสุด
- "active" = มี request ภายใน ACTIVE_TTL วินาทีที่ผ่านมา
- ถ้า user ใหม่เข้ามาและ active count >= CONCURRENT_USER_LIMIT → 503
"""

import time
import logging

from django.conf import settings
from django.http import JsonResponse

logger = logging.getLogger(__name__)

ACTIVE_TTL = 300        # วินาที — idle เกินนี้ถือว่าออกจากระบบแล้ว
REDIS_KEY  = "mil:active_users"


class ConcurrentUserLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self._redis = None

    # ── ดึง limit จาก settings (เปลี่ยนได้โดยไม่ต้อง redeploy) ─────────────
    @property
    def limit(self) -> int:
        return getattr(settings, "CONCURRENT_USER_LIMIT", 300)

    # ── Lazy Redis connection — ใช้ connection เดียวกับ cache ─────────────────
    @property
    def redis(self):
        if self._redis is None:
            from django_redis import get_redis_connection
            self._redis = get_redis_connection("default")
        return self._redis

    def __call__(self, request):
        # 1. เฉพาะ military API เท่านั้น — login/static/public ผ่านได้เลย
        if not request.path.startswith("/military/api/"):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return self.get_response(request)

        # 2. admin/staff ไม่ถูก limit (ป้องกัน admin ถูก lock out)
        if user.is_staff or user.is_superuser:
            return self.get_response(request)

        uid    = str(user.id)
        now    = time.time()
        cutoff = now - ACTIVE_TTL

        try:
            r = self.redis

            # ตรวจว่า user นี้ถูกนับอยู่แล้วไหม
            score = r.zscore(REDIS_KEY, uid)
            already_active = score is not None and float(score) > cutoff

            if not already_active:
                # เคลียร์ผู้ใช้ที่ inactive แล้วนับใหม่
                r.zremrangebyscore(REDIS_KEY, 0, cutoff)
                active_count = int(r.zcard(REDIS_KEY))

                if active_count >= self.limit:
                    logger.info(
                        "ConcurrentUserLimit: user=%s rejected (active=%d limit=%d)",
                        uid, active_count, self.limit,
                    )
                    return JsonResponse(
                        {
                            "error":   "capacity_exceeded",
                            "message": (
                                f"ขณะนี้มีผู้ใช้งานในระบบครบ {self.limit} คนแล้ว "
                                "กรุณารอสักครู่แล้วลองใหม่อีกครั้ง"
                            ),
                            "active":  active_count,
                            "limit":   self.limit,
                        },
                        status=503,
                    )

            # อัปเดต/เพิ่ม timestamp ของ user นี้
            r.zadd(REDIS_KEY, {uid: now})

        except Exception as exc:
            # Redis ล่ม → fail open (ไม่ block ผู้ใช้)
            logger.warning("ConcurrentUserLimitMiddleware Redis error: %s", exc)

        return self.get_response(request)
