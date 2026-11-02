// raschet.js — ответы из диалога → формулы сайта → текст для ВК и ссылка на тот же расчёт на сайте.

const SAJT = 'https://kor-nil.ru';
const METKA = 'utm_source=vk&utm_medium=bot';

const chislo = (s) => Number(String(s).replace(',', '.'));

/** Всё, что нужно формуле: значения по умолчанию из описания калькулятора + ответы человека. */
function sobrat(def, mode, otvet) {
  const md = def.modes.find((m) => m.id === mode);
  if (!md) throw new Error('Нет режима ' + mode);
  const v = {};
  for (const f of [...(md.fields || []), ...(def.common || [])]) {
    if (f.value != null && f.value !== '') v[f.id] = chislo(f.value);
  }
  for (const [k, x] of Object.entries(otvet.v)) v[k] = chislo(x);
  const sel = {};
  for (const s of def.selects || []) sel[s.id] = s.default;
  Object.assign(sel, otvet.s);
  const extras = {};
  if (otvet.room) extras.room = JSON.parse(JSON.stringify(otvet.room));   // measure() двигает проёмы — даём копию
  return { v, sel, extras };
}

/** Ссылка #c=… в том же виде, что делает кнопка «Поделиться» на сайте (encodeState в calculators.js). */
function ssylka(flow, otvet) {
  const obj = { c: flow.key, m: otvet.mode, v: otvet.v, s: otvet.s };
  if (otvet.room) obj.x = { room: otvet.room };
  const kod = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${SAJT}/tools/${flow.page}/?${METKA}#c=${kod}`;
}

// Строки результата: на сайте они в таблице; в сообщении — «название — значение».
// Неразрывные пробелы из форматирования чисел ВК показывает нормально, оставляем.
function tekstOtveta(flow, a, r) {
  const stroki = [];
  stroki.push(`${flow.title}: ${flow.opis(a)}`);
  stroki.push('');
  stroki.push(`✅ ${r.main.label}: ${r.main.value}`);
  stroki.push('');
  for (const [k, x] of r.rows || []) stroki.push(`• ${k} — ${x}`);
  if (r.note) { stroki.push(''); stroki.push(r.note.trim()); }
  return stroki.join('\n');
}

/**
 * Посчитать. → { ok: true, tekst, ssylka } или { ok: false, oshibka, pole? }
 * pole — id шага, который надо переспросить (если формула указала поле).
 */
export function poschitat(CALCS, flow, a) {
  const def = CALCS[flow.key];
  if (!def) return { ok: false, oshibka: 'Этот калькулятор сейчас недоступен.' };
  const otvet = flow.build(a);
  const { v, sel, extras } = sobrat(def, otvet.mode, otvet);
  let r;
  try { r = def.compute(v, otvet.mode, sel, extras); } catch (e) {
    console.error(new Date().toISOString(), 'формула упала', flow.key, e);
    return { ok: false, oshibka: 'Не получилось посчитать. Попробуйте на сайте — там можно поправить все параметры.', ssylka: ssylka(flow, otvet) };
  }
  if (!r) return { ok: false, oshibka: 'С такими числами не считается — проверьте размеры.' };
  if (r.error) return { ok: false, oshibka: r.error, pole: r.field };
  return { ok: true, tekst: tekstOtveta(flow, a, r), ssylka: ssylka(flow, otvet) };
}
