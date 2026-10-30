// proverka.js — страница /seo/proverka/: запуск проверки, ход обхода, отчёт.
// Обход делает служба на сервере (server/proverka/). Отчёт — с чужого сайта, поэтому
// всё выводим только через textContent: заголовок страницы может оказаться и <script>.

(function () {
  const API = '/api/proverka/';
  const OPROS = 1500;
  const $ = (s) => document.querySelector(s);
  const form = $('.pv-form');
  if (!form) return;
  const input = form.elements.url;
  const knopka = form.querySelector('button');
  const oshibka = $('.pv-oshibka');
  const hod = $('.pv-hod');
  const otchetEl = $('.pv-otchet');
  let tekId = null;

  const el = (teg, klass, tekst) => {
    const e = document.createElement(teg);
    if (klass) e.className = klass;
    if (tekst != null) e.textContent = tekst;
    return e;
  };

  function pokazatOshibku(t) {
    oshibka.textContent = t;
    oshibka.hidden = !t;
    hod.hidden = true;
    knopka.disabled = false;
    knopka.textContent = 'Проверить';
  }

  function pokazatHod(d) {
    hod.hidden = false;
    const p = d.progress;
    let t = 'Готовлюсь…', dolya = 0.03;
    if (d.status === 'ochered') t = d.mesto > 1 ? `В очереди: ${d.mesto}-й` : 'Сейчас начну…';
    else if (p) {
      t = p.vsego > 1 ? `${p.etap}: ${p.gotovo} из ${p.vsego}` : p.etap + '…';
      // Этапы идут по порядку; внутри этапа — по счётчику.
      const ETAPY = ['Главная страница', 'robots.txt и sitemap', 'Страницы сайта', 'Проверка ссылок', 'Вес главной страницы', 'Зеркала сайта'];
      const i = Math.max(0, ETAPY.indexOf(p.etap));
      const VES = [0.05, 0.05, 0.55, 0.15, 0.15, 0.05];
      dolya = VES.slice(0, i).reduce((a, b) => a + b, 0) + VES[i] * (p.vsego ? p.gotovo / p.vsego : 0);
    }
    hod.querySelector('.pv-hod-etap').textContent = t;
    hod.querySelector('.pv-bar span').style.width = Math.round(Math.min(1, dolya) * 100) + '%';
  }

  const obrezat = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s || '');
  const TEKST_UROVNYA = { ok: 'в порядке', warn: 'замечание', bad: 'проблема' };
  const slovo = (n, f1, f2, f5) => {
    const a = n % 100, b = a % 10;
    return a > 10 && a < 20 ? f5 : b > 1 && b < 5 ? f2 : b === 1 ? f1 : f5;
  };

  function pokazatOtchet(o) {
    hod.hidden = true;
    knopka.disabled = false;
    knopka.textContent = 'Проверить';
    otchetEl.hidden = false;
    otchetEl.querySelector('.pv-host').textContent = o.host;
    const data = new Date(o.data);
    otchetEl.querySelector('.pv-data').textContent =
      `Проверено ${data.toLocaleDateString('ru-RU')} в ${data.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · ` +
      `${o.stranic} ${slovo(o.stranic, 'страница', 'страницы', 'страниц')} за ${o.sekund} с` +
      (o.nedoshli ? ' · обход остановлен по времени, проверено не всё' : '');

    const itogo = otchetEl.querySelector('.pv-itogo');
    itogo.replaceChildren();
    itogo.append(el('p', 'pv-itogo-glavnoe', `В порядке ${o.itogo.ok} из ${o.itogo.vsego}`));
    const ryad = el('p', 'pv-itogo-ryad');
    if (o.itogo.bad) ryad.append(el('span', 'pv-metka pv-bad', `${o.itogo.bad} ${slovo(o.itogo.bad, 'проблема', 'проблемы', 'проблем')}`));
    if (o.itogo.warn) ryad.append(el('span', 'pv-metka pv-warn', `${o.itogo.warn} ${slovo(o.itogo.warn, 'замечание', 'замечания', 'замечаний')}`));
    if (!o.itogo.bad && !o.itogo.warn) ryad.append(el('span', 'pv-metka pv-ok', 'всё чисто'));
    itogo.append(ryad);

    const sn = o.snippet;
    otchetEl.querySelector('.pv-sn-title').textContent = obrezat(sn.title, 70) || '(без заголовка)';
    let adres = sn.url;
    try { const u = new URL(sn.url); adres = u.hostname + (u.pathname !== '/' ? ' › ' + decodeURI(u.pathname).replace(/^\/|\/$/g, '').split('/').join(' › ') : ''); } catch (e) { /* как есть */ }
    otchetEl.querySelector('.pv-sn-url').textContent = adres;
    otchetEl.querySelector('.pv-sn-desc').textContent = obrezat(sn.description, 160) || 'Описания нет — поиск возьмёт кусок текста со страницы.';

    const gruppy = otchetEl.querySelector('.pv-gruppy');
    gruppy.replaceChildren();
    for (const g of o.gruppy) {
      const blok = el('section', 'pv-gruppa glass');
      blok.append(el('h3', null, g.title));
      const ul = el('ul', 'pv-punkty');
      // Сначала проблемы, потом замечания, в конце то, что в порядке.
      const PORYADOK = { bad: 0, warn: 1, ok: 2 };
      for (const i of [...g.items].sort((a, b) => PORYADOK[a.level] - PORYADOK[b.level])) {
        const li = el('li', 'pv-punkt pv-' + i.level);
        li.append(el('span', 'pv-tochka'), el('span', 'sr-only', TEKST_UROVNYA[i.level] + ': '));
        const telo = el('div', 'pv-punkt-telo');
        telo.append(el('p', null, i.text));
        if (i.why || i.details) {
          const det = el('details');
          det.append(el('summary', null, i.details ? 'Подробнее' : 'Почему важно'));
          if (i.why) det.append(el('p', 'pv-pochemu', i.why));
          if (i.details) {
            const dl = el('ul', 'pv-detali');
            for (const d of i.details) dl.append(el('li', null, d));
            det.append(dl);
          }
          telo.append(det);
        }
        li.append(telo);
        ul.append(li);
      }
      blok.append(ul);
      gruppy.append(blok);
    }
    otchetEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  async function oprosit(id) {
    if (id !== tekId) return;
    let d;
    try {
      const r = await fetch(API + id, { cache: 'no-store' });
      d = await r.json();
      if (!r.ok) return pokazatOshibku(d.error || 'Отчёт не найден');
    } catch (e) {
      return setTimeout(() => oprosit(id), OPROS * 2);     // сеть моргнула — пробуем ещё
    }
    if (d.status === 'gotovo') {
      if (!input.value) input.value = d.otchet.host;
      return pokazatOtchet(d.otchet);
    }
    if (d.status === 'oshibka') return pokazatOshibku(d.error);
    pokazatHod(d);
    setTimeout(() => oprosit(id), OPROS);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return pokazatOshibku('Введите адрес сайта, например example.ru');
    pokazatOshibku('');
    otchetEl.hidden = true;
    knopka.disabled = true;
    knopka.textContent = 'Проверяю…';
    pokazatHod({ status: 'ochered' });
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return pokazatOshibku(d.error || 'Проверка не запустилась. Попробуйте через минуту.');
      tekId = d.id;
      history.replaceState(null, '', '#' + d.id);
      if (window.ymGoal) window.ymGoal('site_check');
      oprosit(d.id);
    } catch (err) {
      pokazatOshibku('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    }
  });

  // «Написать»: в заявку — адрес сайта и ссылка на этот отчёт.
  $('.pv-napisat').addEventListener('click', () => {
    const f = document.querySelector('#zayavka form');
    if (!f) return;
    if (!f.elements.message.value.trim()) {
      f.elements.message.value = `Проверка сайта ${otchetEl.querySelector('.pv-host').textContent}: ${location.href}\n`;
    }
    f.elements.tema.value = 'seo';
  });

  $('.pv-podelitsya').addEventListener('click', async () => {
    const st = $('.pv-podelitsya-status');
    const ssylka = location.href;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'Проверка сайта ' + otchetEl.querySelector('.pv-host').textContent, url: ssylka }); return; } catch (e) { /* передумал */ }
    }
    try {
      await navigator.clipboard.writeText(ssylka);
      st.textContent = 'Ссылка скопирована. Отчёт открывается по ней 30 дней.';
    } catch (e) {
      st.textContent = 'Ссылка на отчёт: ' + ssylka;
    }
    if (window.ymGoal) window.ymGoal('site_check_share');
  });

  // Открыли по ссылке «поделиться»: /seo/proverka/#<код>
  const izSsylki = location.hash.slice(1);
  if (/^[A-Za-z0-9_-]{12}$/.test(izSsylki)) {
    tekId = izSsylki;
    pokazatHod({ status: 'idet' });
    oprosit(izSsylki);
  }
})();
