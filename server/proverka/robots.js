// robots.js — разбор robots.txt и sitemap.xml.
// Правила берём для Яндекса (если для него своей группы нет — общую `*`):
// сайт у нас российский, и Яндекс читает robots.txt так же, как Google, — по самому длинному совпадению.

/** → { gruppy: Map<agent, [{allow, put}]>, sitemaps: [], host } */
export function razobratRobots(tekst) {
  const gruppy = new Map();
  const sitemaps = [];
  let host = null;
  let tekAgenty = [];
  let bylaPravilo = false;
  for (const syroe of tekst.split(/\r?\n/)) {
    const stroka = syroe.replace(/#.*/, '').trim();
    const m = stroka.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const pole = m[1].toLowerCase();
    const zn = m[2].trim();
    if (pole === 'user-agent') {
      if (bylaPravilo) { tekAgenty = []; bylaPravilo = false; }
      const ag = zn.toLowerCase();
      tekAgenty.push(ag);
      if (!gruppy.has(ag)) gruppy.set(ag, []);
    } else if (pole === 'disallow' || pole === 'allow') {
      bylaPravilo = true;
      for (const ag of tekAgenty) gruppy.get(ag).push({ allow: pole === 'allow', put: zn });
    } else if (pole === 'sitemap') {
      if (zn) sitemaps.push(zn);
    } else if (pole === 'host') {
      host = zn;
    }
  }
  return { gruppy, sitemaps, host };
}

function pravilaDlya(robots, agent) {
  if (!robots) return [];
  return robots.gruppy.get(agent) || robots.gruppy.get('*') || [];
}

function sovpadaet(put, shablon) {
  if (!shablon) return -1;
  const konec = shablon.endsWith('$');
  const s = konec ? shablon.slice(0, -1) : shablon;
  const re = new RegExp('^' + s.split('*').map((c) => c.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (konec ? '$' : ''));
  return re.test(put) ? shablon.length : -1;
}

/** Закрыт ли путь (path + query) для агента. */
export function zakryto(robots, put, agent = 'yandex') {
  let luchshee = { dlina: -1, allow: true };
  for (const p of pravilaDlya(robots, agent)) {
    if (!p.allow && p.put === '') continue;            // пустой Disallow — разрешено всё
    const d = sovpadaet(put, p.put);
    if (d > luchshee.dlina || (d === luchshee.dlina && p.allow)) luchshee = { dlina: d, allow: p.allow };
  }
  return !luchshee.allow;
}

/** Адреса из sitemap.xml и вложенные sitemap (для sitemap index). */
export function razobratSitemap(xml) {
  const loc = (blok) => [...blok.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)]
    .map((m) => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex[\s>]/i.test(xml)) {
    return { vlozhennye: loc(xml), adresa: [] };
  }
  return { vlozhennye: [], adresa: loc(xml) };
}
