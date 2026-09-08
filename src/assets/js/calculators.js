// calculators.js — строительные и дачные калькуляторы (/tools/).
// Формулы и константы перенесены 1:1 из приложения ЧатЯдро
// (lib/screens/tools/calculators/*.dart). Всё считается в браузере, сервера нет.
// Разметка формы строится из описания CALCS; на странице только <div class="calc" data-calc="…">.

(function () {
  'use strict';

  /* ---------- Числа: парсинг и формат (calc_format.dart, calc_engine.dart) ---------- */

  function parseNum(s) {
    const t = String(s == null ? '' : s).trim().replace(/[\s ]/g, '').replace(',', '.');
    if (!t) return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }

  // Хвостовые нули режем только когда есть точка — иначе «94 500» превратится в «945».
  function fmt(v, maxDecimals) {
    if (maxDecimals === undefined) maxDecimals = 2;
    if (!Number.isFinite(v)) return '—';
    let s = v.toFixed(maxDecimals);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }

  function formatNumber(v, maxDecimals) {
    if (maxDecimals === undefined) maxDecimals = 6;
    if (!Number.isFinite(v)) return '—';
    let s = v.toFixed(maxDecimals);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    const neg = s.startsWith('-');
    if (neg) s = s.slice(1);
    const parts = s.split('.');
    const digits = parts[0];
    let out = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ' ';
      out += digits[i];
    }
    if (parts.length > 1) out += ',' + parts[1];
    return neg ? '-' + out : out;
  }

  const fmtInt = (v) => formatNumber(v, 0);
  const money = (v) => formatNumber(Math.round(v), 0) + ' ₽';

  function plural(n, one, few, many) {
    const abs = Math.abs(n), last = abs % 10, tens = abs % 100;
    if (tens >= 11 && tens <= 14) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  const pos = (v) => v != null && v > 0;

  /* ---------- Описания калькуляторов ---------- */

  // Расход на 1 м³ бетона (кг), цемент М400 — усреднённая таблица (concrete_calculator.dart).
  const GRADES = {
    m100: { name: 'М100', cement: 214, sand: 870, gravel: 1080, water: 210,
      use: 'Подготовка: подушка под фундамент, подстилающий слой, бордюры. Нагрузку не несёт.' },
    m150: { name: 'М150', cement: 235, sand: 855, gravel: 1080, water: 210,
      use: 'Стяжка пола, садовые дорожки, отмостка, основание под лёгкие постройки (сарай, беседка).' },
    m200: { name: 'М200', cement: 286, sand: 795, gravel: 1080, water: 210,
      use: 'Самая ходовая на даче: ленточный фундамент лёгкого дома, баня, гараж, площадки, лестницы.' },
    m250: { name: 'М250', cement: 332, sand: 750, gravel: 1080, water: 215,
      use: 'Фундамент дома из бруса или газоблока, монолитные плиты, подпорные стенки.' },
    m300: { name: 'М300', cement: 382, sand: 705, gravel: 1080, water: 220,
      use: 'Фундамент тяжёлого дома (кирпич, два этажа), монолитные стены и перекрытия, площадка под машину.' },
  };

  // Насыпная плотность, т/м³ (bulk_calculator.dart).
  const MATERIALS = {
    sand: { name: 'Песок', density: 1.55, hint: 'карьерный сухой; влажный тяжелее на 10–15%' },
    gravel: { name: 'Щебень', density: 1.35, hint: 'гранитный, фракция 20–40' },
    pgs: { name: 'ПГС', density: 1.65, hint: 'песчано-гравийная смесь' },
    screening: { name: 'Отсев', density: 1.40, hint: 'гранитный отсев' },
    soil: { name: 'Земля, чернозём', density: 1.30, hint: 'рыхлый грунт' },
    peat: { name: 'Торф', density: 0.50, hint: 'верховой, влажность средняя' },
    expandedClay: { name: 'Керамзит', density: 0.40, hint: 'фракция 10–20' },
  };
  // Чем возят: грузоподъёмность — что реально берут, а не по паспорту.
  const TRUCKS = [
    { name: 'Газель', tons: 1.5 },
    { name: 'Самосвал 5 т', tons: 5 },
    { name: 'Самосвал 10 т', tons: 10 },
    { name: 'Самосвал 20 т', tons: 20 },
  ];
  function bestTrips(tons) {
    if (tons <= 0) return 0;
    for (const t of TRUCKS) if (tons <= t.tons) return 1;
    return Math.ceil(tons / TRUCKS[TRUCKS.length - 1].tons);
  }

  const CALCS = {
    /* --- Бетон / фундамент --- */
    concrete: {
      modeLabel: 'Что заливаем',
      modes: [
        { id: 'slab', label: 'Плита / стяжка', fields: [
          { id: 'len', label: 'Длина', unit: 'м' },
          { id: 'wid', label: 'Ширина', unit: 'м' },
          { id: 'thick', label: 'Толщина', unit: 'см' },
        ] },
        { id: 'strip', label: 'Ленточный фундамент', fields: [
          { id: 'hLen', label: 'Длина дома (по наружке)', unit: 'м' },
          { id: 'hWid', label: 'Ширина дома (по наружке)', unit: 'м' },
          { id: 'sWid', label: 'Ширина ленты', unit: 'см' },
          { id: 'sDepth', label: 'Глубина в земле', unit: 'см' },
          { id: 'sAbove', label: 'Высота над землёй (цоколь)', unit: 'см, необязательно' },
          { id: 'sInner', label: 'Внутренние стены на ленте', unit: 'м, необязательно' },
        ] },
        { id: 'columns', label: 'Столбы / колонны', fields: [
          { id: 'cSide', label: 'Сечение (сторона квадрата)', unit: 'см' },
          { id: 'cHei', label: 'Высота столба', unit: 'м' },
          { id: 'cCount', label: 'Количество столбов', unit: 'шт', value: '1' },
        ] },
      ],
      selects: [{ id: 'grade', label: 'Марка бетона', default: 'm200',
        choices: Object.keys(GRADES).map((k) => ({ id: k, label: GRADES[k].name, hint: GRADES[k].use })) }],
      prices: [
        { id: 'cement', label: 'Цемент М400', unit: '₽ за мешок 50 кг' },
        { id: 'sand', label: 'Песок', unit: '₽ за тонну' },
        { id: 'gravel', label: 'Щебень', unit: '₽ за тонну' },
      ],
      draw(v, mode, box, yaw) {
        const V = window.CalcViz; if (!V) return false;
        const cm = (x) => (x || 0) / 100;
        if (mode === 'slab') {
          if (!(pos(v.len) && pos(v.wid) && pos(v.thick))) return false;
          const L = v.len, W = v.wid, t = cm(v.thick);
          V.iso(box, [{ x: 0, y: 0, z: 0, dx: L, dy: W, dz: t }], [
            { from: [0, W, 0], to: [L, W, 0], label: 'длина ' + fmt(L) + ' м', offset: 22 },
            { from: [L, 0, 0], to: [L, W, 0], label: 'ширина ' + fmt(W) + ' м', offset: -22 },
            { from: [0, 0, 0], to: [0, 0, t], label: 'толщина ' + fmt(v.thick) + ' см', offset: -22 },
          ], { yaw, caption: 'Плита. Потяните, чтобы повернуть.' });
          return true;
        }
        if (mode === 'strip') {
          const L = v.hLen, W = v.hWid, w = cm(v.sWid), d = cm(v.sDepth), a = cm(v.sAbove);
          if (!(pos(L) && pos(W) && pos(w) && pos(d) && 2 * w < L && 2 * w < W)) return false;
          const z0 = -d;
          // Кольцо ленты из четырёх брусков; подземная часть и цоколь — отдельными брусками,
          // чтобы подземная рисовалась другим цветом.
          const ring = (z, dz) => [
            { x: 0, y: 0, z, dx: L, dy: w, dz }, { x: 0, y: W - w, z, dx: L, dy: w, dz },
            { x: 0, y: w, z, dx: w, dy: W - 2 * w, dz }, { x: L - w, y: w, z, dx: w, dy: W - 2 * w, dz },
          ];
          const boxes = ring(z0, d);
          if (a > 0) boxes.push(...ring(0, a));
          if (pos(v.sInner)) {
            const il = Math.min(v.sInner, W - 2 * w);
            boxes.push({ x: L / 2 - w / 2, y: w, z: z0, dx: w, dy: il, dz: d });
            if (a > 0) boxes.push({ x: L / 2 - w / 2, y: w, z: 0, dx: w, dy: il, dz: a });
          }
          const dims = [
            { from: [0, W, a], to: [L, W, a], label: 'длина ' + fmt(L) + ' м', offset: 24 },
            { from: [L, 0, a], to: [L, W, a], label: 'ширина ' + fmt(W) + ' м', offset: -24 },
            { from: [L, W - w, a], to: [L, W, a], label: 'лента ' + fmt(v.sWid) + ' см', offset: -36 },
            { from: [L, 0, z0], to: [L, 0, 0], label: 'в земле ' + fmt(v.sDepth) + ' см', offset: 40 },
          ];
          if (a > 0) dims.push({ from: [0, 0, 0], to: [0, 0, a], label: 'цоколь ' + fmt(v.sAbove) + ' см', offset: -30 });
          V.iso(box, boxes, dims, { yaw, ground: true, caption: 'Зелёное — уровень земли. Потяните, чтобы повернуть.' });
          return true;
        }
        if (mode === 'columns') {
          if (!(pos(v.cSide) && pos(v.cHei) && pos(v.cCount))) return false;
          const s = cm(v.cSide), hgt = v.cHei, n = Math.min(Math.round(v.cCount), 36);
          const cols = Math.ceil(Math.sqrt(n)), step = Math.max(s * 3, 1.2);
          const boxes = [];
          for (let i = 0; i < n; i++) boxes.push({ x: (i % cols) * step, y: Math.floor(i / cols) * step, z: 0, dx: s, dy: s, dz: hgt });
          V.iso(box, boxes, [
            { from: [0, 0, 0], to: [0, 0, hgt], label: 'высота ' + fmt(hgt) + ' м', offset: -26 },
            { from: [0, s, hgt], to: [s, s, hgt], label: 'сечение ' + fmt(v.cSide) + ' см', offset: 18 },
          ], { yaw, ground: true, caption: n + ' ' + plural(n, 'столб', 'столба', 'столбов') + '. Потяните, чтобы повернуть.' });
          return true;
        }
        return false;
      },
      compute(v, mode, sel) {
        let volume = null;
        if (mode === 'slab') {
          const l = v.len, w = v.wid, t = v.thick;
          if (pos(l) && pos(w) && pos(t)) volume = l * w * (t / 100);
        } else if (mode === 'strip') {
          // Лента по наружным размерам дома: площадь кольца = L·W − (L−2w)(W−2w),
          // углы не считаются дважды. Полная высота = в земле + цоколь.
          const L = v.hLen, Wd = v.hWid, w = (v.sWid || 0) / 100, h = ((v.sDepth || 0) + (v.sAbove || 0)) / 100;
          if (pos(L) && pos(Wd) && pos(w) && pos(v.sDepth) && 2 * w < L && 2 * w < Wd) {
            const ring = L * Wd - (L - 2 * w) * (Wd - 2 * w);
            volume = (ring + (v.sInner || 0) * w) * h;
          }
        } else {
          const s = v.cSide, h = v.cHei, n = v.cCount;
          if (pos(s) && pos(h) && pos(n)) volume = (s / 100) * (s / 100) * h * n;
        }
        if (volume == null) return null;
        const g = GRADES[sel.grade];
        const withReserve = volume * 1.1;
        const cementKg = withReserve * g.cement;
        const bags = Math.ceil(cementKg / 50);
        const sandKg = withReserve * g.sand;
        const gravelKg = withReserve * g.gravel;
        const waterL = withReserve * g.water;
        return {
          main: { label: 'Нужно бетона (с запасом 10%)', value: fmt(withReserve) + ' м³' },
          rows: [
            ['Чистый объём', fmt(volume) + ' м³'],
            ['Цемент М400', fmtInt(cementKg) + ' кг (≈ ' + bags + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' по 50 кг)'],
            ['Песок', fmtInt(sandKg) + ' кг'],
            ['Щебень', fmtInt(gravelKg) + ' кг'],
            ['Вода', '≈ ' + fmtInt(waterL) + ' л'],
          ],
          note: 'Расход для бетона ' + g.name + ' на цементе М400 (усреднённо). Реальный расход зависит от влажности песка и фракции щебня.',
          cost: [
            { label: 'Цемент', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: 'cement' },
            { label: 'Песок', amount: sandKg / 1000, unit: 'т', priceId: 'sand' },
            { label: 'Щебень', amount: gravelKg / 1000, unit: 'т', priceId: 'gravel' },
          ],
        };
      },
    },

    /* --- Краска / побелка --- */
    paint: {
      modeLabel: 'Что красим',
      modes: [
        { id: 'walls', label: 'Стены комнаты', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м' },
          { id: 'hei', label: 'Высота потолка', unit: 'м' },
        ], openings: true },
        { id: 'ceiling', label: 'Потолок', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м' },
        ] },
        { id: 'custom', label: 'Своя площадь', fields: [
          { id: 'area', label: 'Площадь поверхности', unit: 'м²' },
        ] },
      ],
      common: [
        { id: 'coats', label: 'Количество слоёв', unit: '', value: '2' },
        { id: 'rate', label: 'Расход краски (м² на 1 литр)', unit: 'на банке', value: '10' },
        { id: 'can', label: 'Объём банки', unit: 'л', value: '2.7' },
      ],
      presets: { label: 'Расход по типу краски', fieldId: 'rate', unit: 'м²/л', items: [
        ['Водоэмульсионка', '10'], ['Эмаль', '12'], ['Побелка/известь', '7'], ['По дереву', '8'],
      ] },
      prices: [{ id: 'can', label: 'Цена краски', unit: '₽ за банку' }],
      draw(v, mode, box, yaw, extras) {
        const V = window.CalcViz; if (!V) return false;
        if (mode === 'walls' && pos(v.len) && pos(v.wid) && pos(v.hei)) {
          const ops = (extras.openings || []).filter((o) => pos(o.w) && pos(o.h));
          const opArea = ops.reduce((s, o) => s + o.w * o.h * (o.count || 1), 0);
          V.walls(box, [{ label: 'Стена', len: v.len }, { label: 'Стена', len: v.wid }, { label: 'Стена', len: v.len }, { label: 'Стена', len: v.wid }], v.hei, ops,
            { caption: 'Развёртка стен. Проёмы: ' + fmt(opArea) + ' м², под покраску ' + fmt(2 * (v.len + v.wid) * v.hei - opArea) + ' м²' });
          return true;
        }
        if (mode === 'ceiling' && pos(v.len) && pos(v.wid)) {
          V.shape(box, [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]], [
            { from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 }, { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 },
          ], { center: fmt(v.len * v.wid) + ' м²', title: 'Потолок' });
          return true;
        }
        return false;
      },
      compute(v, mode, sel, extras) {
        let area = null;
        if (mode === 'walls') {
          if (pos(v.len) && pos(v.wid) && pos(v.hei)) {
            const ops = (extras.openings || []).filter((o) => pos(o.w) && pos(o.h));
            const opArea = ops.reduce((s, o) => s + o.w * o.h * (o.count || 1), 0);
            const a = 2 * (v.len + v.wid) * v.hei - opArea;
            area = a > 0 ? a : null;
          }
        } else if (mode === 'ceiling') {
          if (pos(v.len) && pos(v.wid)) area = v.len * v.wid;
        } else if (pos(v.area)) area = v.area;
        const coats = v.coats == null ? 1 : v.coats;
        if (area == null || !pos(v.rate) || !(coats > 0)) return null;
        const liters = area * coats / v.rate;
        const reserve = liters * 1.1;
        const cans = pos(v.can) ? Math.ceil(reserve / v.can) : null;
        const rows = [
          ['Без запаса', fmt(liters) + ' л'],
          ['Площадь окраски', fmt(area) + ' м² × ' + fmt(coats) + ' сл.'],
        ];
        if (cans != null) rows.push(['Банок по ' + fmt(v.can) + ' л', '≈ ' + cans + ' шт']);
        return {
          main: { label: 'Нужно краски (с запасом 10%)', value: fmt(reserve) + ' л' },
          rows,
          note: 'Расход указан на банке (обычно 8–12 м²/л). Для тёмного по светлому может понадобиться больше слоёв.',
          cost: cans != null ? [{ label: 'Краска', amount: cans, unit: plural(cans, 'банка', 'банки', 'банок'), priceId: 'can' }] : [],
        };
      },
    },

    /* --- Песок, щебень, земля --- */
    bulk: {
      modeLabel: 'Что известно',
      modes: [
        { id: 'volume', label: 'Объём в кубах', fields: [{ id: 'vol', label: 'Объём', unit: 'м³' }] },
        { id: 'area', label: 'Площадь засыпки', fields: [
          { id: 'len', label: 'Длина', unit: 'м' },
          { id: 'wid', label: 'Ширина', unit: 'м' },
          { id: 'thick', label: 'Толщина слоя', unit: 'см', placeholder: 'дорожка 10–15, грядка 20–30' },
        ] },
        { id: 'weight', label: 'Вес в тоннах', fields: [{ id: 'weight', label: 'Вес', unit: 'т' }] },
      ],
      selects: [{ id: 'material', label: 'Материал', default: 'sand',
        choices: Object.keys(MATERIALS).map((k) => ({ id: k, label: MATERIALS[k].name, hint: MATERIALS[k].density + ' т/м³ — ' + MATERIALS[k].hint })) }],
      prices: [
        { id: 'perTon', label: 'Цена материала', unit: '₽ за тонну' },
        { id: 'delivery', label: 'Доставка', unit: '₽ за рейс, необязательно' },
      ],
      draw(v, mode, box, yaw) {
        const V = window.CalcViz; if (!V || mode !== 'area' || !(pos(v.len) && pos(v.wid) && pos(v.thick))) return false;
        const t = v.thick / 100;
        V.iso(box, [{ x: 0, y: 0, z: 0, dx: v.len, dy: v.wid, dz: t }], [
          { from: [0, v.wid, 0], to: [v.len, v.wid, 0], label: 'длина ' + fmt(v.len) + ' м', offset: 22 },
          { from: [v.len, 0, 0], to: [v.len, v.wid, 0], label: 'ширина ' + fmt(v.wid) + ' м', offset: -22 },
          { from: [0, 0, 0], to: [0, 0, t], label: 'слой ' + fmt(v.thick) + ' см', offset: -22 },
        ], { yaw, caption: 'Слой засыпки. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel) {
        const m = MATERIALS[sel.material];
        let cubes = null;
        if (mode === 'volume') cubes = pos(v.vol) ? v.vol : null;
        else if (mode === 'area') { if (pos(v.len) && pos(v.wid) && pos(v.thick)) cubes = v.len * v.wid * (v.thick / 100); }
        else cubes = pos(v.weight) ? v.weight / m.density : null;
        if (cubes == null) return null;
        const tons = cubes * m.density;
        const rows = [['Насыпная плотность', fmt(m.density) + ' т/м³']];
        TRUCKS.forEach((t) => {
          const n = Math.ceil(tons / t.tons);
          if (n > 0 && n <= 12) rows.push([t.name, n === 1 ? 'один рейс' : n + ' ' + plural(n, 'рейс', 'рейса', 'рейсов')]);
        });
        return {
          main: { label: 'Нужно: ' + m.name.toLowerCase(), value: fmt(cubes) + ' м³ · ' + fmt(tons) + ' т' },
          rows,
          note: 'Плотность усреднённая: ' + m.hint + '. Продавцы считают тоннами, поэтому берите объём с запасом 5–10% — часть уйдёт в утруску и просыпь.',
          cost: [
            { label: m.name, amount: tons, unit: 'т', priceId: 'perTon' },
            { label: 'Доставка', amount: bestTrips(tons), unit: plural(bestTrips(tons), 'рейс', 'рейса', 'рейсов'), priceId: 'delivery', optional: true },
          ],
        };
      },
    },

    /* --- Площадь участка --- */
    area: {
      modeLabel: 'Форма участка',
      modes: [
        { id: 'rect', label: 'Прямоугольник', fields: [{ id: 'a', label: 'Длина', unit: 'м' }, { id: 'b', label: 'Ширина', unit: 'м' }] },
        { id: 'triangle', label: 'Треугольник', fields: [{ id: 'a', label: 'Основание', unit: 'м' }, { id: 'b', label: 'Высота', unit: 'м' }] },
        { id: 'circle', label: 'Круг', fields: [{ id: 'a', label: 'Радиус', unit: 'м' }] },
        { id: 'trapezoid', label: 'Трапеция', fields: [{ id: 'a', label: 'Верхнее основание', unit: 'м' }, { id: 'b', label: 'Нижнее основание', unit: 'м' }, { id: 'c', label: 'Высота', unit: 'м' }] },
      ],
      prices: [{ id: 'm2', label: 'Цена (земля, газон, плитка)', unit: '₽ за м²' }],
      draw(v, mode, box) {
        const V = window.CalcViz; if (!V) return false;
        const m = (x) => fmt(x) + ' м';
        if (mode === 'rect' && pos(v.a) && pos(v.b)) {
          V.shape(box, [[0, 0], [v.a, 0], [v.a, v.b], [0, v.b]], [{ from: [0, 0], to: [v.a, 0], label: m(v.a), offset: 22 }, { from: [v.a, 0], to: [v.a, v.b], label: m(v.b), offset: 22 }], { center: fmt(v.a * v.b / 100) + ' сот.', title: 'Участок' });
          return true;
        }
        if (mode === 'triangle' && pos(v.a) && pos(v.b)) {
          V.shape(box, [[0, 0], [v.a, 0], [v.a * 0.35, v.b]], [{ from: [0, 0], to: [v.a, 0], label: 'основание ' + m(v.a), offset: 22 }, { from: [v.a * 0.35, 0], to: [v.a * 0.35, v.b], label: 'высота ' + m(v.b), offset: 0 }], { center: fmt(v.a * v.b / 2 / 100) + ' сот.', title: 'Участок' });
          return true;
        }
        if (mode === 'circle' && pos(v.a)) {
          V.shape(box, [[-v.a, -v.a], [v.a, v.a]], [{ from: [0, 0], to: [v.a, 0], label: 'радиус ' + m(v.a), offset: 0 }], { circle: { cx: 0, cy: 0, r: v.a }, center: '', title: 'Участок' });
          return true;
        }
        if (mode === 'trapezoid' && pos(v.a) && pos(v.b) && pos(v.c)) {
          const off = (v.b - v.a) / 2;
          V.shape(box, [[0, 0], [v.b, 0], [v.b - off, v.c], [off, v.c]], [{ from: [0, 0], to: [v.b, 0], label: 'нижнее ' + m(v.b), offset: 22 }, { from: [v.b - off, v.c], to: [off, v.c], label: 'верхнее ' + m(v.a), offset: 22 }, { from: [v.b, 0], to: [v.b, v.c], label: 'высота ' + m(v.c), offset: 22 }], { center: fmt((v.a + v.b) / 2 * v.c / 100) + ' сот.', title: 'Участок' });
          return true;
        }
        return false;
      },
      compute(v, mode) {
        let area = null, perimeter = null;
        if (mode === 'rect') { if (pos(v.a) && pos(v.b)) { area = v.a * v.b; perimeter = 2 * (v.a + v.b); } }
        else if (mode === 'triangle') { if (pos(v.a) && pos(v.b)) area = v.a * v.b / 2; }
        else if (mode === 'circle') { if (pos(v.a)) { area = Math.PI * v.a * v.a; perimeter = 2 * Math.PI * v.a; } }
        else if (pos(v.a) && pos(v.b) && pos(v.c)) area = (v.a + v.b) / 2 * v.c;
        if (area == null) return null;
        const rows = [['В квадратных метрах', fmt(area) + ' м²'], ['В гектарах', fmt(area / 10000, 4) + ' га']];
        if (perimeter != null) rows.push(['Периметр (для забора)', fmt(perimeter) + ' м']);
        return {
          main: { label: 'Площадь', value: fmt(area / 100) + ' ' + plural(Math.round(area / 100), 'сотка', 'сотки', 'соток') },
          rows,
          note: '1 сотка = 100 м². Для сложного участка разбейте его на простые фигуры и сложите площади.',
          cost: [{ label: 'Площадь', amount: area, unit: 'м²', priceId: 'm2' }],
        };
      },
    },

    /* --- Удобрения --- */
    fertilizer: {
      modeLabel: 'Что считаем',
      modes: [
        { id: 'area', label: 'Внесение на площадь', fields: [
          { id: 'area', label: 'Площадь грядки / участка', unit: 'м²' },
          { id: 'rate', label: 'Норма внесения', unit: 'г на 1 м²' },
        ], presets: { label: 'Нормы по удобрению', fieldId: 'rate', unit: 'г/м²', items: [
          ['Перегной/компост', '5000'], ['Навоз', '4000'], ['Зола', '150'], ['Селитра', '20'], ['Суперфосфат', '40'], ['Комплексное NPK', '30'],
        ] } },
        { id: 'solution', label: 'Раствор для подкормки', fields: [
          { id: 'conc', label: 'Концентрация', unit: 'г на 10 л воды' },
          { id: 'water', label: 'Объём воды', unit: 'л (ведро = 10, лейка = 10)', value: '10' },
        ], presets: { label: 'Концентрация по удобрению', fieldId: 'conc', unit: 'г/10 л', items: [
          ['Мочевина', '10'], ['Селитра', '15'], ['Коровяк настой', '500'], ['Комплексное NPK', '20'],
        ] } },
      ],
      prices: [{ id: 'kg', label: 'Цена удобрения', unit: '₽ за килограмм' }],
      compute(v, mode) {
        let grams = null;
        if (mode === 'area') { if (pos(v.area) && pos(v.rate)) grams = v.area * v.rate; }
        else if (pos(v.conc) && pos(v.water)) grams = v.conc * v.water / 10;
        if (grams == null) return null;
        const amount = grams >= 1000 ? fmt(grams / 1000) + ' кг' : fmt(grams) + ' г';
        return {
          main: { label: mode === 'area' ? 'Нужно удобрения' : 'Удобрения на раствор', value: amount },
          rows: mode === 'area'
            ? [['На площадь', fmt(v.area) + ' м² по ' + fmt(v.rate) + ' г/м²']]
            : [['Раствор', fmt(v.water) + ' л по ' + fmt(v.conc) + ' г на 10 л']],
          note: mode === 'area'
            ? 'Нормы примерные — уточняйте на упаковке конкретного удобрения.'
            : 'Подкормку лучше делать по влажной почве, утром или вечером. Нормы примерные.',
          cost: [{ label: 'Удобрение', amount: grams / 1000, unit: 'кг', priceId: 'kg' }],
        };
      },
    },
  };

  /* ---------- Рендер ---------- */

  const h = (tag, attrs, children) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => c && el.appendChild(c));
    return el;
  };

  function chips(name, label, items, current, onChange) {
    const wrap = h('fieldset', { class: 'calc-chips' }, [h('legend', { text: label })]);
    items.forEach((it) => {
      const id = name + '-' + it.id;
      const input = h('input', { type: 'radio', name, id, value: it.id });
      if (it.id === current) input.checked = true;
      input.addEventListener('change', () => onChange(it.id));
      wrap.appendChild(h('div', { class: 'calc-chip' }, [input, h('label', { for: id, text: it.label })]));
    });
    return wrap;
  }

  function mount(root) {
    const key = root.dataset.calc;
    const def = CALCS[key];
    if (!def) return;
    const state = { mode: def.modes[0].id, sel: {}, values: {}, prices: {}, extras: { openings: [] }, yaw: -0.6 };
    (def.selects || []).forEach((s) => { state.sel[s.id] = s.default; });
    const storageKey = (id) => 'kn_calc_price_' + key + '_' + id;
    (def.prices || []).forEach((p) => { try { state.prices[p.id] = localStorage.getItem(storageKey(p.id)) || ''; } catch (e) { state.prices[p.id] = ''; } });

    const form = h('form', { class: 'calc-form', novalidate: '' });
    form.addEventListener('submit', (e) => e.preventDefault());
    const fieldsBox = h('div', { class: 'calc-fields' });
    const openingsBox = h('div', { class: 'calc-openings' });
    const vizBox = h('div', { class: 'calc-viz', hidden: '' });
    const presetsBox = h('div', { class: 'calc-presets' });
    const selectsBox = h('div');
    const result = h('div', { class: 'calc-result', 'aria-live': 'polite' });
    const costBox = h('details', { class: 'calc-cost' }, [h('summary', { text: 'Посчитать стоимость' })]);

    function field(f) {
      const id = key + '-' + f.id;
      const saved = state.values[f.id];
      const input = h('input', { type: 'text', inputmode: 'decimal', id, name: f.id, autocomplete: 'off',
        placeholder: f.placeholder || '0', value: saved != null ? saved : (f.value || '') });
      if (saved == null && f.value) state.values[f.id] = f.value;
      input.addEventListener('input', () => { state.values[f.id] = input.value; render(); });
      return h('div', { class: 'calc-field' }, [
        h('label', { for: id, text: f.label }),
        h('div', { class: 'calc-input' }, [input, f.unit ? h('span', { class: 'calc-unit', text: f.unit }) : null]),
      ]);
    }

    const OPENING_PRESETS = [
      { kind: 'window', label: '+ окно', w: '1.4', h: '1.4' },
      { kind: 'door', label: '+ дверь', w: '0.9', h: '2.1' },
      { kind: 'window', label: '+ балконная дверь', w: '0.8', h: '2.1' },
    ];
    function renderOpenings() {
      openingsBox.innerHTML = '';
      const mode = def.modes.find((m) => m.id === state.mode);
      if (!mode.openings) return;
      openingsBox.appendChild(h('p', { class: 'calc-openings-title', text: 'Окна и двери (вычитаются из площади)' }));
      state.extras.openings.forEach((o, idx) => {
        const row = h('div', { class: 'calc-opening' });
        const mk = (key, label) => {
          const inp = h('input', { type: 'text', inputmode: 'decimal', value: o[key], 'aria-label': label });
          inp.addEventListener('input', () => { o[key] = inp.value; render(); });
          return h('label', { class: 'calc-opening-f' }, [h('span', { text: label }), inp]);
        };
        row.appendChild(h('span', { class: 'calc-opening-kind', text: o.kind === 'door' ? 'Дверь' : 'Окно' }));
        row.appendChild(mk('w', 'ширина, м')); row.appendChild(mk('h', 'высота, м')); row.appendChild(mk('count', 'шт'));
        const del = h('button', { type: 'button', class: 'calc-opening-del', 'aria-label': 'Убрать', text: '×' });
        del.addEventListener('click', () => { state.extras.openings.splice(idx, 1); renderOpenings(); render(); });
        row.appendChild(del);
        openingsBox.appendChild(row);
      });
      const adders = h('div', { class: 'calc-presets' });
      OPENING_PRESETS.forEach((p) => {
        const b = h('button', { type: 'button', class: 'calc-preset', text: p.label + ' ' + p.w + '×' + p.h });
        b.addEventListener('click', () => { state.extras.openings.push({ kind: p.kind, w: p.w, h: p.h, count: '1' }); renderOpenings(); render(); });
        adders.appendChild(b);
      });
      openingsBox.appendChild(adders);
    }

    function renderFields() {
      fieldsBox.innerHTML = '';
      const mode = def.modes.find((m) => m.id === state.mode);
      mode.fields.forEach((f) => fieldsBox.appendChild(field(f)));
      renderOpenings();
      (def.common || []).forEach((f) => fieldsBox.appendChild(field(f)));
      presetsBox.innerHTML = '';
      const pr = mode.presets || def.presets;
      if (pr) {
        presetsBox.appendChild(h('span', { class: 'calc-presets-label', text: pr.label + ':' }));
        pr.items.forEach(([label, value]) => {
          const b = h('button', { type: 'button', class: 'calc-preset', text: label + ' · ' + value + ' ' + pr.unit });
          b.addEventListener('click', () => {
            state.values[pr.fieldId] = value;
            const input = fieldsBox.querySelector('[name="' + pr.fieldId + '"]');
            if (input) input.value = value;
            render();
          });
          presetsBox.appendChild(b);
        });
      }
    }

    function render() {
      const v = {};
      const mode = def.modes.find((m) => m.id === state.mode);
      mode.fields.concat(def.common || []).forEach((f) => { v[f.id] = parseNum(state.values[f.id]); });
      const extras = { openings: state.extras.openings.map((o) => ({ kind: o.kind, w: parseNum(o.w), h: parseNum(o.h), count: Math.max(1, Math.round(parseNum(o.count) || 1)) })) };
      lastViz = { v, extras };
      drawViz();
      const r = def.compute(v, state.mode, state.sel, extras);
      result.innerHTML = '';
      costBox.hidden = !r;
      if (!r) {
        result.appendChild(h('p', { class: 'calc-empty', text: 'Заполните поля — результат появится сразу.' }));
        return;
      }
      result.appendChild(h('div', { class: 'calc-main' }, [h('div', { class: 'calc-main-label', text: r.main.label }), h('div', { class: 'calc-main-value', text: r.main.value })]));
      const dl = h('dl', { class: 'calc-rows' });
      r.rows.forEach(([k, val]) => { dl.appendChild(h('dt', { text: k })); dl.appendChild(h('dd', { text: val })); });
      result.appendChild(dl);
      if (r.note) result.appendChild(h('p', { class: 'calc-note', text: r.note }));
      const copy = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Скопировать расчёт' });
      copy.addEventListener('click', () => {
        const lines = [r.main.label + ': ' + r.main.value].concat(r.rows.map(([k, val]) => '• ' + k + ': ' + val));
        const costLines = costRows(r).filter((c) => c.sum != null).map((c) => '• ' + c.label + ' — ' + fmt(c.amount) + ' ' + c.unit + ' = ' + money(c.sum));
        if (costLines.length) lines.push('', 'Стоимость:', ...costLines, 'ИТОГО: ' + money(costRows(r).reduce((s, c) => s + (c.sum || 0), 0)));
        lines.push('', 'Посчитано на kor-nil.ru/tools/ — тот же калькулятор есть в приложении ЧатЯдро');
        navigator.clipboard.writeText(lines.join('\n')).then(() => { copy.textContent = 'Скопировано ✓'; setTimeout(() => { copy.textContent = 'Скопировать расчёт'; }, 1500); });
      });
      result.appendChild(copy);
      renderCost(r);
    }

    let lastViz = null;
    function drawViz() {
      if (!def.draw || !lastViz) { vizBox.hidden = true; return; }
      const ok = def.draw(lastViz.v, state.mode, vizBox, state.yaw, lastViz.extras);
      vizBox.hidden = !ok;
    }
    if (window.CalcViz) window.CalcViz.rotatable(vizBox, () => state.yaw, (yaw) => { state.yaw = yaw; drawViz(); });

    function costRows(r) {
      return r.cost.map((c) => {
        const price = parseNum(state.prices[c.priceId]);
        return Object.assign({}, c, { sum: price != null ? c.amount * price : null });
      });
    }

    function renderCost(r) {
      let body = costBox.querySelector('.calc-cost-body');
      if (!body) {
        body = h('div', { class: 'calc-cost-body' });
        (def.prices || []).forEach((p) => {
          const id = key + '-price-' + p.id;
          const input = h('input', { type: 'text', inputmode: 'decimal', id, placeholder: '0', autocomplete: 'off', value: state.prices[p.id] });
          input.addEventListener('input', () => {
            state.prices[p.id] = input.value;
            try { localStorage.setItem(storageKey(p.id), input.value); } catch (e) { /* приватный режим */ }
            render();
          });
          body.appendChild(h('div', { class: 'calc-field' }, [h('label', { for: id, text: p.label }), h('div', { class: 'calc-input' }, [input, h('span', { class: 'calc-unit', text: p.unit })])]));
        });
        body.appendChild(h('p', { class: 'calc-note', text: 'Цены сохраняются в этом браузере и подставятся в следующий раз.' }));
        body.appendChild(h('div', { class: 'calc-cost-table' }));
        costBox.appendChild(body);
      }
      const table = body.querySelector('.calc-cost-table');
      table.innerHTML = '';
      const rows = costRows(r).filter((c) => c.sum != null);
      if (!rows.length) return;
      const dl = h('dl', { class: 'calc-rows' });
      let total = 0;
      rows.forEach((c) => { total += c.sum; dl.appendChild(h('dt', { text: c.label + ' — ' + fmt(c.amount) + ' ' + c.unit })); dl.appendChild(h('dd', { text: money(c.sum) })); });
      dl.appendChild(h('dt', { class: 'calc-total', text: 'Итого' }));
      dl.appendChild(h('dd', { class: 'calc-total', text: money(total) }));
      table.appendChild(dl);
    }

    form.appendChild(chips(key + '-mode', def.modeLabel, def.modes, state.mode, (id) => { state.mode = id; renderFields(); render(); }));
    (def.selects || []).forEach((s) => {
      const hint = h('p', { class: 'calc-hint' });
      const update = () => { const c = s.choices.find((x) => x.id === state.sel[s.id]); hint.textContent = c.label + ' — ' + c.hint; };
      selectsBox.appendChild(chips(key + '-' + s.id, s.label, s.choices, state.sel[s.id], (id) => { state.sel[s.id] = id; update(); render(); }));
      selectsBox.appendChild(hint);
      update();
    });
    form.appendChild(selectsBox);
    form.appendChild(fieldsBox);
    form.appendChild(openingsBox);
    form.appendChild(presetsBox);
    form.appendChild(vizBox);
    form.appendChild(result);
    form.appendChild(costBox);
    root.innerHTML = '';
    root.appendChild(form);
    renderFields();
    render();
  }

  document.querySelectorAll('.calc[data-calc]').forEach(mount);
})();
