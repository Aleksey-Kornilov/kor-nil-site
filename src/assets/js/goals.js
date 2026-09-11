// goals.js — цели Яндекс.Метрики. Один вход `ymGoal('имя')` для всех скриптов сайта
// и делегированный слушатель на переходы в RuStore.
// Если счётчик не загрузился (блокировщик, офлайн) — вызов молча ничего не делает.

(function () {
  const ID = window.__ymId;

  window.ymGoal = function (name, params) {
    if (!ID || typeof window.ym !== 'function') return;
    try { window.ym(ID, 'reachGoal', name, params); } catch (e) { /* счётчику не до нас */ }
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    // Переход в RuStore — из шапки, футера и блоков «Этот калькулятор есть в ЧатЯдре»
    if (a.href.includes('rustore.ru')) window.ymGoal('rustore_click');
    // Резюме: у русской и английской версии свой файл
    else if (a.href.endsWith('.pdf')) window.ymGoal('cv_download', { file: a.href.split('/').pop() });
  }, { passive: true });
})();
