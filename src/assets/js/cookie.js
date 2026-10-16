// Плашка про cookie Метрики: показываем, пока человек не нажал «Понятно».
// Хранилище может быть недоступно (приватный режим) — тогда плашка просто покажется снова.
(function () {
  var el = document.querySelector('.cookie-plashka');
  if (!el) return;
  var KEY = 'kn_cookie_ok';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* без хранилища */ }
  el.hidden = false;
  el.querySelector('button').addEventListener('click', function () {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* без хранилища */ }
    el.hidden = true;
  });
})();
