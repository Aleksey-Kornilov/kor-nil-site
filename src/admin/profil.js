// profil.js — профиль: фото, имя, смена пароля с глазиком, тема и выход (на телефоне их больше негде нажать).
(function () {
  const { el, api, poleParolya } = Panel;
  const MAKS_FOTO = 5 * 1024 * 1024;
  const baity = (t) => new TextEncoder().encode(t).length;

  function zametka() {
    const m = el('p', { klass: 'uspeh', role: 'status', hidden: true });
    const o = el('p', { klass: 'oshibka', role: 'alert', hidden: true });
    return {
      uzly: [m, o],
      horosho: (t) => { m.textContent = t; m.hidden = false; o.hidden = true; },
      ploho: (t) => { o.textContent = t; o.hidden = false; m.hidden = true; },
      sbros: () => { m.hidden = true; o.hidden = true; },
    };
  }

  function blokFoto(ya) {
    const z = zametka();
    const vybor = el('input', { type: 'file', id: 'foto-fajl', klass: 'skrytyj-fajl', accept: 'image/jpeg,image/png,image/webp' });
    const obnovit = async () => { await Panel.obnovitYa(); await pokazat(); };
    vybor.addEventListener('change', async () => {
      const f = vybor.files[0];
      vybor.value = '';
      if (!f) return;
      z.sbros();
      if (f.size > MAKS_FOTO) return z.ploho('Файл больше 5 МБ.');
      const forma = new FormData();
      forma.append('foto', f);
      try { await api('/foto', { metod: 'POST', forma }); await obnovit(); }
      catch (e) { z.ploho(e.message); }
    });
    const udalit = Panel.dvaShaga('Удалить фото', 'Удалить?', async () => {
      try { await api('/foto', { metod: 'DELETE' }); await obnovit(); }
      catch (e) { z.ploho(e.message); }
    });
    return el('section', { klass: 'plitka' },
      el('h2', {}, 'Фото'), ...z.uzly,
      el('div', { klass: 'foto-stroka' }, Panel.avatar(ya, 'bolshoj'),
        el('div', { klass: 'foto-knopki' }, vybor,
          el('label', { klass: 'knopka', htmlFor: 'foto-fajl' }, ya.est_foto ? 'Заменить фото' : 'Загрузить фото'),
          ya.est_foto && udalit)),
      el('p', { klass: 'podpis' }, 'JPEG, PNG или WebP, до 5 МБ.'));
  }

  function blokDannyh(ya) {
    const z = zametka();
    const imya = el('input', { id: 'imya', value: ya.imya || '', maxLength: 100, autocomplete: 'name' });
    const forma = el('form', { klass: 'plitka', noValidate: true },
      el('h2', {}, 'Данные'), ...z.uzly,
      el('label', { klass: 'pole-vvoda' }, el('span', {}, 'Логин'), el('input', { value: ya.login || '', readOnly: true, 'aria-readonly': 'true' })),
      el('label', { klass: 'pole-vvoda' }, el('span', {}, 'Имя'), imya),
      el('button', { type: 'submit', klass: 'knopka glavnaya' }, 'Сохранить'));
    forma.addEventListener('submit', async (s) => {
      s.preventDefault();
      z.sbros();
      try { await api('/ya', { metod: 'PATCH', telo: { imya: imya.value.trim() } }); await Panel.obnovitYa(); z.horosho('Сохранено.'); }
      catch (e) { z.ploho(e.message); }
    });
    return forma;
  }

  function blokParolya() {
    const z = zametka();
    const staryj = poleParolya({ id: 'parol-staryj', podpis: 'Текущий пароль', avto: 'current-password' });
    const novyj = poleParolya({ id: 'parol-novyj', podpis: 'Новый пароль, от 12 знаков', avto: 'new-password' });
    const povtor = poleParolya({ id: 'parol-povtor', podpis: 'Новый пароль ещё раз', avto: 'new-password' });
    const vse = [staryj, novyj, povtor];
    const forma = el('form', { klass: 'plitka', noValidate: true },
      el('h2', {}, 'Смена пароля'), ...z.uzly, ...vse.map((p) => p.blok),
      el('button', { type: 'submit', klass: 'knopka glavnaya' }, 'Сменить пароль'));
    forma.addEventListener('submit', async (s) => {
      s.preventDefault();
      z.sbros();
      if (!staryj.vvod.value) return z.ploho('Укажите текущий пароль.');
      if (novyj.vvod.value.length < 12) return z.ploho('Новый пароль короче 12 знаков.');
      if (baity(novyj.vvod.value) > 72) return z.ploho('Новый пароль слишком длинный.');
      if (novyj.vvod.value !== povtor.vvod.value) return z.ploho('Новые пароли не совпадают.');
      try {
        await api('/parol', { metod: 'POST', telo: { staryj: staryj.vvod.value, novyj: novyj.vvod.value } });
        vse.forEach((p) => { p.vvod.value = ''; p.skryt(); });
        z.horosho('Пароль изменён, на других устройствах панель закрыта. Если храните пароль в файле, обновите его там.');
      } catch (e) { z.ploho(e.message); }
    });
    return forma;
  }

  async function pokazat() {
    const ekran = Panel.novyjEkran('Профиль');
    let ya;
    try { ya = await api('/ya'); } catch (e) {
      if (ekran.aktualen()) { Panel.skazat(e.message); document.getElementById('ekran').replaceChildren(); }
      return;
    }
    if (!ekran.aktualen()) return;
    document.getElementById('ekran').replaceChildren(
      el('div', { klass: 'golova' }, el('h1', {}, 'Профиль')),
      el('div', { klass: 'profil' },
        el('div', { klass: 'stolbec' }, blokFoto(ya), blokDannyh(ya),
          el('section', { klass: 'plitka ryad-knopok' },
            el('button', { type: 'button', klass: 'knopka', na: Panel.pereklyuchitTemu }, 'Сменить тему'),
            el('button', { type: 'button', klass: 'knopka', na: Panel.vyjti }, 'Выйти'))),
        blokParolya()));
  }

  Panel.profil = pokazat;
})();
