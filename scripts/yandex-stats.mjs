#!/usr/bin/env node
// Сбор статистики kor-nil.ru из Яндекс.Метрики и Яндекс.Вебмастера.
// Токен и счётчик — в .env (YANDEX_OAUTH_TOKEN, METRIKA_COUNTER_ID).
// Запросы идут через curl: на Маке трафик ходит через HTTP(S)_PROXY, а fetch его не умеет.
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))
);
const TOKEN = env.YANDEX_OAUTH_TOKEN;
const COUNTER = env.METRIKA_COUNTER_ID;
const HOST_ID = 'https:kor-nil.ru:443';

async function api(url) {
  const { stdout } = await run('curl', [
    '-sS', '-m', '40', '-H', `Authorization: OAuth ${TOKEN}`, url,
  ], { maxBuffer: 32 * 1024 * 1024 });
  try { return JSON.parse(stdout); } catch { return { _raw: stdout.slice(0, 400) }; }
}

const day = (shift) => {
  const d = new Date();
  d.setDate(d.getDate() + shift);
  return d.toISOString().slice(0, 10);
};

function metrika(params) {
  const q = new URLSearchParams({ ids: COUNTER, accuracy: 'full', limit: '200', ...params });
  return api(`https://api-metrika.yandex.net/stat/v1/data?${q}`);
}

const wm = (path, params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api(`https://api.webmaster.yandex.net/v4/user/${env._uid}/hosts/${encodeURIComponent(HOST_ID)}${path}${q ? '?' + q : ''}`);
};

const out = {};
env._uid = (await api('https://api.webmaster.yandex.net/v4/user')).user_id;

// --- Метрика ---
const M = 'ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds';
out.metrika_by_day = await metrika({ metrics: M, dimensions: 'ym:s:date', date1: day(-120), date2: 'today', sort: 'ym:s:date' });
out.metrika_sources = await metrika({ metrics: M, dimensions: 'ym:s:lastsignTrafficSource', date1: day(-120), date2: 'today' });
out.metrika_search_engine = await metrika({ metrics: 'ym:s:visits,ym:s:users', dimensions: 'ym:s:lastsignSearchEngine', date1: day(-120), date2: 'today' });
out.metrika_phrases = await metrika({ metrics: 'ym:s:visits', dimensions: 'ym:s:lastsignSearchPhrase', date1: day(-120), date2: 'today', limit: '100' });
out.metrika_pages = await metrika({ metrics: 'ym:pv:pageviews', dimensions: 'ym:pv:URLPathFull', date1: day(-120), date2: 'today', limit: '100' });
out.metrika_devices = await metrika({ metrics: M, dimensions: 'ym:s:deviceCategory', date1: day(-120), date2: 'today' });

// --- Вебмастер ---
out.wm_summary = await wm('/summary');
out.wm_sqi = await wm('/sqi-history', { date_from: day(-180), date_to: day(0) });
out.wm_indexing = await wm('/search-urls/in-search/history', { date_from: day(-180), date_to: day(0) });
out.wm_crawl = await wm('/indexing/history', { date_from: day(-180), date_to: day(0) });
out.wm_diagnostics = await wm('/diagnostics/');
for (const ind of ['TOTAL_SHOWS', 'TOTAL_CLICKS', 'AVG_SHOW_POSITION', 'AVG_CLICK_POSITION']) {
  out[`wm_hist_${ind}`] = await wm('/search-queries/all/history', {
    query_indicator: ind, date_from: day(-180), date_to: day(0),
  });
}
// query_indicator повторяется несколько раз — URLSearchParams так не умеет, собираем вручную
out.wm_queries = await api(
  `https://api.webmaster.yandex.net/v4/user/${env._uid}/hosts/${encodeURIComponent(HOST_ID)}/search-queries/popular`
  + `?order_by=TOTAL_SHOWS&limit=100&date_from=${day(-90)}&date_to=${day(0)}`
  + ['TOTAL_SHOWS', 'TOTAL_CLICKS', 'AVG_SHOW_POSITION', 'AVG_CLICK_POSITION'].map((v) => `&query_indicator=${v}`).join('')
);

const dir = process.argv[2] || '.';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/yandex-stats.json`, JSON.stringify(out, null, 2));
console.log(`saved ${dir}/yandex-stats.json`);
