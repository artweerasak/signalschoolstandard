"""
tests/test_video_upload.py

POST /military/api/v1/videos/upload/ — คลังไฟล์ของครู (instructor) เดิมรับ
เฉพาะไฟล์วิดีโอ ครูขอให้รับไฟล์เสียงตัวอย่างประกอบการสอนด้วย (endpoint นี้แค่
เขียนไฟล์ดิบลงดิสก์แล้วคืน URL ไม่มีการ transcode เฉพาะวิดีโอเลย จึงขยายรับ
ไฟล์เสียงได้โดยไม่กระทบของเดิม — ดู api_video_list ที่แค่ scan ไฟล์ในโฟลเดอร์)
"""
import os

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings

from military_profile.models import MilitaryUserProfile, encrypt_field

User = get_user_model()


def _make_user(username, role):
    user = User.objects.create_user(username=username, password="testpass123")
    MilitaryUserProfile.objects.create(
        user=user,
        national_id_encrypted=encrypt_field(f"1-{username}-0000000000"),
        military_id_encrypted=encrypt_field(f"MIL-{username}"),
        full_name_th=f"ทดสอบ {username}",
        unit="หน่วยทดสอบ",
        role=role,
    )
    return user


@pytest.fixture
def instructor(db):
    return _make_user("video_upload_instructor", "instructor")


@pytest.fixture
def video_dir(tmp_path, instructor):
    """เตรียมโฟลเดอร์หมวดหมู่ให้พร้อมอัปโหลด (ข้าม api_video_subjects เพราะ
    เทสนี้เน้นตรวจ validation ของ api_video_upload เอง ไม่ใช่การสร้างหมวดหมู่)"""
    subject_dir = tmp_path / instructor.username / "test-subject"
    os.makedirs(subject_dir)
    return tmp_path


class TestVideoUploadAcceptsAudio:
    def test_accepts_mp3(self, db, instructor, video_dir):
        with override_settings(MILITARY_VIDEO_DIR=str(video_dir)):
            client = Client()
            client.force_login(instructor)
            f = SimpleUploadedFile("ตัวอย่าง.mp3", b"fake mp3 bytes", content_type="audio/mpeg")
            resp = client.post(
                "/military/api/v1/videos/upload/",
                {"file": f, "course_slug": "test-subject"},
            )
        assert resp.status_code == 200, resp.content
        assert os.path.exists(os.path.join(str(video_dir), instructor.username, "test-subject", "ตัวอย่าง.mp3"))

    def test_accepts_m4a(self, db, instructor, video_dir):
        with override_settings(MILITARY_VIDEO_DIR=str(video_dir)):
            client = Client()
            client.force_login(instructor)
            f = SimpleUploadedFile("บันทึกเสียง.m4a", b"fake m4a bytes", content_type="audio/x-m4a")
            resp = client.post(
                "/military/api/v1/videos/upload/",
                {"file": f, "course_slug": "test-subject"},
            )
        assert resp.status_code == 200, resp.content

    def test_still_accepts_video(self, db, instructor, video_dir):
        with override_settings(MILITARY_VIDEO_DIR=str(video_dir)):
            client = Client()
            client.force_login(instructor)
            f = SimpleUploadedFile("clip.mp4", b"fake mp4 bytes", content_type="video/mp4")
            resp = client.post(
                "/military/api/v1/videos/upload/",
                {"file": f, "course_slug": "test-subject"},
            )
        assert resp.status_code == 200, resp.content

    def test_still_rejects_unrelated_file_types(self, db, instructor, video_dir):
        with override_settings(MILITARY_VIDEO_DIR=str(video_dir)):
            client = Client()
            client.force_login(instructor)
            f = SimpleUploadedFile("malware.exe", b"fake exe bytes", content_type="application/octet-stream")
            resp = client.post(
                "/military/api/v1/videos/upload/",
                {"file": f, "course_slug": "test-subject"},
            )
        assert resp.status_code == 400
        assert "วิดีโอหรือไฟล์เสียง" in resp.json()["error"]

    def test_rejects_when_subject_does_not_exist(self, db, instructor, video_dir):
        with override_settings(MILITARY_VIDEO_DIR=str(video_dir)):
            client = Client()
            client.force_login(instructor)
            f = SimpleUploadedFile("ตัวอย่าง.mp3", b"fake mp3 bytes", content_type="audio/mpeg")
            resp = client.post(
                "/military/api/v1/videos/upload/",
                {"file": f, "course_slug": "no-such-subject"},
            )
        assert resp.status_code == 400
