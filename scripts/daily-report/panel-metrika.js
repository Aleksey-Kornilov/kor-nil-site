// Числа Метрики для сводки в панели kor-nil.ru/admin/. Ключ Яндекса остаётся на сервере: браузер получает
// готовый файл admin/metrika.json, закрытый той же сессией, что и панель. Только суммы, данных людей нет.
// Запуск: cron раз в час; `node panel-metrika.js --dry` печатает файл, ничего не записывая.
'use strict';
const { fs, path, today, shift, metrika, goalsList, windowStats, pagePath } = require('./common');

const SITE = process.env.KOR_NIL_SITE || '/root/kor-nil-site';
const FAJL = path.join(SITE, 'admin', 'metrika.json');
// Закрытые разделы и страницы по скрытым ссылкам — не аудитория сайта.
const SKRYTO = /^\/(dom|d-[0-9a-f]+|otzyv|admin)(\/|$)/;

async function sutki(d1, d2) {
  const r = await metrika({ date1: d1, date2: d2, metrics: 'ym:s:visits,ym:s:users', dimensions: 'ym:s:date', sort: 'ym:s:date', limit: '100' });
  const po = new Map(r.data.map((x) => [x.dimensions[0].name, x.metrics]));
  const dni = [];
  for (let d = d1; d <= d2; d = shift(d, 1)) {
    const m = po.get(d) || [0, 0];
    dni.push({ d, vizity: m[0], lyudi: m[1] });
  }
  return dni;
}

async function stranicy(d1, d2) {
  const r = await metrika({ date1: d1, date2: d2, metrics: 'ym:pv:pageviews', dimensions: 'ym:pv:URLPath', sort: '-ym:pv:pageviews', limit: '30' });
  return r.data
    .filter((x) => !SKRYTO.test(x.dimensions[0].name))
    .slice(0, 7)
    .map((x) => ({ nazvanie: pagePath(x.dimensions[0].name), adres: x.dimensions[0].name, prosmotry: x.metrics[0] }));
}

async function sobrat() {
  const celi = await goalsList();
  const okno = (ot, do_) => windowStats(shift(today, ot), shift(today, do_), celi);
  const [n7, b7, n30, b30, dni, str] = await Promise.all([
    okno(-6, 0), okno(-13, -7), okno(-29, 0), okno(-59, -30),
    sutki(shift(today, -29), today), stranicy(shift(today, -29), today),
  ]);
  const period = (seichas, bylo) => ({ vizity: seichas.visits, lyudi: seichas.users, iz_poiska: seichas.search, bylo_vizity: bylo.visits });
  return {
    obnovleno: new Date().toISOString(),
    periody: { n7: period(n7, b7), n30: period(n30, b30) },
    sutki: dni,
    istochniki: n30.sources.filter((x) => x.visits > 0).slice(0, 6).map((x) => ({ nazvanie: x.name, vizity: x.visits })),
    stranicy: str,
    celi: celi.map((g) => ({ nazvanie: g.words, n7: n7.goals[g.code] || 0, n30: n30.goals[g.code] || 0 })),
  };
}

sobrat().then((dannye) => {
  const tekst = JSON.stringify(dannye);
  if (process.argv.includes('--dry')) return console.log(JSON.stringify(dannye, null, 1));
  // Через временный файл: панель не прочитает записанное наполовину.
  const vremennyj = `${FAJL}.tmp`;
  fs.writeFileSync(vremennyj, tekst, { mode: 0o644 });
  fs.renameSync(vremennyj, FAJL);
}).catch((e) => {
  console.error(new Date().toISOString(), 'panel-metrika:', e.message);
  process.exitCode = 1;
});
