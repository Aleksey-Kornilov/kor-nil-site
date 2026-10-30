// report.js — из фактов обхода (crawl.js) делает отчёт: группы пунктов «в порядке / замечание / проблема».
// Тексты для владельца сайта, не для SEO-шника: что не так и почему это важно, без жаргона.

const OK = 'ok', WARN = 'warn', BAD = 'bad';
const SPISOK = 10;

const put = (url) => { try { const u = new URL(url); return decodeURI(u.pathname + u.search); } catch { return url; } };
const spisok = (arr, fn = put) => {
  const s = arr.slice(0, SPISOK).map(fn);
  if (arr.length > SPISOK) s.push(`… и ещё ${arr.length - SPISOK}`);
  return s;
};
const mb = (b) => (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
const kb = (b) => (b < 1024 ? 'меньше 1 КБ' : Math.round(b / 1024) + ' КБ');
const sek = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' с';
function slovo(n, f1, f2, f5) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return f5;
  if (b > 1 && b < 5) return f2;
  if (b === 1) return f1;
  return f5;
}

const POCHEMU = {
  robots: 'robots.txt — первое, что читает поисковый робот: что можно обходить, что нет и где карта сайта.',
  robotsZakryt: 'Сайт целиком закрыт от поиска — ни Яндекс, ни Google его не покажут. Так бывает, когда сайт сделали на тестовом адресе и забыли открыть.',
  sitemap: 'Карта сайта (sitemap.xml) — список страниц для робота. Без неё новые страницы попадают в поиск медленнее, а глубокие могут не попасть вовсе.',
  https: 'Без https браузер пишет «Не защищено», а поисковики ставят такие сайты ниже.',
  httpRedirect: 'Если сайт открывается и по http, и по https, для поиска это две копии одного сайта — вес делится, в выдаче может оказаться не та.',
  www: 'Адрес с www и без www — для поиска разные сайты. Один из них должен перенаправлять на другой, иначе снова две копии.',
  canonical: 'canonical говорит поиску, какой адрес у страницы главный. Если он указывает на другую страницу, поиск может показать её вместо этой.',
  noindex: 'Запрет noindex прямо просит поиск не показывать страницу. Если так задумано — всё в порядке.',
  title: 'Заголовок (title) — синяя строка в выдаче. По нему человек решает, нажать или нет. Яндекс показывает примерно 60–70 символов, остальное обрезает.',
  description: 'Описание (description) — серый текст под заголовком в выдаче. Без него поиск возьмёт случайный кусок со страницы.',
  og: 'Когда ссылку присылают в ВК или Telegram, картинку и заголовок превью берут из OG-тегов. Без них ссылка выглядит голой строкой.',
  h1: 'h1 — главный заголовок на самой странице. Поиск по нему понимает, о чём она. Нужен ровно один.',
  alt: 'Подпись картинки (alt) читают поиск по картинкам и программы для незрячих. Без неё картинка для поиска — пустое место.',
  jsonld: 'Разметка (JSON-LD) объясняет поиску, что на странице: организация, товар, статья, адрес. За неё дают расширенные сниппеты — звёзды, цены, хлебные крошки.',
  viewport: 'Без тега viewport телефон показывает сайт мелко, как на компьютере. Больше половины посетителей сейчас с телефона, и поиск это учитывает.',
  lang: 'Язык страницы (lang) нужен браузеру для перевода и озвучки, поиску — чтобы не ошибиться с языком.',
  ttfb: 'Сколько сервер думает, прежде чем начать отдавать страницу. Больше секунды — посетитель уже ждёт, поиск это видит.',
  ves: 'Тяжёлая страница долго открывается на мобильном интернете. Обычно виноваты большие картинки — их можно сжать в разы без потери вида.',
  szhatie: 'Сжатие (gzip или brotli) уменьшает страницу при передаче в 3–5 раз. Включается одной настройкой сервера.',
  dubliTitle: 'Одинаковые заголовки — поиск не понимает, какую из страниц показывать, и показывает какую-то одну. Остальные теряют шансы.',
  dubliDesc: 'Одинаковые описания — в выдаче страницы выглядят одинаково, и человеку не из чего выбрать.',
  bitye: 'Битая ссылка ведёт на несуществующую страницу. Посетитель упирается в ошибку, а робот тратит время обхода впустую.',
  redirekty: 'Эти адреса перенаправляют на другие. Работает, но каждое — лишняя задержка для посетителя и для робота. Лучше ставить сразу конечный адрес.',
  zakrytyeRobots: 'Эти страницы закрыты в robots.txt и в поиск не попадут. Если так задумано — всё в порядке.',
};

const p = (level, text, pochemu, detali) => ({ level, text, why: pochemu ? POCHEMU[pochemu] : undefined, details: detali?.length ? detali : undefined });

export function sobratOtchet(f) {
  const g = f.stranicy[0];
  const html = f.stranicy.filter((s) => s.status === 200 && s.title !== undefined);
  const gruppy = [];

  // — Видит ли поиск сайт —
  const poisk = [];
  if (!f.robots.est) poisk.push(p(WARN, 'robots.txt не найден', 'robots'));
  else if (f.robots.zakrytSajt) poisk.push(p(BAD, 'robots.txt закрывает весь сайт от поиска', 'robotsZakryt'));
  else if (f.robots.zakrytGlavnaya) poisk.push(p(BAD, 'robots.txt закрывает главную страницу', 'robotsZakryt'));
  else poisk.push(p(OK, 'robots.txt на месте и не мешает поиску'));
  if (!f.sitemap.najden) poisk.push(p(WARN, 'Карта сайта (sitemap.xml) не найдена', 'sitemap'));
  else if (f.sitemap.chuzhie) poisk.push(p(WARN, `В карте сайта ${f.sitemap.chuzhie} ${slovo(f.sitemap.chuzhie, 'адрес', 'адреса', 'адресов')} с другим доменом или http`, 'sitemap'));
  else poisk.push(p(OK, `Карта сайта найдена: ${f.sitemap.vsego} ${slovo(f.sitemap.vsego, 'страница', 'страницы', 'страниц')}`));
  if (!f.https) poisk.push(p(BAD, f.httpsOshibka ? `Сайт открывается только по http: ${f.httpsOshibka.toLowerCase()}` : 'Сайт работает без https', 'https'));
  else poisk.push(p(OK, 'Сайт работает по https'));
  if (f.https && f.zerkala.http && !f.zerkala.http.net) {
    const z = f.zerkala.http;
    if (z.status === 200) poisk.push(p(WARN, 'Сайт открывается и по http, без перенаправления на https', 'httpRedirect'));
    else if (z.status >= 300 && z.status < 400) poisk.push(p(OK, 'С http перенаправляет на https'));
  }
  const w = f.zerkala.www;
  if (w && !w.net) {
    if (w.status === 200 && new URL(w.kuda).host !== f.host) poisk.push(p(WARN, `${w.host} открывается отдельно, без перенаправления на ${f.host}`, 'www'));
    else if (w.status >= 300 && w.status < 400) poisk.push(p(OK, `${w.host} перенаправляет на основной адрес`));
  }
  if (g.noindex) poisk.push(p(BAD, 'Главная страница запрещена к показу в поиске (noindex)', 'noindex'));
  if (!g.canonical) poisk.push(p(WARN, 'На главной не указан canonical', 'canonical'));
  else if (g.canonical.replace(/\/$/, '') !== g.url.replace(/\/$/, '')) poisk.push(p(WARN, `canonical главной указывает на другой адрес: ${g.canonical}`, 'canonical'));
  else poisk.push(p(OK, 'canonical указан верно'));
  gruppy.push({ title: 'Видит ли поиск сайт', items: poisk });

  // — Как выглядит в выдаче (главная) —
  const vydacha = [];
  const tl = (g.title || '').length;
  if (!g.title) vydacha.push(p(BAD, 'У главной нет заголовка (title)', 'title'));
  else if (tl > 70) vydacha.push(p(WARN, `Заголовок ${tl} ${slovo(tl, 'символ', 'символа', 'символов')} — в выдаче обрежут`, 'title'));
  else if (tl < 15) vydacha.push(p(WARN, `Заголовок слишком короткий: ${tl} ${slovo(tl, 'символ', 'символа', 'символов')}`, 'title'));
  else vydacha.push(p(OK, `Заголовок ${tl} ${slovo(tl, 'символ', 'символа', 'символов')}`));
  const dl = (g.description || '').length;
  if (!g.description) vydacha.push(p(BAD, 'Нет описания (description)', 'description'));
  else if (dl > 170) vydacha.push(p(WARN, `Описание ${dl} ${slovo(dl, 'символ', 'символа', 'символов')} — в выдаче обрежут`, 'description'));
  else if (dl < 50) vydacha.push(p(WARN, `Описание слишком короткое: ${dl} ${slovo(dl, 'символ', 'символа', 'символов')}`, 'description'));
  else vydacha.push(p(OK, `Описание ${dl} ${slovo(dl, 'символ', 'символа', 'символов')}`));
  if (!g.og.title || !g.og.image) vydacha.push(p(WARN, !g.og.image && !g.og.title ? 'Нет превью для соцсетей (OG-теги)' : 'Превью для соцсетей без ' + (g.og.image ? 'заголовка' : 'картинки'), 'og'));
  else vydacha.push(p(OK, 'Превью для соцсетей настроено'));
  gruppy.push({ title: 'Как выглядит в выдаче', items: vydacha });

  // — Содержимое (главная) —
  const sod = [];
  if (!g.h1.length) sod.push(p(BAD, 'На главной нет заголовка h1', 'h1'));
  else if (g.h1.length > 1) sod.push(p(WARN, `На главной ${g.h1.length} ${slovo(g.h1.length, 'заголовок', 'заголовка', 'заголовков')} h1`, 'h1', g.h1.slice(0, 5)));
  else sod.push(p(OK, 'Заголовок h1 один'));
  if (g.imgBezAlt) sod.push(p(WARN, `${g.imgBezAlt} из ${g.imgVsego} ${slovo(g.imgVsego, 'картинки', 'картинок', 'картинок')} без подписи (alt)`, 'alt'));
  else if (g.imgVsego) sod.push(p(OK, 'У всех картинок есть подпись (alt)'));
  if (!g.jsonld.length) sod.push(p(WARN, 'Нет разметки для поиска (JSON-LD)', 'jsonld'));
  else if (g.jsonld.includes('ОШИБКА')) sod.push(p(BAD, 'Разметка JSON-LD с ошибкой — поиск её не прочтёт', 'jsonld'));
  else sod.push(p(OK, 'Разметка для поиска: ' + [...new Set(g.jsonld)].slice(0, 6).join(', ')));
  if (!g.viewport) sod.push(p(BAD, 'Нет настройки для телефона (viewport)', 'viewport'));
  else sod.push(p(OK, 'Страница настроена для телефона'));
  if (!g.lang) sod.push(p(WARN, 'Не указан язык страницы (lang)', 'lang'));
  gruppy.push({ title: 'Содержимое главной', items: sod });

  // — Скорость (главная) —
  const sk = [];
  if (g.ms != null) {
    sk.push(p(g.ms < 800 ? OK : g.ms < 2000 ? WARN : BAD, `Сервер отвечает за ${sek(g.ms)}`, g.ms < 800 ? null : 'ttfb'));
  }
  const vsego = f.ves.html + f.ves.resursy;
  const priblizitelno = f.ves.vsego > f.ves.prochitano ? ' (по первым ' + f.ves.prochitano + ' файлам)' : '';
  sk.push(p(vsego < 2 * 1048576 ? OK : vsego < 5 * 1048576 ? WARN : BAD, `Страница весит ${vsego < 1048576 ? kb(vsego) : mb(vsego)}${priblizitelno}`, vsego < 2 * 1048576 ? null : 'ves'));
  if (!g.szhatie) sk.push(p(WARN, 'Сжатие страницы не включено', 'szhatie'));
  else sk.push(p(OK, 'Сжатие включено (' + g.szhatie + ')'));
  gruppy.push({ title: 'Скорость главной', items: sk });

  // — По всему сайту —
  const ves = [];
  const dubli = (pole) => {
    const m = new Map();
    for (const s of html) if (s[pole]) m.set(s[pole], [...(m.get(s[pole]) || []), s.url]);
    return [...m].filter(([, u]) => u.length > 1);
  };
  const dt = dubli('title');
  if (dt.length) ves.push(p(BAD, `Одинаковые заголовки: ${dt.reduce((a, [, u]) => a + u.length, 0)} страниц в ${dt.length} ${slovo(dt.length, 'группе', 'группах', 'группах')}`, 'dubliTitle',
    dt.slice(0, 5).map(([t, u]) => `«${t.slice(0, 60)}» — ${u.slice(0, 4).map(put).join(', ')}${u.length > 4 ? ' …' : ''}`)));
  else if (html.length > 1) ves.push(p(OK, 'Заголовки у всех страниц разные'));
  const dd = dubli('description');
  if (dd.length) ves.push(p(WARN, `Одинаковые описания: ${dd.reduce((a, [, u]) => a + u.length, 0)} страниц`, 'dubliDesc',
    dd.slice(0, 5).map(([, u]) => u.slice(0, 4).map(put).join(', ') + (u.length > 4 ? ' …' : ''))));
  // Списки по страницам — только когда страниц больше одной, иначе это повтор пунктов про главную.
  const mnogo = html.length > 1;
  if (f.stranicy.length === 1) ves.push(p(WARN, 'Нашлась только главная: нет карты сайта, а на главной нет ссылок на другие страницы', 'sitemap'));
  const bezT = mnogo ? html.filter((s) => !s.title) : [];
  if (bezT.length) ves.push(p(BAD, `Без заголовка (title): ${bezT.length}`, 'title', spisok(bezT.map((s) => s.url))));
  const bezD = mnogo ? html.filter((s) => !s.description) : [];
  if (bezD.length) ves.push(p(WARN, `Без описания (description): ${bezD.length}`, 'description', spisok(bezD.map((s) => s.url))));
  const bezH = mnogo ? html.filter((s) => !s.h1.length) : [];
  if (bezH.length) ves.push(p(WARN, `Без заголовка h1: ${bezH.length}`, 'h1', spisok(bezH.map((s) => s.url))));
  if (f.bitye.length) ves.push(p(BAD, `Битые ссылки: ${f.bitye.length}`, 'bitye',
    spisok(f.bitye, (b) => `${put(b.url)} — ${b.status ? 'ошибка ' + b.status : 'не открывается'}, стоит на странице ${put(b.gde)}`)));
  else ves.push(p(OK, 'Битых ссылок не нашлось'));
  const red = f.stranicy.slice(1).filter((s) => s.cepochka.length);
  if (red.length) ves.push(p(WARN, `Адреса с перенаправлением: ${red.length}`, 'redirekty', spisok(red, (s) => `${put(s.url)} → ${put(s.itog)}`)));
  const ni = html.filter((s) => s.noindex && s !== g);
  if (ni.length) ves.push(p(WARN, `Запрещены к показу (noindex): ${ni.length}`, 'noindex', spisok(ni.map((s) => s.url))));
  if (f.zakrytyeRobots.length) ves.push(p(WARN, `Закрыты в robots.txt: ${f.zakrytyeRobots.length}`, 'zakrytyeRobots', spisok(f.zakrytyeRobots)));
  const oshibki = f.stranicy.filter((s) => s.status !== 200 && !f.bitye.some((b) => b.url === s.url));
  if (oshibki.length) ves.push(p(WARN, `Страницы из карты сайта с ошибкой: ${oshibki.length}`, 'sitemap', spisok(oshibki, (s) => `${put(s.url)} — ${s.status || s.oshibka}`)));
  gruppy.push({ title: `По всему сайту · ${f.stranicy.length} ${slovo(f.stranicy.length, 'страница', 'страницы', 'страниц')}`, items: ves });

  const vse = gruppy.flatMap((gr) => gr.items);
  return {
    host: f.host, url: f.glavnaya,
    snippet: { title: g.title, description: g.description, url: f.glavnaya },
    itogo: { ok: vse.filter((i) => i.level === OK).length, warn: vse.filter((i) => i.level === WARN).length, bad: vse.filter((i) => i.level === BAD).length, vsego: vse.length },
    stranic: f.stranicy.length, sekund: f.sekund, nedoshli: f.nedoshli,
    gruppy,
  };
}
