// admin.js — каркас панели: меню, маршруты, сводка. Разделы — в zayavki.js и profil.js, общее — в vhod/obshchee.js.
(function () {
  const { el, ikon, api } = Panel;
  const $ = (id) => document.getElementById(id);
  const RAZDELY = [['svodka', 'Сводка', '#svodka'], ['zayavki', 'Заявки', '#zayavki'], ['profil', 'Профиль', '#profil']];
  const punkty = {};
  let ya = null, nomerEkrana = 0;

  Panel.skazat = (tekst) => { $('soobshchenie').textContent = tekst || ''; $('soobshchenie').hidden = !tekst; };

  // Новый показ отменяет старый: ответ, пришедший поздно, экран не перепишет.
  Panel.novyjEkran = (nazvanie) => {
    document.title = `${nazvanie} · kor-nil.ru`;
    const nomer = ++nomerEkrana;
    return { aktualen: () => nomer === nomerEkrana };
  };

  // Дата в адресе числом: nginx отбивает адреса со знаком %, а двоеточие в запросе кодируется именно так.
  Panel.avatar = (dannye, klass) => {
    const bukva = (dannye.imya || dannye.login || '?').trim().charAt(0).toUpperCase();
    return dannye.est_foto
      ? el('img', { klass: `avatar ${klass || ''}`, src: `/admin/api/foto?v=${Date.parse(dannye.foto_at) || 0}`, alt: '' })
      : el('span', { klass: `avatar ${klass || ''}`, 'aria-hidden': 'true' }, bukva);
  };

  Panel.obnovitYa = async () => {
    ya = await api('/ya');
    $('kto-ya').replaceChildren(Panel.avatar(ya), el('span', {}, ya.imya || ya.login));
    return ya;
  };

  Panel.obnovitMetku = async () => {
    try {
      const s = await api('/svodka');
      const n = s.po_statusam && s.po_statusam.novaya;
      punkty.zayavki.querySelector('.schet')?.remove();
      if (n) punkty.zayavki.append(el('span', { klass: 'schet', 'aria-label': `Новых: ${n}` }, n));
    } catch { /* метка необязательна, ошибку покажет сам экран */ }
  };

  Panel.vyjti = async () => {
    try { await api('/vyhod', { metod: 'POST' }); location.replace('/admin/vhod/'); }
    catch (e) { Panel.skazat(e.message); }
  };

  function pokazatel(chislo, podpis, ssylka, klass) {
    return el(ssylka ? 'a' : 'div', { klass: `pokazatel ${klass || ''}`, href: ssylka }, el('b', {}, chislo ?? 0), el('span', {}, podpis));
  }

  async function svodka() {
    const ekran = Panel.novyjEkran('Сводка');
    let s, novye, poseshcheniya;
    try {
      [s, novye, poseshcheniya] = await Promise.all([api('/svodka'), api('/zayavki?status=novaya&limit=5'), Panel.poseshcheniya()]);
    } catch (e) {
      if (ekran.aktualen()) { Panel.skazat(e.message); $('ekran').replaceChildren(); }
      return;
    }
    if (!ekran.aktualen()) return;
    Panel.skazat('');
    const p = s.po_statusam || {};
    $('ekran').replaceChildren(
      el('div', { klass: 'golova' }, el('h1', {}, 'Сводка')),
      el('div', { klass: 'pokazateli' },
        pokazatel(p.novaya, 'Новые', '#zayavki/novaya', 'vazhno'),
        pokazatel(p.v_rabote, 'В работе', '#zayavki/v_rabote'),
        pokazatel(p.otvetil, 'Ответил', '#zayavki/otvetil'),
        pokazatel(p.spam, 'Спам', '#zayavki/spam'),
        pokazatel(s.za_7_dney, 'Заявок за 7 дней'),
        pokazatel(s.za_30_dney, 'Заявок за 30 дней')),
      el('section', {},
        el('div', { klass: 'golova' }, el('h2', {}, 'Новые заявки'), el('a', { href: '#zayavki' }, 'Все заявки')),
        novye.items.length ? Panel.zayavki.tablica(novye.items).mesto : el('p', { klass: 'pusto plitka' }, 'Новых заявок нет.')),
      poseshcheniya);
  }

  function otmetitPunkt(kod) {
    for (const [k, p] of Object.entries(punkty)) {
      if (k === kod) p.setAttribute('aria-current', 'page'); else p.removeAttribute('aria-current');
    }
  }

  function marshrut() {
    Panel.skazat('');
    scrollTo(0, 0);
    const h = location.hash;
    const z = /^#z(\d{1,9})$/.exec(h);
    const s = /^#zayavki(?:\/([a-z_]+))?$/.exec(h);
    if (z) { otmetitPunkt('zayavki'); return Panel.zayavki.kartochka(z[1]); }
    if (s) { otmetitPunkt('zayavki'); return Panel.zayavki.spisok(s[1] || ''); }
    if (h === '#profil') { otmetitPunkt('profil'); return Panel.profil(); }
    otmetitPunkt('svodka');
    return svodka();
  }

  for (const [kod, nazvanie, ssylka] of RAZDELY) {
    punkty[kod] = el('a', { klass: 'punkt', href: ssylka }, ikon(kod), el('span', {}, nazvanie));
    $('menyu').append(punkty[kod]);
  }
  $('na-sajt').append(ikon('sajt'), 'Открыть сайт');
  $('tema').append(ikon('tema'), 'Сменить тему');
  $('tema').addEventListener('click', Panel.pereklyuchitTemu);
  $('vyhod').append(ikon('vyhod'), 'Выйти');
  $('vyhod').addEventListener('click', Panel.vyjti);
  addEventListener('hashchange', marshrut);

  Panel.obnovitYa().catch((e) => Panel.skazat(e.message));
  Panel.obnovitMetku();
  marshrut();
})();
