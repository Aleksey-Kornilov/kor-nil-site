// goals.js — цели Яндекс.Метрики. Один вход `ymGoal('имя')` для всех скриптов сайта
// и делегированный слушатель на переходы в RuStore.
// Если счётчик не загрузился (блокировщик, офлайн) — вызов молча ничего не делает.

(function () {
  window.ymGoal = function (name, params) {
    // __ymId появляется не сразу: Метрика стартует только после первого действия
    // посетителя (см. загрузчик в head.njk), а этот файл грузится с defer и выполняется
    // раньше. Поэтому читаем счётчик В МОМЕНТ ВЫЗОВА. Если прочитать его один раз при
    // загрузке, он навсегда останется undefined и ни одна цель не дойдёт до Метрики —
    // именно так и было с 11.09 по 02.10.2026: пять целей показывали ноль.
    const ID = window.__ymId;
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
