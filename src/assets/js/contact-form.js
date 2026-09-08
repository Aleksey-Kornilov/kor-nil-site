// contact-form.js — обработка формы связи. Отправляет POST на бэкенд ЧатЯдра,
// который пересылает сообщение на email автора через Resend.

(function() {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('cf-status');
  if (!form) return;

  const ENDPOINT = 'https://sntchat.ru/api/kor-nil-contact';
  // Тексты — из data-атрибутов формы, чтобы английская страница могла их подменить
  const d = form.dataset;
  const MSG = {
    fill: d.msgFill || 'Заполните все поля.',
    sending: d.msgSending || 'Отправка…',
    ok: d.msgOk || 'Спасибо! Сообщение отправлено, я отвечу вам на почту в течение дня.',
    fail: d.msgFail || 'Не удалось отправить. Попробуйте написать в Telegram: @',
    send: d.msgSend || 'Отправить',
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.classList.remove('is-success', 'is-error');
    status.textContent = '';

    const data = Object.fromEntries(new FormData(form));
    if (!data.name || !data.email || !data.message) {
      status.classList.add('is-error');
      status.textContent = MSG.fill;
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = MSG.sending;

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error('server error ' + resp.status);
      status.classList.add('is-success');
      status.textContent = MSG.ok;
      form.reset();
    } catch (err) {
      status.classList.add('is-error');
      status.textContent = MSG.fail + (form.dataset.telegram || 'kornil');
    } finally {
      btn.disabled = false;
      btn.textContent = MSG.send;
    }
  });
})();
