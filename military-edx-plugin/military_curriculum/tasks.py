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
        logger.error("cascade_enroll_student_task: request %s not found", enrollment_request_id)
        return

    cascade_enroll_student(enrollment_request)
