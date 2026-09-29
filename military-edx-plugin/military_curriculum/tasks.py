"""
military_curriculum/tasks.py

Celery tasks:
  - cascade_enroll_student_task : enroll นักเรียน 1 คนเข้าทุกวิชาในหลักสูตร
    (dispatch แบบนี้เมื่อ prep_personnel บรรจุพร้อมกันหลายคน — ดู
    quota_views.py:api_curriculum_enroll ที่ตัดสินใจว่าจะรัน sync หรือ
    dispatch เป็น task ตามจำนวน student_ids)
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def cascade_enroll_student_task(self, enrollment_request_id: int):
    from .models import CurriculumEnrollmentRequest
    from .services.enrollment_service import cascade_enroll_student

    try:
        enrollment_request = CurriculumEnrollmentRequest.objects.get(pk=enrollment_request_id)
    except CurriculumEnrollmentRequest.DoesNotExist:
        # ผู้เรียกควรส่งงานหลัง transaction ที่สร้าง row นี้ commit แล้วเสมอ
        # (ดู quota_views.py: transaction.on_commit(...)) แต่เผื่อพลาดจุดนั้น
        # ที่ไหนสักแห่งในอนาคต ลอง retry สั้นๆ ก่อนยอมแพ้ — ไม่งั้น row ที่
        # เพิ่ง commit ไปหมาดๆ แต่ worker ยังมองไม่เห็น จะค้างเป็น pending
        # ถาวรแบบเงียบๆ ไม่มี error ให้เห็นเลย (เคยเกิดจริง 74 คนค้าง 3 วัน)
        logger.warning(
            "cascade_enroll_student_task: request %s not found yet, retrying (%s/%s)",
            enrollment_request_id, self.request.retries, self.max_retries,
        )
        try:
            raise self.retry(countdown=5)
        except self.MaxRetriesExceededError:
            logger.error("cascade_enroll_student_task: request %s never appeared after retries", enrollment_request_id)
            return

    cascade_enroll_student(enrollment_request)
