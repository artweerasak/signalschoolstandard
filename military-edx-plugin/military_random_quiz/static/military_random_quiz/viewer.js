function MilitaryRandomQuizXBlock(runtime, element, initArgs) {
  var questions = initArgs.questions || [];
  var isSubmitted = initArgs.is_submitted;
  var revealAnswer = initArgs.reveal_answer;
  var showScore = initArgs.show_score;
  var canRetake = initArgs.can_retake;
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
        // reveal_answer=true -- server เพิ่ง include c.correct มาให้ (เฉพาะตอนนี้
        // เท่านั้น -- ตอนยังไม่ส่งคำตอบ server จะไม่ส่งเฉลยมาเลย ดู olx.public_choices)
        var cls = 'mil-rq-choice';
        if (revealAnswer && c.correct) cls += ' mil-rq-choice-correct';
        else if (revealAnswer && q.answered === ci && !c.correct) cls += ' mil-rq-choice-wrong';
        return '<label class="' + cls + '">' +
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
      document.getElementById('mil-rq-submit').style.display = 'none';
      var resultEl = document.getElementById('mil-rq-result');
      resultEl.style.display = 'block';
      if (showScore && initArgs.score) {
        resultEl.textContent = 'คะแนนของคุณ: ' + initArgs.score.raw_earned.toFixed(1) + ' / ' + initArgs.score.raw_possible;
      } else {
        resultEl.textContent = 'ส่งคำตอบแล้ว';
      }
      var retakeBtn = document.getElementById('mil-rq-retake');
      if (canRetake) {
        retakeBtn.style.display = 'inline-block';
      }
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
      // โหลดหน้าใหม่แทนที่จะแก้ DOM เอง -- ให้ฝั่ง server เป็นแหล่งความจริงเดียว
      // (ว่าจะเฉลยไหม/โชว์คะแนนไหม/ทำซ้ำได้ไหม) ไม่ต้องเขียน logic ซ้ำสองที่
      window.location.reload();
    }).fail(function () {
      window.alert('ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่');
    });
  });

  document.getElementById('mil-rq-retake').addEventListener('click', function () {
    if (!window.confirm('ต้องการทำข้อสอบรอบใหม่หรือไม่? ระบบจะสุ่มข้อสอบชุดใหม่ให้')) return;
    var handlerUrl = runtime.handlerUrl(element, 'retake_quiz');
    $.ajax({
      type: 'POST',
      url: handlerUrl,
      data: JSON.stringify({}),
      contentType: 'application/json',
      headers: { 'X-CSRFToken': getCsrfToken() },
    }).done(function (resp) {
      if (resp.error) {
        window.alert(resp.error);
        return;
      }
      window.location.reload();
    }).fail(function () {
      window.alert('เริ่มรอบใหม่ไม่สำเร็จ กรุณาลองใหม่');
    });
  });

  render();
}
