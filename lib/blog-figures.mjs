// blog-figures.mjs — схемы для статей блога: рисуются кодом в SVG, а не картинками.
// Почему так: SVG весит килобайты вместо сотен килобайт, не мылится на любом экране,
// сам подстраивается под светлую и тёмную тему через currentColor и переменные,
// а текст внутри читают и поисковики, и скринридеры.
//
// Каждая функция возвращает готовый <figure> с подписью. Вставляются в Markdown
// шорткодом {% figure "имя" %} (см. eleventy.config.mjs).

const W = 760;

// Обёртка со скроллом: на узком экране схема не сжимается до нечитаемого,
// а прокручивается вбок. Подпись остаётся на месте, поэтому она вне скролла.
const wrap = (inner, height, caption, label) => `<figure class="fig">
<div class="fig-scroll"><svg viewBox="0 0 ${W} ${height}" class="fig-svg" role="img" aria-label="${label}">${inner}</svg></div>
<figcaption>${caption}<span class="fig-hint"> Схему можно прокрутить вбок.</span></figcaption>
</figure>`;

const txt = (x, y, s, cls = 'fig-t', anchor = 'middle') =>
  `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${s}</text>`;

const box = (x, y, w, h, cls = 'fig-box') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="${cls}"/>`;

const arrow = (x1, y1, x2, y2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="fig-arrow" marker-end="url(#fig-arr)"/>`;

const DEFS = `<defs><marker id="fig-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="fig-arrhead"/></marker></defs>`;

/* ---------- 1. Загрузка страницы: до и после отложенной аналитики ---------- */
function timeline() {
  const y = 58, h = 34, x0 = 150, scale = 92; // 1 секунда = 92 px
  const bar = (row, segs) => segs.map((s) => {
    const x = x0 + s.from * scale, w = (s.to - s.from) * scale;
    return `${box(x, row, w, h, 'fig-box ' + s.cls)}${txt(x + w / 2, row + 22, s.label)}`;
  }).join('');
  const ticks = [0, 1, 2, 3, 4, 5, 6].map((s) =>
    `<line x1="${x0 + s * scale}" y1="40" x2="${x0 + s * scale}" y2="196" class="fig-grid"/>${txt(x0 + s * scale, 30, s + ' с', 'fig-s')}`).join('');
  const inner = DEFS + ticks
    + txt(x0 - 14, y + 22, 'Было', 'fig-t fig-b', 'end')
    + bar(y, [
      { from: 0, to: 0.6, label: '', cls: 'fig-ok' },
      { from: 0.6, to: 2.6, label: 'аналитика', cls: 'fig-bad' },
      { from: 2.6, to: 5.6, label: 'запись сеанса', cls: 'fig-bad' },
    ])
    + txt(x0 - 14, y + 100 + 22, 'Стало', 'fig-t fig-b', 'end')
    + txt(x0 + 0.3 * scale, y + h + 18, 'страница', 'fig-s')
    + bar(y + 100, [{ from: 0, to: 1.1, label: 'страница', cls: 'fig-ok' }])
    + txt(x0 + 1.1 * scale + 16, y + 100 + 22, 'аналитика ждёт первого действия человека', 'fig-s', 'start');
  return wrap(inner, 210,
    'Пока аналитика грузилась сразу, главный поток был занят почти пять секунд. После отложенного запуска страница готова к работе за секунду, а аналитика ждёт первого действия человека.',
    'Две шкалы времени загрузки: до и после отложенного запуска аналитики');
}

/* ---------- 2. Медиа-пайплайн: путь файла от телефона до собеседника ---------- */
function media() {
  const y = 60, bw = 150, bh = 66, gap = 32;
  const x0 = (W - (4 * bw + 3 * gap)) / 2;
  const xs = [0, 1, 2, 3].map((i) => x0 + i * (bw + gap));
  const steps = [
    ['Телефон', 'сжатие на месте'],
    ['Хранилище', 'файл как есть'],
    ['Сервер', 'ffmpeg → 720p'],
    ['Собеседник', 'лёгкий файл'],
  ];
  const inner = DEFS + steps.map(([a, b], i) =>
    box(xs[i], y, bw, bh) + txt(xs[i] + bw / 2, y + 28, a, 'fig-t fig-b') + txt(xs[i] + bw / 2, y + 50, b, 'fig-s')
  ).join('') + xs.slice(0, 3).map((x) => arrow(x + bw + 5, y + bh / 2, x + bw + gap - 6, y + bh / 2)).join('')
    + txt(W / 2, 32, 'Видео: было 630 МБ · стало 204 МБ', 'fig-t fig-b')
    + txt(W / 2, y + bh + 30, 'сообщение уходит сразу, готовый файл приходит следом', 'fig-s');
  return wrap(inner, 180,
    'Файл сжимается на телефоне, уходит в хранилище напрямую, а сервер перекодирует его в фоне и сообщает клиенту, когда готово.',
    'Схема пути медиафайла: телефон, хранилище, сервер, собеседник');
}

/* ---------- 3. Лента: почему окно свежести именно неделя ---------- */
function feed() {
  const y = 70, h = 40, x0 = 190, w = 500;
  const row = (top, label, segs) => txt(x0 - 14, top + 26, label, 'fig-t fig-b', 'end') + segs.map((s) =>
    `${box(x0 + s.from * w, top, (s.to - s.from) * w, h, 'fig-box ' + s.cls)}${(s.to - s.from) > 0.14 ? txt(x0 + (s.from + s.to) / 2 * w, top + 25, s.label) : ''}`).join('');
  const inner = DEFS
    + txt(W / 2, 34, 'Что человек видит в начале ленты', 'fig-t fig-b')
    + row(y, 'Окно 14 дней', [
      { from: 0, to: 0.62, label: 'непрочитанное двухнедельной давности', cls: 'fig-bad' },
      { from: 0.62, to: 1, label: 'свежее', cls: 'fig-ok' },
    ])
    + row(y + 74, 'Окно 7 дней', [
      { from: 0, to: 0.42, label: 'непрочитанное за неделю', cls: 'fig-ok' },
      { from: 0.42, to: 1, label: 'остальное по свежести', cls: 'fig-ok fig-soft' },
    ])
    + txt(W / 2, y + 74 + h + 28, 'Замер на живых данных: 1163 непрочитанных против 277 прочитанных', 'fig-s');
  return wrap(inner, 236,
    'При окне в две недели лента открывалась записями двухнедельной давности. Неделя — верхняя граница, при которой начало ленты остаётся свежим.',
    'Сравнение двух окон свежести ленты: 14 дней и 7 дней');
}

/* ---------- 4. Разбор текста в два шага перед проверкой орфографии ---------- */
function tokenize() {
  const inner = DEFS
    + txt(W / 2, 30, 'Что уходит на сервер проверки орфографии', 'fig-t fig-b')
    + box(24, 50, 300, 54) + txt(174, 72, 'Пишите на ivanov@mail.ru', 'fig-t') + txt(174, 92, 'исходный текст', 'fig-s')
    + arrow(334, 77, 392, 77)
    + box(402, 44, 334, 32, 'fig-box fig-bad') + txt(569, 65, 'одной регуляркой: ivanov · mail · Пишите', 'fig-t')
    + box(402, 86, 334, 32, 'fig-box fig-ok') + txt(569, 107, 'в два шага: Пишите', 'fig-t')
    + txt(569, 138, 'адрес отбрасывается целиком, а не режется на куски', 'fig-s');
  return wrap(inner, 158,
    'Разбор в один проход вытаскивает из почтового адреса «ivanov» и «mail» и отправляет их на сервер. Разбор в два шага сначала отбрасывает подозрительные куски целиком.',
    'Сравнение двух способов разбора текста перед проверкой орфографии');
}

/* ---------- 5. Путь приложения в магазин ---------- */
function release() {
  const y = 74, bw = 150, bh = 62, gap = 40;
  const xs = [26, 26 + bw + gap, 26 + 2 * (bw + gap), 26 + 3 * (bw + gap)];
  const steps = [
    ['7 августа', 'подача', 'fig-box'],
    ['11 августа', 'отказ: реестр', 'fig-box fig-bad'],
    ['11 августа', 'пересборка', 'fig-box'],
    ['16 августа', 'опубликовано', 'fig-box fig-ok'],
  ];
  const inner = DEFS + txt(W / 2, 34, 'Девять дней до публикации', 'fig-t fig-b')
    + steps.map(([d, s, cls], i) =>
      box(xs[i], y, bw, bh, cls) + txt(xs[i] + bw / 2, y + 26, d, 'fig-s') + txt(xs[i] + bw / 2, y + 48, s, 'fig-t fig-b')
    ).join('') + xs.slice(0, 3).map((x) => arrow(x + bw + 6, y + bh / 2, x + bw + gap - 8, y + bh / 2)).join('')
    + txt(W / 2, y + bh + 30, 'Отказ был юридическим: приложение даже не смотрели', 'fig-s');
  return wrap(inner, 180,
    'Между подачей и публикацией — отказ по юридическому основанию и пересборка из боевого коммита.',
    'Четыре шага публикации приложения в магазине: подача, отказ, пересборка, публикация');
}

export const FIGURES = { timeline, media, feed, tokenize, release };
