// net.js — запросы к чужим сайтам без риска для нашего сервера.
//
// Адрес вводит посетитель, поэтому через проверку можно попытаться достучаться до самого
// сервера (127.0.0.1:8790 — обмерник, 5432 — база) или до внутренней сети. Защита:
// - только http/https и только порты 80/443;
// - адрес домена проверяется в момент соединения (свой lookup), а не заранее:
//   иначе домен может сначала отдать внешний IP, а при соединении — 127.0.0.1;
// - редиректы идём сами, и каждый новый адрес проходит те же проверки;
// - таймаут, предел размера ответа.

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';

export const UA = 'Mozilla/5.0 (compatible; KorNilProverka/1.0; +https://kor-nil.ru/seo/proverka/)';
const TIMEOUT = 10000;
const MAX_BODY = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const ZAKRYTO = new net.BlockList();
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) ZAKRYTO.addSubnet(a, p, 'ipv4');
for (const [a, p] of [
  ['::', 127], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) ZAKRYTO.addSubnet(a, p, 'ipv6');

export function zakrytyjIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return ZAKRYTO.check(ip, 'ipv4');
  if (fam === 6) {
    // ::ffff:127.0.0.1 — тот же IPv4 внутри IPv6
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return ZAKRYTO.check(m[1], 'ipv4');
    return ZAKRYTO.check(ip, 'ipv6');
  }
  return true;
}

function bezopasnyjLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true, family: options.family || 0 }, (err, adresa) => {
    if (err) return cb(err);
    const plohoj = adresa.find((a) => zakrytyjIp(a.address));
    if (plohoj || !adresa.length) {
      const e = new Error('Адрес во внутренней сети — такие не проверяем');
      e.code = 'ZAKRYTYJ_ADRES';
      return cb(e);
    }
    if (options.all) return cb(null, adresa);
    cb(null, adresa[0].address, adresa[0].family);
  });
}

/** Годится ли адрес для проверки (без сети). Возвращает текст ошибки или null. */
export function plohojUrl(u) {
  if (!['http:', 'https:'].includes(u.protocol)) return 'Только адреса http и https';
  if (u.port && !['80', '443'].includes(u.port)) return 'Только обычные порты 80 и 443';
  if (u.username || u.password) return 'Адрес с логином и паролем не проверяем';
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, ''))) {
    if (zakrytyjIp(u.hostname.replace(/^\[|\]$/g, ''))) return 'Адрес во внутренней сети — такие не проверяем';
  } else if (!u.hostname.includes('.') || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) {
    return 'Нужен адрес сайта в интернете, например example.ru';
  }
  return null;
}

/** Один запрос без редиректов. → { status, headers, body (Buffer|null), ms, size } */
function odinZapros(url, { method = 'GET', telo = true } = {}) {
  return new Promise((done) => {
    let gotovo = false;
    const resolve = (v) => { if (!gotovo) { gotovo = true; done(v); } };
    const u = new URL(url);
    const bad = plohojUrl(u);
    if (bad) return resolve({ error: bad, code: 'PLOHOJ_URL' });
    const lib = u.protocol === 'https:' ? https : http;
    const start = Date.now();
    const req = lib.request(u, {
      method,
      lookup: bezopasnyjLookup,
      timeout: TIMEOUT,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'ru,en;q=0.8',
      },
    }, (res) => {
      const ms = Date.now() - start;
      const otvet = { status: res.statusCode, headers: res.headers, ms, body: null, size: 0 };
      if (!telo || method === 'HEAD' || (res.statusCode >= 300 && res.statusCode < 400)) {
        res.resume();
        return resolve(otvet);
      }
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      let potok = res;
      if (enc === 'gzip' || enc === 'x-gzip') potok = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') potok = res.pipe(zlib.createInflate());
      else if (enc === 'br') potok = res.pipe(zlib.createBrotliDecompress());
      const chasti = [];
      let szhato = 0, razmer = 0, obrezano = false;
      res.on('data', (c) => { szhato += c.length; });
      potok.on('data', (c) => {
        razmer += c.length;
        if (obrezano) return;
        if (razmer > MAX_BODY) { obrezano = true; konec(); req.destroy(); return; }
        chasti.push(c);
      });
      function konec() { resolve({ ...otvet, body: Buffer.concat(chasti), size: szhato, razmer, obrezano }); }
      potok.on('end', konec);
      potok.on('error', konec);
      res.on('aborted', konec);
    });
    req.on('timeout', () => { req.destroy(Object.assign(new Error('Сайт не ответил за 10 секунд'), { code: 'TIMEOUT' })); });
    req.on('error', (e) => resolve({ error: opisatOshibku(e), code: e.code || 'OSHIBKA' }));
    req.end();
  });
}

function opisatOshibku(e) {
  switch (e.code) {
    case 'ENOTFOUND': case 'EAI_AGAIN': return 'Такой домен не найден';
    case 'ECONNREFUSED': return 'Сайт не принимает соединения';
    case 'ECONNRESET': return 'Сайт оборвал соединение';
    case 'TIMEOUT': case 'ETIMEDOUT': return 'Сайт не ответил за 10 секунд';
    case 'ZAKRYTYJ_ADRES': return e.message;
    case 'CERT_HAS_EXPIRED': return 'Сертификат https просрочен';
    case 'ERR_TLS_CERT_ALTNAME_INVALID': return 'Сертификат https выдан на другой домен';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT': case 'SELF_SIGNED_CERT_IN_CHAIN': return 'Сертификат https самодельный';
    default: return 'Не удалось открыть: ' + (e.code || e.message);
  }
}

/**
 * Запрос с редиректами. → { url (итоговый), status, headers, body, ms, size, cepochka: [{url, status}], error }
 * ms — время до первого байта последнего запроса в цепочке.
 */
export async function zapros(url, opts = {}) {
  const cepochka = [];
  let tek = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await odinZapros(tek, opts);
    if (r.error) return { url: tek, cepochka, ...r };
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      let dalee;
      try { dalee = new URL(r.headers.location, tek).href; } catch { return { url: tek, cepochka, ...r }; }
      cepochka.push({ url: tek, status: r.status });
      tek = dalee;
      continue;
    }
    return { url: tek, cepochka, ...r };
  }
  return { url: tek, cepochka, error: 'Слишком много редиректов подряд', code: 'REDIRECTS' };
}

export const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
