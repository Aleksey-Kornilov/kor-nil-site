// Дневная сводка: вчерашний день, вывод — последние 7 дней против 7 дней до них.
'use strict';
const C = require('./common');
const { Y, shift, today, human, metrika, wm, plural, people, times, dur, num1, change, pagePath, SOURCES } = C;

async function collectMetrika() {
  const goals = await C.goalsList();
  const [day, w7, p7, w28, p28] = await Promise.all([
    C.windowStats(Y, Y, goals), C.windowStats(shift(Y, -6), Y, goals), C.windowStats(shift(Y, -13), shift(Y, -7), goals),
    C.windowStats(shift(Y, -27), Y, goals), C.windowStats(shift(Y, -55), shift(Y, -28), goals),
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
  const [summary, probs, inSearch, events, qd] = await Promise.all([
    wm('/summary').catch(() => null),
    C.problems().catch(() => null),
    wm(`/search-urls/in-search/history?date_from=${shift(today, -30)}&date_to=${today}`).catch(() => null),
    wm('/search-urls/events/samples?limit=50').catch(() => null),
    C.queryDays(shift(today, -60), today).catch(() => null),
  ]);
  let queries = null;
  if (qd && qd.lastDate) {
    const end = qd.lastDate;
    queries = { lastDate: end, cur: C.sumDays(qd.days, shift(end, -6), end), prev: C.sumDays(qd.days, shift(end, -13), shift(end, -7)),
      lag: Math.round((Date.parse(today) - Date.parse(end)) / C.DAY) };
    queries.top = await C.popular(shift(end, -6), end, 5).catch(() => []);
  }
  const hs = inSearch && inSearch.history ? inSearch.history : [];
  const weekAgo = hs.filter((h) => h.date.slice(0, 10) <= shift(today, -7)).pop();
  return {
    pages: summary ? summary.searchable_pages_count : null,
    pagesWeekAgo: weekAgo ? weekAgo.value : (hs[0] ? hs[0].value : null),
    problems: probs,
    events: events ? events.samples.filter((e) => e.event_date.slice(0, 10) >= shift(today, -2)) : [],
    queries,
  };
}

function compose(m, w) {
  const L = [];
  const d = m.day;
  const goalLine = (st, g) => (st.goals[g.code] ? `${g.words} — ${times(st.goals[g.code])}` : null);
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
    L.push('', `Как смотрели: в среднем ${dur(sec)} на сайте, ${num1(depth)} стр. за заход; ушли почти сразу (меньше 15 секунд) — ${Math.round(bounce)}% заходов.`);
  }
  if (m.cities.length) L.push(`Откуда люди: ${m.cities.map((c) => `${c.dimensions[0].name || 'не определён'} ${c.metrics[0]}`).join(', ')}.`);
  if (m.devices.length) L.push(`С чего смотрели: ${C.deviceLine(m.devices)}.`);

  L.push('', 'Поиск Яндекса (Вебмастер):');
  if (!w) L.push('— Вебмастер не ответил, в этот раз без него.');
  else {
    const q = w.queries;
    if (q) {
      const ctr = q.cur.shows ? num1(q.cur.clicks / q.cur.shows * 100) : '0';
      L.push(`— за неделю по ${human(q.lastDate)}: сайт показали в поиске ${q.cur.shows} ${plural(q.cur.shows, 'раз', 'раза', 'раз')} (неделей раньше ${q.prev.shows}), кликнули ${q.cur.clicks} (${ctr}% показов).`
        + (q.cur.posW > 0 ? ` Среднее место в выдаче ${num1(q.cur.posW / q.cur.shows)} (1–10 — первая страница).` : ''));
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
      w.problems.forEach((p) => L.push(C.problemLine(p)));
    } else if (w.problems) L.push('— Проблем Яндекс не видит.');
  }

  // Вывод: неделя к неделе — люди, поиск, полезные действия, показы и страницы в поиске
  const sig = [['людей', m.w7.users, m.p7.users], ['из поиска', m.w7.search, m.p7.search], ['полезных действий', m.w7.useful, m.p7.useful]];
  if (w && w.queries && w.queries.lag <= 10) sig.push(['показов в Яндексе', w.queries.cur.shows, w.queries.prev.shows]);
  if (w && w.pages != null && w.pagesWeekAgo != null) sig.push(['страниц в поиске', w.pages, w.pagesWeekAgo]);

  L.push('', 'ЗАКЛЮЧЕНИЕ', '');
  L.push('Последние 7 дней против 7 дней до них:');
  sig.forEach(([n, a, b]) => L.push(`— ${n}: ${b} → ${a} (${change(a, b)})`));
  L.push(`За 4 недели: людей ${m.w28.users} (до этого ${m.p28.users}), из поиска ${m.w28.search} (до этого ${m.p28.search}), полезных действий ${m.w28.useful} (до этого ${m.p28.useful}).`);
  L.push('', C.verdict(sig, 'неделю').text);
  if (m.w7.users < 30) L.push('Чисел пока мало, поэтому по одному дню выводов не делаю — только неделя к неделе.');
  return L.join('\n');
}

async function daily() {
  const [m, w] = await Promise.all([collectMetrika(), collectWebmaster().catch(() => null)]);
  return compose(m, w);
}

module.exports = { daily };
