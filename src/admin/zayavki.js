// zayavki.js — список и карточка заявки. Данные написал посторонний человек: только через el (textContent),
// ссылки только из белого списка (bezopasnayaSsylka).
(function () {
  const { el, api } = Panel;
  const STATUSY = { novaya: 'Новая', v_rabote: 'В работе', otvetil: 'Ответил', spam: 'Спам' };
  const VKLADKI = { '': 'Все', novaya: 'Новые', v_rabote: 'В работе', otvetil: 'Ответил', spam: 'Спам' };
  const ekranMesto = () => document.getElementById('ekran');

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
  Panel.dvaShaga = dvaShaga;

  function stroka(z) {
    const ssylka = `#z${encodeURIComponent(z.id)}`;
    const tr = el('tr', { klass: z.status === 'novaya' || z.status === 'spam' ? z.status : '' },
      el('td', {}, el('a', { klass: 'imya', href: ssylka }, z.name || 'Без имени')),
      el('td', {}, z.tema_nazvanie || 'Без темы'),
      el('td', {}, el('span', { klass: 'metki' },
        el('span', { klass: `metka status-${z.status}` }, STATUSY[z.status] || z.status),
        z.dogovor && el('span', { klass: 'metka' }, 'Договор'),
        z.dostavleno === false && el('span', { klass: 'metka trevoga' }, 'Бот не доставил'))),
      el('td', { klass: 'kogda' }, data(z.created_at)));
    tr.addEventListener('click', (s) => { if (!s.target.closest('a')) location.hash = ssylka; });
    return tr;
  }

  function tablica(items) {
    const telo = el('tbody', {}, ...items.map(stroka));
    const mesto = el('div', { klass: 'plitka tablica-mesto' }, el('table', { klass: 'tablica' },
      el('thead', {}, el('tr', {}, ...['Имя', 'Тема', 'Состояние', 'Когда'].map((t) => el('th', { scope: 'col' }, t)))), telo));
    return { mesto, telo };
  }

  async function spisok(status) {
    if (status && !STATUSY[status]) status = '';
    const ekran = Panel.novyjEkran('Заявки');
    const q = new URLSearchParams({ limit: '50' });
    if (status) q.set('status', status);
    let otvet;
    try { otvet = await api(`/zayavki?${q}`); } catch (e) {
      if (ekran.aktualen()) { Panel.skazat(e.message); ekranMesto().replaceChildren(); }
      return;
    }
    if (!ekran.aktualen()) return;

    let vse = otvet.items.slice(), sled = otvet.next ?? null;
    const sch = otvet.schetchiki || {};
    const obshchij = Object.values(sch).reduce((a, b) => a + (Number(b) || 0), 0);
    const vkladki = el('nav', { klass: 'vkladki', 'aria-label': 'Состояние заявки' }, ...Object.entries(VKLADKI).map(([kod, nazvanie]) => {
      const n = kod ? sch[kod] : obshchij;
      return el('a', { klass: 'vkladka', href: kod ? `#zayavki/${kod}` : '#zayavki', 'aria-current': kod === status ? 'page' : null }, n ? `${nazvanie} · ${n}` : nazvanie);
    }));
    const poisk = el('input', { klass: 'poisk', type: 'search', placeholder: 'Поиск среди показанных', 'aria-label': 'Поиск по имени, теме и контакту' });
    const mesto = el('div', {});
    const esche = el('button', { type: 'button', klass: 'knopka', id: 'esche', hidden: sled === null }, 'Показать ещё');

    const narisovat = () => {
      const slovo = poisk.value.trim().toLowerCase();
      const vidno = slovo ? vse.filter((z) => `${z.name || ''} ${z.tema_nazvanie || ''} ${z.svyaz || ''}`.toLowerCase().includes(slovo)) : vse;
      mesto.replaceChildren(vidno.length ? tablica(vidno).mesto : el('p', { klass: 'pusto plitka' }, slovo ? 'Ничего не нашлось.' : 'Заявок нет.'));
    };
    poisk.addEventListener('input', narisovat);
    esche.addEventListener('click', async () => {
      q.set('before', sled);
      esche.disabled = true;
      try {
        const dalshe = await api(`/zayavki?${q}`);
        vse = vse.concat(dalshe.items);
        sled = dalshe.next ?? null;
        esche.hidden = sled === null;
        narisovat();
      } catch (e) { Panel.skazat(e.message); }
      esche.disabled = false;
    });

    Panel.skazat('');
    ekranMesto().replaceChildren(el('div', { klass: 'golova' }, el('h1', {}, 'Заявки')), el('div', { klass: 'polka' }, vkladki, poisk), mesto, esche);
    narisovat();
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
      try { await api(`/zayavki/${id}`, { metod: 'PATCH', telo }); await kartochka(id); Panel.obnovitMetku(); }
      catch (e) { Panel.skazat(e.message); }
    };
    const vybor = el('select', { id: 'status' }, ...Object.entries(STATUSY).map(([kod, nazvanie]) =>
      el('option', { value: kod, selected: kod === z.status }, nazvanie)));
    vybor.addEventListener('change', () => pomenyat({ status: vybor.value }));
    const dogovor = el('input', { type: 'checkbox', id: 'dogovor', checked: !!z.dogovor });
    dogovor.addEventListener('change', () => pomenyat({ dogovor: dogovor.checked }));
    const zakryt = el('input', { type: 'date', id: 'dogovor-zakryt', value: dlyaPolya(z.dogovor_zakryt) });
    zakryt.addEventListener('change', () => pomenyat({ dogovor_zakryt: zakryt.value || null }));

    return el('section', { klass: 'plitka upravlenie', 'aria-label': 'Работа с заявкой' },
      el('div', {}, el('label', { htmlFor: 'status' }, 'Состояние'), vybor),
      el('label', { klass: 'galochka' }, dogovor, ' Есть договор'),
      z.dogovor && el('div', {}, el('label', { htmlFor: 'dogovor-zakryt' }, 'Договор закрыт'), zakryt),
      z.dogovor && !z.dogovor_zakryt && el('p', { klass: 'preduprezhdenie' }, 'Укажите дату, когда договор закончится: от неё считается срок хранения.'),
      el('button', { type: 'button', klass: 'knopka', na: () => pomenyat({ last_contact_at: new Date().toISOString() }) }, 'Общались сегодня'),
      z.soglasie_reklama && !z.reklama_otozvano_at && dvaShaga('Отказался от новостей', 'Записать отказ?', () => pomenyat({ reklama_otozvano: true })));
  }

  function blokIstorii(z, id) {
    const tekst = el('textarea', { rows: 3, maxLength: 5000, placeholder: 'Что обсудили, о чём договорились', 'aria-label': 'Новая запись' });
    const zapisat = async () => {
      const t = tekst.value.trim();
      if (!t) return;
      try { await api(`/zayavki/${id}/zapis`, { metod: 'POST', telo: { text: t } }); await kartochka(id); Panel.obnovitMetku(); }
      catch (e) { Panel.skazat(e.message); }
    };
    const zapisi = (z.istoriya || []).map((r) => el('li', {},
      el('div', { klass: 'kogda' }, data(r.created_at)),
      el('p', { klass: 'tekst' }, r.text),
      dvaShaga('Удалить запись', 'Удалить запись?', async () => {
        try { await api(`/zayavki/${id}/zapis/${encodeURIComponent(r.id)}`, { metod: 'DELETE' }); await kartochka(id); }
        catch (e) { Panel.skazat(e.message); }
      })));
    return el('section', { klass: 'plitka istoriya' },
      el('h2', {}, 'История'),
      zapisi.length ? el('ol', {}, ...zapisi) : el('p', { klass: 'podpis' }, 'Записей пока нет.'),
      tekst,
      el('button', { type: 'button', klass: 'knopka glavnaya', na: zapisat }, 'Записать'));
  }

  async function kartochka(id) {
    const ekran = Panel.novyjEkran('Заявка');
    let z;
    try { z = await api(`/zayavki/${id}`); } catch (e) {
      if (ekran.aktualen()) { Panel.skazat(e.message); ekranMesto().replaceChildren(el('a', { klass: 'nazad', href: '#zayavki' }, '← Все заявки')); }
      return;
    }
    if (!ekran.aktualen()) return;
    Panel.skazat('');
    const ssylka = bezopasnayaSsylka(z.ssylka);
    const udalit = async () => {
      try { await api(`/zayavki/${id}`, { metod: 'DELETE' }); Panel.obnovitMetku(); location.hash = '#zayavki'; }
      catch (e) { Panel.skazat(e.message); }
    };
    ekranMesto().replaceChildren(
      el('a', { klass: 'nazad', href: '#zayavki' }, '← Все заявки'),
      el('div', { klass: 'golova' }, el('div', {},
        el('h1', {}, z.name || 'Без имени'),
        el('p', { klass: 'podpis' }, `${data(z.created_at)} · ${z.tema_nazvanie || 'Без темы'}`))),
      el('div', { klass: 'dve-kolonki' },
        el('div', { klass: 'stolbec' },
          el('section', { klass: 'plitka', 'aria-label': 'Заявка' },
            blokSvyazi(z),
            z.message ? el('p', { klass: 'tekst' }, z.message) : el('p', { klass: 'podpis' }, 'Текста нет.')),
          blokIstorii(z, id)),
        el('div', { klass: 'stolbec' },
          blokUpravleniya(z, id),
          el('section', { klass: 'plitka' },
            el('h2', {}, 'Подробности'),
            el('dl', { klass: 'polya' },
              pole('Как связаться', z.svyaz || '—'),
              z.ploshchad != null && pole('Площадь', `${z.ploshchad} м²`),
              pole('Страница', z.stranica || '—'),
              ssylka && pole('Расчёт', el('a', { href: ssylka, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть')),
              pole('Заполнено за', z.vremya != null ? `${z.vremya} с` : '—'),
              pole('Последнее общение', data(z.last_contact_at)),
              pole('Согласие на обработку', `${z.soglasie_versiya || '—'}, ${data(z.soglasie_at)}`),
              pole('Новости об услугах', z.reklama_otozvano_at ? `отказ ${data(z.reklama_otozvano_at)}` : (z.soglasie_reklama ? 'да' : 'нет')),
              pole('IP', z.ip || '—'))),
          el('div', {}, dvaShaga('Удалить заявку', 'Удалить вместе с сообщением бота? Вернуть нельзя.', udalit)))),
    );
  }

  Panel.zayavki = { spisok, kartochka, tablica };
})();
