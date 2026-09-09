// calc-tour.js — короткое обучение по конструктору: 3–5 шагов с подсветкой того, что нажимать.
// Показывается один раз на калькулятор (localStorage), повторить — кнопка «Как пользоваться».
// Подключается после calculators.js; шаги собираются по тому, что реально есть на странице.

(function () {
  'use strict';
  const root = document.querySelector('.calc[data-calc]');
  if (!root) return;
  const key = 'kn_tour_' + root.dataset.calc;
  const store = { get() { try { return localStorage.getItem(key); } catch (e) { return '1'; } }, set(v) { try { localStorage.setItem(key, v); } catch (e) { /* приватный режим */ } } };

  function steps() {
    const list = [];
    const add = (sel, title, text) => { const el = root.querySelector(sel); if (el && !el.hidden && el.offsetParent !== null) list.push({ el, title, text }); };
    add('.calc-chips', '1. Выберите, что считаем', 'Кнопки сверху переключают режим: форму, тип или способ ввода. От выбора зависят поля ниже.');
    add('.calc-fields', '2. Введите размеры', 'Метры — в метрах, сантиметры — в сантиметрах: единица подписана справа от поля. Результат пересчитывается сразу, кнопки «Посчитать» нет.');
    add('.plan-svg', '3. Нарисуйте план', 'Тяните синие точки за углы. Нажмите на сторону — появятся её длина и настройки. Заготовки выше задают форму одним нажатием.');
    add('.room-svg', '3. Стены и проёмы', 'Нажмите на стену, чтобы выбрать отделку или включить забор. Кнопками «+» добавьте окна, двери, ворота и тяните их по стене.');
    add('.calc-viz', '4. Схема', 'Схему можно крутить: тяните влево-вправо и вверх-вниз. Колесо мыши или щипок — масштаб, кнопки справа сверху — то же и сброс.');
    add('.calc-result', '5. Результат', 'Цифры, стоимость по вашим ценам, кнопки «Поделиться», «Ссылка на расчёт», «Скачать PDF». Ссылка открывает тот же расчёт у любого, кому вы её отправите.');
    return list;
  }

  let i = 0, list = [], card = null, current = null;
  function clear() { if (current) current.el.classList.remove('tour-target'); if (card) card.remove(); card = null; current = null; }
  function show(n) {
    clear();
    if (n >= list.length) { store.set('done'); return; }
    i = n; current = list[n]; current.el.classList.add('tour-target');
    card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Подсказка');
    card.innerHTML = '<p class="tour-title"></p><p class="tour-text"></p><div class="tour-actions"><button type="button" class="btn btn-primary btn-sm tour-next"></button><button type="button" class="btn btn-secondary btn-sm tour-skip">Закрыть</button><span class="tour-count"></span></div>';
    card.querySelector('.tour-title').textContent = current.title;
    card.querySelector('.tour-text').textContent = current.text;
    card.querySelector('.tour-next').textContent = n + 1 < list.length ? 'Дальше' : 'Понятно';
    card.querySelector('.tour-count').textContent = (n + 1) + ' из ' + list.length;
    card.querySelector('.tour-next').addEventListener('click', () => show(n + 1));
    card.querySelector('.tour-skip').addEventListener('click', () => { clear(); store.set('done'); });
    current.el.insertAdjacentElement('afterend', card);
    current.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function start() { list = steps(); if (list.length) show(0); }

  // Кнопка «Как пользоваться» над калькулятором
  const help = document.createElement('button'); help.type = 'button'; help.className = 'tour-help'; help.textContent = 'Как пользоваться?';
  help.addEventListener('click', () => (card ? (clear(), store.set('done')) : start()));
  const top = root.previousElementSibling && root.previousElementSibling.classList.contains('calc-topline') ? root.previousElementSibling : root;
  top.parentNode.insertBefore(help, top);

  if (store.get() !== 'done' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setTimeout(start, 900);
  else if (store.get() !== 'done') setTimeout(start, 900);
})();
