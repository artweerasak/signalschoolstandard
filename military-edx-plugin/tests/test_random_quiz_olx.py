"""
tests/test_random_quiz_olx.py

military_random_quiz/olx.py has zero Open edX/Django dependencies by design
(see its docstring) specifically so it's testable here -- the rest of the
XBlock (xblock.py) imports xmodule/openedx.core, which this standalone test
image can't provide (same constraint as cms.djangoapps.* elsewhere in this
suite), so it's exercised via live production verification instead (see the
plan runbook), not here.
"""
import pytest

from military_random_quiz.olx import parse_multiplechoice_olx, public_choices

REAL_OLX = '''<problem display_name="วิธีการเคลื่อนที่เข้าปะทะ ทั้ง 2 แบบคือข้อใด">
  <multiplechoiceresponse>
    <label>วิธีการเคลื่อนที่เข้าปะทะ ทั้ง 2 แบบคือข้อใด
</label>
    <choicegroup type="MultipleChoice" shuffle="true">
        <choice correct="false">ใช้รูปขบวนหมู่แถวตอน</choice>
        <choice correct="false">ใช้รูปขบวนหมู่แถวหน้ากระดาน</choice>
        <choice correct="false">ใช้รูปขบวนหมวดแถวตอน</choice>
        <choice correct="true">แบบค้นหาและโจมตี แบบเคลื่อนที่รูปขบวนเข้าหาข้าศึก</choice>
    </choicegroup>
  </multiplechoiceresponse>
</problem>'''


def test_parses_real_production_olx_exactly():
    """This is the exact OLX byte-for-byte pulled from a real published
    question via get_block_olx() during research for this feature -- locks
    in that the parser handles the actual production format, not just an
    idealized one."""
    stem, choices = parse_multiplechoice_olx(REAL_OLX)
    assert stem == "วิธีการเคลื่อนที่เข้าปะทะ ทั้ง 2 แบบคือข้อใด"
    assert len(choices) == 4
    assert [c["text"] for c in choices] == [
        "ใช้รูปขบวนหมู่แถวตอน",
        "ใช้รูปขบวนหมู่แถวหน้ากระดาน",
        "ใช้รูปขบวนหมวดแถวตอน",
        "แบบค้นหาและโจมตี แบบเคลื่อนที่รูปขบวนเข้าหาข้าศึก",
    ]
    assert [c["correct"] for c in choices] == [False, False, False, True]
    assert [c["index"] for c in choices] == [0, 1, 2, 3]


def test_public_choices_strips_correct_flag():
    """The single most important invariant in this file: whatever gets sent
    to the browser must never carry the answer key."""
    _, choices = parse_multiplechoice_olx(REAL_OLX)
    pub = public_choices(choices)
    assert all("correct" not in c for c in pub)
    assert [c["text"] for c in pub] == [c["text"] for c in choices]
    assert [c["index"] for c in pub] == [c["index"] for c in choices]


def test_rejects_non_multiplechoice_problem():
    olx = '<problem><stringresponse answer="foo"><textline/></stringresponse></problem>'
    with pytest.raises(ValueError):
        parse_multiplechoice_olx(olx)


def test_rejects_zero_correct_answers():
    olx = '''<problem><multiplechoiceresponse><label>Q</label>
        <choicegroup><choice correct="false">A</choice><choice correct="false">B</choice>
        </choicegroup></multiplechoiceresponse></problem>'''
    with pytest.raises(ValueError):
        parse_multiplechoice_olx(olx)


def test_rejects_multiple_correct_answers():
    olx = '''<problem><multiplechoiceresponse><label>Q</label>
        <choicegroup><choice correct="true">A</choice><choice correct="true">B</choice>
        </choicegroup></multiplechoiceresponse></problem>'''
    with pytest.raises(ValueError):
        parse_multiplechoice_olx(olx)


def test_rejects_no_choices():
    olx = '<problem><multiplechoiceresponse><label>Q</label><choicegroup></choicegroup></multiplechoiceresponse></problem>'
    with pytest.raises(ValueError):
        parse_multiplechoice_olx(olx)
