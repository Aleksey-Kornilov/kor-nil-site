// Сводка за период: неделя (по понедельникам), месяц (1-го числа), квартал (1 января, апреля, июля, октября).
// Тот же порядок, что в дневной: коротко → разбор → заключение, плюс тренд и «что стоит сделать».
'use strict';
const C = require('./common');
const { today, shift, human, metrika, wm, plural, times, dur, num1, change, pagePath, SOURCES, SINCE } = C;

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const monthStart = (s) => s.slice(0, 8) + '01';
const prevMonth = (s) => { const end = shift(monthStart(s), -1); return [monthStart(end), end]; };
const quarterStart = (s) => s.slice(0, 5) + String(Math.floor((+s.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0') + '-01';
const prevQuarter = (s) => { const end = shift(quarterStart(s), -1); return [quarterStart(end), end]; };
const dayOfWeek = (s) => new Date(s + 'T12:00:00Z').getUTCDay();

// Прошлый полный период и все предыдущие для тренда: [[d1, d2], …], последний — отчётный
function periods(kind) {
  const list = [];
  if (kind === 'week') {
    const dow = dayOfWeek(today);
    let end = shift(today, -(dow === 0 ? 7 : dow));
    for (let i = 0; i < 4; i++) { list.unshift([shift(end, -6), end]); end = shift(end, -7); }
  } else if (kind === 'month') {
    let r = prevMonth(today);
    for (let i = 0; i < 6; i++) { list.unshift(r); r = prevMonth(r[0]); }
  } else {
    let r = prevQuarter(today);
    for (let i = 0; i < 4; i++) { list.unshift(r); r = prevQuarter(r[0]); }
  }
  return list;
}
const WORDS = {
  week: { span: 'неделю', this: 'эту неделю', prev: 'прошлой неделей', series: 'по неделям' },
  month: { span: 'месяц', this: 'этот месяц', prev: 'прошлым месяцем', series: 'по месяцам' },
  quarter: { span: 'квартал', this: 'этот квартал', prev: 'прошлым кварталом', series: 'по кварталам' },
};
function label(kind, [d1, d2]) {
  if (kind === 'week') return `неделя ${human(d1)} — ${human(d2)}`;
  if (kind === 'month') return `${MONTHS[+d1.slice(5, 7) - 1]} ${d1.slice(0, 4)}`;
  return `${Math.floor((+d1.slice(5, 7) - 1) / 3) + 1}-й квартал ${d1.slice(0, 4)} (${MONTHS[+d1.slice(5, 7) - 1]} — ${MONTHS[+d2.slice(5, 7) - 1]})`;
}
const shortLabel = (kind, [d1, d2]) => (kind === 'week' ? `${+d1.slice(8)}.${d1.slice(5, 7)}` : kind === 'month' ? MONTHS[+d1.slice(5, 7) - 1].slice(0, 3) : `${Math.floor((+d1.slice(5, 7) - 1) / 3) + 1}кв`);

async function collect(kind) {
  const list = periods(kind);
  const P = list[list.length - 1], Q = list[list.length - 2];
  const goals = await C.goalsList();
  const series = await Promise.all(list.map(([a, b]) => C.windowStats(a, b, goals)));
  const cur = series[series.length - 1], prev = series[series.length - 2];
  const q = (range, p) => metrika(Object.assign({ date1: range[0], date2: range[1] }, p)).then((r) => r.data).catch(() => []);
  const [byDay, viewsP, viewsQ, engines, cities, devices, behav] = await Promise.all([
    q(P, { metrics: 'ym:s:users', dimensions: 'ym:s:date', sort: 'ym:s:date', limit: '100' }),
    q(P, { metrics: 'ym:pv:pageviews', dimensions: 'ym:pv:URLPath', sort: '-ym:pv:pageviews', limit: '8' }),
    q(Q, { metrics: 'ym:pv:pageviews', dimensions: 'ym:pv:URLPath', sort: '-ym:pv:pageviews', limit: '100' }),
    q(P, { metrics: 'ym:s:visits', dimensions: 'ym:s:lastSearchEngineRoot', filters: "ym:s:lastTrafficSource=='organic'" }),
    q(P, { metrics: 'ym:s:users', dimensions: 'ym:s:regionCity', sort: '-ym:s:users', limit: '5' }),
    q(P, { metrics: 'ym:s:visits', dimensions: 'ym:s:deviceCategory' }),
    metrika({ date1: P[0], date2: P[1], metrics: 'ym:s:avgVisitDurationSeconds,ym:s:bounceRate,ym:s:pageDepth' }).then((r) => r.totals.map(Number)).catch(() => null),
  ]);
  // Лучший день — и почему: с какой страницы и откуда пришли в тот день
  const days = byDay.map((r) => ({ date: r.dimensions[0].name, users: r.metrics[0] }));
  const best = days.slice().sort((a, b) => b.users - a.users)[0] || null;
  let bestWhy = null;
  if (best && best.users > 0) {
    const [pg, src] = await Promise.all([
      q([best.date, best.date], { metrics: 'ym:s:visits', dimensions: 'ym:s:startURLPath', sort: '-ym:s:visits', limit: '1' }),
      q([best.date, best.date], { metrics: 'ym:s:visits', dimensions: 'ym:s:lastTrafficSource', sort: '-ym:s:visits', limit: '1' }),
    ]);
    bestWhy = { page: pg[0] ? pg[0].dimensions[0].name : null, source: src[0] ? src[0].dimensions[0].id : null };
  }
  const nDays = Math.round((Date.parse(P[1]) - Date.parse(P[0])) / C.DAY) + 1;
  const empty = nDays - days.filter((d) => d.users > 0).length;
  const prevViews = Object.fromEntries(viewsQ.map((r) => [r.dimensions[0].name, r.metrics[0]]));
  return { list, P, Q, goals, series, cur, prev, days, best, bestWhy, empty, nDays,
    views: viewsP.map((r) => ({ path: r.dimensions[0].name, n: r.metrics[0], before: prevViews[r.dimensions[0].name] || 0 })),
    engines, cities, devices, behav };
}

async function collectWm(P, Q) {
  const [qd, probs, inSearch, events] = await Promise.all([
    C.queryDays(Q[0], today).catch(() => null),
    C.problems().catch(() => null),
    // Число страниц в поиске Яндекс отмечает раз в несколько дней — берём историю с запасом
    wm(`/search-urls/in-search/history?date_from=${shift(Q[0], -60)}&date_to=${today}`).catch(() => null),
    wm('/search-urls/events/samples?limit=100').catch(() => null),
  ]);
  const out = { problems: probs, events: events ? events.samples.filter((e) => e.event_date.slice(0, 10) >= P[0] && e.event_date.slice(0, 10) <= P[1]) : [] };
  const hs = inSearch && inSearch.history ? inSearch.history : [];
  const at = (d) => { const h = hs.filter((x) => x.date.slice(0, 10) <= d).pop(); return h ? h.value : null; };
  out.pagesEnd = at(P[1]); out.pagesStart = at(Q[1]);
  if (qd && qd.lastDate) {
    out.lastDate = qd.lastDate;
    out.cur = C.sumDays(qd.days, P[0], P[1]); out.prev = C.sumDays(qd.days, Q[0], Q[1]);
    out.covered = qd.lastDate >= P[1];
    if (out.cur.n) {
      const [top, before] = await Promise.all([C.popular(P[0], P[1], 8).catch(() => []), C.popular(Q[0], Q[1], 100).catch(() => [])]);
      const was = Object.fromEntries(before.map((x) => [x.text, x.pos]));
      out.top = top.map((x) => Object.assign(x, { before: was[x.text] || null }));
    }
  }
  return out;
}

// Что стоит сделать — простые правила по цифрам, не больше трёх советов
function hints(m, w) {
  const out = [];
  const zay = m.cur.goals.zayavka || 0;
  if (zay) out.push(`Были заявки (${zay}) — проверь, что на все ответил.`);
  if (w && w.problems && w.problems.some(C.isUrgent)) out.push('Яндекс видит серьёзную проблему (🔴 выше) — её чинить в первую очередь.');
  const near = w && w.top ? w.top.filter((x) => x.shows >= 5 && x.pos >= 8 && x.pos <= 20) : [];
  if (near.length) out.push(`Почти на первой странице поиска: ${near.slice(0, 2).map((x) => `«${x.text}» (место ${x.pos.toFixed(0)})`).join(', ')} — эти страницы стоит усилить: текст, заголовок, пример расчёта.`);
  if (m.cur.users >= 10 && m.cur.useful === 0) out.push('Люди заходят, но ничего не делают — посмотреть в Вебвизоре, на чём уходят.');
  if (m.cur.search < m.prev.search - 2) out.push('Из поиска пришло меньше — проверить, не выпали ли страницы из поиска (ниже в разборе).');
  if (!out.length) out.push('Особых действий не нужно — продолжаем: новые статьи, калькуляторы, посты со ссылками.');
  return out.slice(0, 3);
}

function compose(kind, m, w) {
  const W = WORDS[kind], L = [], c = m.cur, p = m.prev;
  // Прошлый период целиком до появления счётчика — сравнивать не с чем
  const noPrev = m.Q[1] < SINCE;
  const was = (n) => (noPrev ? '' : ` — перед этим ${n}`);
  const zay = c.goals.zayavka || 0;
  L.push(`📅 kor-nil.ru — итоги: ${label(kind, m.P)}`, '');
  L.push('КОРОТКО');
  L.push(`• Людей: ${c.users} (заходов ${c.visits})${was(p.users)}`);
  L.push(`• Из поиска: ${c.search}${was(p.search)}`);
  L.push(`• Полезных действий: ${c.useful}${was(p.useful)}${zay ? `; ЗАЯВОК: ${zay} ❗` : ''}`);
  if (w && w.pagesEnd != null) L.push(`• Страниц в поиске Яндекса: ${w.pagesEnd}${w.pagesStart != null ? ` (было ${w.pagesStart})` : ''}`);
  L.push('', 'РАЗБОР', '');

  if (m.best && m.best.users > 0) {
    const why = m.bestWhy ? ` — пришли в основном ${SOURCES[m.bestWhy.source] || 'разными путями'}${m.bestWhy.page ? `, первая страница «${pagePath(m.bestWhy.page)}»` : ''}` : '';
    L.push(`Лучший день: ${human(m.best.date)}, ${m.best.users} ${plural(m.best.users, 'человек', 'человека', 'человек')}${why}.`);
  }
  if (m.empty) L.push(`Дней совсем без посетителей: ${m.empty} из ${m.nDays}.`);
  L.push('', 'Откуда пришли:');
  if (!c.visits) L.push('— никого не было.');
  c.sources.forEach((s) => {
    const before = (p.sources.find((x) => x.id === s.id) || {}).visits || 0;
    let t = `— ${SOURCES[s.id] || s.name}: ${s.visits}` + (noPrev ? '' : ` (перед этим ${before})`);
    if (s.id === 'organic' && m.engines.length) t += ' — ' + m.engines.map((e) => `${e.dimensions[0].name} ${e.metrics[0]}`).join(', ');
    L.push(t);
  });
  if (m.views.length) {
    L.push('', 'Что смотрели больше всего (просмотры' + (noPrev ? '):' : ', в скобках — перед этим):'));
    m.views.forEach((v) => L.push(`— ${pagePath(v.path)}: ${v.n}` + (noPrev ? '' : ` (${v.before})`)));
  }
  L.push('', 'Что сделали (цели)' + (noPrev ? ':' : ', в скобках — перед этим:'));
  const done = m.goals.filter((g) => c.goals[g.code] || p.goals[g.code]);
  if (done.length) done.forEach((g) => L.push(`— ${g.words}: ${times(c.goals[g.code] || 0)}` + (noPrev ? '' : ` (${p.goals[g.code] || 0})`)));
  else L.push('— никто ничего не сделал.');
  if (m.behav && c.visits) L.push('', `Как смотрели: в среднем ${C.dur(m.behav[0])} на сайте, ${num1(m.behav[2])} стр. за заход; ушли почти сразу — ${Math.round(m.behav[1])}% заходов.`);
  if (m.cities.length) L.push(`Откуда люди: ${m.cities.map((x) => `${x.dimensions[0].name || 'не определён'} ${x.metrics[0]}`).join(', ')}.`);
  if (m.devices.length) L.push(`С чего смотрели: ${C.deviceLine(m.devices)}.`);

  L.push('', 'Поиск Яндекса (Вебмастер):');
  if (!w) L.push('— Вебмастер не ответил, в этот раз без него.');
  else {
    if (w.cur && w.cur.n) {
      const ctr = w.cur.shows ? num1(w.cur.clicks / w.cur.shows * 100) : '0';
      L.push(`— показали в поиске ${w.cur.shows} ${plural(w.cur.shows, 'раз', 'раза', 'раз')} (перед этим ${w.prev.shows}), кликнули ${w.cur.clicks} (${ctr}% показов)`
        + (w.cur.posW > 0 ? `, среднее место ${num1(w.cur.posW / w.cur.shows)}` : '') + '.');
      if (!w.covered) L.push(`— ⚠ Вебмастер пока дал данные только по ${human(w.lastDate)} — за остальные дни цифр ещё нет.`);
      if (w.top && w.top.length) {
        L.push('— Главные запросы (место в выдаче, в скобках — было):');
        w.top.forEach((x) => {
          const mv = x.before == null ? 'новый' : Math.round(x.before) > Math.round(x.pos) ? `↑ было ${x.before.toFixed(0)}` : Math.round(x.before) < Math.round(x.pos) ? `↓ было ${x.before.toFixed(0)}` : 'без изменений';
          L.push(`   «${x.text}» — показов ${x.shows}, кликов ${x.clicks}, место ${x.pos.toFixed(0)} (${mv})`);
        });
      }
    } else L.push(`— за ${W.this} Вебмастер ещё не дал цифр по запросам${w.lastDate ? ` (последние — по ${human(w.lastDate)})` : ''}.`);
    const appeared = w.events.filter((e) => e.event === 'APPEARED_IN_SEARCH'), removed = w.events.filter((e) => e.event !== 'APPEARED_IN_SEARCH');
    if (appeared.length) L.push(`— Появились в поиске (${appeared.length}): ` + appeared.slice(0, 8).map((e) => pagePath(new URL(e.url).pathname)).join(', ') + (appeared.length > 8 ? ' и др.' : '.'));
    if (removed.length) L.push(`— Выпали из поиска (${removed.length}): ` + removed.slice(0, 8).map((e) => pagePath(new URL(e.url).pathname)).join(', ') + '.');
    if (w.problems && w.problems.length) { L.push('— Что Яндекс считает недочётами:'); w.problems.forEach((x) => L.push(C.problemLine(x))); }
  }

  const sig = [['людей', c.users, p.users], ['из поиска', c.search, p.search], ['полезных действий', c.useful, p.useful]];
  if (w && w.cur && w.cur.n && w.covered && w.prev.n) sig.push(['показов в Яндексе', w.cur.shows, w.prev.shows]);
  if (w && w.pagesEnd != null && w.pagesStart != null) sig.push(['страниц в поиске', w.pagesEnd, w.pagesStart]);
  L.push('', 'ЗАКЛЮЧЕНИЕ', '');
  if (!noPrev) {
    L.push(`Сравнение с ${W.prev}:`);
    sig.forEach(([n, a, b]) => L.push(`— ${n}: ${b} → ${a} (${change(a, b)})`));
  }
  // В тренде — только отрезки, когда счётчик уже стоял
  const tr = m.list.map((r, i) => [r, m.series[i]]).filter(([r]) => r[1] >= SINCE);
  if (tr.length > 1) {
    L.push('', `Тренд ${W.series} (людей / из поиска / полезных):`);
    L.push(tr.map(([r, x]) => `${shortLabel(kind, r)}: ${x.users}/${x.search}/${x.useful}`).join(' → '));
    if (tr[0][0][0] < SINCE) L.push(`(счётчик стоит с ${human(SINCE)} — первый отрезок неполный)`);
  }
  if (L[L.length - 1] !== '') L.push('');
  L.push(noPrev ? `Сравнивать пока не с чем: счётчик стоит с ${human(SINCE)}. Этот ${W.span} — точка отсчёта, со следующим будет видно, растёт сайт или нет.` : C.verdict(sig, W.span).text);
  if (c.users < 30) L.push('Чисел пока мало — смотри на тренд выше, а не на одно сравнение.');
  L.push('', 'Что стоит сделать:');
  hints(m, w).forEach((h) => L.push('— ' + h));
  return L.join('\n');
}

async function periodReport(kind) {
  const m = await collect(kind);
  const w = await collectWm(m.P, m.Q).catch(() => null);
  return compose(kind, m, w);
}

// Какую сводку слать сегодня: из совпавших — самую крупную
function kindForToday() {
  const d = +today.slice(8), mo = +today.slice(5, 7);
  if (d === 1 && [1, 4, 7, 10].includes(mo)) return 'quarter';
  if (d === 1) return 'month';
  if (dayOfWeek(today) === 1) return 'week';
  return 'day';
}

module.exports = { periodReport, kindForToday };
