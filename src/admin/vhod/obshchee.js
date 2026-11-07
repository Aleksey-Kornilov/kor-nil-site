// obshchee.js — общее для экрана входа и панели. Лежит в /admin/vhod/: это единственный
// адрес панели, открытый без сессии, а вход без этого файла не работает.
// 🔴 Всё, что пришло с сервера, написал посторонний человек в форме: в страницу только через
// textContent (функция el), никакого innerHTML.

window.Panel = (function () {
  const API = '/admin/api';

  const OSHIBKI = {
    not_found: 'Такой заявки уже нет.',
    bad_request: 'Сервер не принял данные. Проверьте, что введено.',
    bad_credentials: 'Неверный логин или пароль.',
    bad_origin: 'Сервер не принял запрос. Обновите страницу.',
    disabled: 'Панель на сервере выключена.',
    forbidden: 'Сервер не принял ключ панели.',
    json_only: 'Сервер не принял формат запроса.',
    bad_text: 'Запись пустая или длиннее 5000 знаков.',
    bad_dogovor_zakryt: 'Проверьте дату договора.',
    bad_last_contact_at: 'Дата общения не может быть в будущем.',
    bad_imya: 'Имя должно быть от 1 до 100 знаков.',
    staryj_neveren: 'Текущий пароль указан неверно.',
    parol_korotkij: 'Новый пароль короче 12 знаков.',
    parol_dlinnyj: 'Новый пароль слишком длинный.',
    parol_tot_zhe: 'Новый пароль совпадает с текущим.',
    bad_image: 'Нужна картинка JPEG, PNG или WebP.',
    too_large: 'Файл больше 5 МБ.',
  };

  function el(teg, svojstva, ...deti) {
    const e = document.createElement(teg);
    for (const [k, v] of Object.entries(svojstva || {})) {
      if (k === 'klass') e.className = v;
      else if (k === 'na') e.addEventListener('click', v);
      else if (k.startsWith('aria-') || k === 'role') { if (v !== undefined && v !== null) e.setAttribute(k, v); }
      else if (v !== undefined && v !== null) e[k] = v;
    }
    for (const d of deti) {
      if (d === null || d === undefined || d === false) continue;
      e.append(d.nodeType ? d : document.createTextNode(String(d)));
    }
    return e;
  }

  // Рисунки значков — постоянные строки из этого файла, данные сервера сюда не попадают.
  const IKONKI = {
    svodka: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
    zayavki: ['M4 4h16v16H4z', 'M4 13h5l2 3h2l2-3h5'],
    profil: ['M20 21a8 8 0 0 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    sajt: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
    vyhod: ['M15 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
    glaz: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    glazNet: ['M3 3l18 18', 'M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.2 4', 'M6.5 6.6A18 18 0 0 0 2 12s4 7 10 7a10 10 0 0 0 5-1.4', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
    tema: ['M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z'],
  };

  function ikon(imya) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ikon');
    for (const d of IKONKI[imya] || []) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  }

  // Поле пароля с глазиком. Текст показан только пока включено, при отправке формы — скрыт снова.
  function poleParolya({ id, podpis, avto, maks }) {
    const vvod = el('input', { id, type: 'password', autocomplete: avto, spellcheck: false, required: true });
    if (maks) vvod.maxLength = maks;
    const glaz = el('button', { type: 'button', klass: 'glazik', 'aria-label': 'Показать пароль', 'aria-pressed': 'false' }, ikon('glaz'));
    const pokazat = (da) => {
      vvod.type = da ? 'text' : 'password';
      glaz.setAttribute('aria-pressed', String(da));
      glaz.setAttribute('aria-label', da ? 'Скрыть пароль' : 'Показать пароль');
      glaz.replaceChildren(ikon(da ? 'glazNet' : 'glaz'));
    };
    glaz.addEventListener('click', () => { pokazat(vvod.type === 'password'); vvod.focus(); });
    const blok = el('label', { klass: 'pole-vvoda' }, el('span', {}, podpis),
      el('span', { klass: 'parol-obertka' }, vvod, glaz));
    return { blok, vvod, skryt: () => pokazat(false) };
  }

  class OshibkaApi extends Error {
    constructor(soobshchenie, status, kod) { super(soobshchenie); this.status = status; this.kod = kod; }
  }

  function vPoryadke(otvet, dannye) {
    if (otvet.ok) return dannye;
    let tekst = OSHIBKI[dannye.error];
    if (otvet.status === 429) {
      const sek = Number(otvet.headers.get('Retry-After'));
      const min = Math.max(1, Math.ceil(sek / 60));
      tekst = sek ? `Слишком много попыток. Повторите через ${min} мин.` : 'Слишком много попыток. Повторите позже.';
    }
    if (otvet.status === 413) tekst = OSHIBKI.too_large;
    throw new OshibkaApi(tekst || `Ошибка ${otvet.status}${dannye.error ? `: ${dannye.error}` : ''}`, otvet.status, dannye.error);
  }

  async function api(put, { metod = 'GET', telo, forma } = {}) {
    let otvet;
    try {
      otvet = await fetch(API + put, {
        method: metod,
        credentials: 'same-origin',
        headers: telo ? { 'Content-Type': 'application/json' } : undefined,
        body: telo ? JSON.stringify(telo) : forma,
      });
    } catch {
      throw new OshibkaApi('Нет связи с сервером.', 0);
    }
    // Сессия кончилась: на экран входа. Сам вход отвечает 401 на неверный пароль, это не тот случай.
    if (otvet.status === 401 && put !== '/vhod') {
      location.replace('/admin/vhod/');
      return new Promise(() => {});
    }
    return vPoryadke(otvet, await otvet.json().catch(() => ({})));
  }

  // Тема: по умолчанию как в системе. Выбор — удобство одного браузера, поэтому localStorage.
  function chitatTemu() {
    try { return localStorage.getItem('panel-tema'); } catch { return null; }
  }
  function primenitTemu(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  function pereklyuchitTemu() {
    const temnaya = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const t = temnaya ? 'light' : 'dark';
    primenitTemu(t);
    try { localStorage.setItem('panel-tema', t); } catch { /* тема просто не запомнится */ }
  }
  primenitTemu(chitatTemu());

  return { el, ikon, api, poleParolya, pereklyuchitTemu };
})();
