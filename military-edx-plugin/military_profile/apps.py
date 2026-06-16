from django.apps import AppConfig


class MilitaryProfileConfig(AppConfig):
    name = "military_profile"
    verbose_name = "Military Profile"

    def ready(self):
        # Import signal handlers so they register on startup.
        import military_profile.signals  # noqa: F401

        # ── ทำให้ PDF Viewer XBlock โผล่ใน "Advanced Components" ของทุกหลักสูตรถาวร ──
        # Studio สร้างเมนู Advanced จาก: course.advanced_modules + DEFAULT_ADVANCED_MODULES
        # (cms/djangoapps/contentstore/views/component.py) — append เข้า list นี้
        # ครูจึงไม่ต้องไปใส่ "military-pdf-viewer" ใน Advanced Settings รายวิชาเองอีก
        try:
            from cms.djangoapps.contentstore.views import component as _component
            if "military-pdf-viewer" not in _component.DEFAULT_ADVANCED_MODULES:
                _component.DEFAULT_ADVANCED_MODULES.append("military-pdf-viewer")
        except Exception:
            # LMS / สภาพแวดล้อมที่ไม่มี contentstore — ข้ามได้
            pass

        # ── แก้ RawPostDataException ตอนอัปโหลดไฟล์เข้า Files & Uploads (CMS) ──
        # edX เดิม: update_asset() อ่าน request.FILES (กิน stream) แล้วค่อยอ่าน request.body
        #   → "You cannot access body after reading from request's data stream" (500)
        # monkeypatch แบบ runtime — อยู่ใน plugin จึงไม่หายเมื่อ container ถูก recreate
        # (ต่างจากการแก้ไฟล์ source ที่หายทุกครั้งที่สร้าง container ใหม่)
        try:
            from cms.djangoapps.contentstore import asset_storage_handlers as _ash
            if not getattr(_ash.update_asset, "_military_patched", False):
                _orig_update_asset = _ash.update_asset

                def _patched_update_asset(request, course_key, asset_key=None):
                    ct = request.content_type or ''
                    # multipart (อัปโหลดไฟล์) → ส่งเข้า _upload_asset ก่อนแตะ request.body
                    if request.method in ('POST', 'PUT') and ('multipart' in ct or 'form-data' in ct):
                        return _ash._upload_asset(request, course_key)
                    return _orig_update_asset(request, course_key, asset_key)

                _patched_update_asset._military_patched = True
                _ash.update_asset = _patched_update_asset
        except Exception:
            pass
