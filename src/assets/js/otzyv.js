// otzyv.js — отзыв заказчика по личной ссылке (otzyv.njk). Ссылка: kor-nil.ru/otzyv/#<код>.
// Код живёт в адресе после «#»: он не уходит на сервер сайта и в его журналы. Сразу после
// чтения убираем его из адреса, чтобы он не попал в Метрику и в закладки.
// Сервер ЧатЯдра по коду отдаёт подпись и работу (GET) и принимает отзыв (POST), передаёт
// его Алексею сообщением бота. Согласие на обработку ПД — обязательно, на показ — по желанию.
// Фамилия, имя и контакт — для записи согласия (приказ РКН № 18), на сайте не показываются.

(function () {
  const ENDPOINT = 'https://sntchat.ru/api/kor-nil-otzyv';
  const VERSIYA = '2026-10-27';            // редакция /soglasie-otzyv/ и /soglasie-otzyv-pokaz/
  const OTKRYTO = Date.now();

  const wrap = document.querySelector('.otzyv');
  const form = wrap.querySelector('.otzyv-form');
  const net = wrap.querySelector('.otzyv-net');
  const status = form.querySelector('.form-status');
  const btn = form.querySelector('button[type="submit"]');

  const kod = decodeURIComponent(location.hash.slice(1)).trim();
  if (location.hash) history.replaceState(null, '', location.pathname);
  const nevernaya = () => { form.hidden = true; net.hidden = false; };
  if (!/^[a-z0-9]{8,32}$/.test(kod)) return nevernaya();

  const soobshit = (txt, ok) => {
    status.classList.remove('is-success', 'is-error');
    status.classList.add(ok ? 'is-success' : 'is-error');
    status.textContent = txt;
  };

  // Чья ссылка: подпись и работа. Нет такого кода — показываем «ссылка не сработала».
  fetch(`${ENDPOINT}?kod=${encodeURIComponent(kod)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => {
      if (!d.podpis) return nevernaya();
      wrap.querySelectorAll('.otzyv-podpis').forEach((el) => { el.textContent = d.podpis; });
      const a = wrap.querySelector('.otzyv-rabota');
      a.textContent = d.rabota || 'на сайте';
      if (/^\/[a-z0-9\-/]*$/.test(d.ssylka || '')) a.href = d.ssylka;
      form.hidden = false;
    })
    .catch((st) => {
      if (st === 404) return nevernaya();
      net.hidden = false;
      net.querySelector('p').textContent = 'Страница сейчас не открывается. Попробуйте позже или напишите мне в Telegram: @'
        + (wrap.dataset.telegram || 'kornil');
    });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const tekst = f.tekst.value.trim();
    const fio = f.fio.value.trim(), kontakt = f.kontakt.value.trim();
    if (tekst.length < 10) return soobshit('Напишите хотя бы пару слов.');
    if (fio.length < 3 || kontakt.length < 3) return soobshit('Укажите фамилию с именем и телефон или почту — они нужны для записи согласия.');
    if (!f.soglasie_pd.checked) return soobshit('Без согласия на обработку данных я не смогу принять отзыв — отметьте первую галочку.');

    const data = {
      kod, tekst, fio, kontakt,
      soglasie_pd: true,
      soglasie_pokaz: f.soglasie_pokaz.checked,
      versiya: VERSIYA,
      company: f.company.value,
      vremya: Math.round((Date.now() - OTKRYTO) / 1000),
    };

    btn.disabled = true;
    btn.textContent = 'Отправка…';
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const otvet = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(otvet.error || 'Ошибка ' + resp.status);
      soobshit(data.soglasie_pokaz
        ? 'Спасибо! Отзыв у меня. На странице работы он появится в ближайшие дни.'
        : 'Спасибо! Отзыв у меня, на сайте его не будет.', true);
      form.querySelectorAll('textarea, input, button').forEach((el) => { el.disabled = true; });
      return;
    } catch (err) {
      soobshit(`Не получилось отправить (${err.message}). Напишите мне в Telegram: @${wrap.dataset.telegram || 'kornil'}`);
    }
    btn.disabled = false;
    btn.textContent = 'Отправить отзыв';
  });
})();
