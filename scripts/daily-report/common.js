// Общее для всех сводок: настройки, даты по Самаре, запросы к Метрике и Вебмастеру, слова, вывод.
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
// .env рядом со скриптом — свой маленький разбор, без зависимостей
for (const line of (fs.existsSync(path.join(HERE, '.env')) ? fs.readFileSync(path.join(HERE, '.env'), 'utf8') : '').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const TOKEN = process.env.YANDEX_OAUTH_TOKEN;
const COUNTER = process.env.METRIKA_COUNTER_ID;
const WM = `https://api.webmaster.yandex.net/v4/user/${process.env.WM_USER_ID}/hosts/${encodeURIComponent(process.env.WM_HOST_ID || '')}`;
// С этого дня есть счётчик: что раньше — сравнивать не с чем
const SINCE = '2026-09-08';

/* ---------- даты (сутки — по Самаре) ---------- */
const TZ = 'Europe/Samara';
const DAY = 86400000;
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const today = ymd(new Date());
const shift = (s, n) => ymd(new Date(Date.parse(s + 'T12:00:00Z') + n * DAY));
const human = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const Y = shift(today, -1);

/* ---------- запросы с повторами: Вебмастер иногда с первого раза отвечает пустым ---------- */
async function get(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { Authorization: 'OAuth ' + TOKEN }, signal: AbortSignal.timeout(30000) });
      const text = await r.text();
      if (r.ok && text) return JSON.parse(text);
      last = new Error(r.status + ' ' + text.slice(0, 120));
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
  }
  throw last;
}
const metrika = (p) => get('https://api-metrika.yandex.net/stat/v1/data?' + new URLSearchParams(Object.assign({ ids: COUNTER, accuracy: 'full', limit: '20', lang: 'ru' }, p)));
const wm = (p) => get(WM + p);

/* ---------- слова ---------- */
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
const people = (n) => n + ' ' + plural(n, 'человек', 'человека', 'человек');
const times = (n) => n + ' ' + plural(n, 'раз', 'раза', 'раз');
const dur = (sec) => (sec < 60 ? Math.round(sec) + ' с' : Math.floor(sec / 60) + ' мин ' + Math.round(sec % 60) + ' с');
const num1 = (x) => x.toFixed(1).replace('.', ',');
const change = (a, b) => (b === 0 ? (a === 0 ? 'столько же' : 'было 0') : (a === b ? 'столько же' : (a > b ? '+' : '−') + Math.round(Math.abs(a - b) / b * 100) + '%'));

// Страница словами: заголовок из файла сайта на этом же сервере («Калькулятор плитки», а не tools/kalkulyator-plitki)
const SITE = process.env.KOR_NIL_SITE || '/root/kor-nil-site';
const pagePath = (p) => {
  if (p === '/') return 'главная';
  try {
    const t = fs.readFileSync(path.join(SITE, decodeURI(p), 'index.html'), 'utf8').match(/<title>([^<]*)<\/title>/);
    // Без хвоста после двоеточия: «Калькулятор лестницы на второй этаж», а не весь заголовок для поиска
    if (t) return t[1].split(/ [·|—] /)[0].split(': ')[0].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  } catch (e) { /* страницы нет — покажем адрес */ }
  return decodeURI(p).replace(/^\/|\/$/g, '');
};

// Откуда пришли: коды Метрики → по-человечески
const SOURCES = { organic: 'из поиска', direct: 'напрямую (набрали адрес, закладка, ссылка из чата)', referral: 'по ссылке с другого сайта',
  social: 'из соцсетей', messenger: 'из чатов (Telegram, WhatsApp)', ad: 'с рекламы', internal: 'со своих страниц', recommend: 'из рекомендаций Яндекса', email: 'из почты' };
// Цели по их коду на сайте → что сделал человек
const GOAL_WORDS = {
  calc_result: 'посчитали в калькуляторе', calc_share: 'унесли расчёт с собой (ссылка, PDF, QR)', calc_zakaz: 'нажали «Заказать» в калькуляторе',
  zayavka: 'отправили заявку', rustore_click: 'ушли ставить ЧатЯдро в RuStore', cv_download: 'скачали резюме',
};
const AUTO_WORDS = { number: 'посмотрели 3 страницы и больше', messenger: 'перешли написать в Telegram/WhatsApp', social: 'перешли в соцсеть', form: 'отправили форму (так видит Метрика)' };
// «Полезное действие» — то, ради чего сайт: расчёт, заявка, переход написать, установка, резюме
const USEFUL = new Set(['calc_result', 'calc_share', 'calc_zakaz', 'zayavka', 'rustore_click', 'cv_download', 'auto:messenger']);
// Что Вебмастер считает проблемой — по-человечески
const PROBLEMS = {
  NO_REGIONS: 'не указан регион сайта — Яндекс хуже показывает его в Самаре',
  DOCUMENTS_MISSING_DESCRIPTION: 'у части страниц нет описания для поиска',
  DOCUMENTS_MISSING_TITLE: 'у части страниц нет заголовка',
  URL_ALERT_4XX: 'есть ссылки на несуществующие страницы (404)', URL_ALERT_5XX: 'сайт отвечал ошибкой сервера',
  CONNECT_FAILED: 'Яндекс не смог зайти на сайт', DISALLOWED_IN_ROBOTS: 'сайт закрыт от поиска в robots.txt',
  SLOW_AVG_RESPONSE_TIME: 'сайт медленно отвечает', SSL_CERTIFICATE_ERROR: 'проблема с сертификатом https',
  NOT_MOBILE_FRIENDLY: 'неудобен на телефоне', DUPLICATE_PAGES: 'есть одинаковые страницы',
  NO_METRIKA_COUNTER_CRAWL_ENABLED: 'не включён обход страниц по Метрике (кнопка у Яндекса пока не работает)',
  NOT_IN_SPRAV: 'сайт не привязан к карточке в Яндекс Бизнесе (карточка на модерации)',
  NO_METRIKA_COUNTER_BINDING: 'Метрика не привязана к Вебмастеру', FAVICON_PROBLEM: 'проблема со значком сайта',
};
// Устройства словами
const DEVICES = { 'пк': 'компьютеры', 'смартфоны': 'телефоны', 'планшеты': 'планшеты', 'тв': 'телевизоры' };
const deviceLine = (rows) => rows.map((x) => `${DEVICES[(x.dimensions[0].name || '').toLowerCase()] || (x.dimensions[0].name || '').toLowerCase()} ${x.metrics[0]}`).join(', ');
const isUrgent = (p) => p.severity === 'FATAL' || p.severity === 'CRITICAL';
const problemLine = (p) => `   ${isUrgent(p) ? '🔴' : '•'} ${PROBLEMS[p.code] || 'замечание Яндекса (код ' + p.code + ')'}`;

/* ---------- Метрика ---------- */
async function goalsList() {
  const d = await get(`https://api-metrika.yandex.net/management/v1/counter/${COUNTER}/goals`);
  return d.goals.map((g) => {
    const code = g.type === 'action' ? (g.conditions[0] || {}).url : 'auto:' + g.type;
    return { id: g.id, code, words: GOAL_WORDS[code] || AUTO_WORDS[g.type] || g.name };
  });
}

// Окно дат: заходы, люди, из поиска, полезные действия и все цели
async function windowStats(d1, d2, goals) {
  const metrics = ['ym:s:visits', 'ym:s:users'].concat(goals.map((g) => `ym:s:goal${g.id}reaches`));
  const r = await metrika({ date1: d1, date2: d2, metrics: metrics.join(','), dimensions: 'ym:s:lastTrafficSource' });
  const t = r.totals.map(Number);
  const organic = r.data.find((x) => x.dimensions[0].id === 'organic');
  const goalsBy = {};
  goals.forEach((g, i) => { goalsBy[g.code] = t[2 + i]; });
  return {
    visits: t[0], users: t[1], search: organic ? organic.metrics[0] : 0, goals: goalsBy,
    useful: goals.reduce((s, g) => s + (USEFUL.has(g.code) ? goalsBy[g.code] : 0), 0),
    sources: r.data.map((x) => ({ id: x.dimensions[0].id, name: x.dimensions[0].name, visits: x.metrics[0] })),
  };
}

/* ---------- Вебмастер ---------- */
// Показы по дням. Нули в хвосте — это не «никто не видел», а Вебмастер ещё не досчитал
async function queryDays(from, to) {
  const h = await wm(`/search-queries/all/history?query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&date_from=${from}&date_to=${to}`);
  const I = h.indicators || {};
  if (!I.TOTAL_SHOWS) return { days: [], lastDate: null };
  const days = I.TOTAL_SHOWS.map((p, i) => ({ date: p.date.slice(0, 10), shows: p.value,
    clicks: ((I.TOTAL_CLICKS || [])[i] || {}).value || 0, pos: ((I.AVG_SHOW_POSITION || [])[i] || {}).value || 0 }));
  let end = days.length - 1;
  while (end >= 0 && !days[end].shows) end--;
  return { days: days.slice(0, end + 1), lastDate: end >= 0 ? days[end].date : null };
}
const sumDays = (days, d1, d2) => days.filter((d) => d.date >= d1 && d.date <= d2)
  .reduce((s, d) => ({ shows: s.shows + d.shows, clicks: s.clicks + d.clicks, posW: s.posW + d.pos * d.shows, n: s.n + 1 }), { shows: 0, clicks: 0, posW: 0, n: 0 });
async function popular(d1, d2, limit) {
  const r = await wm(`/search-queries/popular?order_by=TOTAL_SHOWS&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&date_from=${d1}&date_to=${d2}&limit=${limit}`);
  return r.queries.map((x) => ({ text: x.query_text, shows: x.indicators.TOTAL_SHOWS || 0, clicks: x.indicators.TOTAL_CLICKS || 0, pos: x.indicators.AVG_SHOW_POSITION || 0 }));
}
async function problems() {
  const d = await wm('/diagnostics');
  return Object.entries(d.problems).filter(([, p]) => p.state === 'PRESENT').map(([k, p]) => ({ code: k, severity: p.severity }));
}

/* ---------- вывод: растёт / держится / затухает ---------- */
// sig — [[что, сейчас, раньше], …]. Заметно — если разница хотя бы 2 и хотя бы 15%
function verdict(sig, span) {
  const dir = (a, b) => (a - b >= Math.max(2, 0.15 * b) ? 1 : b - a >= Math.max(2, 0.15 * b) ? -1 : 0);
  const ups = sig.filter(([, a, b]) => dir(a, b) > 0).map((x) => x[0]), downs = sig.filter(([, a, b]) => dir(a, b) < 0).map((x) => x[0]);
  if (ups.length > downs.length) return { trend: 1, text: `📈 Сайт РАСТЁТ: больше ${ups.join(', ')}.` };
  if (downs.length > ups.length) return { trend: -1, text: `📉 Сайт ЗАТУХАЕТ: меньше ${downs.join(', ')}.` };
  if (ups.length) return { trend: 0, text: `➖ Сайт ДЕРЖИТСЯ НА МЕСТЕ: больше ${ups.join(', ')}, но меньше ${downs.join(', ')} — одно уравновешивает другое.` };
  return { trend: 0, text: `➖ Сайт ДЕРЖИТСЯ НА МЕСТЕ: заметных перемен за ${span} нет.` };
}

module.exports = {
  fs, path, HERE, SINCE, today, Y, shift, human, DAY, get, metrika, wm,
  plural, people, times, dur, num1, change, pagePath, deviceLine, SOURCES, USEFUL, PROBLEMS, problemLine, isUrgent,
  goalsList, windowStats, queryDays, sumDays, popular, problems, verdict,
};
