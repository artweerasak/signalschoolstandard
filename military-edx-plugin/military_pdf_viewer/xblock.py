"""
Military PDF Viewer XBlock
ครูกรอกแค่ URL แล้ว save — นักเรียนเห็น PDF พร้อมปุ่มเต็มหน้าจอ
"""
import pkg_resources
from xblock.core import XBlock
from xblock.fields import Scope, String, Integer
from xblock.fragment import Fragment


def _get_csrf_token():
    """ดึง CSRF token จาก current request ผ่าน crum middleware ของ Open edX"""
    try:
        from crum import get_current_request
        from django.middleware.csrf import get_token
        request = get_current_request()
        if request:
            return get_token(request)
    except Exception:
        pass
    return ""


class MilitaryPdfViewerXBlock(XBlock):
    """แสดง PDF จาก URL พร้อมปุ่มเต็มหน้าจอ ครูกรอก URL ได้ใน Studio"""

    display_name = String(
        display_name="ชื่อเอกสาร",
        default="เอกสารประกอบการเรียน",
        scope=Scope.settings,
        help="ชื่อที่แสดงเหนือ PDF",
    )

    pdf_url = String(
        display_name="URL ของไฟล์ PDF",
        default="",
        scope=Scope.settings,
        help="ใส่ URL ของไฟล์ PDF หรือ link จาก Files & Uploads",
    )

    height = Integer(
        display_name="ความสูง (px)",
        default=700,
        scope=Scope.settings,
        help="ความสูงของกรอบแสดง PDF (pixel) เช่น 700",
    )

    def resource_string(self, path):
        return pkg_resources.resource_string(__name__, path).decode("utf8")

    def student_view(self, context=None):
        """View ที่นักเรียนเห็น"""
        html = self.resource_string("static/military_pdf_viewer/student_view.html")
        frag = Fragment(
            html.format(
                display_name=self.display_name or "เอกสารประกอบการเรียน",
                pdf_url=self.pdf_url or "",
                height=self.height or 700,
                block_id=self.scope_ids.usage_id,
            )
        )
        frag.add_css(self.resource_string("static/military_pdf_viewer/viewer.css"))
        frag.add_javascript(self.resource_string("static/military_pdf_viewer/viewer.js"))
        frag.initialize_js("MilitaryPdfViewerXBlock")
        return frag

    def studio_view(self, context=None):
        """View ที่ครูเห็นตอน Edit ใน Studio — CSRF token embed จาก server"""
        html = self.resource_string("static/military_pdf_viewer/studio_view.html")
        frag = Fragment(
            html.format(
                display_name=self.display_name or "",
                pdf_url=self.pdf_url or "",
                height=self.height or 700,
                csrf_token=_get_csrf_token(),
            )
        )
        frag.add_css(self.resource_string("static/military_pdf_viewer/viewer.css"))
        frag.add_javascript(self.resource_string("static/military_pdf_viewer/studio.js"))
        frag.initialize_js("MilitaryPdfViewerStudio")
        return frag

    @XBlock.json_handler
    def save_settings(self, data, suffix=""):
        """บันทึกค่าที่ครูกรอกใน Studio"""
        self.display_name = data.get("display_name", self.display_name)
        self.pdf_url = data.get("pdf_url", self.pdf_url)
        self.height = int(data.get("height", self.height) or 700)
        return {"result": "success"}

    @staticmethod
    def workbench_scenarios():
        return [
            ("Military PDF Viewer", "<military-pdf-viewer/>"),
        ]
