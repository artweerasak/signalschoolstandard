"""
military_random_quiz/olx.py

Pure parsing helpers with zero Open edX/Django dependencies, kept separate
from xblock.py so they're unit-testable in the standalone test image (which
can't import xmodule/openedx.core -- see tests/test_random_quiz_olx.py in
the main military-edx-plugin test suite).
"""
from lxml import etree


def parse_multiplechoice_olx(olx_xml):
    """Parse a single-select CAPA <problem><multiplechoiceresponse> OLX
    string (the exact format _question_to_olx() in military_profile writes
    on import) into (stem, choices).

    choices is a list of dicts, in original OLX order (index is the stable
    identity used for grading/shuffling -- never the display position):
        [{"index": 0, "text": "...", "correct": True}, ...]

    Raises ValueError if the OLX isn't a recognizable single-select
    multiplechoiceresponse problem (e.g. a different problem type was
    somehow added to a library used by this block) -- callers should skip
    or surface such questions rather than silently mis-rendering them.
    """
    if isinstance(olx_xml, str):
        olx_xml = olx_xml.encode("utf-8")
    root = etree.fromstring(olx_xml)

    mcr = root.find(".//multiplechoiceresponse")
    if mcr is None:
        raise ValueError("ไม่ใช่โจทย์แบบเลือกตอบข้อเดียว (multiplechoiceresponse)")

    label_el = root.find(".//label")
    stem = "".join(label_el.itertext()).strip() if label_el is not None else ""

    choices = []
    for i, choice_el in enumerate(mcr.findall(".//choice")):
        text = "".join(choice_el.itertext()).strip()
        correct = (choice_el.get("correct") or "false").strip().lower() == "true"
        choices.append({"index": i, "text": text, "correct": correct})

    if not choices:
        raise ValueError("ไม่พบตัวเลือกในโจทย์นี้")
    if sum(1 for c in choices if c["correct"]) != 1:
        raise ValueError("โจทย์นี้ต้องมีคำตอบที่ถูกต้องเพียงข้อเดียว")

    return stem, choices


def public_choices(choices):
    """Strip the 'correct' flag before sending choice data to the browser --
    student_view must never leak which choice is correct in its JSON
    payload. Grading always re-derives correctness server-side from fresh
    OLX, never trusts anything the client echoes back."""
    return [{"index": c["index"], "text": c["text"]} for c in choices]
