// flows.js — сценарии бота: какие вопросы задаём по каждому калькулятору.
// Считает не бот, а формулы сайта (calcs.js); здесь только «что спросить» и «куда подставить».
// Остальные поля берут значения по умолчанию, как на сайте; тонкая настройка — по ссылке на страницу.
//
// Шаг: { id, q, kind: 'choice' | 'num', choices?: [[подпись, значение]], presets?: [...], min, max,
//        when?: (a) => bool }. Ответы лежат в a[id]; куда они идут, решает build().

const NET_OKON = [['Нет', '0'], ['1', '1'], ['2', '2'], ['3', '3']];

export const FLOWS = {
  beton: {
    title: 'Бетон', key: 'concrete', page: 'kalkulyator-betona',
    steps: [
      { id: 'mode', kind: 'choice', q: 'Что заливаем?', choices: [['Плита или площадка', 'slab'], ['Ленточный фундамент', 'strip'], ['Столбы', 'columns']] },
      { id: 'len', kind: 'num', q: 'Длина плиты, м?', presets: ['3', '4', '6', '8'], min: 0.1, max: 200, when: (a) => a.mode === 'slab' },
      { id: 'wid', kind: 'num', q: 'Ширина плиты, м?', presets: ['3', '4', '6', '8'], min: 0.1, max: 200, when: (a) => a.mode === 'slab' },
      { id: 'thick', kind: 'num', q: 'Толщина плиты, см?', presets: ['10', '15', '20', '25'], min: 3, max: 200, when: (a) => a.mode === 'slab' },
      { id: 'hLen', kind: 'num', q: 'Длина дома по наружным стенам, м?', presets: ['6', '8', '10', '12'], min: 1, max: 200, when: (a) => a.mode === 'strip' },
      { id: 'hWid', kind: 'num', q: 'Ширина дома по наружным стенам, м?', presets: ['6', '8', '10', '12'], min: 1, max: 200, when: (a) => a.mode === 'strip' },
      { id: 'sWid', kind: 'num', q: 'Ширина ленты, см?', presets: ['30', '40', '50'], min: 10, max: 200, when: (a) => a.mode === 'strip' },
      { id: 'sDepth', kind: 'num', q: 'Глубина ленты в земле, см?', presets: ['50', '70', '100', '150'], min: 10, max: 400, when: (a) => a.mode === 'strip' },
      { id: 'sAbove', kind: 'num', q: 'Высота над землёй (цоколь), см?', presets: ['0', '20', '30', '50'], min: 0, max: 200, when: (a) => a.mode === 'strip' },
      { id: 'cSide', kind: 'num', q: 'Сечение столба — сторона квадрата, см?', presets: ['20', '30', '40'], min: 5, max: 200, when: (a) => a.mode === 'columns' },
      { id: 'cHei', kind: 'num', q: 'Высота столба, м?', presets: ['1', '1.5', '2', '3'], min: 0.1, max: 30, when: (a) => a.mode === 'columns' },
      { id: 'cCount', kind: 'num', q: 'Сколько столбов?', presets: ['4', '6', '9', '12'], min: 1, max: 500, int: true, when: (a) => a.mode === 'columns' },
      { id: 'source', kind: 'choice', q: 'Бетон мешаете сами или заказываете миксер?', choices: [['Мешаю сам', 'mix'], ['Готовый с завода', 'ready']] },
    ],
    build(a) {
      const fields = { slab: ['len', 'wid', 'thick'], strip: ['hLen', 'hWid', 'sWid', 'sDepth', 'sAbove'], columns: ['cSide', 'cHei', 'cCount'] }[a.mode];
      return { mode: a.mode, v: pick(a, fields), s: { source: a.source } };
    },
    opis(a) {
      if (a.mode === 'slab') return `Плита ${n(a.len)} × ${n(a.wid)} м, толщина ${n(a.thick)} см`;
      if (a.mode === 'strip') return `Лента под дом ${n(a.hLen)} × ${n(a.hWid)} м, ширина ${n(a.sWid)} см, глубина ${n(a.sDepth)} см`;
      return `${n(a.cCount)} шт. столбов ${n(a.cSide)} × ${n(a.cSide)} см, высота ${n(a.cHei)} м`;
    },
  },

  plitka: {
    title: 'Плитка', key: 'floor', page: 'kalkulyator-plitki',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.3, max: 100 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['1.5', '2', '3', '4'], min: 0.3, max: 100 },
      { id: 'tile', kind: 'choice', q: 'Размер плитки, см?', choices: [['30 × 30', '30x30'], ['30 × 60', '60x30'], ['60 × 60', '60x60'], ['60 × 120', '120x60']] },
    ],
    build(a) {
      const [L, W] = a.tile.split('x');
      return { mode: 'rect', v: { len: a.len, wid: a.wid, tileL: L, tileW: W }, s: { material: 'tile' } };
    },
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, плитка ${a.tile.split('x').reverse().join(' × ')} см`,
  },

  kvarcvinil: {
    title: 'Кварцвинил', key: 'lvt', page: 'kalkulyator-kvarcvinila',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.3, max: 100 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.3, max: 100 },
      { id: 'type', kind: 'choice', q: 'Какой кварцвинил?', choices: [['Замковый', 'click'], ['Клеевой', 'glue']] },
    ],
    build: (a) => ({ mode: 'rect', v: { len: a.len, wid: a.wid }, s: { type: a.type } }),
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, кварцвинил ${a.type === 'glue' ? 'клеевой' : 'замковый'}`,
  },

  laminat: {
    title: 'Ламинат', key: 'laminate', page: 'kalkulyator-laminata',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.3, max: 100 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.3, max: 100 },
    ],
    build: (a) => ({ mode: 'rect', v: { len: a.len, wid: a.wid }, s: {} }),
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, ламинат`,
  },

  oboi: {
    title: 'Обои', key: 'room', page: 'kalkulyator-oboev', finish: 'paper',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.5, max: 50 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.5, max: 50 },
      { id: 'hei', kind: 'num', q: 'Высота потолка, м?', presets: ['2.5', '2.7', '3'], min: 1.5, max: 6 },
      { id: 'okna', kind: 'choice', q: 'Сколько окон в комнате?', choices: NET_OKON },
      { id: 'dveri', kind: 'choice', q: 'Сколько дверей?', choices: NET_OKON.slice(0, 3) },
      { id: 'rollW', kind: 'choice', q: 'Ширина рулона?', choices: [['Метровые (1,06 м)', '1.06'], ['Полуметровые (0,53 м)', '0.53']] },
    ],
    build: (a) => ({ mode: 'room', v: { len: a.len, wid: a.wid, hei: a.hei, rollW: a.rollW }, s: {}, room: komnata(a, 'paper') }),
    opis: (a) => `Комната ${n(a.len)} × ${n(a.wid)} м, потолок ${n(a.hei)} м, ${okna(a)}`,
  },

  kraska: {
    title: 'Краска', key: 'room', page: 'kalkulyator-kraski', finish: 'paint',
    steps: [
      { id: 'chto', kind: 'choice', q: 'Что красим?', choices: [['Стены комнаты', 'room'], ['Потолок', 'ceiling']] },
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.5, max: 50 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.5, max: 50 },
      { id: 'hei', kind: 'num', q: 'Высота потолка, м?', presets: ['2.5', '2.7', '3'], min: 1.5, max: 6, when: (a) => a.chto === 'room' },
      { id: 'okna', kind: 'choice', q: 'Сколько окон в комнате?', choices: NET_OKON, when: (a) => a.chto === 'room' },
      { id: 'dveri', kind: 'choice', q: 'Сколько дверей?', choices: NET_OKON.slice(0, 3), when: (a) => a.chto === 'room' },
      { id: 'coats', kind: 'choice', q: 'Сколько слоёв?', choices: [['Один', '1'], ['Два', '2'], ['Три', '3']] },
    ],
    build(a) {
      if (a.chto === 'ceiling') return { mode: 'ceiling', v: { len: a.len, wid: a.wid, coats: a.coats }, s: {} };
      return { mode: 'room', v: { len: a.len, wid: a.wid, hei: a.hei, coats: a.coats }, s: {}, room: komnata(a, 'paint') };
    },
    opis: (a) => a.chto === 'ceiling'
      ? `Потолок ${n(a.len)} × ${n(a.wid)} м, ${n(a.coats)} ${sloj(a.coats)}`
      : `Стены комнаты ${n(a.len)} × ${n(a.wid)} м, потолок ${n(a.hei)} м, ${okna(a)}, ${n(a.coats)} ${sloj(a.coats)}`,
  },

  styazhka: {
    title: 'Стяжка', key: 'screed', page: 'kalkulyator-styazhki',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.3, max: 100 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.3, max: 100 },
      { id: 'mix', kind: 'choice', q: 'Из чего делаете?', choices: [['Пескобетон (готовая смесь)', 'ready'], ['Цемент и песок', 'cps'], ['Наливной пол', 'self']] },
      { id: 'thick', kind: 'num', q: 'Толщина слоя, мм?', presets: ['30', '50', '70', '80'], min: 2, max: 300, when: (a) => a.mix !== 'self' },
      { id: 'thick', kind: 'num', q: 'Толщина слоя, мм?', presets: ['5', '10', '20', '30'], min: 2, max: 300, when: (a) => a.mix === 'self' },
    ],
    build: (a) => ({ mode: 'rect', v: { len: a.len, wid: a.wid, thick: a.thick }, s: { mix: a.mix } }),
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, слой ${n(a.thick)} мм, ${{ ready: 'пескобетон', cps: 'цемент и песок', self: 'наливной пол' }[a.mix]}`,
  },
};

// Порядок кнопок в меню
export const MENU = ['beton', 'styazhka', 'plitka', 'kvarcvinil', 'laminat', 'oboi', 'kraska'];

const n = (x) => String(x).replace('.', ',');
function pick(a, ids) { const o = {}; for (const k of ids) o[k] = a[k]; return o; }
const sloj = (n) => (n === '1' ? 'слой' : 'слоя');
function okna(a) {
  const o = Number(a.okna), d = Number(a.dveri);
  const ch = [];
  ch.push(o ? `${o} ${o === 1 ? 'окно' : 'окна'}` : 'без окон');
  ch.push(d ? `${d} ${d === 1 ? 'дверь' : 'двери'}` : 'без дверей');
  return ch.join(', ');
}

// Комната для calc-room.js: окна и двери типовых размеров (как кнопки «+ окно», «+ дверь» на сайте),
// раскладываем по стенам по кругу, чтобы на одной стене не громоздились.
function komnata(a, finish) {
  const openings = [];
  let stena = 0;
  for (let i = 0; i < Number(a.okna || 0); i++) openings.push({ kind: 'window', w: 1.4, h: 1.4, y: 0.9, x: 0.5, wall: (stena++) % 4 });
  for (let i = 0; i < Number(a.dveri || 0); i++) openings.push({ kind: 'door', w: 0.9, h: 2.1, y: 0, x: 0.3, wall: (stena++) % 4 });
  return { walls: [], openings, defaultFinish: finish };
}
