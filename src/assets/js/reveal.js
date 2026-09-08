// Появление секций при прокрутке. Скрываем только то, что ниже первого экрана,
// и только когда браузер умеет IntersectionObserver и пользователь не просил
// «меньше движения». Иначе всё видно сразу — ничего не ломается.

(function() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const sections = document.querySelectorAll('main .section');
  const fold = window.innerHeight;
  const targets = [];

  sections.forEach((el) => {
    // Секция хотя бы частично на первом экране — не трогаем (LCP, без мигания)
    if (el.getBoundingClientRect().top < fold) return;
    el.classList.add('reveal');
    targets.push(el);
  });
  if (!targets.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

  targets.forEach((el) => io.observe(el));
})();
