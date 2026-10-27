// zayavka.js — форма заявки (components/zayavka.njk). Шлёт POST на бэкенд ЧатЯдра,
// который передаёт заявку Алексею сообщением бота в ЧатЯдре (не почтой через зарубежный сервис).
// Согласие на обработку ПД — обязательная отдельная галочка; её версия уходит вместе с заявкой.

(function () {
  const ENDPOINT = 'https://sntchat.ru/api/kor-nil-contact';
  const VERSIYA = '2026-10-15';            // редакция /soglasie/
  const DOM = new Set(['dom', 'rasst', 'inzh']);
  // Рассыльщики рекламы заполняют форму за секунды после открытия страницы (27.10.2026 — за 6 с).
  // Человек так быстро не успевает; если всё же успел (автозаполнение), второе нажатие проходит.
  const OTKRYTO = Date.now();
  const BYSTRO = 10000;

  document.querySelectorAll('.zayavka-form').forEach((form) => {
    const status = form.querySelector('.form-status');
    const tema = form.elements.tema;
    const pl = form.querySelector('.zayavka-ploshchad');
    const btn = form.querySelector('button[type="submit"]');
    let predupredil = false;

    // Площадь спрашиваем только про дом.
    const pokazPl = () => { pl.hidden = !DOM.has(tema.value); };
    tema.addEventListener('change', pokazPl);
    pokazPl();

    // Пришли из калькулятора: ссылка на расчёт лежит в sessionStorage (см. calculators.js, «Заказать»).
    let iz = null;
    try { iz = JSON.parse(sessionStorage.getItem('kn_zayavka') || 'null'); } catch (e) { iz = null; }
    if (iz && /^https:\/\/kor-nil\.ru\//.test(iz.ssylka || '')) {
      if (!form.elements.message.value) form.elements.message.value = `По расчёту «${iz.chto || 'калькулятор'}» — ссылка приложена к заявке.\n`;
    } else iz = null;

    const soobshit = (txt, ok) => {
      status.classList.remove('is-success', 'is-error');
      status.classList.add(ok ? 'is-success' : 'is-error');
      status.textContent = txt;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const name = f.name.value.trim(), svyaz = f.svyaz.value.trim();
      if (name.length < 2 || svyaz.length < 3) return soobshit('Укажите имя и как с вами связаться.');
      if (!f.soglasie_pd.checked) return soobshit('Без согласия на обработку данных я не смогу вам ответить — отметьте галочку.');
      const vremya = Date.now() - OTKRYTO;
      if (vremya < BYSTRO && !predupredil) {
        predupredil = true;
        return soobshit('Проверьте, всё ли верно, и нажмите «Отправить» ещё раз.');
      }

      const data = {
        name, svyaz,
        tema: tema.value,
        ploshchad: DOM.has(tema.value) && f.ploshchad.value ? Number(f.ploshchad.value) : undefined,
        message: f.message.value.trim(),
        stranica: location.pathname,
        ssylka: iz ? iz.ssylka : undefined,
        soglasie_pd: true,
        soglasie_reklama: f.soglasie_reklama.checked,
        versiya: VERSIYA,
        company: f.company.value,
        vremya: Math.round(vremya / 1000),   // секунд от открытия страницы до отправки
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
        soobshit('Спасибо! Заявка у меня, отвечу в течение дня.', true);
        try { sessionStorage.removeItem('kn_zayavka'); } catch (e) { /* нет хранилища */ }
        iz = null;
        form.reset();
        pokazPl();
        if (window.ymGoal) window.ymGoal('zayavka', { tema: data.tema || 'net' });
      } catch (err) {
        soobshit(`Не получилось отправить (${err.message}). Напишите мне в Telegram: @${form.dataset.telegram || 'kornil'}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Отправить';
      }
    });
  });
})();
