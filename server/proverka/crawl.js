// crawl.js — обход сайта: до 20 страниц, проверка ссылок, вес главной, зеркала.
// Вежливо: к проверяемому сайту не чаще 2 запросов в секунду, всё по очереди.
// Результат — сырые факты; оценки и тексты отчёта делает report.js.

import { parse } from 'node-html-parser';
import { zapros, pauza } from './net.js';
import { razobratRobots, razobratSitemap, zakryto } from './robots.js';

export const MAX_STRANIC = 20;
const MAX_SSYLOK = 30;          // внутренние ссылки, которые не вошли в 20 страниц, — проверяем, живы ли
const MAX_RESURSOV = 30;        // картинки, стили, скрипты главной — для веса страницы
const PAUZA_SAJT = 500;         // 2 запроса в секунду к проверяемому сайту
const PAUZA_CHUZHIE = 100;      // к CDN и прочим — чаще можно
const VSEGO_MAX_MS = 110000;    // общий предел: дольше — отдаём то, что успели

const FAJL = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|7z|docx?|xlsx?|pptx?|mp[34]|avi|mov|webm|woff2?|ttf|css|js|xml|txt|json|exe|apk|dmg)$/i;

function normalizovat(href, baza) {
  try {
    const u = new URL(href, baza);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

const tekst = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

function meta(doc, imya) {
  const el = doc.querySelectorAll('meta').find((m) =>
    (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase() === imya);
  return el ? (el.getAttribute('content') || '').trim() : null;
}

/** Факты одной HTML-страницы. */
function razobratStranicu(r) {
  const html = r.body.toString('utf8');
  const doc = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });
  const robotsMeta = [meta(doc, 'robots'), meta(doc, 'yandex')].filter(Boolean).join(',').toLowerCase();
  const xRobots = String(r.headers['x-robots-tag'] || '').toLowerCase();
  const canonicalEl = doc.querySelectorAll('link').find((l) => (l.getAttribute('rel') || '').toLowerCase() === 'canonical');
  const imgs = doc.querySelectorAll('img');
  const jsonld = doc.querySelectorAll('script').filter((s) => (s.getAttribute('type') || '').toLowerCase() === 'application/ld+json');
  const tipy = [];
  for (const s of jsonld) {
    try {
      const d = JSON.parse(s.textContent);
      const obhod = (o) => {
        if (Array.isArray(o)) return o.forEach(obhod);
        if (o && typeof o === 'object') {
          if (o['@type']) tipy.push(...[].concat(o['@type']));
          if (o['@graph']) obhod(o['@graph']);
        }
      };
      obhod(d);
    } catch { tipy.push('ОШИБКА'); }
  }
  const ssylki = new Set();
  for (const a of doc.querySelectorAll('a')) {
    const rel = (a.getAttribute('rel') || '').toLowerCase();
    const href = a.getAttribute('href');
    if (!href || rel.includes('nofollow')) continue;
    const u = normalizovat(href, r.url);
    if (u) ssylki.add(u);
  }
  const resursy = new Set();
  for (const el of doc.querySelectorAll('img, script, link')) {
    let src = null;
    if (el.tagName === 'LINK') {
      if ((el.getAttribute('rel') || '').toLowerCase() === 'stylesheet') src = el.getAttribute('href');
    } else src = el.getAttribute('src');
    if (!src || src.startsWith('data:')) continue;
    const u = normalizovat(src, r.url);
    if (u) resursy.add(u);
  }
  return {
    title: tekst(doc.querySelector('title')) || null,
    description: meta(doc, 'description'),
    h1: doc.querySelectorAll('h1').map(tekst),
    canonical: canonicalEl ? normalizovat(canonicalEl.getAttribute('href') || '', r.url) : null,
    noindex: /noindex|none/.test(robotsMeta) || /noindex|none/.test(xRobots),
    imgVsego: imgs.length,
    imgBezAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
    jsonld: tipy,
    og: { title: meta(doc, 'og:title'), description: meta(doc, 'og:description'), image: meta(doc, 'og:image') },
    viewport: !!meta(doc, 'viewport'),
    lang: (doc.querySelector('html') || { getAttribute: () => null }).getAttribute('lang') || null,
    ssylki: [...ssylki],
    resursy: [...resursy],
  };
}

const etoHtml = (r) => /text\/html|application\/xhtml/i.test(String(r.headers?.['content-type'] || ''));

/**
 * Обход. progress(etap, gotovo, vsego) вызывается по ходу.
 * → факты сайта или { error } если главная не открылась.
 */
export async function obojti(start, progress = () => {}) {
  const nachalo = Date.now();
  const vremyaVyshlo = () => Date.now() - nachalo > VSEGO_MAX_MS;
  const poslednij = new Map();      // хост → время последнего запроса
  const zapr = async (url, opts) => {
    const host = new URL(url).host;
    const pauzaMs = host === sajtHost ? PAUZA_SAJT : PAUZA_CHUZHIE;
    const zhdat = (poslednij.get(host) || 0) + pauzaMs - Date.now();
    if (zhdat > 0) await pauza(zhdat);
    poslednij.set(host, Date.now());
    return zapros(url, opts);
  };
  let sajtHost = new URL(start).host;

  // 1. Главная. Если по https не открылась, а адрес вводили без протокола — пробуем http.
  progress('Главная страница', 0, 1);
  let glavnaya = await zapr(start);
  if (glavnaya.error && start.startsWith('https://') && !['PLOHOJ_URL', 'ZAKRYTYJ_ADRES', 'ENOTFOUND'].includes(glavnaya.code)) {
    const http = await zapr(start.replace(/^https:/, 'http:'));
    if (!http.error) glavnaya = { ...http, httpsOshibka: glavnaya.error };
  }
  if (glavnaya.error) return { error: glavnaya.error };
  if (glavnaya.status >= 400) return { error: `Главная страница отвечает ошибкой ${glavnaya.status}` };
  if (!etoHtml(glavnaya)) return { error: 'По этому адресу не страница сайта, а файл' };

  const itog = new URL(glavnaya.url);
  sajtHost = itog.host;
  const svoj = (u) => { try { return new URL(u).host === sajtHost; } catch { return false; } };

  // 2. robots.txt
  progress('robots.txt и sitemap', 0, 1);
  const robotsR = await zapr(itog.origin + '/robots.txt');
  const robotsEst = !robotsR.error && robotsR.status === 200 && !etoHtml(robotsR);
  const robots = robotsEst ? razobratRobots(robotsR.body.toString('utf8')) : null;

  // 3. sitemap: из robots.txt или /sitemap.xml; sitemap index — до 3 вложенных.
  const sitemap = { najden: false, adres: null, adresa: [], chuzhie: 0 };
  const kandidaty = robots?.sitemaps.length ? robots.sitemaps.slice(0, 2) : [itog.origin + '/sitemap.xml'];
  for (const sm of kandidaty) {
    const r = await zapr(sm);
    if (r.error || r.status !== 200 || !/<(urlset|sitemapindex)[\s>]/i.test(r.body?.toString('utf8') || '')) continue;
    sitemap.najden = true;
    sitemap.adres ||= sm;
    let razbor = razobratSitemap(r.body.toString('utf8'));
    sitemap.adresa.push(...razbor.adresa);
    for (const vl of razbor.vlozhennye.slice(0, 3)) {
      const rv = await zapr(vl);
      if (!rv.error && rv.status === 200) sitemap.adresa.push(...razobratSitemap(rv.body.toString('utf8')).adresa);
    }
  }
  sitemap.vsego = sitemap.adresa.length;
  sitemap.chuzhie = sitemap.adresa.filter((u) => !svoj(u)).length;

  // 4. Страницы: главная, затем адреса из sitemap, затем ссылки со страниц (в ширину).
  const ochered = [glavnaya.url];
  const vOcheredi = new Set([glavnaya.url, start]);
  for (const u of sitemap.adresa) {
    const n = normalizovat(u, itog.href);
    if (n && svoj(n) && !vOcheredi.has(n) && !FAJL.test(new URL(n).pathname)) { ochered.push(n); vOcheredi.add(n); }
  }
  const stranicy = [];
  const zakrytyeRobots = [];
  const istochnik = new Map();       // ссылка → первая страница, где она нашлась
  const proverennye = new Map();     // адрес → статус (для битых ссылок)

  for (let i = 0; i < ochered.length && stranicy.length < MAX_STRANIC && !vremyaVyshlo(); i++) {
    const url = ochered[i];
    const u = new URL(url);
    if (i > 0 && zakryto(robots, u.pathname + u.search)) { zakrytyeRobots.push(url); continue; }
    progress('Страницы сайта', stranicy.length, Math.min(MAX_STRANIC, ochered.length));
    const r = i === 0 ? glavnaya : await zapr(url);
    proverennye.set(url, r.error ? 0 : r.status);
    const s = { url, itog: r.url, status: r.error ? 0 : r.status, oshibka: r.error || null, cepochka: r.cepochka || [], ms: r.ms };
    if (!r.error && r.status === 200 && etoHtml(r) && r.body) {
      Object.assign(s, razobratStranicu(r), { size: r.size, razmer: r.razmer, szhatie: r.headers['content-encoding'] || null });
      if (r.url !== url) proverennye.set(r.url, r.status);
      for (const l of s.ssylki) {
        if (!svoj(l)) continue;
        if (!istochnik.has(l)) istochnik.set(l, url);
        if (!vOcheredi.has(l) && !FAJL.test(new URL(l).pathname)) { ochered.push(l); vOcheredi.add(l); }
      }
    }
    stranicy.push(s);
  }

  // 5. Ссылки, до которых обход не дошёл: живы ли (HEAD, без тела).
  const ostalnye = [...istochnik.keys()].filter((l) => !proverennye.has(l)).slice(0, MAX_SSYLOK);
  for (let i = 0; i < ostalnye.length && !vremyaVyshlo(); i++) {
    progress('Проверка ссылок', i, ostalnye.length);
    let r = await zapr(ostalnye[i], { method: 'HEAD' });
    if (!r.error && (r.status === 405 || r.status === 501)) r = await zapr(ostalnye[i], { telo: false });
    proverennye.set(ostalnye[i], r.error ? 0 : r.status);
  }
  const bitye = [...proverennye].filter(([l, st]) => (st === 0 || st >= 400) && istochnik.has(l))
    .map(([l, st]) => ({ url: l, status: st, gde: istochnik.get(l) }));

  // 6. Вес главной: размеры картинок, стилей и скриптов по заголовку Content-Length.
  const glavnayaFakty = stranicy[0];
  const ves = { html: glavnaya.size || 0, resursy: 0, prochitano: 0, vsego: glavnayaFakty.resursy?.length || 0 };
  for (const res of (glavnayaFakty.resursy || []).slice(0, MAX_RESURSOV)) {
    if (vremyaVyshlo()) break;
    progress('Вес главной страницы', ves.prochitano, Math.min(MAX_RESURSOV, ves.vsego));
    const r = await zapr(res, { method: 'HEAD' });
    const dl = Number(r.headers?.['content-length']);
    if (!r.error && r.status === 200 && dl > 0) ves.resursy += dl;
    ves.prochitano++;
  }

  // 7. Зеркала: http → https и вариант с www / без www. Статус — первого ответа, до перенаправлений.
  progress('Зеркала сайта', 0, 1);
  const zerkala = {};
  if (itog.protocol === 'https:') {
    const r = await zapr('http://' + itog.host + '/', { telo: false });
    zerkala.http = r.error ? { net: true } : { status: r.cepochka[0]?.status || r.status, kuda: r.url };
  }
  const drugoj = itog.hostname.startsWith('www.') ? itog.hostname.slice(4) : 'www.' + itog.hostname;
  const rw = await zapr(itog.protocol + '//' + drugoj + '/', { telo: false });
  zerkala.www = rw.error ? { net: true, host: drugoj } : { status: rw.cepochka[0]?.status || rw.status, kuda: rw.url, host: drugoj };

  return {
    start, glavnaya: glavnaya.url, host: itog.host, https: itog.protocol === 'https:',
    httpsOshibka: glavnaya.httpsOshibka || null,
    robots: robotsEst ? { est: true, sitemaps: robots.sitemaps, zakrytGlavnaya: zakryto(robots, itog.pathname), zakrytSajt: zakryto(robots, '/') && zakryto(robots, '/a') } : { est: false },
    sitemap: { najden: sitemap.najden, adres: sitemap.adres, vsego: sitemap.vsego, chuzhie: sitemap.chuzhie },
    stranicy, zakrytyeRobots, bitye, ves, zerkala,
    ochered: ochered.length, nedoshli: vremyaVyshlo(), sekund: Math.round((Date.now() - nachalo) / 1000),
  };
}
