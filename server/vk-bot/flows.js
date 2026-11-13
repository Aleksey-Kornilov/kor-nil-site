// flows.js — сценарии бота: какие вопросы задаём по каждому калькулятору.
// Считает не бот, а формулы сайта (calcs.js); здесь только «что спросить» и «куда подставить».
// Остальные поля берут значения по умолчанию, как на сайте; тонкая настройка — по ссылке на страницу.
//
// Шаг: { id, q, kind: 'choice' | 'num', choices?: [[подпись, значение]], presets?: [...], min, max,
//        when?: (a) => bool }. Ответы лежат в a[id]; куда они идут, решает build().

const NET_OKON = [['Нет', '0'], ['1', '1'], ['2', '2'], ['3', '3']];

const n = (x) => String(x).replace('.', ',');

// Ходовые размеры, см — сверено с каталогами магазинов 13.11.2026. Первый — как по умолчанию на сайте.
// [длина, ширина]; у плитки длина — бо́льшая сторона.
const KVARCVINIL = [['122', '18.3'], ['120', '18'], ['152', '18'], ['152', '23'], ['61', '30.5'], ['60', '30'], ['91.4', '45.7']];
const LAMINAT = [['138', '19.3'], ['128.5', '19.2'], ['129.2', '19.3'], ['138', '15.6'], ['129.2', '24.6'], ['205', '24']];
const PLITKA = [['20', '20'], ['30', '30'], ['33', '33'], ['40', '40'], ['45', '45'], ['60', '30'], ['60', '60'], ['60', '20'], ['120', '20'], ['120', '60']];

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
      ...razmerShagi('tile', 'Размер плитки, см?', PLITKA, 'плитки', [['20', '30', '60', '120'], ['20', '30', '60']]),
    ],
    build(a) {
      const [L, W] = razmer(a, 'tile');
      return { mode: 'rect', v: { len: a.len, wid: a.wid, tileL: L, tileW: W }, s: { material: 'tile' } };
    },
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, плитка ${razmer(a, 'tile').map(n).join(' × ')} см`,
  },

  kvarcvinil: {
    title: 'Кварцвинил', key: 'lvt', page: 'kalkulyator-kvarcvinila',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.3, max: 100 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.3, max: 100 },
      // Замковый тоже клеят (так надёжнее на тёплом полу и в больших комнатах) — тогда считаем клей и грунт, как у клеевого
      { id: 'type', kind: 'choice', q: 'Какой кварцвинил и как кладёте?', choices: [['Замковый, без клея', 'click'], ['Замковый, но на клей', 'clickglue'], ['Клеевой', 'glue']] },
      ...razmerShagi('plank', 'Размер планки или плитки, см?', KVARCVINIL, 'планки', [['60', '91', '122', '152'], ['18', '23', '30.5', '45.7']]),
      { id: 'perPack', kind: 'num', q: 'Сколько штук в упаковке? Написано на коробке.', presets: ['8', '10', '12', '16'], min: 1, max: 100, int: true, when: (a) => a.plank !== KVARCVINIL[0].join('x') },
    ],
    build: (a) => ({ mode: 'rect', v: { len: a.len, wid: a.wid, ...planka(a, KVARCVINIL) }, s: { type: a.type === 'click' ? 'click' : 'glue' } }),
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, кварцвинил ${{ click: 'замковый', clickglue: 'замковый на клей', glue: 'клеевой' }[a.type]}, ${razmerOpis(a, KVARCVINIL)}`,
  },

  laminat: {
    title: 'Ламинат', key: 'laminate', page: 'kalkulyator-laminata',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.3, max: 100 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.3, max: 100 },
      ...razmerShagi('plank', 'Размер доски, см?', LAMINAT, 'доски', [['121.8', '128.5', '138', '205'], ['15.6', '19.3', '24.4']]),
      { id: 'perPack', kind: 'num', q: 'Сколько досок в упаковке? Написано на коробке.', presets: ['6', '7', '8', '9'], min: 1, max: 100, int: true, when: (a) => a.plank !== LAMINAT[0].join('x') },
    ],
    build: (a) => ({ mode: 'rect', v: { len: a.len, wid: a.wid, ...planka(a, LAMINAT) }, s: {} }),
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, ламинат, ${razmerOpis(a, LAMINAT)}`,
  },

  oboi: {
    title: 'Обои', key: 'room', page: 'kalkulyator-oboev', finish: 'paper',
    steps: [
      { id: 'len', kind: 'num', q: 'Длина комнаты, м?', presets: ['3', '4', '5', '6'], min: 0.5, max: 50 },
      { id: 'wid', kind: 'num', q: 'Ширина комнаты, м?', presets: ['2', '3', '4', '5'], min: 0.5, max: 50 },
      { id: 'hei', kind: 'num', q: 'Высота потолка, м?', presets: ['2.5', '2.7', '3'], min: 1.5, max: 6 },
      { id: 'okna', kind: 'choice', q: 'Сколько окон в комнате?', choices: NET_OKON },
      { id: 'dveri', kind: 'choice', q: 'Сколько дверей?', choices: NET_OKON.slice(0, 3) },
      { id: 'roll', kind: 'choice', q: 'Какой рулон? Ширина и длина — на этикетке.', choices: [['Метровый 1,06 × 10,05 м', '1.06x10.05'], ['Полуметровый 0,53 × 10,05 м', '0.53x10.05'],
        ['Метровый 1,06 × 25 м (под покраску)', '1.06x25'], ['Метровый 1,06 × 15 м', '1.06x15'], ['Другой', 'svoj']] },
      { id: 'rollW', kind: 'num', q: 'Ширина рулона, м?', presets: ['0.53', '0.7', '1.06'], min: 0.3, max: 3, when: (a) => a.roll === 'svoj' },
      { id: 'rollL', kind: 'num', q: 'Длина рулона, м?', presets: ['10.05', '15', '25'], min: 1, max: 100, when: (a) => a.roll === 'svoj' },
    ],
    build: (a) => ({ mode: 'room', v: { len: a.len, wid: a.wid, hei: a.hei, ...rulon(a) }, s: {}, room: komnata(a, 'paper') }),
    opis: (a) => `Комната ${n(a.len)} × ${n(a.wid)} м, потолок ${n(a.hei)} м, ${okna(a)}, рулон ${Object.values(rulon(a)).map(n).join(' × ')} м`,
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
      { id: 'can', kind: 'num', q: 'Объём банки, л?', presets: ['0.9', '2.7', '4.5', '9', '10'], min: 0.1, max: 30 },
    ],
    build(a) {
      if (a.chto === 'ceiling') return { mode: 'ceiling', v: { len: a.len, wid: a.wid, coats: a.coats, can: a.can }, s: {} };
      return { mode: 'room', v: { len: a.len, wid: a.wid, hei: a.hei, coats: a.coats, can: a.can }, s: {}, room: komnata(a, 'paint') };
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
      { id: 'bag', kind: 'num', q: 'Мешок пескобетона, кг?', presets: ['25', '40', '50'], min: 1, max: 100, when: (a) => a.mix === 'ready' },
      { id: 'bag', kind: 'num', q: 'Мешок цемента, кг?', presets: ['25', '40', '50'], min: 1, max: 100, when: (a) => a.mix === 'cps' },
      { id: 'bag', kind: 'num', q: 'Мешок наливного пола, кг?', presets: ['20', '25'], min: 1, max: 100, when: (a) => a.mix === 'self' },
    ],
    build: (a) => ({ mode: 'rect', v: { len: a.len, wid: a.wid, thick: a.thick, [{ ready: 'readyBag', cps: 'cemBag', self: 'selfBag' }[a.mix]]: a.bag }, s: { mix: a.mix } }),
    opis: (a) => `Пол ${n(a.len)} × ${n(a.wid)} м, слой ${n(a.thick)} мм, ${{ ready: 'пескобетон', cps: 'цемент и песок', self: 'наливной пол' }[a.mix]}`,
  },

  akvarium: {
    title: 'Аквариум', key: 'aquarium', page: 'kalkulyator-akvariuma',
    steps: [
      { id: 'forma', kind: 'choice', q: 'Какой формы аквариум?', choices: [['Прямоугольный', 'rect'], ['Восьмигранный', 'oct'], ['Шестигранный', 'hex'],
        ['Угловой на 5 граней', 'corner5'], ['Угловой треугольный', 'corner3'], ['Круглый (цилиндр)', 'cyl'], ['Шар', 'ball']] },
      { id: 'len', kind: 'num', q: 'Длина аквариума, см?', presets: ['40', '50', '60', '80'], min: 5, max: 500, when: (a) => a.forma === 'rect' },
      { id: 'wid', kind: 'num', q: 'Ширина — от переднего стекла до заднего, см?', presets: ['25', '30', '35', '40'], min: 5, max: 500, when: (a) => a.forma === 'rect' },
      { id: 'face', kind: 'num', q: 'Ширина одного стекла (грани) снаружи, см?', presets: ['10', '12', '15', '20'], min: 2, max: 300, when: (a) => a.forma === 'oct' || a.forma === 'hex' },
      { id: 'backL', kind: 'num', q: 'Задняя стенка слева (вдоль стены), см?', presets: ['40', '50', '60', '70'], min: 5, max: 500, when: (a) => a.forma === 'corner5' || a.forma === 'corner3' },
      { id: 'backR', kind: 'num', q: 'Задняя стенка справа (вдоль стены), см?', presets: ['40', '50', '60', '70'], min: 5, max: 500, when: (a) => a.forma === 'corner5' || a.forma === 'corner3' },
      { id: 'sideL', kind: 'num', q: 'Короткое боковое стекло слева, см?', presets: ['15', '20', '25', '30'], min: 1, max: 500, when: (a) => a.forma === 'corner5' },
      { id: 'sideR', kind: 'num', q: 'Короткое боковое стекло справа, см?', presets: ['15', '20', '25', '30'], min: 1, max: 500, when: (a) => a.forma === 'corner5' },
      { id: 'diam', kind: 'num', q: 'Диаметр в самом широком месте, см?', presets: ['30', '40', '50', '60'], min: 5, max: 500, when: (a) => a.forma === 'cyl' },
      { id: 'diam', kind: 'num', q: 'Диаметр шара в самом широком месте, см?', presets: ['20', '25', '30', '40'], min: 5, max: 300, when: (a) => a.forma === 'ball' },
      { id: 'hei', kind: 'num', q: 'Высота аквариума, см?', presets: ['30', '35', '40', '45', '50'], min: 5, max: 300, when: (a) => a.forma !== 'ball' },
      { id: 'soil', kind: 'choice', q: 'Грунт на дне (слой 5 см)?', choices: [['Гравий', 'gravel'], ['Песок', 'sand'], ['Питательный', 'nutri'], ['Без грунта', 'none']] },
      { id: 'fish', kind: 'choice', q: 'Какие рыбки?', choices: [['Тропические (гуппи, неоны, петушки)', 'trop'], ['Золотые и вуалехвосты', 'cold']] },
    ],
    build(a) {
      const s = { soil: a.soil, fish: a.fish };
      if (a.forma === 'oct' || a.forma === 'hex') return { mode: 'regular', v: { sides: a.forma === 'oct' ? '8' : '6', face: a.face, hei: a.hei }, s };
      const fields = { rect: ['len', 'wid', 'hei'], corner5: ['backL', 'backR', 'sideL', 'sideR', 'hei'], corner3: ['backL', 'backR', 'hei'], cyl: ['diam', 'hei'], ball: ['diam'] }[a.forma];
      return { mode: a.forma, v: pick(a, fields), s };
    },
    opis(a) {
      const h = `высота ${n(a.hei)} см`;
      return {
        rect: `прямоугольный ${n(a.len)} × ${n(a.wid)} см, ${h}`,
        oct: `восьмигранный, грань ${n(a.face)} см, ${h}`,
        hex: `шестигранный, грань ${n(a.face)} см, ${h}`,
        corner5: `угловой на 5 граней: задние ${n(a.backL)} и ${n(a.backR)} см, боковые ${n(a.sideL)} и ${n(a.sideR)} см, ${h}`,
        corner3: `угловой треугольный: задние ${n(a.backL)} и ${n(a.backR)} см, ${h}`,
        cyl: `круглый, диаметр ${n(a.diam)} см, ${h}`,
        ball: `шар диаметром ${n(a.diam)} см`,
      }[a.forma];
    },
  },
};

// Порядок кнопок в меню
export const MENU = ['beton', 'styazhka', 'plitka', 'kvarcvinil', 'laminat', 'oboi', 'kraska', 'akvarium'];

// Вопрос «какой размер» кнопками из списка + «Свой размер» → длина и ширина числом.
function razmerShagi(id, q, spisok, chego, [dliny, shiriny]) {
  const svoj = (a) => a[id] === 'svoj';
  return [
    { id, kind: 'choice', q, choices: [...spisok.map(([L, W]) => [`${n(L)}×${n(W)}`, `${L}x${W}`]), ['Свой размер', 'svoj']] },
    { id: id + 'L', kind: 'num', q: `Длина ${chego}, см?`, presets: dliny, min: 5, max: 300, when: svoj },
    { id: id + 'W', kind: 'num', q: `Ширина ${chego}, см?`, presets: shiriny, min: 5, max: 200, when: svoj },
  ];
}
const razmer = (a, id) => (a[id] === 'svoj' ? [a[id + 'L'], a[id + 'W']] : a[id].split('x'));
function planka(a, spisok) {
  if (a.plank === spisok[0].join('x')) return {};                       // обычный — всё как на сайте
  const [plankL, plankW] = razmer(a, 'plank');
  return { plankL, plankW, perPack: a.perPack };
}
const razmerOpis = (a, spisok) => `${razmer(a, 'plank').map(n).join(' × ')} см` + (a.plank === spisok[0].join('x') ? '' : `, ${n(a.perPack)} шт. в упаковке`);
const rulon = (a) => (a.roll === 'svoj' ? { rollW: a.rollW, rollL: a.rollL } : { rollW: a.roll.split('x')[0], rollL: a.roll.split('x')[1] });
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
