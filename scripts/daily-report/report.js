// Ежедневная сводка по kor-nil.ru — Алексею в ЧатЯдро, от бота «kor-nil.ru».
//
// Что: каждое утро берёт вчерашний день из Метрики и последние данные Вебмастера и пишет
// простыми словами — сначала коротко, потом разбор, в конце вывод: сайт растёт, стоит или затухает.
//
// Где живёт: на сервере в /root/kor-nil-report/ (код ЧатЯдра не трогаем, его не перезапускаем).
// Отправка — через уже работающего бота «kor-nil.ru» (services/kor_nil_bot.js бэкенда ЧатЯдра):
// пуш уходит пустым, «Новое сообщение», цифры не попадают к Google и Apple.
// Запуск — системный cron в 08:00 МСК = 09:00 по Самаре (см. scripts/daily-report/README.md).
//
//   node report.js          собрать и отправить
//   node report.js --dry    только напечатать (ничего не шлёт)
//   node report.js --force  отправить, даже если сегодня уже отправляли
//
// Настройки — /root/kor-nil-report/.env: YANDEX_OAUTH_TOKEN, METRIKA_COUNTER_ID, WM_USER_ID, WM_HOST_ID.
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const BACKEND = process.env.KOR_NIL_BACKEND || '/root/sntchat-app/backend';
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const TZ = 'Europe/Samara';

// .env рядом со скриптом — свой маленький разбор, без зависимостей
for (const line of (fs.existsSync(path.join(HERE, '.env')) ? fs.readFileSync(path.join(HERE, '.env'), 'utf8') : '').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const TOKEN = process.env.YANDEX_OAUTH_TOKEN;
const COUNTER = process.env.METRIKA_COUNTER_ID;
const WM = `https://api.webmaster.yandex.net/v4/user/${process.env.WM_USER_ID}/hosts/${encodeURIComponent(process.env.WM_HOST_ID || '')}`;

/* ---------- даты (сутки — по Самаре) ---------- */
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const DAY = 86400000;
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

/* ---------- слова ---------- */
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
const people = (n) => n + ' ' + plural(n, 'человек', 'человека', 'человек');
const times = (n) => n + ' ' + plural(n, 'раз', 'раза', 'раз');
const dur = (sec) => (sec < 60 ? Math.round(sec) + ' с' : Math.floor(sec / 60) + ' мин ' + Math.round(sec % 60) + ' с');
const change = (a, b) => (b === 0 ? (a === 0 ? 'столько же' : 'было 0') : (a === b ? 'столько же' : (a > b ? '+' : '−') + Math.round(Math.abs(a - b) / b * 100) + '%'));
// Страница словами: заголовок из файла сайта на этом же сервере («Калькулятор плитки», а не tools/kalkulyator-plitki)
const SITE = process.env.KOR_NIL_SITE || '/root/kor-nil-site';
const pagePath = (p) => {
  if (p === '/') return 'главная';
  try {
    const t = fs.readFileSync(path.join(SITE, decodeURI(p), 'index.html'), 'utf8').match(/<title>([^<]*)<\/title>/);
    if (t) return t[1].split(/ [·|—] /)[0].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
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

/* ---------- сбор ---------- */
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

async function collectMetrika() {
  const goals = await goalsList();
  const [day, w7, p7, w28, p28] = await Promise.all([
    windowStats(Y, Y, goals), windowStats(shift(Y, -6), Y, goals), windowStats(shift(Y, -13), shift(Y, -7), goals),
    windowStats(shift(Y, -27), Y, goals), windowStats(shift(Y, -55), shift(Y, -28), goals),
  ]);
  const q = (p) => metrika(Object.assign({ date1: Y, date2: Y }, p)).then((r) => r.data).catch(() => []);
  const [engines, pages, cities, devices, behav] = await Promise.all([
    q({ metrics: 'ym:s:visits', dimensions: 'ym:s:lastSearchEngineRoot', filters: "ym:s:lastTrafficSource=='organic'" }),
    q({ metrics: 'ym:s:visits', dimensions: 'ym:s:startURLPath', sort: '-ym:s:visits', limit: '6' }),
    q({ metrics: 'ym:s:users', dimensions: 'ym:s:regionCity', sort: '-ym:s:users', limit: '5' }),
    q({ metrics: 'ym:s:visits', dimensions: 'ym:s:deviceCategory' }),
    metrika({ date1: Y, date2: Y, metrics: 'ym:s:avgVisitDurationSeconds,ym:s:bounceRate,ym:s:pageDepth' }).then((r) => r.totals).catch(() => null),
  ]);
  return { goals, day, w7, p7, w28, p28, engines, pages, cities, devices, behav };
}

async function collectWebmaster() {
  const from60 = shift(today, -60);
  const [summary, diag, inSearch, events, hist] = await Promise.all([
    get(WM + '/summary').catch(() => null),
    get(WM + '/diagnostics').catch(() => null),
    get(WM + `/search-urls/in-search/history?date_from=${shift(today, -30)}&date_to=${today}`).catch(() => null),
    get(WM + '/search-urls/events/samples?limit=50').catch(() => null),
    get(WM + `/search-queries/all/history?query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&date_from=${from60}&date_to=${today}`).catch(() => null),
  ]);
  // Показы по дням. Нули в хвосте — это не «никто не видел», а Вебмастер ещё не досчитал
  let queries = null;
  if (hist && hist.indicators && hist.indicators.TOTAL_SHOWS) {
    const days = hist.indicators.TOTAL_SHOWS.map((p, i) => ({ date: p.date.slice(0, 10), shows: p.value,
      clicks: (hist.indicators.TOTAL_CLICKS[i] || {}).value || 0, pos: (hist.indicators.AVG_SHOW_POSITION[i] || {}).value || 0 }));
    let end = days.length - 1;
    while (end >= 0 && !days[end].shows) end--;
    if (end >= 0) {
      const sum = (a, b) => days.slice(Math.max(0, a), b + 1).reduce((s, d) => ({ shows: s.shows + d.shows, clicks: s.clicks + d.clicks, posW: s.posW + d.pos * d.shows }), { shows: 0, clicks: 0, posW: 0 });
      const cur = sum(end - 6, end), prev = sum(end - 13, end - 7);
      queries = { lastDate: days[end].date, cur, prev, lag: Math.round((Date.parse(today) - Date.parse(days[end].date)) / DAY) };
      const top = await get(WM + `/search-queries/popular?order_by=TOTAL_SHOWS&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&date_from=${shift(queries.lastDate, -6)}&date_to=${queries.lastDate}&limit=5`).catch(() => null);
      queries.top = top ? top.queries.map((x) => ({ text: x.query_text, shows: x.indicators.TOTAL_SHOWS || 0, clicks: x.indicators.TOTAL_CLICKS || 0, pos: x.indicators.AVG_SHOW_POSITION || 0 })) : [];
    }
  }
  const hs = inSearch && inSearch.history ? inSearch.history : [];
  const weekAgo = hs.filter((h) => h.date.slice(0, 10) <= shift(today, -7)).pop();
  return {
    pages: summary ? summary.searchable_pages_count : null,
    pagesWeekAgo: weekAgo ? weekAgo.value : (hs[0] ? hs[0].value : null),
    problems: diag ? Object.entries(diag.problems).filter(([, p]) => p.state === 'PRESENT').map(([k, p]) => ({ code: k, severity: p.severity })) : null,
    events: events ? events.samples.filter((e) => e.event_date.slice(0, 10) >= shift(today, -2)) : [],
    queries,
  };
}

/* ---------- текст ---------- */
function compose(m, w) {
  const L = [];
  const d = m.day;
  const goalLine = (st, g) => st.goals[g.code] ? `${g.words} — ${times(st.goals[g.code])}` : null;
  const zay = d.goals.zayavka || 0;

  L.push(`📊 kor-nil.ru — сводка за ${human(Y)}`, '');
  L.push('КОРОТКО');
  L.push(`• Людей на сайте: ${d.users} (заходов ${d.visits})`);
  L.push(`• Из поиска: ${people(d.search)}`);
  L.push(`• Полезных действий: ${d.useful}${zay ? ` — в том числе ЗАЯВОК: ${zay} ❗` : ''}`);
  if (w && w.pages != null) L.push(`• Страниц сайта в поиске Яндекса: ${w.pages}`);
  L.push('');

  L.push('РАЗБОР', '');
  L.push('Откуда пришли:');
  if (!d.visits) L.push('— никого не было.');
  d.sources.forEach((s) => {
    let t = `— ${SOURCES[s.id] || s.name}: ${s.visits}`;
    if (s.id === 'organic' && m.engines.length) t += ' (' + m.engines.map((e) => `${e.dimensions[0].name} ${e.metrics[0]}`).join(', ') + ')';
    L.push(t);
  });
  if (m.pages.length) {
    L.push('', 'На какую страницу попали первой:');
    m.pages.forEach((p) => L.push(`— ${pagePath(p.dimensions[0].name)}: ${p.metrics[0]}`));
  }
  L.push('', 'Что сделали (цели):');
  const done = m.goals.map((g) => goalLine(d, g)).filter(Boolean);
  if (done.length) done.forEach((t) => L.push('— ' + t)); else L.push(d.visits ? '— ничего: посмотрели и ушли.' : '— нечего считать.');
  if (m.behav && d.visits) {
    const [sec, bounce, depth] = m.behav.map(Number);
    L.push('', `Как смотрели: в среднем ${dur(sec)} на сайте, ${depth.toFixed(1).replace('.', ',')} стр. за заход; ушли почти сразу (меньше 15 секунд) — ${Math.round(bounce)}% заходов.`);
  }
  if (m.cities.length) L.push(`Откуда люди: ${m.cities.map((c) => `${c.dimensions[0].name || 'не определён'} ${c.metrics[0]}`).join(', ')}.`);
  if (m.devices.length) L.push(`С чего смотрели: ${m.devices.map((c) => `${(c.dimensions[0].name || '').toLowerCase()} ${c.metrics[0]}`).join(', ')}.`);

  L.push('', 'Поиск Яндекса (Вебмастер):');
  if (!w) L.push('— Вебмастер не ответил, в этот раз без него.');
  else {
    const q = w.queries;
    if (q) {
      const ctr = q.cur.shows ? (q.cur.clicks / q.cur.shows * 100).toFixed(1).replace('.', ',') : '0';
      const pos = q.cur.shows ? (q.cur.posW / q.cur.shows).toFixed(1).replace('.', ',') : '—';
      L.push(`— за неделю по ${human(q.lastDate)}: сайт показали в поиске ${q.cur.shows} ${plural(q.cur.shows, 'раз', 'раза', 'раз')} (неделей раньше ${q.prev.shows}), кликнули ${q.cur.clicks} (${ctr}% показов).`
        + (q.cur.posW > 0 ? ` Среднее место в выдаче ${pos} (1–10 — первая страница).` : ''));
      if (q.lag > 5) L.push(`— ⚠ Вебмастер не обновлял эти цифры ${q.lag} ${plural(q.lag, 'день', 'дня', 'дней')} — у Яндекса задержка, свежее появится позже.`);
      if (q.top.length) {
        L.push('— Что искали, когда видели сайт:');
        q.top.forEach((x) => L.push(`   «${x.text}» — показов ${x.shows}, кликов ${x.clicks}, место ${x.pos ? x.pos.toFixed(0) : '—'}`));
      }
    } else L.push('— по запросам данных пока нет.');
    if (w.pages != null) L.push(`— Страниц в поиске: ${w.pages}${w.pagesWeekAgo != null ? ` (неделю назад ${w.pagesWeekAgo})` : ''}.`);
    const appeared = w.events.filter((e) => e.event === 'APPEARED_IN_SEARCH'), removed = w.events.filter((e) => e.event !== 'APPEARED_IN_SEARCH');
    if (appeared.length) L.push('— Новые в поиске: ' + appeared.map((e) => pagePath(new URL(e.url).pathname)).join(', ') + '.');
    if (removed.length) L.push('— Выпали из поиска: ' + removed.map((e) => pagePath(new URL(e.url).pathname)).join(', ') + '.');
    if (w.problems && w.problems.length) {
      L.push('— Что Яндекс считает недочётами:');
      w.problems.forEach((p) => L.push(`   ${p.severity === 'FATAL' || p.severity === 'CRITICAL' ? '🔴' : '•'} ${PROBLEMS[p.code] || 'замечание Яндекса (код ' + p.code + ')'}`));
    } else if (w.problems) L.push('— Проблем Яндекс не видит.');
  }

  // Вывод: неделя к неделе — люди, поиск, полезные действия, показы и страницы в поиске
  const sig = [
    ['людей', m.w7.users, m.p7.users], ['из поиска', m.w7.search, m.p7.search], ['полезных действий', m.w7.useful, m.p7.useful],
  ];
  if (w && w.queries && w.queries.lag <= 10) sig.push(['показов в Яндексе', w.queries.cur.shows, w.queries.prev.shows]);
  if (w && w.pages != null && w.pagesWeekAgo != null) sig.push(['страниц в поиске', w.pages, w.pagesWeekAgo]);
  const dir = (a, b) => (a - b >= Math.max(2, 0.15 * b) ? 1 : b - a >= Math.max(2, 0.15 * b) ? -1 : 0);
  const ups = sig.filter(([, a, b]) => dir(a, b) > 0), downs = sig.filter(([, a, b]) => dir(a, b) < 0);

  L.push('', 'ЗАКЛЮЧЕНИЕ', '');
  L.push('Последние 7 дней против 7 дней до них:');
  sig.forEach(([n, a, b]) => L.push(`— ${n}: ${b} → ${a} (${change(a, b)})`));
  L.push(`За 4 недели: людей ${m.w28.users} (до этого ${m.p28.users}), из поиска ${m.w28.search} (до этого ${m.p28.search}), полезных действий ${m.w28.useful} (до этого ${m.p28.useful}).`);
  let verdict;
  if (ups.length > downs.length) verdict = `📈 Сайт РАСТЁТ: больше ${ups.map((x) => x[0]).join(', ')}.`;
  else if (downs.length > ups.length) verdict = `📉 Сайт ЗАТУХАЕТ: меньше ${downs.map((x) => x[0]).join(', ')}.`;
  else if (ups.length) verdict = `➖ Сайт ДЕРЖИТСЯ НА МЕСТЕ: больше ${ups.map((x) => x[0]).join(', ')}, но меньше ${downs.map((x) => x[0]).join(', ')} — одно уравновешивает другое.`;
  else verdict = '➖ Сайт ДЕРЖИТСЯ НА МЕСТЕ: заметных перемен за неделю нет.';
  L.push('', verdict);
  if (m.w7.users < 30) L.push('Чисел пока мало, поэтому по одному дню выводов не делаю — только неделя к неделе.');
  return L.join('\n');
}

/* ---------- отправка ---------- */
async function main() {
  const stateFile = path.join(HERE, 'last-sent.txt');
  if (!DRY && !FORCE && fs.existsSync(stateFile) && fs.readFileSync(stateFile, 'utf8').trim() === today) { console.log(today, 'уже отправлено'); return; }
  let text;
  try {
    const [m, w] = await Promise.all([collectMetrika(), collectWebmaster().catch(() => null)]);
    text = compose(m, w);
  } catch (e) {
    console.error(new Date().toISOString(), 'сбор не удался:', e.message);
    text = `📊 kor-nil.ru — сводку за ${human(Y)} собрать не удалось: Метрика не ответила (${String(e.message).slice(0, 80)}). Завтра попробую снова.`;
  }
  if (DRY) { console.log(text); return; }
  require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
  const { sendKorNilMessage } = require(path.join(BACKEND, 'services/kor_nil_bot'));
  const r = await sendKorNilMessage(null, text);
  console.log(new Date().toISOString(), 'отправка:', JSON.stringify(r));
  if (r && r.ok) fs.writeFileSync(stateFile, today);
  // Пуш уходит в фоне — даём ему время, потом выходим (таймеры бэкенда держат процесс)
  await new Promise((res) => setTimeout(res, 8000));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
