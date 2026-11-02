// main.js — служба бота ВК «Ремонт и стройка: калькуляторы и проекты» (vk.ru/club242848914).
// Формулы читает из выложенного сайта (SITE_JS) и перечитывает, когда сайт обновили.
// Учёт — stat.jsonl: дата, калькулятор, посчиталось ли. Кто писал — не храним.

import { readFileSync, statSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zagruzitCalcs } from './calcs.js';
import { sozdatVk } from './vk.js';
import { sozdatBota } from './bot.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// .env рядом: VK_GROUP_TOKEN, VK_GROUP_ID, SITE_JS (папка с calculators.js и calc-room.js)
try {
  for (const s of readFileSync(path.join(DIR, '.env'), 'utf8').split('\n')) {
    const m = s.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* переменные пришли из окружения */ }

const { VK_GROUP_TOKEN, VK_GROUP_ID } = process.env;
const SITE_JS = process.env.SITE_JS || '/root/kor-nil-site/assets/js';
if (!VK_GROUP_TOKEN || !VK_GROUP_ID) { console.error('Нет VK_GROUP_TOKEN или VK_GROUP_ID'); process.exit(1); }

let calcs = zagruzitCalcs(SITE_JS), metka = statSync(path.join(SITE_JS, 'calculators.js')).mtimeMs;
function getCalcs() {
  try {
    const t = statSync(path.join(SITE_JS, 'calculators.js')).mtimeMs;
    if (t !== metka) { calcs = zagruzitCalcs(SITE_JS); metka = t; console.log(new Date().toISOString(), 'формулы перечитаны'); }
  } catch (e) { console.error(new Date().toISOString(), 'не перечитал формулы, считаю старыми:', e.message); }
  return calcs;
}
const stat = (calc, ok) => { try { appendFileSync(path.join(DIR, 'stat.jsonl'), JSON.stringify({ d: new Date().toISOString().slice(0, 10), calc, ok }) + '\n'); } catch { /* не критично */ } };

const vk = sozdatVk(VK_GROUP_TOKEN, VK_GROUP_ID);
const bot = sozdatBota(vk, getCalcs, stat);
console.log(new Date().toISOString(), `бот слушает сообщество ${VK_GROUP_ID}, формулы из ${SITE_JS}`);
vk.slushat((u) => bot.obrabotat(u));
