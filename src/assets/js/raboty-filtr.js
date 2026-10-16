// raboty-filtr.js — «Все / Для дома / Для бизнеса» на странице «Работы» (/projects/).
(function () {
  const knopki = document.querySelectorAll('[data-filtr]');
  const kartochki = document.querySelectorAll('#raboty .rabota');
  knopki.forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.filtr;
    knopki.forEach((k) => k.setAttribute('aria-pressed', String(k === b)));
    kartochki.forEach((k) => { k.hidden = Boolean(f) && k.dataset.napr !== f; });
  }));
})();
