// server.js — служба проверки сайта для kor-nil.ru/seo/proverka/.
// nginx: location /api/proverka/ → 127.0.0.1:8791 (X-Real-IP ставит nginx).
//
//   POST /api/proverka/        {"url": "example.ru"} → {"id"}
//   GET  /api/proverka/<id>    → {"status": "ochered"|"idet"|"gotovo"|"oshibka", progress?, otchet?, error?}
//
// Отчёты лежат файлами в DATA_DIR 30 дней — по ним работает ссылка «поделиться» (/seo/proverka/#<id>).
// В отчёте только адреса чужого сайта; данных посетителя (IP и т.п.) не храним.

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { obojti } from './crawl.js';
import { sobratOtchet } from './report.js';
import { plohojUrl } from './net.js';

const PORT = Number(process.env.PORT || 8791);
const DATA_DIR = process.env.DATA_DIR || '/root/kor-nil-proverka-data';
const LIMIT_V_CHAS = 5;
const ODNOVREMENNO = 2;
const HRANIT_DNEJ = 30;
const POVTOR_MIN = 15;          // тот же адрес за 15 минут — отдаём готовый отчёт, не обходим заново

mkdirSync(DATA_DIR, { recursive: true });

const zadachi = new Map();      // id → { status, url, progress, otchet, error, vremya }
const ochered = [];
const posledniePoUrl = new Map(); // нормализованный адрес → { id, vremya }
const poIp = new Map();         // ip → [время запусков]
let idet = 0;

const ID_RE = /^[A-Za-z0-9_-]{12}$/;

function normalizovatVvod(vvod) {
  let s = String(vvod || '').trim();
  if (!s || s.length > 300) return { error: 'Введите адрес сайта, например example.ru' };
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return { error: 'Не похоже на адрес сайта' }; }
  const bad = plohojUrl(u);
  if (bad) return { error: bad };
  u.hash = '';
  return { url: u.href };
}

function otvet(res, kod, data) {
  const telo = JSON.stringify(data);
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(telo);
}

function chitatTelo(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 2000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

function sledujushaya() {
  while (idet < ODNOVREMENNO && ochered.length) {
    const id = ochered.shift();
    const z = zadachi.get(id);
    if (!z) continue;
    idet++;
    z.status = 'idet';
    obojti(z.url, (etap, gotovo, vsego) => { z.progress = { etap, gotovo, vsego }; })
      .then((fakty) => {
        if (fakty.error) { z.status = 'oshibka'; z.error = fakty.error; return; }
        z.otchet = { ...sobratOtchet(fakty), data: new Date().toISOString() };
        z.status = 'gotovo';
        writeFileSync(path.join(DATA_DIR, id + '.json'), JSON.stringify(z.otchet));
      })
      .catch((e) => {
        console.error(new Date().toISOString(), 'обход упал', z.url, e);
        z.status = 'oshibka';
        z.error = 'Проверка сорвалась. Попробуйте ещё раз через минуту.';
      })
      .finally(() => {
        idet--;
        z.vremya = Date.now();
        z.progress = undefined;
        sledujushaya();
      });
  }
}

async function zapusk(req, res) {
  const telo = await chitatTelo(req);
  const n = normalizovatVvod(telo?.url);
  if (n.error) return otvet(res, 400, { error: n.error });

  const byl = posledniePoUrl.get(n.url);
  if (byl && Date.now() - byl.vremya < POVTOR_MIN * 60000) {
    const z = zadachi.get(byl.id);
    if (z && z.status !== 'oshibka') return otvet(res, 200, { id: byl.id });
  }

  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
  const chas = Date.now() - 3600000;
  const zapuski = (poIp.get(ip) || []).filter((t) => t > chas);
  if (zapuski.length >= LIMIT_V_CHAS) {
    const cherez = Math.ceil((zapuski[0] + 3600000 - Date.now()) / 60000);
    return otvet(res, 429, { error: `Можно ${LIMIT_V_CHAS} проверок в час. Следующая — через ${cherez} мин.` });
  }
  zapuski.push(Date.now());
  poIp.set(ip, zapuski);

  const id = randomBytes(9).toString('base64url');
  zadachi.set(id, { status: 'ochered', url: n.url, vremya: Date.now() });
  posledniePoUrl.set(n.url, { id, vremya: Date.now() });
  ochered.push(id);
  sledujushaya();
  otvet(res, 200, { id });
}

function status(res, id) {
  if (!ID_RE.test(id)) return otvet(res, 404, { error: 'Отчёт не найден' });
  const z = zadachi.get(id);
  if (z) {
    if (z.status === 'gotovo') return otvet(res, 200, { status: 'gotovo', otchet: z.otchet });
    if (z.status === 'oshibka') return otvet(res, 200, { status: 'oshibka', error: z.error });
    const mesto = z.status === 'ochered' ? ochered.indexOf(id) + 1 : undefined;
    return otvet(res, 200, { status: z.status, progress: z.progress, mesto, url: z.url });
  }
  try {
    const otchet = JSON.parse(readFileSync(path.join(DATA_DIR, id + '.json'), 'utf8'));
    return otvet(res, 200, { status: 'gotovo', otchet });
  } catch {
    return otvet(res, 404, { error: 'Отчёт не найден — возможно, ему больше 30 дней' });
  }
}

// Уборка: готовые задачи из памяти — через час (файл остаётся), файлы — через 30 дней, счётчики IP — старше часа.
setInterval(() => {
  const chasNazad = Date.now() - 3600000;
  for (const [id, z] of zadachi) if (['gotovo', 'oshibka'].includes(z.status) && z.vremya < chasNazad) zadachi.delete(id);
  for (const [u, b] of posledniePoUrl) if (b.vremya < chasNazad) posledniePoUrl.delete(u);
  for (const [ip, t] of poIp) if (!t.some((x) => x > chasNazad)) poIp.delete(ip);
  const srok = Date.now() - HRANIT_DNEJ * 86400000;
  for (const f of readdirSync(DATA_DIR)) {
    const fp = path.join(DATA_DIR, f);
    try { if (statSync(fp).mtimeMs < srok) unlinkSync(fp); } catch { /* уже удалён */ }
  }
}, 10 * 60000).unref();

http.createServer((req, res) => {
  const put = req.url.split('?')[0].replace(/\/+$/, '');
  if (req.method === 'POST' && put === '/api/proverka') return zapusk(req, res);
  const m = put.match(/^\/api\/proverka\/([^/]+)$/);
  if (req.method === 'GET' && m) return status(res, m[1]);
  otvet(res, 404, { error: 'Нет такого адреса' });
}).listen(PORT, '127.0.0.1', () => console.log(`proverka слушает 127.0.0.1:${PORT}, данные ${DATA_DIR}`));
