// admin.js — панель заявок kor-nil.ru/admin/. Данные — ручки /admin/api/ (бэкенд ЧатЯдра за паролем nginx).
// 🔴 Всё, что пришло с сервера, написал посторонний человек в форме: в страницу только через
// textContent (функция el), никакого innerHTML. Ссылки — только из белого списка (bezopasnayaSsylka).

(function () {
  const API = '/admin/api';
  const STATUSY = { novaya: 'Новая', v_rabote: 'В работе', otvetil: 'Ответил', spam: 'Спам' };
  const OSHIBKI = {
    not_found: 'Такой заявки уже нет.',
    bad_request: 'Сервер не принял данные. Проверьте, что введено.',
    disabled: 'Панель на сервере выключена.',
    forbidden: 'Сервер не принял ключ панели.',
    bad_text: 'Запись пустая или длиннее 5000 знаков.',
    bad_dogovor_zakryt: 'Проверьте дату договора.',
    bad_last_contact_at: 'Дата общения не может быть в будущем.',
    json_only: 'Сервер не принял формат запроса.',
  };

  const $ = (id) => document.getElementById(id);
  const spisok = $('spisok'), kartochka = $('kartochka'), esche = $('esche'), soobshchenie = $('soobshchenie');
  let filtr = '', sled = null, zapros = 0;

  function el(teg, svojstva, ...deti) {
    const e = document.createElement(teg);
    for (const [k, v] of Object.entries(svojstva || {})) {
      if (k === 'klass') e.className = v;
      else if (k === 'na') e.addEventListener('click', v);
      else if (v !== undefined && v !== null) e[k] = v;
    }
    for (const d of deti) {
      if (d === null || d === undefined || d === false) continue;
      e.append(d.nodeType ? d : document.createTextNode(String(d)));
    }
    return e;
  }

  function skazat(tekst) {
    soobshchenie.textContent = tekst || '';
    soobshchenie.hidden = !tekst;
  }

  async function api(put, { metod = 'GET', telo } = {}) {
    const otvet = await fetch(API + put, {
      method: metod,
      credentials: 'same-origin',
      headers: telo ? { 'Content-Type': 'application/json' } : undefined,
      body: telo ? JSON.stringify(telo) : undefined,
    });
    const dannye = await otvet.json().catch(() => ({}));
    if (!otvet.ok) throw new Error(OSHIBKI[dannye.error] || `Ошибка ${otvet.status}${dannye.error ? `: ${dannye.error}` : ''}`);
    return dannye;
  }

  const data = (v, sVremenem = true) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', sVremenem
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Дата для поля ввода. База отдаёт дату как момент времени, и обрезка строки сдвигала бы её на день.
  const dlyaPolya = (v) => {
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function bezopasnayaSsylka(v) {
    return typeof v === 'string' && /^(tel:|mailto:|https:\/\/(t\.me|vk\.com|kor-nil\.ru)\/)/.test(v) ? v : null;
  }

  // Кнопка с подтверждением прямо на месте: первое нажатие спрашивает, второе делает.
  function dvaShaga(nadpis, vopros, dejstvie) {
    const mesto = el('span', { klass: 'dva-shaga' });
    const pervaya = () => mesto.replaceChildren(el('button', { type: 'button', klass: 'knopka opasno', na: vtoraya }, nadpis));
    const vtoraya = () => mesto.replaceChildren(
      el('span', { klass: 'vopros' }, vopros),
      el('button', { type: 'button', klass: 'knopka opasno', na: dejstvie }, 'Да'),
      el('button', { type: 'button', klass: 'knopka', na: pervaya }, 'Отмена'),
    );
    pervaya();
    return mesto;
  }

  function stroka(z) {
    return el('a', { klass: `stroka status-${z.status}`, href: `#z${encodeURIComponent(z.id)}` },
      el('span', { klass: 'kogda' }, data(z.created_at)),
      el('span', { klass: 'kto' }, z.name || '—'),
      el('span', { klass: 'chto' }, z.tema_nazvanie || 'Без темы'),
      el('span', { klass: 'metki' },
        el('span', { klass: `metka status-${z.status}` }, STATUSY[z.status] || z.status),
        z.dogovor && el('span', { klass: 'metka' }, 'Договор'),
        z.dostavleno === false && el('span', { klass: 'metka trevoga' }, 'Бот не доставил')));
  }

  async function pokazatSpisok(dalshe) {
    const moj = ++zapros;
    kartochka.hidden = true;
    spisok.hidden = false;
    $('filtr').hidden = false;
    document.title = 'Заявки · kor-nil.ru';
    if (!dalshe) { sled = null; spisok.replaceChildren(); }
    const q = new URLSearchParams({ limit: '50' });
    if (filtr) q.set('status', filtr);
    if (dalshe && sled !== null) q.set('before', sled);
    try {
      const otvet = await api(`/zayavki?${q}`);
      if (moj !== zapros) return;
      skazat('');
      obnovitSchetchiki(otvet.schetchiki);
      spisok.append(...otvet.items.map(stroka));
      sled = otvet.next ?? null;
      esche.hidden = sled === null;
      if (!spisok.children.length) spisok.append(el('p', { klass: 'pusto' }, 'Заявок нет.'));
    } catch (e) {
      if (moj === zapros) skazat(e.message);
    }
  }

  const pole = (podpis, ...znachenie) => el('div', { klass: 'pole' }, el('dt', {}, podpis), el('dd', {}, ...znachenie));

  function blokSvyazi(z) {
    const knopki = (z.svyazi || []).map((s) => {
      const ssylka = bezopasnayaSsylka(s.ssylka);
      return ssylka
        ? el('a', { klass: 'knopka', href: ssylka, target: '_blank', rel: 'noopener noreferrer' }, s.znachenie)
        : el('span', { klass: 'metka' }, s.znachenie);
    });
    return knopki.length ? el('div', { klass: 'svyazi' }, ...knopki) : null;
  }

  function blokUpravleniya(z, id) {
    const pomenyat = async (telo) => {
      try { await api(`/zayavki/${id}`, { metod: 'PATCH', telo }); await pokazatKartochku(id); }
      catch (e) { skazat(e.message); }
    };
    const vybor = el('select', { id: 'status' }, ...Object.entries(STATUSY).map(([kod, nazvanie]) =>
      el('option', { value: kod, selected: kod === z.status }, nazvanie)));
    vybor.addEventListener('change', () => pomenyat({ status: vybor.value }));

    const dogovor = el('input', { type: 'checkbox', id: 'dogovor', checked: !!z.dogovor });
    dogovor.addEventListener('change', () => pomenyat({ dogovor: dogovor.checked }));
    const zakryt = el('input', { type: 'date', id: 'dogovor-zakryt', value: dlyaPolya(z.dogovor_zakryt) });
    zakryt.addEventListener('change', () => pomenyat({ dogovor_zakryt: zakryt.value || null }));

    return el('div', { klass: 'upravlenie glass' },
      el('label', { htmlFor: 'status' }, 'Состояние'), vybor,
      el('label', { klass: 'galochka' }, dogovor, ' Есть договор'),
      z.dogovor && el('label', { htmlFor: 'dogovor-zakryt' }, 'Договор закрыт'),
      z.dogovor && zakryt,
      z.dogovor && !z.dogovor_zakryt && el('p', { klass: 'preduprezhdenie' }, 'Укажите дату, когда договор закончится: от неё считается срок хранения.'),
      el('button', { type: 'button', klass: 'knopka', na: () => pomenyat({ last_contact_at: new Date().toISOString() }) }, 'Общались сегодня'),
      z.soglasie_reklama && !z.reklama_otozvano_at && dvaShaga('Отказался от новостей', 'Записать отказ?', () => pomenyat({ reklama_otozvano: true })));
  }

  function blokIstorii(z, id) {
    const tekst = el('textarea', { rows: 3, maxLength: 5000, placeholder: 'Что обсудили, о чём договорились' });
    const zapisat = async () => {
      const t = tekst.value.trim();
      if (!t) return;
      try { await api(`/zayavki/${id}/zapis`, { metod: 'POST', telo: { text: t } }); await pokazatKartochku(id); }
      catch (e) { skazat(e.message); }
    };
    const zapisi = (z.istoriya || []).map((r) => el('li', {},
      el('div', { klass: 'kogda' }, data(r.created_at)),
      el('p', { klass: 'tekst' }, r.text),
      dvaShaga('Удалить запись', 'Удалить запись?', async () => {
        try { await api(`/zayavki/${id}/zapis/${encodeURIComponent(r.id)}`, { metod: 'DELETE' }); await pokazatKartochku(id); }
        catch (e) { skazat(e.message); }
      })));
    return el('section', { klass: 'istoriya' },
      el('h3', {}, 'История'),
      zapisi.length ? el('ol', {}, ...zapisi) : el('p', { klass: 'pusto' }, 'Записей пока нет.'),
      tekst,
      el('button', { type: 'button', klass: 'knopka glavnaya', na: zapisat }, 'Записать'));
  }

  async function pokazatKartochku(id) {
    const moj = ++zapros;
    let z;
    try { z = await api(`/zayavki/${id}`); } catch (e) {
      if (moj === zapros) { skazat(e.message); spisok.hidden = true; esche.hidden = true; kartochka.hidden = true; }
      return;
    }
    if (moj !== zapros) return;
    skazat('');
    spisok.hidden = true;
    esche.hidden = true;
    $('filtr').hidden = true;
    document.title = 'Заявка · kor-nil.ru';
    const ssylka = bezopasnayaSsylka(z.ssylka);
    const udalit = async () => {
      try { await api(`/zayavki/${id}`, { metod: 'DELETE' }); location.hash = ''; }
      catch (e) { skazat(e.message); }
    };
    kartochka.hidden = false;
    kartochka.replaceChildren(
      el('p', {}, el('a', { href: '#' }, '← Все заявки')),
      el('h2', {}, z.name || 'Без имени'),
      el('p', { klass: 'kogda' }, `${data(z.created_at)} · ${z.tema_nazvanie || 'Без темы'}`),
      blokSvyazi(z),
      z.message ? el('p', { klass: 'tekst glass' }, z.message) : el('p', { klass: 'pusto' }, 'Текста нет.'),
      blokUpravleniya(z, id),
      blokIstorii(z, id),
      el('h3', {}, 'Подробности'),
      el('dl', { klass: 'polya' },
        pole('Как связаться', z.svyaz || '—'),
        z.ploshchad != null && pole('Площадь', `${z.ploshchad} м²`),
        pole('Страница', z.stranica || '—'),
        ssylka && pole('Расчёт', el('a', { href: ssylka, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть')),
        pole('Заполнено за', z.vremya != null ? `${z.vremya} с` : '—'),
        pole('Последнее общение', data(z.last_contact_at)),
        pole('Согласие на обработку', `${z.soglasie_versiya || '—'}, ${data(z.soglasie_at)}`),
        pole('Новости об услугах', z.reklama_otozvano_at ? `отказ ${data(z.reklama_otozvano_at)}` : (z.soglasie_reklama ? 'да' : 'нет')),
        pole('IP', z.ip || '—')),
      el('div', { klass: 'udalenie' }, dvaShaga('Удалить заявку', 'Удалить вместе с сообщением бота? Вернуть нельзя.', udalit)),
    );
  }

  function marshrut() {
    const m = /^#z(\d+)$/.exec(location.hash);
    if (m) pokazatKartochku(m[1]); else pokazatSpisok(false);
  }

  function obnovitSchetchiki(schetchiki) {
    knopkiFiltra.forEach((k) => {
      const n = schetchiki && schetchiki[k.dataset.kod];
      k.textContent = n ? `${k.dataset.nazvanie} · ${n}` : k.dataset.nazvanie;
    });
  }

  const knopkiFiltra = [['', 'Все'], ...Object.entries(STATUSY)].map(([kod, nazvanie]) => {
    const b = el('button', { type: 'button', klass: 'knopka', na: () => {
      filtr = kod;
      knopkiFiltra.forEach((k) => k.setAttribute('aria-pressed', String(k === b)));
      pokazatSpisok(false);
    } }, nazvanie);
    b.dataset.kod = kod;
    b.dataset.nazvanie = nazvanie;
    b.setAttribute('aria-pressed', String(kod === ''));
    return b;
  });
  $('filtr').append(...knopkiFiltra);
  esche.addEventListener('click', () => pokazatSpisok(true));
  addEventListener('hashchange', marshrut);
  marshrut();
})();
