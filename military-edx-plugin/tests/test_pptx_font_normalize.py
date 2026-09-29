"""
tests/test_pptx_font_normalize.py

_normalize_fonts_pptx() force-replaces every font in an uploaded .pptx with
TH SarabunPSK before sending it to Gotenberg for PDF conversion (see
military_profile/api_views.py). Files exported from PowerPoint with "Embed
fonts in the file" carry a <p:embeddedFontLst> in ppt/presentation.xml that
binds font names to real embedded font binaries (ppt/fonts/*.fntdata). Left
alone, the blanket typeface-rename also renames those embedded-font entries,
producing multiple "TH SarabunPSK" embeddedFont declarations that each point
at a different (non-Thai) original font's binary data -- LibreOffice then
picks one of those instead of the real system-installed TH SarabunPSK,
rendering all text as .notdef boxes. The fix strips <p:embeddedFontLst>
entirely so LibreOffice falls back to the system font by name.
"""
from military_profile.api_views import _normalize_fonts_pptx


def test_strips_embedded_font_list():
    xml = (
        '<p:presentation embedTrueTypeFonts="1" saveSubsetFonts="1">'
        '<p:embeddedFontLst>'
        '<p:embeddedFont><p:font typeface="Abadi" panose="020B0604020104020204"/>'
        '<p:regular r:id="rId76"/></p:embeddedFont>'
        '<p:embeddedFont><p:font typeface="TH SarabunPSK" panose="020B0500040200020003"/>'
        '<p:regular r:id="rId98"/></p:embeddedFont>'
        '</p:embeddedFontLst>'
        '<p:sldIdLst/>'
        '</p:presentation>'
    )
    result = _normalize_fonts_pptx(xml)
    assert '<p:embeddedFontLst>' not in result
    assert '<p:embeddedFont>' not in result
    assert 'embedTrueTypeFonts="0"' in result
    assert '<p:sldIdLst/>' in result  # rest of the document untouched


def test_still_replaces_slide_text_typefaces():
    xml = '<a:rPr><a:latin typeface="Calibri"/><a:cs typeface="Angsana New"/></a:rPr>'
    result = _normalize_fonts_pptx(xml)
    assert result.count('typeface="TH SarabunPSK"') == 2


def test_theme_font_refs_untouched():
    xml = '<a:latin typeface="+mn-lt"/><a:cs typeface="+mn-cs"/>'
    result = _normalize_fonts_pptx(xml)
    assert 'typeface="+mn-lt"' in result
    assert 'typeface="+mn-cs"' in result


def test_empty_typeface_forced_to_target():
    xml = '<a:cs typeface=""/>'
    result = _normalize_fonts_pptx(xml)
    assert result == '<a:cs typeface="TH SarabunPSK"/>'
