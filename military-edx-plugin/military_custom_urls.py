"""
military_custom_urls.py — Custom ROOT_URLCONF for military eLearning.

ไฟล์นี้ extend LMS urls.py ปกติ แล้วเพิ่ม /military/* routes
โดยไม่ต้อง rebuild Docker image

ใช้โดยตั้งค่า:
    ROOT_URLCONF = "military_custom_urls"
ใน LMS production settings
"""
from lms.urls import urlpatterns  # นำเข้า URL ทั้งหมดจาก LMS ปกติ
from django.urls import include, path

urlpatterns = list(urlpatterns) + [
    path("military/", include("plugin_urls")),
]
