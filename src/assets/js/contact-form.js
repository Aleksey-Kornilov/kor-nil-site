// contact-form.js — обработка формы связи. Отправляет POST на бэкенд ЧатЯдра,
// который пересылает сообщение на email автора через Resend.

(function() {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('cf-status');
  if (!form) return;

  const ENDPOINT = 'https://sntchat.ru/api/kor-nil-contact';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.classList.remove('is-success', 'is-error');
    status.textContent = '';

    const data = Object.fromEntries(new FormData(form));
    if (!data.name || !data.email || !data.message) {
      status.classList.add('is-error');
      status.textContent = 'Заполните все поля.';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Отправка…';

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error('server error ' + resp.status);
      status.classList.add('is-success');
      status.textContent = 'Спасибо! Сообщение отправлено, я отвечу вам на почту в течение дня.';
      form.reset();
    } catch (err) {
      status.classList.add('is-error');
      status.textContent = 'Не удалось отправить. Попробуйте написать в Telegram: @' + (form.dataset.telegram || 'kornil');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить';
    }
  });
})();
