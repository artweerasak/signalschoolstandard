function MilitaryRandomQuizStudio(runtime, element, initArgs) {
  var csrfToken = document.getElementById('mil-rq-csrf-token').value;
  var currentLibraryKey = document.getElementById('mil-rq-current-library-key').value;
  var selected = new Set(initArgs.selected_block_keys || []);
  var allBlocks = [];

  var randomizeCheckbox = document.getElementById('mil-rq-randomize');
  randomizeCheckbox.checked = initArgs.randomize !== false;
  function updateCountFieldVisibility() {
    document.getElementById('mil-rq-count-field').style.display =
      randomizeCheckbox.checked ? '' : 'none';
  }
  randomizeCheckbox.addEventListener('change', updateCountFieldVisibility);
  updateCountFieldVisibility();

  document.getElementById('mil-rq-show-answer').checked = initArgs.show_answer_after_submit !== false;
  document.getElementById('mil-rq-show-score').checked = initArgs.show_score_after_submit !== false;

  function ajax(handlerName, data) {
    return $.ajax({
      type: 'POST',
      url: runtime.handlerUrl(element, handlerName),
      data: JSON.stringify(data || {}),
      contentType: 'application/json',
      headers: { 'X-CSRFToken': csrfToken },
    });
  }

  function updateSummary() {
    document.getElementById('mil-rq-selected-summary').textContent =
      'เลือกแล้ว ' + selected.size + ' ข้อ';
  }

  function renderBlockList(filterText) {
    var tbody = document.getElementById('mil-rq-block-list');
    var filtered = allBlocks.filter(function (b) {
      return !filterText || b.display_name.toLowerCase().indexOf(filterText.toLowerCase()) !== -1;
    });
    document.getElementById('mil-rq-count-label').textContent = allBlocks.length + ' ข้อ';
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="mil-rq-empty">ไม่พบข้อสอบ</td></tr>';
      return;
    }
    var rows = filtered.map(function (b, i) {
      var checked = selected.has(b.key) ? 'checked' : '';
      return '<tr data-key="' + b.key + '">' +
        '<td><input type="checkbox" class="mil-rq-row-check" ' + checked + ' /></td>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(b.display_name) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = rows.join('');
    Array.prototype.forEach.call(tbody.querySelectorAll('.mil-rq-row-check'), function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.closest('tr').getAttribute('data-key');
        if (cb.checked) selected.add(key); else selected.delete(key);
        updateSummary();
      });
    });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function loadBlocks(libraryKey) {
    var tbody = document.getElementById('mil-rq-block-list');
    tbody.innerHTML = '<tr><td colspan="3" class="mil-rq-empty">กำลังโหลด...</td></tr>';
    ajax('list_library_blocks', { library_key: libraryKey }).done(function (resp) {
      if (resp.error) {
        tbody.innerHTML = '<tr><td colspan="3" class="mil-rq-empty">' + escapeHtml(resp.error) + '</td></tr>';
        return;
      }
      allBlocks = resp.blocks || [];
      renderBlockList('');
      updateSummary();
    }).fail(function () {
      tbody.innerHTML = '<tr><td colspan="3" class="mil-rq-empty">โหลดข้อสอบไม่สำเร็จ</td></tr>';
    });
  }

  function loadLibraries() {
    var select = document.getElementById('mil-rq-library-select');
    ajax('list_libraries', {}).done(function (resp) {
      if (resp.error || !resp.libraries || resp.libraries.length === 0) {
        select.innerHTML = '<option value="">-- ไม่มีคลังข้อสอบ --</option>';
        return;
      }
      select.innerHTML = resp.libraries.map(function (l) {
        return '<option value="' + l.key + '">' + escapeHtml(l.title) + '</option>';
      }).join('');
      if (currentLibraryKey && resp.libraries.some(function (l) { return l.key === currentLibraryKey; })) {
        select.value = currentLibraryKey;
      }
      if (select.value) loadBlocks(select.value);
    });
  }

  document.getElementById('mil-rq-library-select').addEventListener('change', function (e) {
    selected.clear();
    updateSummary();
    if (e.target.value) loadBlocks(e.target.value);
  });

  document.getElementById('mil-rq-search').addEventListener('input', function (e) {
    renderBlockList(e.target.value);
  });

  document.getElementById('mil-rq-select-all').addEventListener('change', function (e) {
    var checked = e.target.checked;
    allBlocks.forEach(function (b) {
      if (checked) selected.add(b.key); else selected.delete(b.key);
    });
    renderBlockList(document.getElementById('mil-rq-search').value);
    updateSummary();
  });

  document.getElementById('mil-rq-save').addEventListener('click', function () {
    var errEl = document.getElementById('mil-rq-error');
    var libraryKey = document.getElementById('mil-rq-library-select').value;
    if (!libraryKey) {
      errEl.textContent = 'กรุณาเลือกคลังข้อสอบ';
      errEl.style.display = 'block';
      return;
    }
    if (selected.size === 0) {
      errEl.textContent = 'กรุณาเลือกข้อสอบอย่างน้อย 1 ข้อ';
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';
    ajax('save_settings', {
      display_name: document.getElementById('mil-rq-display-name').value.trim(),
      library_key: libraryKey,
      selected_block_keys: Array.from(selected),
      randomize: randomizeCheckbox.checked,
      count: document.getElementById('mil-rq-count').value,
      weight: document.getElementById('mil-rq-weight').value,
      max_attempts: document.getElementById('mil-rq-max-attempts').value,
      show_answer_after_submit: document.getElementById('mil-rq-show-answer').checked,
      show_score_after_submit: document.getElementById('mil-rq-show-score').checked,
      access_code: document.getElementById('mil-rq-access-code').value,
    }).done(function (resp) {
      if (resp.error) {
        errEl.textContent = resp.error;
        errEl.style.display = 'block';
        return;
      }
      runtime.notify('save', { state: 'end' });
    }).fail(function (xhr) {
      errEl.textContent = 'บันทึกไม่สำเร็จ: ' + xhr.status;
      errEl.style.display = 'block';
    });
  });

  document.getElementById('mil-rq-cancel').addEventListener('click', function () {
    runtime.notify('cancel', {});
  });

  loadLibraries();
}
