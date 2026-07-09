// Мобильное меню — тумблер бургера, закрытие по клику вне меню.

(function() {
  const nav = document.querySelector('.site-nav');
  const btn = document.querySelector('.nav-toggle');
  if (!nav || !btn) return;

  function setOpen(open) {
    nav.dataset.open = open ? 'true' : 'false';
    btn.setAttribute('aria-expanded', String(open));
  }

  btn.addEventListener('click', () => {
    const open = nav.dataset.open === 'true';
    setOpen(!open);
  });

  // Клик по ссылке в меню — закрываем
  nav.querySelectorAll('.nav-menu a').forEach(a => {
    a.addEventListener('click', () => setOpen(false));
  });

  // Клик вне меню на мобильном — закрываем
  document.addEventListener('click', (e) => {
    if (nav.dataset.open !== 'true') return;
    if (!nav.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });

  // Esc — закрываем
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.dataset.open === 'true') setOpen(false);
  });
})();
