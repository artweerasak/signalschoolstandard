"""
Military Random Quiz XBlock

สุ่มข้อสอบจากคลังข้อสอบ (Content Library) ให้นักเรียนแต่ละคนไม่ซ้ำกัน — ชุดที่สุ่ม
ได้คงที่ทุกครั้งที่เข้าหน้า (ไม่สุ่มใหม่ทุก reload) และให้คะแนนอัตโนมัติเข้าสมุดคะแนน
จริงของ LMS — ใช้ควบคู่กับ Problem Bank (itembank) เดิมของ Open edX ได้ ไม่ได้แทนที่
(ไม่แตะโค้ด itembank เลย เป็น XBlock category ใหม่แยกต่างหาก)

เหตุผลที่ต้องมี component นี้: Problem Bank เดิมทำงานถูกต้อง (สุ่ม+ให้คะแนน) อยู่แล้ว
แต่หน้า editor ของมันเป็นการ์ด กวาดตายากเวลามีข้อสอบเยอะ (ปัญหาจริงที่เจอ: คลัง 60 ข้อ
เผลอเลือกได้แค่ 20 เพราะการ์ดจำยาก) — component นี้ให้หน้า editor เป็นตาราง/ลิสต์แทน

สถาปัตยกรรม:
- studio_view (รันใน CMS): ให้ครูเลือก Library + ติ๊กเลือกข้อ (หรือ Select All) จาก
  ตารางลิสต์ ผ่าน content_libraries.api ตรงๆ (openedx.core — ใช้ได้ทั้ง LMS/CMS)
- student_view (รันใน LMS): สุ่มข้อแบบคงที่ด้วย xmodule.item_bank_block.ItemBankMixin.
  make_selection (ยืนยันแล้วว่า import ได้จาก LMS, เป็น pure classmethod ไม่ผูกกับ
  ItemBankBlock) แล้วดึงเนื้อหาแต่ละข้อด้วย openedx.core.djangoapps.xblock.api.
  get_block_olx (ยืนยันแล้วว่า import ได้จาก LMS) — พาร์สด้วย military_random_quiz.olx
- การให้คะแนน: เก็บคำตอบ+คะแนนใน Scope.user_state, ส่งเข้า gradebook ผ่าน
  self.runtime.publish(self, 'grade', ...) — คำตอบที่ถูกต้องไม่เคยส่งไปฝั่ง client
  เลย (parse_multiplechoice_olx เก็บไว้ฝั่ง server เท่านั้น, ตรวจคำตอบด้วยการ parse
  OLX ใหม่ทุกครั้งตอน submit ไม่เชื่อค่าที่ client ส่งกลับมาเรื่องเฉลย)
"""
import random as _random_mod

import pkg_resources
from xblock.core import XBlock
from xblock.fields import Scope, String, Integer, Float, List, Dict, Boolean
from xblock.fragment import Fragment

from .olx import parse_multiplechoice_olx, public_choices


def _get_current_request():
    try:
        from crum import get_current_request
        return get_current_request()
    except Exception:
        return None


def _get_csrf_token():
    """ดึง CSRF token จาก current request ผ่าน crum middleware ของ Open edX
    (pattern เดียวกับ military_pdf_viewer/xblock.py)"""
    try:
        from django.middleware.csrf import get_token
        request = _get_current_request()
        if request:
            return get_token(request)
    except Exception:
        pass
    return ""


class MilitaryRandomQuizXBlock(XBlock):
    """สุ่มข้อสอบจากคลังข้อสอบ ให้คะแนนอัตโนมัติ — ใช้คู่กับ Problem Bank เดิมได้"""

    has_score = True

    # ── ตั้งค่าโดยครู (Scope.settings) ──────────────────────────────────
    display_name = String(
        display_name="ชื่อแบบทดสอบ",
        default="แบบทดสอบสุ่มข้อ",
        scope=Scope.settings,
    )
    library_key = String(
        display_name="Library key ของคลังข้อสอบ",
        default="",
        scope=Scope.settings,
        help='เช่น lib:SSC:TACPROM1',
    )
    selected_block_keys = List(
        display_name="ข้อที่เลือกจากคลัง",
        default=[],
        scope=Scope.settings,
    )
    randomize = Boolean(
        display_name="สุ่มข้อสอบ",
        default=True,
        scope=Scope.settings,
        help="ติ๊ก = สุ่ม N ข้อจากคลังต่อคน (คนละชุด) — ไม่ติ๊ก = ทุกคนได้ข้อสอบครบตามที่เลือก เรียงลำดับเดิม ไม่สุ่ม",
    )
    count = Integer(
        display_name="จำนวนข้อสุ่มต่อคน",
        default=10,
        scope=Scope.settings,
    )
    weight = Float(
        display_name="คะแนนเต็ม",
        default=10.0,
        scope=Scope.settings,
    )
    max_attempts = Integer(
        display_name="จำนวนครั้งที่ทำได้",
        default=1,
        scope=Scope.settings,
        help="ใส่ 0 = ไม่จำกัดจำนวนครั้ง",
    )
    show_answer_after_submit = Boolean(
        display_name="เฉลยคำตอบหลังส่ง",
        default=True,
        scope=Scope.settings,
    )
    show_score_after_submit = Boolean(
        display_name="แสดงคะแนนหลังส่ง",
        default=True,
        scope=Scope.settings,
    )
    access_code = String(
        display_name="รหัสเข้าสอบ",
        default="",
        scope=Scope.settings,
        help="รหัสเดียวใช้ร่วมกันทั้งห้องสอบ -- เว้นว่าง = ไม่ต้องใช้รหัส เปิดทำข้อสอบได้ทันที",
    )

    # ── ต่อนักเรียนแต่ละคน (Scope.user_state) ──────────────────────────
    assigned_block_keys = List(default=[], scope=Scope.user_state)
    submitted_answers = Dict(default={}, scope=Scope.user_state)  # {"lb:...": chosen_index}
    is_submitted = String(default="", scope=Scope.user_state)     # "" | "submitted"
    attempt_number = Integer(default=0, scope=Scope.user_state)   # จำนวนครั้งที่ส่งคำตอบไปแล้ว
    raw_earned = Float(default=None, scope=Scope.user_state)      # คะแนน "สูงสุด" ที่เคยทำได้
    access_code_verified = Boolean(default=False, scope=Scope.user_state)  # กรอกรหัสเข้าสอบถูกแล้ว

    # ------------------------------------------------------------------
    # grading -- has_score=True หมายถึง XBlock grading machinery จะเรียก
    # max_score()/get_score() พวกนี้เพื่อคำนวณคะแนนรวมของ subsection/course
    # ------------------------------------------------------------------
    def max_score(self):
        return self.weight

    def get_score(self):
        if self.raw_earned is None:
            return None
        return {"raw_earned": self.raw_earned, "raw_possible": self.weight}

    def resource_string(self, path):
        return pkg_resources.resource_string(__name__, path).decode("utf8")

    # ------------------------------------------------------------------
    # student_view (LMS)
    # ------------------------------------------------------------------
    def _library_usage_key(self, block_key_str):
        from opaque_keys.edx.locator import LibraryUsageLocatorV2
        return LibraryUsageLocatorV2.from_string(block_key_str)

    def _ensure_assigned_questions(self):
        """สุ่มชุดคำถามให้นักเรียนคนนี้ครั้งแรก แล้วคงที่ทุกครั้งที่เข้าใหม่ (ไม่สุ่มซ้ำ)
        ใช้ ItemBankMixin.make_selection เดียวกับที่ Problem Bank ของ Open edX ใช้จริง
        (pure classmethod, ยืนยันแล้วว่า import จาก LMS ได้และไม่ผูกกับ ItemBankBlock)

        ห้ามเรียกส่วน reassign นี้อีกหลังส่งคำตอบไปแล้ว -- ถ้าครูแก้ pool ทีหลัง
        (เพิ่ม/ลบข้อในคลัง) แล้ว make_selection รันซ้ำ จะไปเปลี่ยน assigned_block_keys
        ของคนที่ตรวจให้คะแนนไปแล้ว ทำให้ชุดข้อที่บันทึกไว้ไม่ตรงกับที่ใช้ตรวจจริง"""
        if self.is_submitted == "submitted":
            return
        if not self.selected_block_keys:
            return

        if not self.randomize:
            # ไม่สุ่ม -- ทุกคนได้ข้อสอบครบตามที่เลือกไว้ เรียงลำดับเดิมเป๊ะ
            if self.assigned_block_keys != self.selected_block_keys:
                self.assigned_block_keys = list(self.selected_block_keys)
            return

        try:
            children = [self._library_usage_key(k) for k in self.selected_block_keys]
        except Exception:
            return
        selected = []
        for k in self.assigned_block_keys:
            try:
                key = self._library_usage_key(k)
                selected.append((key.block_type, key.block_id))
            except Exception:
                continue

        from xmodule.item_bank_block import ItemBankMixin
        result = ItemBankMixin.make_selection(selected, children, self.count)
        if any(result.get(k) for k in ("invalid", "overlimit", "added")):
            # .lib_key (ไม่ใช่ .library_key) -- ชื่อ attribute จริงของ
            # LibraryUsageLocatorV2 ยืนยันผ่าน shell กับ production จริง
            lib_key = children[0].lib_key if children else None
            new_assigned = []
            for block_type, block_id in result["selected"]:
                from opaque_keys.edx.locator import LibraryUsageLocatorV2
                new_assigned.append(str(LibraryUsageLocatorV2(lib_key, block_type, block_id)))
            self.assigned_block_keys = new_assigned

    def _shuffled_choice_order(self, question_key, num_choices):
        """ลำดับการแสดงตัวเลือกที่คงที่ต่อ (นักเรียน, ข้อ) คู่หนึ่งๆ -- สลับแค่ตำแหน่ง
        แสดงผล ไม่ใช่ตัว index ที่ใช้ตรวจคำตอบ (index อิง OLX order เดิมเสมอ)
        ไม่สุ่ม (randomize=False) -- ไม่สลับตัวเลือกด้วย เพื่อให้ "ไม่สุ่ม" หมายถึง
        ทุกคนเห็นข้อสอบเหมือนกันทุกกระเบียดนิ้วจริงๆ ไม่ใช่แค่ไม่ตัดข้อ"""
        if not self.randomize:
            return list(range(num_choices))
        seed = "{}:{}".format(self.scope_ids.user_id, question_key)
        order = list(range(num_choices))
        _random_mod.Random(seed).shuffle(order)
        return order

    def _attempts_remaining(self):
        """True ถ้ายังทำ(ซ้ำ)ได้อีก -- max_attempts=0 หมายถึงไม่จำกัด"""
        if self.max_attempts == 0:
            return True
        return self.attempt_number < self.max_attempts

    def _needs_access_code(self):
        """True ถ้าตั้งรหัสเข้าสอบไว้ (ไม่ว่าง) และนักเรียนคนนี้ยังไม่เคยกรอกถูก
        -- กรอกถูกครั้งเดียวพอ ไม่ต้องกรอกซ้ำทุกครั้งที่เข้าหน้า/ทำรอบใหม่"""
        return bool((self.access_code or "").strip()) and not self.access_code_verified

    def _load_questions_for_student(self, reveal_correct=False):
        """คืน [{key, stem, choices:[{index,text[,correct]}], answered}, ...]
        -- ไม่มี field บอกคำตอบที่ถูกต้องเลย เว้นแต่ reveal_correct=True (ใช้เฉพาะ
        ตอนส่งคำตอบไปแล้วและครูเปิด "เฉลยคำตอบหลังส่ง" ไว้ -- ดู olx.public_choices)"""
        from openedx.core.djangoapps.xblock.api import get_block_olx
        from openedx.core.djangoapps.xblock.data import LatestVersion

        questions = []
        for key_str in self.assigned_block_keys:
            try:
                key = self._library_usage_key(key_str)
                olx_xml = get_block_olx(key, version=LatestVersion.PUBLISHED)
                stem, choices = parse_multiplechoice_olx(olx_xml)
            except Exception:
                continue  # ข้อที่ดึง/parse ไม่ได้ -- ข้ามไปแทนที่จะทำทั้งหน้าเสีย
            order = self._shuffled_choice_order(key_str, len(choices))
            source = choices if reveal_correct else public_choices(choices)
            display_choices = [source[i] for i in order]
            questions.append({
                "key": key_str,
                "stem": stem,
                "choices": display_choices,
                "answered": self.submitted_answers.get(key_str),
            })
        return questions

    def student_view(self, context=None):
        needs_code = self._needs_access_code()
        if needs_code:
            # ยังไม่ยืนยันรหัสเข้าสอบ -- ห้ามสุ่ม/โหลดข้อสอบเด็ดขาด กันข้อสอบรั่วผ่าน
            # initArgs ก่อนกรอกรหัสถูก (ไม่ใช่แค่ซ่อนด้วย CSS ฝั่ง client)
            is_submitted = False
            reveal = False
            questions = []
        else:
            self._ensure_assigned_questions()
            is_submitted = self.is_submitted == "submitted"
            reveal = is_submitted and self.show_answer_after_submit
            questions = self._load_questions_for_student(reveal_correct=reveal)
        html = self.resource_string("static/military_random_quiz/student_view.html")
        frag = Fragment(html.format(
            display_name=self.display_name or "แบบทดสอบสุ่มข้อ",
            block_id=self.scope_ids.usage_id,
        ))
        frag.add_css(self.resource_string("static/military_random_quiz/viewer.css"))
        frag.add_javascript(self.resource_string("static/military_random_quiz/viewer.js"))
        frag.initialize_js("MilitaryRandomQuizXBlock", {
            "needs_code": needs_code,
            "questions": questions,
            "is_submitted": is_submitted,
            "reveal_answer": reveal,
            "show_score": self.show_score_after_submit,
            "score": self.get_score(),
            "weight": self.weight,
            "attempt_number": self.attempt_number,
            "max_attempts": self.max_attempts,
            "can_retake": is_submitted and self._attempts_remaining(),
        })
        return frag

    @XBlock.json_handler
    def submit_access_code(self, data, suffix=""):
        """ตรวจรหัสเข้าสอบ -- เทียบแบบ strip()+ไม่สนตัวพิมพ์เล็กใหญ่ ลดปัญหาพิมพ์ผิด
        Shift ค้าง/Caps Lock ตอนแจกรหัสปากเปล่าในห้องสอบ"""
        expected = (self.access_code or "").strip()
        if not expected:
            self.access_code_verified = True
            return {"success": True}
        submitted = (data.get("code") or "").strip()
        if submitted.lower() == expected.lower():
            self.access_code_verified = True
            return {"success": True}
        return {"error": "รหัสเข้าสอบไม่ถูกต้อง"}

    @XBlock.json_handler
    def submit_quiz(self, data, suffix=""):
        """ตรวจคำตอบ -- parse OLX ใหม่ทุกครั้ง ไม่เชื่อค่าเฉลยจาก client เด็ดขาด"""
        if self._needs_access_code():
            return {"error": "กรุณากรอกรหัสเข้าสอบก่อน"}
        if self.is_submitted == "submitted":
            return {"error": "ส่งคำตอบไปแล้ว ไม่สามารถส่งซ้ำได้"}
        if not self.assigned_block_keys:
            return {"error": "ยังไม่มีข้อสอบสำหรับผู้ใช้นี้"}
        # ป้องกันไว้อีกชั้น เผื่อ state ไม่ตรงกัน (ปกติ retake_quiz จะกันไว้แล้วว่า
        # ต้องเหลือจำนวนครั้งก่อนถึงจะเคลียร์ state ให้ทำรอบใหม่ได้)
        if self.max_attempts != 0 and self.attempt_number >= self.max_attempts:
            return {"error": "ทำครบจำนวนครั้งที่กำหนดแล้ว"}

        from openedx.core.djangoapps.xblock.api import get_block_olx
        from openedx.core.djangoapps.xblock.data import LatestVersion

        answers = data.get("answers", {})  # {"lb:...": display_position_int}
        correct_count = 0
        total = 0
        stored_answers = {}
        for key_str in self.assigned_block_keys:
            try:
                key = self._library_usage_key(key_str)
                olx_xml = get_block_olx(key, version=LatestVersion.PUBLISHED)
                _, choices = parse_multiplechoice_olx(olx_xml)
            except Exception:
                continue
            total += 1
            order = self._shuffled_choice_order(key_str, len(choices))
            display_pos = answers.get(key_str)
            chosen_index = None
            if isinstance(display_pos, int) and 0 <= display_pos < len(order):
                chosen_index = order[display_pos]
            stored_answers[key_str] = chosen_index
            if chosen_index is not None and choices[chosen_index]["correct"]:
                correct_count += 1

        this_attempt_score = (correct_count / total * self.weight) if total else 0.0

        self.submitted_answers = stored_answers
        self.is_submitted = "submitted"
        self.attempt_number += 1
        # เก็บ "คะแนนสูงสุด" ที่เคยทำได้ -- ตามที่ผู้ใช้เลือกไว้สำหรับกรณีทำหลายรอบ
        self.raw_earned = max(this_attempt_score, self.raw_earned or 0.0)

        # only_if_higher=True คือกลไกมาตรฐานของ XBlock grading (แบบเดียวกับที่
        # capa_block.py ใช้) ให้ gradebook เก็บคะแนนสูงสุดข้ามรอบเองโดยอัตโนมัติ
        # ส่งค่าของรอบนี้ไป ไม่ใช่ self.raw_earned ที่ max ไว้แล้ว กัน publish
        # ซ้ำเป็นค่าเดิมเมื่อรอบหลังได้คะแนนน้อยกว่ารอบก่อน
        self.runtime.publish(self, "grade", {
            "value": this_attempt_score,
            "max_value": self.weight,
            "only_if_higher": True,
        })

        return {
            "success": True,
            "correct_count": correct_count,
            "total": total,
            "score": self.get_score(),
            "can_retake": self._attempts_remaining(),
            "attempt_number": self.attempt_number,
            "max_attempts": self.max_attempts,
        }

    @XBlock.json_handler
    def retake_quiz(self, data, suffix=""):
        """เริ่มทำรอบใหม่ -- สุ่มชุดข้อใหม่เสมอ (ไม่ reuse ชุดเดิม) เพราะผู้ใช้
        ต้องการให้แต่ละรอบสุ่มใหม่ กันจำคำตอบข้ามรอบ คะแนนสูงสุด (raw_earned) และ
        attempt_number ไม่ถูกแตะ -- เก็บประวัติไว้ตามที่ควร"""
        if self._needs_access_code():
            return {"error": "กรุณากรอกรหัสเข้าสอบก่อน"}
        if self.is_submitted != "submitted":
            return {"error": "ยังไม่ได้ส่งคำตอบรอบปัจจุบัน"}
        if not self._attempts_remaining():
            return {"error": "ทำครบจำนวนครั้งที่กำหนดแล้ว ไม่สามารถทำซ้ำได้อีก"}
        self.assigned_block_keys = []
        self.submitted_answers = {}
        self.is_submitted = ""
        return {"success": True}

    # ------------------------------------------------------------------
    # studio_view (CMS) -- editor แบบลิสต์ (ไม่ใช่การ์ด) สำหรับเลือกข้อจากคลัง
    # ------------------------------------------------------------------
    def studio_view(self, context=None):
        html = self.resource_string("static/military_random_quiz/studio_view.html")
        frag = Fragment(html.format(
            display_name=self.display_name or "",
            library_key=self.library_key or "",
            count=self.count or 10,
            weight=self.weight or 10.0,
            max_attempts=self.max_attempts if self.max_attempts is not None else 1,
            access_code=self.access_code or "",
            csrf_token=_get_csrf_token(),
        ))
        frag.add_css(self.resource_string("static/military_random_quiz/viewer.css"))
        frag.add_javascript(self.resource_string("static/military_random_quiz/studio.js"))
        frag.initialize_js("MilitaryRandomQuizStudio", {
            "selected_block_keys": self.selected_block_keys,
            "randomize": self.randomize,
            "show_answer_after_submit": self.show_answer_after_submit,
            "show_score_after_submit": self.show_score_after_submit,
        })
        return frag

    def _require_instructor_or_admin(self):
        request = _get_current_request()
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        from common.djangoapps.student.models import CourseAccessRole
        return CourseAccessRole.objects.filter(user=user, role__in=["instructor", "staff"]).exists()

    @XBlock.json_handler
    def list_libraries(self, data, suffix=""):
        """รายชื่อ Library ที่ครูคนนี้เข้าถึงได้ -- logic เดียวกับ
        military_profile.api_views.api_import_list_libraries"""
        if not self._require_instructor_or_admin():
            return {"error": "Forbidden"}
        try:
            from openedx.core.djangoapps.content_libraries.models import ContentLibrary, ContentLibraryPermission
            from opaque_keys.edx.locator import LibraryLocatorV2
            request = _get_current_request()
            user = request.user
            if user.is_staff or user.is_superuser:
                libs = ContentLibrary.objects.all().select_related("learning_package", "org")
                result = [
                    {"key": str(LibraryLocatorV2(org=l.org.short_name, slug=l.slug)), "title": l.learning_package.title}
                    for l in libs
                ]
            else:
                perms = ContentLibraryPermission.objects.filter(user=user).select_related(
                    "library__learning_package", "library__org"
                )
                result = [
                    {"key": str(LibraryLocatorV2(org=p.library.org.short_name, slug=p.library.slug)),
                     "title": p.library.learning_package.title}
                    for p in perms
                ]
            return {"libraries": result}
        except Exception as e:
            return {"error": str(e)}

    @XBlock.json_handler
    def list_library_blocks(self, data, suffix=""):
        """รายการข้อสอบทั้งหมดในคลัง -- ไม่ paginate (ต่างจาก picker เดิมของ
        Open edX ที่โหลดแค่หน้าแรก) logic เดียวกับ api_list_library_blocks"""
        if not self._require_instructor_or_admin():
            return {"error": "Forbidden"}
        try:
            from openedx.core.djangoapps.content_libraries.api.blocks import (
                get_library_components, get_library_block,
            )
            from opaque_keys.edx.locator import LibraryLocatorV2, LibraryUsageLocatorV2

            library_key_str = data.get("library_key", "").strip()
            library_key = LibraryLocatorV2.from_string(library_key_str)
            comps = get_library_components(library_key)
            blocks = []
            for c in comps:
                parts = c.key.split(":")
                if len(parts) < 3:
                    continue
                block_type, local_key = parts[-2], parts[-1]
                usage_key_str = "lb:{}:{}:{}:{}".format(
                    library_key.org, library_key.slug, block_type, local_key
                )
                try:
                    meta = get_library_block(LibraryUsageLocatorV2.from_string(usage_key_str))
                    display_name = meta.display_name or local_key
                except Exception:
                    display_name = local_key
                blocks.append({"key": usage_key_str, "display_name": display_name, "block_type": block_type})
            return {"blocks": blocks, "total": len(blocks)}
        except Exception as e:
            return {"error": str(e)}

    @XBlock.json_handler
    def save_settings(self, data, suffix=""):
        if not self._require_instructor_or_admin():
            return {"error": "Forbidden"}
        self.display_name = data.get("display_name", self.display_name)
        self.library_key = data.get("library_key", self.library_key)
        randomize = data.get("randomize")
        self.randomize = bool(randomize) if randomize is not None else self.randomize
        self.selected_block_keys = data.get("selected_block_keys", self.selected_block_keys) or []
        # "is not None" rather than a truthy check -- weight=0 (an
        # intentionally ungraded practice quiz) must not silently fall back
        # to the previous value.
        count = data.get("count")
        self.count = max(1, int(count)) if count is not None else (self.count or 10)
        weight = data.get("weight")
        self.weight = float(weight) if weight is not None else (self.weight if self.weight is not None else 10.0)
        max_attempts = data.get("max_attempts")
        self.max_attempts = max(0, int(max_attempts)) if max_attempts is not None else (self.max_attempts or 1)
        show_answer = data.get("show_answer_after_submit")
        self.show_answer_after_submit = bool(show_answer) if show_answer is not None else self.show_answer_after_submit
        show_score = data.get("show_score_after_submit")
        self.show_score_after_submit = bool(show_score) if show_score is not None else self.show_score_after_submit
        access_code = data.get("access_code")
        self.access_code = access_code.strip() if access_code is not None else self.access_code
        return {"result": "success"}

    @staticmethod
    def workbench_scenarios():
        return [
            ("Military Random Quiz", "<military-random-quiz/>"),
        ]
