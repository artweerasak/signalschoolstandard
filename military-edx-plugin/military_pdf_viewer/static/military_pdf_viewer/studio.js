function MilitaryPdfViewerStudio(runtime, element) {
  var handlerUrl = runtime.handlerUrl(element, 'save_settings');

  // อ่าน CSRF token จาก hidden field ที่ server embed ไว้ — ไม่ต้องอ่านจาก cookie
  var csrfToken = document.getElementById('mil-csrf-token').value;

  document.getElementById('mil-save').addEventListener('click', function () {
    var url = document.getElementById('mil-pdf-url').value.trim();
    var errEl = document.getElementById('mil-error');

    if (!url) {
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';

    $.ajax({
      type: 'POST',
      url: handlerUrl,
      data: JSON.stringify({
        display_name: document.getElementById('mil-display-name').value.trim(),
        pdf_url: url,
        height: document.getElementById('mil-height').value || 700,
      }),
      contentType: 'application/json',
      headers: { 'X-CSRFToken': csrfToken },
      success: function () {
        runtime.notify('save', { state: 'end' });
      },
      error: function (xhr) {
        console.error('Save failed:', xhr.status, xhr.responseText);
      },
    });
  });

  document.getElementById('mil-cancel').addEventListener('click', function () {
    runtime.notify('cancel', {});
  });
}
