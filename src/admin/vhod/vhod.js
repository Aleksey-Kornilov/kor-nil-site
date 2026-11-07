// vhod.js — экран входа. Cookie SameSite=Strict не приходит при переходе по внешней ссылке,
// и nginx присылает сюда уже вошедшего: поэтому сначала спрашиваем /ya.
(function () {
  const $ = (id) => document.getElementById(id);
  const parol = Panel.poleParolya({ id: 'parol', podpis: 'Пароль', avto: 'current-password' });
  $('mesto-parolya').append(parol.blok);

  const pokazat = (tekst) => { $('oshibka').textContent = tekst || ''; $('oshibka').hidden = !tekst; };

  fetch('/admin/api/ya', { credentials: 'same-origin' })
    .then((o) => { if (o.ok) location.replace('/admin/'); })
    .catch(() => {});

  $('forma').addEventListener('submit', async (s) => {
    s.preventDefault();
    const login = $('login').value.trim();
    if (!login || !parol.vvod.value) return pokazat('Укажите логин и пароль.');
    const knopka = $('vojti');
    knopka.disabled = true;
    pokazat('');
    try {
      await Panel.api('/vhod', { metod: 'POST', telo: { login, parol: parol.vvod.value } });
      location.replace('/admin/');
    } catch (e) {
      pokazat(e.message);
      parol.skryt();
      parol.vvod.value = '';
      parol.vvod.focus();
      knopka.disabled = false;
    }
  });
  $('login').focus();
})();
