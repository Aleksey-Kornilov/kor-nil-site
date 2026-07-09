// Тумблер темы. Инициализация темы происходит в <head> до отрисовки —
// это нужно чтобы избежать «мерцания» белым/чёрным при загрузке страницы.
// Здесь мы только вешаем обработчик клика на кнопку.

(function() {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.dataset.theme || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    html.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (_) {}

    // Обновляем meta theme-color (влияет на цвет шапки браузера на мобильных)
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) {
      meta.setAttribute('content', next === 'dark' ? '#0e1621' : '#f7f8fa');
    }
  });

  // Реагируем на смену системной темы если пользователь не выбрал вручную
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    }
  });
})();
