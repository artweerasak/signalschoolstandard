function MilitaryRandomQuizXBlock(runtime, element, initArgs) {
  var questions = initArgs.questions || [];
  var isSubmitted = initArgs.is_submitted;
  var THAI_LETTERS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ'];

  function getCsrfToken() {
    var m = document.cookie.match('(^|;) ?csrftoken=([^;]*)(;|$)');
    return m ? m[2] : '';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function render() {
    var container = document.getElementById('mil-rq-questions');
    if (questions.length === 0) {
      container.innerHTML = '<p class="mil-rq-empty">ยังไม่มีข้อสอบในแบบทดสอบนี้ กรุณาติดต่อผู้สอน</p>';
      document.getElementById('mil-rq-submit').style.display = 'none';
      return;
    }
    container.innerHTML = questions.map(function (q, qi) {
      var choicesHtml = q.choices.map(function (c, ci) {
        var letter = THAI_LETTERS[ci] || (ci + 1);
        var checked = q.answered === ci ? 'checked' : '';
        var disabled = isSubmitted ? 'disabled' : '';
        return '<label class="mil-rq-choice">' +
          '<input type="radio" name="mil-rq-q-' + qi + '" value="' + ci + '" ' + checked + ' ' + disabled + ' />' +
          '<span class="mil-rq-choice-letter">' + letter + '.</span> ' +
          '<span>' + escapeHtml(c.text) + '</span>' +
          '</label>';
      }).join('');
      return '<div class="mil-rq-question" data-key="' + q.key + '">' +
        '<p class="mil-rq-stem"><strong>' + (qi + 1) + '.</strong> ' + escapeHtml(q.stem) + '</p>' +
        '<div class="mil-rq-choices">' + choicesHtml + '</div>' +
        '</div>';
    }).join('');

    if (isSubmitted) {
      showResult(initArgs.score);
    }
  }

  function showResult(score) {
    var resultEl = document.getElementById('mil-rq-result');
    var submitBtn = document.getElementById('mil-rq-submit');
    submitBtn.style.display = 'none';
    resultEl.style.display = 'block';
    if (score) {
      resultEl.textContent = 'คะแนนของคุณ: ' + score.raw_earned.toFixed(1) + ' / ' + score.raw_possible;
    } else {
      resultEl.textContent = 'ส่งคำตอบแล้ว';
    }
  }

  document.getElementById('mil-rq-submit').addEventListener('click', function () {
    var answers = {};
    questions.forEach(function (q, qi) {
      var checked = document.querySelector('input[name="mil-rq-q-' + qi + '"]:checked');
      if (checked) answers[q.key] = parseInt(checked.value, 10);
    });
    if (Object.keys(answers).length < questions.length) {
      if (!window.confirm('คุณยังตอบไม่ครบทุกข้อ ต้องการส่งคำตอบเลยหรือไม่?')) return;
    }
    var handlerUrl = runtime.handlerUrl(element, 'submit_quiz');
    $.ajax({
      type: 'POST',
      url: handlerUrl,
      data: JSON.stringify({ answers: answers }),
      contentType: 'application/json',
      headers: { 'X-CSRFToken': getCsrfToken() },
    }).done(function (resp) {
      if (resp.error) {
        window.alert(resp.error);
        return;
      }
      isSubmitted = true;
      Array.prototype.forEach.call(element.querySelectorAll('input[type=radio]'), function (r) {
        r.disabled = true;
      });
      showResult(resp.score);
    }).fail(function () {
      window.alert('ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่');
    });
  });

  render();
}
