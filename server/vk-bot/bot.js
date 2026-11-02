// bot.js — диалог: меню калькуляторов → вопросы по одному → расчёт и ссылка на сайт.
// Состояние разговора — в памяти (перезапуск службы просто вернёт человека к меню).

import { FLOWS, MENU } from './flows.js';
import { poschitat } from './raschet.js';

const ZABYT_CHEREZ = 60 * 60000;      // разговор без ответа час — забываем
const NE_POVTORYAT = 10 * 60000;      // подсказку «нажмите кнопку» не чаще раза в 10 минут

const PRIVET = 'Привет! Посчитаю материалы для ремонта и стройки — по тем же формулам, что калькуляторы на kor-nil.ru.\n\nВыберите, что считаем:';
const NE_PONYAL = 'Чтобы посчитать, нажмите кнопку ниже.\n\nЕсли у вас вопрос не про расчёт — просто напишите его, Алексей прочитает и ответит здесь.';

// ——— Клавиатуры ———
const knopka = (label, payload, color = 'secondary') => ({ action: { type: 'text', label: label.slice(0, 40), payload: JSON.stringify(payload) }, color });
const poRyadam = (arr, n) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };

function klavMenu() {
  const k = MENU.map((id) => knopka(FLOWS[id].title, { calc: id }, 'primary'));
  return { one_time: false, buttons: [...poRyadam(k, 2),
    [{ action: { type: 'open_link', link: 'https://kor-nil.ru/tools/?utm_source=vk&utm_medium=bot', label: 'Все калькуляторы на сайте' } }]] };
}

function klavShaga(flowId, shag) {
  const ryady = [];
  if (shag.kind === 'choice') {
    const k = shag.choices.map(([l, z]) => knopka(l, { calc: flowId, shag: shag.id, z }, 'primary'));
    // Короткие подписи — в ряд по 4, длинные — по одной в строке, чтобы на телефоне не обрезались
    ryady.push(...poRyadam(k, shag.choices.every(([l]) => l.length <= 12) ? 4 : 1));
  } else if (shag.presets?.length) {
    ryady.push(shag.presets.map((p) => knopka(p.replace('.', ','), { calc: flowId, shag: shag.id, z: p }, 'primary')));
  }
  ryady.push([knopka('↩ Меню', { menu: 1 })]);
  return { one_time: false, buttons: ryady };
}

function klavPosle(flowId) {
  return { one_time: false, buttons: [
    [knopka(`Ещё раз: ${FLOWS[flowId].title.toLowerCase()}`, { calc: flowId }, 'positive')],
    [knopka('Другой калькулятор', { menu: 1 })],
  ] };
}

// ——— Логика ———
const tekShag = (flow, a) => flow.steps.find((s) => (!s.when || s.when(a)) && a[s.id] === undefined);

function razobratChislo(tekst, shag) {
  const m = String(tekst).replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return { oshibka: 'Нужно число — например, 4,5. Или нажмите кнопку.' };
  const x = Number(m[0].replace(',', '.'));
  if (shag.int && !Number.isInteger(x)) return { oshibka: 'Здесь нужно целое число.' };
  if (shag.min != null && x < shag.min) return { oshibka: `Слишком мало: не меньше ${String(shag.min).replace('.', ',')}.` };
  if (shag.max != null && x > shag.max) return { oshibka: `Слишком много: не больше ${String(shag.max).replace('.', ',')}.` };
  return { z: String(x) };
}

/**
 * Бот. vk — из vk.js, getCalcs() — свежие формулы сайта, stat(calc, ok) — учёт без личных данных.
 */
export function sozdatBota(vk, getCalcs, stat = () => {}) {
  const razgovory = new Map();   // peerId → { flowId, a, vremya }
  const podskazki = new Map();   // peerId → когда последний раз показали «нажмите кнопку»

  const menu = (peer, tekst = PRIVET) => vk.otpravit(peer, tekst, klavMenu());

  async function sprosit(peer, r) {
    const flow = FLOWS[r.flowId];
    const shag = tekShag(flow, r.a);
    if (shag) {
      const hint = shag.kind === 'num' ? (shag.presets?.length ? '\nНажмите кнопку или напишите своё число.' : '\nНапишите число.') : '';
      return vk.otpravit(peer, shag.q + hint, klavShaga(r.flowId, shag));
    }
    const res = poschitat(getCalcs(), flow, r.a);
    stat(r.flowId, res.ok);
    if (!res.ok) {
      if (res.pole && flow.steps.some((s) => s.id === res.pole)) {
        delete r.a[res.pole];
        await vk.otpravit(peer, '⚠️ ' + res.oshibka);
        return sprosit(peer, r);
      }
      razgovory.delete(peer);
      return vk.otpravit(peer, '⚠️ ' + res.oshibka + (res.ssylka ? '\n\nНа сайте: ' + res.ssylka : ''), klavPosle(r.flowId));
    }
    razgovory.delete(peer);
    return vk.otpravit(peer, `${res.tekst}\n\n📐 Подробно — с чертежом, своей формой комнаты и ценами:\n${res.ssylka}`, klavPosle(r.flowId));
  }

  async function soobshchenie(msg) {
    const peer = msg.peer_id;
    if (!peer || peer >= 2e9 || msg.from_id < 0) return;   // беседы и сообщения от сообществ не обрабатываем
    let p = {};
    try { p = msg.payload ? JSON.parse(msg.payload) : {}; } catch { p = {}; }
    const tekst = (msg.text || '').trim();
    const nizh = tekst.toLowerCase();

    for (const [k, r] of razgovory) if (Date.now() - r.vremya > ZABYT_CHEREZ) razgovory.delete(k);
    for (const [k, t] of podskazki) if (Date.now() - t > NE_POVTORYAT) podskazki.delete(k);

    if (p.command === 'start' || p.menu || ['начать', 'меню', 'start', '/start'].includes(nizh)) {
      razgovory.delete(peer);
      return menu(peer, p.menu ? 'Что считаем?' : PRIVET);
    }
    if (p.calc && FLOWS[p.calc] && !p.shag) {
      const r = { flowId: p.calc, a: {}, vremya: Date.now() };
      razgovory.set(peer, r);
      return sprosit(peer, r);
    }

    const r = razgovory.get(peer);
    if (r) {
      r.vremya = Date.now();
      const shag = tekShag(FLOWS[r.flowId], r.a);
      if (!shag) { razgovory.delete(peer); return menu(peer); }
      if (p.shag) {
        if (p.calc !== r.flowId || p.shag !== shag.id) return sprosit(peer, r);   // старая кнопка — повторим текущий вопрос
        r.a[shag.id] = String(p.z);
        return sprosit(peer, r);
      }
      if (shag.kind === 'num') {
        const ch = razobratChislo(tekst, shag);
        if (ch.oshibka) return vk.otpravit(peer, ch.oshibka, klavShaga(r.flowId, shag));
        r.a[shag.id] = ch.z;
        return sprosit(peer, r);
      }
      const vybor = shag.choices.find(([l]) => l.toLowerCase() === nizh);
      if (vybor) { r.a[shag.id] = vybor[1]; return sprosit(peer, r); }
      return vk.otpravit(peer, 'Выберите вариант кнопкой.', klavShaga(r.flowId, shag));
    }

    // Не в разговоре и не кнопка: это, скорее всего, вопрос живому человеку — не засыпаем его меню
    if (podskazki.has(peer)) return;
    podskazki.set(peer, Date.now());
    return menu(peer, NE_PONYAL);
  }

  return {
    async obrabotat(u) {
      if (u.type === 'message_new') return soobshchenie(u.object.message);
    },
  };
}
