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
  // Текущий тип забора для рисунка (draw не получает sel): сохраняется движком в def._sel
  const state_type = (def) => (def._sel && def._sel.type) || 'proflist';

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
        { id: 'plan', label: 'Лента: свой план', plan: true, fields: [
          { id: 'pW', label: 'Ширина ленты (по умолчанию)', unit: 'см', value: '40' },
          { id: 'pDepth', label: 'Глубина в земле (по умолчанию)', unit: 'см', value: '60' },
          { id: 'pAbove', label: 'Высота над землёй (цоколь)', unit: 'см, необязательно' },
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
      draw(v, mode, box, yaw, extras) {
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
        if (mode === 'plan') {
          const P = window.CalcPlan; if (!P || !extras.plan) return false;
          const g = P.geometry(extras.plan, { w: v.pW, depth: v.pDepth, above: v.pAbove || 0 });
          if (!g.valid || !pos(v.pW) || !pos(v.pDepth)) return false;
          let dims;
          if (g.edges.length > 8) {
            // Круг и «почти круг»: подписи каждой грани — мусор, подписываем диаметр
            const xs = g.verts.map((q) => q[0]), ys = g.verts.map((q) => q[1]);
            const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
            dims = [{ from: [Math.min(...xs), cy, g.above], to: [Math.max(...xs), cy, g.above], label: 'диаметр ' + fmt(Math.max(...xs) - Math.min(...xs)) + ' м', offset: 0 }];
          } else {
            dims = g.edges.map((e) => ({ from: [e.a[0], e.a[1], g.above], to: [e.b[0], e.b[1], g.above], label: fmt(e.len) + ' м', offset: -22 }));
          }
          const e0 = g.edges[0];
          dims.push({ from: [e0.a[0], e0.a[1], -e0.depth], to: [e0.a[0], e0.a[1], 0], label: 'в земле ' + fmt(e0.depth * 100) + ' см', offset: 40 });
          if (g.above > 0) dims.push({ from: [e0.b[0], e0.b[1], 0], to: [e0.b[0], e0.b[1], g.above], label: 'цоколь ' + fmt(g.above * 100) + ' см', offset: -30 });
          V.iso(box, P.prisms(g), dims, { yaw, ground: true, caption: 'Зелёное — уровень земли. Потяните, чтобы повернуть.' });
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
      compute(v, mode, sel, extras) {
        let volume = null;
        if (mode === 'plan') {
          const P = window.CalcPlan;
          if (P && extras.plan && pos(v.pW) && pos(v.pDepth)) {
            const g = P.geometry(extras.plan, { w: v.pW, depth: v.pDepth, above: v.pAbove || 0 });
            if (!g.valid) return { error: 'Контур пересекает сам себя — поправьте углы на плане.' };
            volume = g.volume;
          }
        } else if (mode === 'slab') {
          const l = v.len, w = v.wid, t = v.thick;
          if (pos(l) && pos(w) && pos(t)) volume = l * w * (t / 100);
        } else if (mode === 'strip') {
          // Лента по наружным размерам дома: площадь кольца = L·W − (L−2w)(W−2w),
          // углы не считаются дважды. Полная высота = в земле + цоколь.
          const L = v.hLen, Wd = v.hWid, w = (v.sWid || 0) / 100, h = ((v.sDepth || 0) + (v.sAbove || 0)) / 100;
          if (pos(L) && pos(Wd) && pos(w) && pos(v.sDepth)) {
            if (!(2 * w < L && 2 * w < Wd)) return { error: 'Ширина ленты больше половины размера дома — проверьте единицы: размеры дома в метрах, лента в сантиметрах.' };
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

    /* --- Комната: стены с проёмами, отделка по стенам, краска и обои --- */
    room: {
      modeLabel: 'Что считаем',
      modes: [
        { id: 'room', label: 'Стены комнаты', room: true, fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
          { id: 'hei', label: 'Высота потолка', unit: 'м', value: '2.7' },
        ] },
        { id: 'roomplan', label: 'Комната: свой план (ниши, выступы)', room: true, plan: { simple: true, presetsKey: 'ROOM_PRESETS' }, fields: [
          { id: 'hei', label: 'Высота потолка', unit: 'м', value: '2.7' },
        ] },
        { id: 'ceiling', label: 'Потолок (краска)', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м' },
        ] },
        { id: 'custom', label: 'Своя площадь (краска)', fields: [
          { id: 'area', label: 'Площадь поверхности', unit: 'м²' },
        ] },
      ],
      common: [
        { id: 'coats', label: 'Слоёв краски', unit: '', value: '2', group: 'paint' },
        { id: 'rate', label: 'Расход краски (м² на 1 литр)', unit: 'на банке', value: '10', group: 'paint' },
        { id: 'can', label: 'Объём банки краски', unit: 'л', value: '2.7', group: 'paint' },
        { id: 'rollW', label: 'Ширина рулона обоев', unit: 'м', value: '1.06', group: 'paper' },
        { id: 'rollL', label: 'Длина рулона', unit: 'м', value: '10.05', group: 'paper' },
        { id: 'rapport', label: 'Раппорт (повтор рисунка)', unit: 'см, 0 = без подгонки', value: '0', group: 'paper' },
        { id: 'trim', label: 'Запас на подрезку полосы', unit: 'см', value: '10', group: 'paper' },
        { id: 'overlap', label: 'Нахлёст', unit: 'см, 0 = встык', value: '0', group: 'paper' },
        { id: 'glue', label: 'Пачки клея хватает на', unit: 'м²', value: '30', group: 'paper' },
      ],
      presets: [
        { label: 'Расход краски', fieldId: 'rate', unit: 'м²/л', group: 'paint', items: [['Водоэмульсионка', '10'], ['Эмаль', '12'], ['Побелка/известь', '7'], ['По дереву', '8']] },
        { label: 'Рулон', fieldId: 'rollW', unit: 'м', group: 'paper', items: [['Метровые', '1.06'], ['Полуметровые', '0.53']] },
        { label: 'Длина рулона', fieldId: 'rollL', unit: 'м', group: 'paper', items: [['Обычный', '10.05'], ['Длинный', '25']] },
      ],
      prices: [
        { id: 'roll', label: 'Цена рулона обоев', unit: '₽ за рулон', group: 'paper' },
        { id: 'glue', label: 'Цена клея', unit: '₽ за пачку', group: 'paper' },
        { id: 'can', label: 'Цена краски', unit: '₽ за банку', group: 'paint' },
      ],
      // Длины стен по порядку: прямоугольник или контур своего плана
      lens(v, mode, extras) {
        if (mode === 'room') return (pos(v.len) && pos(v.wid)) ? [v.len, v.wid, v.len, v.wid] : null;
        if (mode === 'roomplan') {
          const P = window.CalcPlan; if (!P || !extras.plan) return null;
          const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
          return g.valid ? g.edges.map((e) => e.len) : null;
        }
        return null;
      },
      // Какие группы полей показывать: по отделке стен
      groups(v, mode, extras) {
        const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
        if (!R || !extras.room || !lens) return { paint: true, paper: false };
        const m = R.measure(extras.room, lens, v.hei || 0, R.FINISH, extras.room.defaultFinish);
        return { paint: m.paint.n > 0, paper: m.paper.n > 0 };
      },
      draw(v, mode, box) {
        const V = window.CalcViz; if (!V) return false;
        if (mode === 'ceiling' && pos(v.len) && pos(v.wid)) {
          V.shape(box, [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]], [
            { from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 }, { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 },
          ], { center: fmt(v.len * v.wid) + ' м²', title: 'Потолок' });
          return true;
        }
        return false;
      },
      compute(v, mode, sel, extras) {
        const coats = v.coats == null ? 1 : v.coats;
        const paintCalc = (area) => {
          if (!(area > 0) || !pos(v.rate) || !(coats > 0)) return null;
          const liters = area * coats / v.rate, reserve = liters * 1.1;
          const cans = pos(v.can) ? Math.ceil(reserve / v.can) : null;
          return { area, liters, reserve, cans };
        };
        if (mode === 'ceiling' || mode === 'custom') {
          const area = mode === 'ceiling' ? (pos(v.len) && pos(v.wid) ? v.len * v.wid : null) : (pos(v.area) ? v.area : null);
          const p = paintCalc(area);
          if (!p) return null;
          const rows = [['Без запаса', fmt(p.liters) + ' л'], ['Площадь окраски', fmt(area) + ' м² × ' + fmt(coats) + ' сл.']];
          if (p.cans != null) rows.push(['Банок по ' + fmt(v.can) + ' л', '≈ ' + p.cans + ' шт']);
          return { main: { label: 'Нужно краски (с запасом 10%)', value: fmt(p.reserve) + ' л' }, rows,
            note: 'Расход указан на банке (обычно 8–12 м²/л). Для тёмного по светлому может понадобиться больше слоёв.',
            cost: p.cans != null ? [{ label: 'Краска', amount: p.cans, unit: plural(p.cans, 'банка', 'банки', 'банок'), priceId: 'can' }] : [] };
        }
        const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
        if (mode === 'roomplan' && !lens && extras.plan) return { error: 'Контур комнаты пересекает сам себя — поправьте углы на плане.' };
        if (!R || !extras.room || !lens || !pos(v.hei)) return null;
        const m = R.measure(extras.room, lens, v.hei, R.FINISH, extras.room.defaultFinish);
        if (m.paint.n === 0 && m.paper.n === 0) return { error: 'У всех стен выбрано «без отделки» — отметьте на развёртке, какие стены красим или оклеиваем.' };
        const rows = [], cost = [], mains = [];
        let note = '';
        // Обои
        if (m.paper.n > 0) {
          const effW = (v.rollW || 0) - (v.overlap || 0) / 100;
          let stripLen = v.hei + (v.trim || 0) / 100;
          if (pos(v.rapport)) { const r = v.rapport / 100; stripLen = Math.ceil(stripLen / r - 1e-9) * r; }
          if (pos(effW) && pos(v.rollL)) {
            const strips = m.paper.walls.reduce((s2, w) => s2 + Math.ceil(w.len / effW - 1e-9), 0);
            const perRoll = Math.floor(v.rollL / stripLen + 1e-9);
            if (perRoll < 1) return { error: 'Полоса (' + fmt(stripLen) + ' м) длиннее рулона (' + fmt(v.rollL) + ' м): проверьте длину рулона, высоту потолка и раппорт.' };
            {
              const rolls = Math.ceil(strips / perRoll);
              const glue = pos(v.glue) ? Math.ceil(m.paper.area / v.glue) : null;
              mains.push('обои ' + rolls + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов'));
              rows.push(['Обои: стен', m.paper.n + ' ' + plural(m.paper.n, 'стена', 'стены', 'стен') + ', ' + fmt(m.paper.area) + ' м² (с проёмами ' + fmt(m.paper.len * v.hei) + ')']);
              rows.push(['Полос', strips + ' по ' + fmt(stripLen) + ' м' + (pos(v.rapport) ? ' (с подгонкой рисунка)' : '')]);
              rows.push(['Полос из рулона', String(perRoll)]);
              if (glue != null) rows.push(['Клей', glue + ' ' + plural(glue, 'пачка', 'пачки', 'пачек') + ' (на ' + fmt(m.paper.area) + ' м²)']);
              cost.push({ label: 'Обои', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'roll' });
              if (glue != null) cost.push({ label: 'Клей', amount: glue, unit: plural(glue, 'пачка', 'пачки', 'пачек'), priceId: 'glue' });
              note += 'Полосы считаются по ширине каждой стены с округлением вверх; проёмы из полос не вычитаются — остатки уходят над окнами и дверями. ';
            }
          }
        }
        // Краска
        if (m.paint.n > 0) {
          const p = paintCalc(m.paint.area);
          if (p) {
            mains.push('краска ' + fmt(p.reserve) + ' л');
            rows.push(['Краска: стен', m.paint.n + ' ' + plural(m.paint.n, 'стена', 'стены', 'стен') + ', ' + fmt(m.paint.area) + ' м² × ' + fmt(coats) + ' сл.']);
            rows.push(['Без запаса', fmt(p.liters) + ' л']);
            if (p.cans != null) { rows.push(['Банок по ' + fmt(v.can) + ' л', '≈ ' + p.cans + ' шт']); cost.push({ label: 'Краска', amount: p.cans, unit: plural(p.cans, 'банка', 'банки', 'банок'), priceId: 'can' }); }
          }
        }
        if (!mains.length) return null;
        m.walls.forEach((w) => rows.push(['Стена ' + (w.i + 1) + ' · ' + R.FINISH[w.finish], fmt(w.net) + ' м²' + (w.count ? ' (проёмов ' + w.count + ')' : '')]));
        return { main: { label: 'Нужно (с запасом)', value: mains.join(' · ') }, rows, note: note + 'Проёмы: ' + fmt(m.openings) + ' м² вычтены из площади.', cost };
      },
    },

    /* --- Фасад: дом по размерам или по плану, отделка каждой стены, фронтоны --- */
    facade: {
      modeLabel: 'Форма дома',
      finishes: { siding: 'Сайдинг', plaster: 'Штукатурка', paint: 'Краска', none: 'Без отделки' },
      modes: [
        { id: 'rect', label: 'Прямоугольный дом', room: true, fields: [
          { id: 'len', label: 'Длина дома', unit: 'м', value: '8' },
          { id: 'wid', label: 'Ширина дома', unit: 'м', value: '6' },
          { id: 'hei', label: 'Высота стен (до кровли)', unit: 'м', value: '3' },
        ] },
        { id: 'plan', label: 'Дом по своему плану', room: true, plan: { simple: true }, fields: [
          { id: 'hei', label: 'Высота стен (до кровли)', unit: 'м', value: '3' },
        ] },
      ],
      common: [
        { id: 'gables', label: 'Фронтонов (треугольники под крышей)', unit: 'шт', value: '2', group: 'gable' },
        { id: 'gableW', label: 'Ширина фронтона', unit: 'м', value: '6', group: 'gable' },
        { id: 'gableH', label: 'Высота фронтона', unit: 'м', value: '2', group: 'gable' },
        { id: 'panelL', label: 'Длина панели сайдинга', unit: 'м', value: '3.66', group: 'siding' },
        { id: 'panelW', label: 'Рабочая ширина панели', unit: 'м', value: '0.23', group: 'siding' },
        { id: 'sidingWaste', label: 'Запас на подрезку', unit: '%', value: '10', group: 'siding' },
        { id: 'plasterRate', label: 'Расход штукатурки', unit: 'кг/м² при вашей толщине', value: '15', group: 'plaster' },
        { id: 'plasterBag', label: 'Мешок штукатурки', unit: 'кг', value: '25', group: 'plaster' },
        { id: 'coats', label: 'Слоёв краски', unit: '', value: '2', group: 'paint' },
        { id: 'rate', label: 'Расход краски (м² на 1 литр)', unit: 'на банке', value: '8', group: 'paint' },
        { id: 'can', label: 'Объём банки', unit: 'л', value: '9', group: 'paint' },
      ],
      selects: [{ id: 'gableFinish', label: 'Отделка фронтонов', default: 'siding',
        choices: [{ id: 'siding', label: 'Сайдинг', hint: 'как у стен из сайдинга' }, { id: 'plaster', label: 'Штукатурка', hint: '' }, { id: 'paint', label: 'Краска', hint: '' }, { id: 'none', label: 'Без отделки', hint: 'фронтоны не считаем' }] }],
      prices: [
        { id: 'panel', label: 'Панель сайдинга', unit: '₽ за штуку', group: 'siding' },
        { id: 'plaster', label: 'Штукатурка', unit: '₽ за мешок', group: 'plaster' },
        { id: 'can', label: 'Краска', unit: '₽ за банку', group: 'paint' },
      ],
      lens(v, mode, extras) {
        if (mode === 'rect') return (pos(v.len) && pos(v.wid)) ? [v.len, v.wid, v.len, v.wid] : null;
        const P = window.CalcPlan; if (!P || !extras.plan) return null;
        const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
        return g.valid ? g.edges.map((e) => e.len) : null;
      },
      groups(v, mode, extras, sel) {
        const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
        const out = { gable: true, siding: false, plaster: false, paint: false };
        if (!R || !extras.room || !lens) return out;
        const m = R.measure(extras.room, lens, v.hei || 0, this.finishes, extras.room.defaultFinish || 'siding');
        ['siding', 'plaster', 'paint'].forEach((f) => { out[f] = m.by[f].n > 0 || (sel.gableFinish === f && pos(v.gables)); });
        return out;
      },
      draw(v, mode, box, yaw, extras) {
        const V = window.CalcViz; if (!V || !pos(v.hei)) return false;
        let verts = null;
        if (mode === 'rect') { if (pos(v.len) && pos(v.wid)) verts = [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]]; }
        else { const P = window.CalcPlan; if (P && extras.plan) { const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 }); if (g.valid) verts = g.verts; } }
        if (!verts) return false;
        const dims = verts.length <= 8 ? verts.map((a, i) => { const b = verts[(i + 1) % verts.length]; return { from: [a[0], a[1], v.hei], to: [b[0], b[1], v.hei], label: (i + 1) + ': ' + fmt(Math.hypot(b[0] - a[0], b[1] - a[1])) + ' м', offset: -18 }; }) : [];
        dims.push({ from: [verts[0][0], verts[0][1], 0], to: [verts[0][0], verts[0][1], v.hei], label: 'высота ' + fmt(v.hei) + ' м', offset: -28 });
        V.iso(box, [{ poly: verts, z: 0, dz: v.hei }], dims, { yaw, ground: true, caption: 'Коробка дома без кровли. Номера — стены на развёртке. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
        if (mode === 'plan' && !lens && extras.plan) return { error: 'Контур дома пересекает сам себя — поправьте углы на плане.' };
        if (!R || !extras.room || !lens || !pos(v.hei)) return null;
        const m = R.measure(extras.room, lens, v.hei, this.finishes, extras.room.defaultFinish || 'siding');
        const gableArea = (pos(v.gables) && pos(v.gableW) && pos(v.gableH)) ? v.gables * v.gableW * v.gableH / 2 : 0;
        const area = { siding: m.by.siding.area, plaster: m.by.plaster.area, paint: m.by.paint.area };
        if (gableArea > 0 && area[sel.gableFinish] != null) area[sel.gableFinish] += gableArea;
        const rows = [], cost = [], mains = [];
        if (area.siding > 0 && pos(v.panelL) && pos(v.panelW)) {
          const need = area.siding * (1 + (v.sidingWaste || 0) / 100);
          const panels = Math.ceil(need / (v.panelL * v.panelW));
          const start = m.by.siding.len;
          const jLen = extras.room.openings.filter((o) => m.walls[o.wall] && m.walls[o.wall].finish === 'siding').reduce((s2, o) => s2 + 2 * (o.w + o.h), 0);
          mains.push('сайдинг ' + panels + ' ' + plural(panels, 'панель', 'панели', 'панелей'));
          rows.push(['Сайдинг: площадь', fmt(area.siding) + ' м² (+' + fmt(v.sidingWaste || 0) + '% подрезка = ' + fmt(need) + ')']);
          rows.push(['Стартовая планка', fmt(start) + ' м']);
          rows.push(['Угловой профиль', m.by.siding.n + ' ' + plural(m.by.siding.n, 'угол', 'угла', 'углов') + ' × ' + fmt(v.hei) + ' м = ' + fmt(m.by.siding.n * v.hei) + ' м']);
          if (jLen > 0) rows.push(['J-профиль вокруг проёмов', fmt(jLen) + ' м']);
          cost.push({ label: 'Сайдинг', amount: panels, unit: plural(panels, 'панель', 'панели', 'панелей'), priceId: 'panel' });
        }
        if (area.plaster > 0 && pos(v.plasterRate) && pos(v.plasterBag)) {
          const kg = area.plaster * v.plasterRate, bags = Math.ceil(kg / v.plasterBag);
          mains.push('штукатурка ' + bags + ' ' + plural(bags, 'мешок', 'мешка', 'мешков'));
          rows.push(['Штукатурка', fmt(area.plaster) + ' м² × ' + fmt(v.plasterRate) + ' кг = ' + fmtInt(kg) + ' кг']);
          cost.push({ label: 'Штукатурка', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: 'plaster' });
        }
        if (area.paint > 0 && pos(v.rate)) {
          const coats = v.coats == null ? 1 : v.coats, liters = area.paint * coats / v.rate * 1.1;
          const cans = pos(v.can) ? Math.ceil(liters / v.can) : null;
          mains.push('краска ' + fmt(liters) + ' л');
          rows.push(['Краска', fmt(area.paint) + ' м² × ' + fmt(coats) + ' сл., с запасом 10%' + (cans != null ? ', ' + cans + ' ' + plural(cans, 'банка', 'банки', 'банок') : '')]);
          if (cans != null) cost.push({ label: 'Краска', amount: cans, unit: plural(cans, 'банка', 'банки', 'банок'), priceId: 'can' });
        }
        if (!mains.length) return { error: 'У всех стен выбрано «без отделки» — отметьте на развёртке, чем отделываем.' };
        if (gableArea > 0) rows.push(['Фронтоны', v.gables + ' × ' + fmt(v.gableW) + '×' + fmt(v.gableH) + ' / 2 = ' + fmt(gableArea) + ' м² → ' + this.finishes[sel.gableFinish]]);
        m.walls.forEach((w) => rows.push(['Стена ' + (w.i + 1) + ' · ' + this.finishes[w.finish], fmt(w.net) + ' м²' + (w.count ? ' (проёмов ' + w.count + ')' : '')]));
        return { main: { label: 'Нужно на фасад', value: mains.join(' · ') }, rows,
          note: 'Проёмы вычтены (' + fmt(m.openings) + ' м²). Сайдинг: панели по площади с запасом, стартовая планка по длине стен, угловой профиль по числу стен, J-профиль по периметру проёмов. Расход штукатурки указан на мешке для вашей толщины слоя.', cost };
      },
    },

    /* --- Забор: по длине или по плану участка; типы забора и ворот --- */
    fence: {
      modeLabel: 'Как задаём забор',
      finishes: { fence: 'Забор', none: 'Без забора (сосед, дом)' },
      modes: [
        { id: 'plan', label: 'По плану участка', room: true, plan: { simple: true, presetsKey: 'PLOT_PRESETS' }, fields: [
          { id: 'hei', label: 'Высота забора', unit: 'м', value: '2' },
          { id: 'step', label: 'Шаг столбов', unit: 'м', value: '2.5' },
        ] },
        { id: 'line', label: 'Просто по длине', fields: [
          { id: 'len', label: 'Длина забора', unit: 'м', value: '40' },
          { id: 'hei', label: 'Высота забора', unit: 'м', value: '2' },
          { id: 'step', label: 'Шаг столбов', unit: 'м', value: '2.5' },
          { id: 'gate', label: 'Ворота', unit: 'м, необязательно', value: '3' },
          { id: 'wicket', label: 'Калитка', unit: 'м, необязательно', value: '1' },
        ] },
      ],
      selects: [
        { id: 'type', label: 'Из чего забор', default: 'proflist', choices: [
          { id: 'proflist', label: 'Профнастил', hint: 'листы по рабочей ширине, лаги, саморезы' },
          { id: 'picket', label: 'Штакетник', hint: 'односторонний: штакетины с зазором' },
          { id: 'picket2', label: 'Штакетник шахматный', hint: 'с двух сторон вразбежку — штакетин почти вдвое больше, зато просветов нет' },
          { id: 'chainlink', label: 'Сетка-рабица', hint: 'рулоны по длине' },
          { id: 'block', label: 'Блоки / кирпич', hint: 'кладка: штук на м² и раствор' },
        ] },
        { id: 'gateType', label: 'Ворота', default: 'swing', choices: [
          { id: 'swing', label: 'Распашные', hint: 'две створки, два столба' },
          { id: 'sliding', label: 'Откатные', hint: 'нужен фундамент под ролики и свободное место вдоль забора ≈ 1,5 ширины ворот' },
          { id: 'lift', label: 'Подъёмные', hint: 'секционные/подъёмно-поворотные, обычно в гараж; нужен проём с перемычкой' },
        ] },
      ],
      common: [
        { id: 'sheetW', label: 'Рабочая ширина листа', unit: 'м', value: '1.15', group: 'proflist' },
        { id: 'plankW', label: 'Ширина штакетины', unit: 'м', value: '0.1', group: 'picket' },
        { id: 'gap', label: 'Зазор между штакетинами', unit: 'м', value: '0.05', group: 'picket' },
        { id: 'plankW2', label: 'Ширина штакетины', unit: 'м', value: '0.1', group: 'picket2' },
        { id: 'gap2', label: 'Шаг на одной стороне', unit: 'м (между соседними на одной стороне)', value: '0.1', group: 'picket2' },
        { id: 'rollL', label: 'Длина рулона сетки', unit: 'м', value: '10', group: 'chainlink' },
        { id: 'perM2', label: 'Блоков / кирпичей на м²', unit: 'шт (блок 390×190 ≈ 12,5; кирпич в полкирпича ≈ 51)', value: '12.5', group: 'block' },
        { id: 'mortar', label: 'Раствор', unit: 'кг/м² кладки', value: '30', group: 'block' },
        { id: 'postDepth', label: 'Столб в земле', unit: 'м', value: '1' },
        { id: 'lagRows', label: 'Рядов лаг (поперечин)', unit: 'шт', value: '2', group: 'lags' },
      ],
      presets: [{ label: 'Кладка', fieldId: 'perM2', unit: 'шт/м²', group: 'block', items: [['Блок 390×190', '12.5'], ['Кирпич в полкирпича', '51'], ['Кирпич в кирпич', '102']] }],
      prices: [
        { id: 'unit', label: 'Лист / штакетина / рулон / блок', unit: '₽ за штуку' },
        { id: 'post', label: 'Столб', unit: '₽ за штуку' },
        { id: 'lag', label: 'Лага 6 м', unit: '₽ за штуку', group: 'lags' },
      ],
      roomOpts: {
        finishes: { fence: 'Забор', none: 'Без забора (сосед, дом)' }, defaultFinish: 'fence', fullHeight: true, wallWord: 'Сторона',
        kindLabels: { gate: 'Ворота', wicket: 'Калитка' },
        openingPresets: [{ kind: 'gate', label: '+ ворота', w: 3, h: 2, y: 0 }, { kind: 'gate', label: '+ ворота 4 м', w: 4, h: 2, y: 0 }, { kind: 'wicket', label: '+ калитка', w: 1, h: 2, y: 0 }],
        openingLabel: (o) => (o.kind === 'wicket' ? 'калитка ' : 'ворота ') + String(o.w).replace('.', ',') + ' м',
        openingsTitle: 'Ворота и калитки на этой стороне (нажмите на них в развёртке, чтобы найти):',
        hint: 'Нажмите на сторону, чтобы включить или выключить забор на ней. Ворота и калитки тяните по стороне, можно перетащить на соседнюю.',
        wallTitle: (i, w) => 'Сторона ' + (i + 1) + ': ' + String(Math.round(w.len * 100) / 100).replace('.', ',') + ' м' + (w.count ? ', проёмов ' + w.count : ''),
      },
      lens(v, mode, extras) {
        if (mode !== 'plan') return null;
        const P = window.CalcPlan; if (!P || !extras.plan) return null;
        const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
        return g.valid ? g.edges.map((e) => e.len) : null;
      },
      groups(v, mode, extras, sel) {
        const t = sel.type;
        return { proflist: t === 'proflist', picket: t === 'picket', picket2: t === 'picket2', chainlink: t === 'chainlink', block: t === 'block', lags: t !== 'block' && t !== 'chainlink' };
      },
      // Сводка по забору: полезная длина, пролёты, столбы, проёмы — для обоих режимов
      summary(v, mode, sel, extras) {
        if (!(pos(v.hei) && pos(v.step))) return null;
        if (mode === 'line') {
          if (!pos(v.len)) return null;
          const gate = v.gate || 0, wicket = v.wicket || 0, net = v.len - gate - wicket;
          if (net <= 0) return { error: 'Ворота и калитка длиннее самого забора — проверьте длины.' };
          const sections = Math.ceil(net / v.step - 1e-9);
          return { net, sections, posts: sections + 1 + (gate > 0 ? 1 : 0) + (wicket > 0 ? 1 : 0), gates: gate > 0 ? 1 : 0, wickets: wicket > 0 ? 1 : 0, gateLen: gate, sides: null, corners: 0 };
        }
        const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
        if (!lens && extras.plan) return { error: 'Контур участка пересекает сам себя — поправьте углы на плане.' };
        if (!R || !extras.room || !lens) return null;
        const m = R.measure(extras.room, lens, v.hei, this.finishes, 'fence', true);
        const sides = m.walls.filter((w) => w.finish === 'fence');
        if (!sides.length) return { error: 'На всех сторонах выключен забор — включите хотя бы одну.' };
        let net = 0, sections = 0, posts = 0, gates = 0, wickets = 0, gateLen = 0;
        sides.forEach((w) => {
          const sec = Math.ceil(w.netLen / v.step - 1e-9);
          net += w.netLen; sections += sec; posts += sec + 1 + w.ops.length;
          w.ops.forEach((o) => { if (o.kind === 'wicket') wickets++; else { gates++; gateLen += o.w; } });
        });
        // Соседние огороженные стороны делят угловой столб
        const n = m.walls.length; let shared = 0;
        for (let i = 0; i < n; i++) { const a = m.walls[i], b = m.walls[(i + 1) % n]; if (a.finish === 'fence' && b.finish === 'fence') shared++; }
        posts -= shared;
        return { net, sections, posts, gates, wickets, gateLen, sides, corners: shared };
      },
      draw(v, mode, box, yaw, extras) {
        const V = window.CalcViz; if (!V) return false;
        if (mode === 'line') {
          if (!(pos(v.len) && pos(v.hei) && pos(v.step))) return false;
          V.fence(box, v.len, v.hei, v.step, v.gate || 0, v.wicket || 0, state_type(this));
          return true;
        }
        const P = window.CalcPlan, R = window.CalcRoom; if (!P || !R || !extras.plan || !extras.room || !pos(v.hei)) return false;
        const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 }); if (!g.valid) return false;
        const m = R.measure(extras.room, g.edges.map((e) => e.len), v.hei, this.finishes, 'fence', true);
        // Забор в объёме: тонкие призмы по каждой стороне, с разрывами под ворота и калитки
        const prisms = [];
        g.edges.forEach((e, i) => {
          const w = m.walls[i]; if (w.finish !== 'fence') return;
          const dx = (e.b[0] - e.a[0]) / e.len, dy = (e.b[1] - e.a[1]) / e.len, nx = -dy * 0.06, ny = dx * 0.06;
          const cuts = w.ops.map((o) => [o.x, o.x + o.w]).sort((p, q) => p[0] - q[0]);
          let pos0 = 0; const segs = [];
          cuts.forEach(([c0, c1]) => { if (c0 > pos0) segs.push([pos0, c0]); pos0 = Math.max(pos0, c1); });
          if (pos0 < e.len) segs.push([pos0, e.len]);
          segs.forEach(([s0, s1]) => {
            const a = [e.a[0] + dx * s0, e.a[1] + dy * s0], b = [e.a[0] + dx * s1, e.a[1] + dy * s1];
            prisms.push({ poly: [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], z: 0, dz: v.hei });
          });
        });
        if (!prisms.length) return false;
        const dims = g.edges.length <= 8 ? g.edges.map((e, i) => ({ from: [e.a[0], e.a[1], 0], to: [e.b[0], e.b[1], 0], label: (i + 1) + ': ' + fmt(e.len) + ' м', offset: 22 })) : [];
        V.iso(box, prisms, dims, { yaw, ground: true, caption: 'Забор по участку: разрывы — ворота и калитки. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const sm = this.summary(v, mode, sel, extras);
        if (!sm) return null; if (sm.error) return sm;
        const { net, sections, posts, gates, wickets, gateLen } = sm;
        const rows = [], cost = []; let main, unitCost = null;
        const postLen = v.hei + (v.postDepth || 1);
        const holes = posts * Math.PI * 0.1 * 0.1 * (v.postDepth || 1);
        const cementBags = Math.ceil(holes * 1.1 * 286 / 50);
        const P = (n, a, b, c) => n + ' ' + plural(n, a, b, c);
        const t = sel.type;
        if (t === 'proflist') {
          if (!pos(v.sheetW)) return null;
          const sheets = Math.ceil(net / v.sheetW - 1e-9);
          main = P(sheets, 'лист', 'листа', 'листов') + ' · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Листы профнастила', sheets + ' шт высотой ' + fmt(v.hei) + ' м (рабочая ширина ' + fmt(v.sheetW) + ' м)']);
          rows.push(['Саморезы', '≈ ' + sheets * 8 + ' шт (по 8 на лист)']);
          unitCost = { label: 'Профнастил', amount: sheets, unit: plural(sheets, 'лист', 'листа', 'листов') };
        } else if (t === 'picket' || t === 'picket2') {
          const pw = t === 'picket' ? v.plankW : v.plankW2, gp = t === 'picket' ? (v.gap || 0) : (v.gap2 || 0);
          if (!pos(pw)) return null;
          const planks = Math.ceil(net / (pw + gp) - 1e-9) * (t === 'picket2' ? 2 : 1);
          main = P(planks, 'штакетина', 'штакетины', 'штакетин') + ' · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Штакетины', planks + ' шт × ' + fmt(v.hei) + ' м' + (t === 'picket2' ? ' (шахматка: с двух сторон вразбежку)' : ', шаг ' + fmt(pw + gp) + ' м')]);
          rows.push(['Саморезы', '≈ ' + planks * (v.lagRows || 2) * 2 + ' шт (по 2 на ряд лаг)']);
          unitCost = { label: 'Штакетник', amount: planks, unit: plural(planks, 'штакетина', 'штакетины', 'штакетин') };
        } else if (t === 'chainlink') {
          if (!pos(v.rollL)) return null;
          const rolls = Math.ceil(net / v.rollL - 1e-9);
          main = P(rolls, 'рулон', 'рулона', 'рулонов') + ' сетки · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Сетка-рабица', rolls + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов') + ' по ' + fmt(v.rollL) + ' м, высота ' + fmt(v.hei) + ' м']);
          unitCost = { label: 'Сетка', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов') };
        } else {
          if (!pos(v.perM2)) return null;
          const area = net * v.hei, blocks = Math.ceil(area * v.perM2 * 1.05), mortarKg = area * (v.mortar || 0), bags = Math.ceil(mortarKg / 25);
          main = P(blocks, 'блок', 'блока', 'блоков') + ' · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Кладка', fmt(area) + ' м² × ' + fmt(v.perM2) + ' шт/м² + 5% бой = ' + blocks + ' шт']);
          if (mortarKg > 0) rows.push(['Раствор', fmtInt(mortarKg) + ' кг ≈ ' + bags + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' по 25 кг']);
          unitCost = { label: 'Блоки / кирпич', amount: blocks, unit: 'шт' };
        }
        rows.push(['Пролётов', sections + ' по ' + fmt(v.step) + ' м (полезная длина ' + fmt(net) + ' м)']);
        rows.push(['Столбы', posts + ' шт длиной ' + fmt(postLen) + ' м (' + fmt(v.postDepth || 1) + ' м в земле)' + (sm.corners ? ', угловые общие' : '')]);
        if (gates || wickets) {
          const gt = { swing: 'распашные', sliding: 'откатные', lift: 'подъёмные' }[sel.gateType];
          let note = gates ? P(gates, 'ворота', 'ворот', 'ворот') + ' ' + gt : '';
          if (wickets) note += (note ? ', ' : '') + P(wickets, 'калитка', 'калитки', 'калиток');
          if (gates && sel.gateType === 'sliding') note += '. Откатным нужно ≈ ' + fmt(gateLen * 1.5) + ' м свободного места вдоль забора и фундамент под ролики';
          if (gates && sel.gateType === 'lift') note += '. Подъёмные: проём с жёсткой перемычкой сверху, обычно в гараж';
          rows.push(['Проёмы', note]);
        }
        if (t !== 'block' && t !== 'chainlink') {
          const rowsL = v.lagRows == null ? 2 : v.lagRows, lagPieces = Math.ceil(rowsL * net / 6 - 1e-9);
          rows.push(['Лаги', rowsL + ' ' + plural(rowsL, 'ряд', 'ряда', 'рядов') + ' × ' + fmt(net) + ' м → ' + lagPieces + ' шт по 6 м']);
          cost.push({ label: 'Лаги', amount: lagPieces, unit: 'шт', priceId: 'lag' });
        }
        rows.push(['Бетон под столбы', fmt(holes) + ' м³ (лунки ⌀20 см) ≈ ' + cementBags + ' ' + plural(cementBags, 'мешок', 'мешка', 'мешков') + ' цемента']);
        if (sm.sides) sm.sides.forEach((w) => rows.push(['Сторона ' + (w.i + 1), fmt(w.len) + ' м' + (w.opLen ? ', проёмы ' + fmt(w.opLen) + ' м' : '')]));
        cost.unshift(Object.assign({ priceId: 'unit' }, unitCost), { label: 'Столбы', amount: posts, unit: plural(posts, 'столб', 'столба', 'столбов'), priceId: 'post' });
        return { main: { label: 'Нужно', value: main }, rows, cost,
          note: 'Полезная длина = стороны с забором минус ворота и калитки. Столбы: пролёты + 1 на каждой стороне, угловые общие, плюс по одному на ворота и калитку. Бетон — лунки ⌀20 см на глубину столба, М200 с запасом 10%.' };
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
      // Четырёхугольник по 4 сторонам: без диагонали считаем угол у переднего левого прямым.
      // Точки: A(0,0) передний левый, B — передний правый, D — задний левый, C — задний правый.
      quad(v) {
        const a = v.qa, b = v.qb, c = v.qc, d = v.qd;
        if (!(pos(a) && pos(b) && pos(c) && pos(d))) return null;
        const assumed = !pos(v.qdiag);
        const diag = assumed ? Math.hypot(a, d) : v.qdiag; // BD
        const tri = (x, y, z) => { const p = (x + y + z) / 2, q = p * (p - x) * (p - y) * (p - z); return q > 0 ? Math.sqrt(q) : null; };
        const t1 = tri(a, d, diag), t2 = tri(b, c, diag);
        if (t1 == null || t2 == null) return { error: 'С такими сторонами четырёхугольник не сходится — проверьте замеры и диагональ.' };
        const cosA = (a * a + d * d - diag * diag) / (2 * a * d);
        const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
        const D = [d * Math.cos(angA), d * Math.sin(angA)];
        const B = [a, 0]; const bd = [D[0] - B[0], D[1] - B[1]]; const L = Math.hypot(bd[0], bd[1]);
        const x = (b * b - c * c + L * L) / (2 * L); const hh = Math.max(0, b * b - x * x); const h = Math.sqrt(hh);
        const ux = bd[0] / L, uy = bd[1] / L;
        const C1 = [B[0] + ux * x + uy * h, B[1] + uy * x - ux * h], C2 = [B[0] + ux * x - uy * h, B[1] + uy * x + ux * h];
        const C = Math.hypot(C1[0], C1[1]) > Math.hypot(C2[0], C2[1]) ? C1 : C2;
        return { area: t1 + t2, perimeter: a + b + c + d, pts: [[0, 0], B, C, D], assumed, diag };
      },
      modeLabel: 'Форма участка',
      modes: [
        { id: 'rect', label: 'Прямоугольник', fields: [{ id: 'a', label: 'Длина', unit: 'м' }, { id: 'b', label: 'Ширина', unit: 'м' }] },
        { id: 'triangle', label: 'Треугольник', fields: [{ id: 'a', label: 'Основание', unit: 'м' }, { id: 'b', label: 'Высота', unit: 'м' }] },
        { id: 'circle', label: 'Круг', fields: [{ id: 'a', label: 'Радиус', unit: 'м' }] },
        { id: 'trapezoid', label: 'Трапеция', fields: [{ id: 'a', label: 'Верхнее основание', unit: 'м' }, { id: 'b', label: 'Нижнее основание', unit: 'м' }, { id: 'c', label: 'Высота', unit: 'м' }] },
        { id: 'quad', label: 'Четыре стороны (не совсем прямоугольник)', fields: [
          { id: 'qa', label: 'Передняя сторона', unit: 'м' },
          { id: 'qb', label: 'Правая сторона', unit: 'м' },
          { id: 'qc', label: 'Задняя сторона', unit: 'м' },
          { id: 'qd', label: 'Левая сторона', unit: 'м' },
          { id: 'qdiag', label: 'Диагональ: от переднего левого угла до заднего правого', unit: 'м, необязательно' },
        ] },
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
        if (mode === 'quad') {
          const q = this.quad(v); if (!q || q.error) return false;
          const [A, B, C, D] = q.pts;
          V.shape(box, q.pts, [
            { from: A, to: B, label: 'перед ' + m(v.qa), offset: 22 }, { from: B, to: C, label: 'право ' + m(v.qb), offset: 22 },
            { from: C, to: D, label: 'зад ' + m(v.qc), offset: 22 }, { from: D, to: A, label: 'лево ' + m(v.qd), offset: 22 },
            { from: A, to: C, label: 'диагональ ' + m(q.diag) + (q.assumed ? ' (принято)' : ''), offset: 0 },
          ], { center: fmt(q.area / 100) + ' сот.', title: 'Участок', caption: q.assumed ? 'Угол у переднего левого принят прямым. Введите диагональ — будет точно.' : 'По четырём сторонам и диагонали.' });
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
        else if (mode === 'quad') { const q = this.quad(v); if (!q) return null; if (q.error) return q; area = q.area; perimeter = q.perimeter; }
        else if (pos(v.a) && pos(v.b) && pos(v.c)) area = (v.a + v.b) / 2 * v.c;
        if (area == null) return null;
        const rows = [['В квадратных метрах', fmt(area) + ' м²'], ['В гектарах', fmt(area / 10000, 4) + ' га']];
        if (perimeter != null) rows.push(['Периметр (для забора)', fmt(perimeter) + ' м']);
        return {
          main: { label: 'Площадь', value: fmt(area / 100) + ' ' + plural(Math.round(area / 100), 'сотка', 'сотки', 'соток') },
          rows,
          note: mode === 'quad'
            ? (this.quad(v).assumed ? 'Диагональ не введена: угол у переднего левого принят прямым, погрешность обычно до 1–2%. Измерьте диагональ рулеткой от переднего левого до заднего правого угла и введите — расчёт станет точным. ' : 'По четырём сторонам и диагонали: точный расчёт. ') + '1 сотка = 100 м².'
            : '1 сотка = 100 м². Для сложного участка разбейте его на простые фигуры и сложите площади.',
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

  // Схема в PNG: клонируем SVG, переносим стили из CSS в атрибуты (иначе canvas их не видит), рисуем 2×
  async function svgToPng(svg, filename) {
    const clone = svg.cloneNode(true);
    const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-opacity', 'fill-opacity', 'stroke-dasharray', 'font-size', 'font-weight', 'font-family', 'opacity', 'paint-order', 'stroke-linejoin', 'r'];
    src.forEach((el, i) => { const cs = getComputedStyle(el); props.forEach((p) => { const val = cs.getPropertyValue(p); if (val) dst[i].style.setProperty(p, val); }); });
    const vb = svg.viewBox.baseVal, W = vb.width || 640, H = vb.height || 400;
    clone.setAttribute('width', W); clone.setAttribute('height', H); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = getComputedStyle(svg.parentElement).backgroundColor;
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
    const canvas = document.createElement('canvas'); canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement('a'); a.download = filename; a.href = canvas.toDataURL('image/png'); a.click();
  }

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
    const planBox = h('div', { class: 'calc-planbox' });
    const roomBox = h('div', { class: 'calc-roombox' });
    let planEditor = null, roomEditor = null;
    const vizBox = h('div', { class: 'calc-viz', hidden: '' });
    const presetsBox = h('div', { class: 'calc-preset-rows' });
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
      return h('div', { class: 'calc-field', 'data-group': f.group || '' }, [
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

    function renderPlan() {
      const mode = def.modes.find((m) => m.id === state.mode);
      if (!mode.plan || !window.CalcPlan) { planBox.innerHTML = ''; planEditor = null; return; }
      const opts = typeof mode.plan === 'object' ? mode.plan : {};
      const presets = opts.presetsKey ? window.CalcPlan[opts.presetsKey] : window.CalcPlan.PRESETS;
      if (!state.extras.plan) state.extras.plan = { verts: presets.rect.make(), edges: [], inner: [], preset: 'rect' };
      planEditor = window.CalcPlan.editor(planBox, state.extras.plan, () => ({
        w: parseNum(state.values.pW) || 40, depth: parseNum(state.values.pDepth) || 60, above: parseNum(state.values.pAbove) || 0,
      }), () => render(), { simple: !!opts.simple, presets });
    }

    function renderFields() {
      fieldsBox.innerHTML = '';
      const mode = def.modes.find((m) => m.id === state.mode);
      mode.fields.forEach((f) => fieldsBox.appendChild(field(f)));
      renderOpenings();
      renderPlan();
      renderRoom();
      (def.common || []).forEach((f) => fieldsBox.appendChild(field(f)));
      presetsBox.innerHTML = '';
      const prs = mode.presets || def.presets;
      (Array.isArray(prs) ? prs : (prs ? [prs] : [])).forEach((pr) => {
        const row = h('div', { class: 'calc-presets', 'data-group': pr.group || '' });
        row.appendChild(h('span', { class: 'calc-presets-label', text: pr.label + ':' }));
        pr.items.forEach(([label, value]) => {
          const b = h('button', { type: 'button', class: 'calc-preset', text: label + ' · ' + value + ' ' + pr.unit });
          b.addEventListener('click', () => {
            state.values[pr.fieldId] = value;
            const input = fieldsBox.querySelector('[name="' + pr.fieldId + '"]');
            if (input) input.value = value;
            render();
          });
          row.appendChild(b);
        });
        presetsBox.appendChild(row);
      });
    }

    function renderRoom() {
      const mode = def.modes.find((m) => m.id === state.mode);
      if (!mode.room || !window.CalcRoom) { roomBox.innerHTML = ''; roomEditor = null; return; }
      const finishes = def.finishes || window.CalcRoom.FINISH;
      const defaultFinish = (def.roomOpts && def.roomOpts.defaultFinish) || (finishes[root.dataset.finish] ? root.dataset.finish : Object.keys(finishes)[0]);
      if (!state.extras.room) state.extras.room = { walls: [], openings: [], defaultFinish };
      state.extras.room.defaultFinish = defaultFinish;
      roomEditor = window.CalcRoom.editor(roomBox, state.extras.room, () => {
        const v = {}; Object.keys(state.values).forEach((k) => { v[k] = parseNum(state.values[k]); });
        return { lens: def.lens ? def.lens(v, state.mode, { plan: state.extras.plan, room: state.extras.room }) : null, H: parseNum(state.values.hei) || 0 };
      }, () => render(), Object.assign({ finishes, defaultFinish }, def.roomOpts || {}));
    }

    function render() {
      const v = {};
      const mode = def.modes.find((m) => m.id === state.mode);
      mode.fields.concat(def.common || []).forEach((f) => { v[f.id] = parseNum(state.values[f.id]); });
      const extras = { openings: state.extras.openings.map((o) => ({ kind: o.kind, w: parseNum(o.w), h: parseNum(o.h), count: Math.max(1, Math.round(parseNum(o.count) || 1)) })), plan: state.extras.plan, room: state.extras.room };
      if (planEditor) planEditor.redraw();
      if (roomEditor) roomEditor.redraw();
      // Группы полей (краска/обои/сайдинг…) — по тому, какая отделка выбрана у стен.
      // Применяется и до расчёта, и после (цены создаются позже, при первом результате).
      const applyGroups = () => {
        if (!def.groups) return;
        const gs = def.groups(v, state.mode, extras, state.sel);
        form.querySelectorAll('[data-group]').forEach((elm) => { const g = elm.dataset.group; if (g) elm.hidden = !gs[g]; });
      };
      applyGroups();
      render.after = applyGroups;
      lastViz = { v, extras };
      drawViz();
      def._sel = state.sel;
      const r = def.compute(v, state.mode, state.sel, extras);
      result.innerHTML = '';
      costBox.hidden = !r || !!r.error;
      if (!r || r.error) {
        result.appendChild(h('p', { class: 'calc-empty' + (r && r.error ? ' calc-empty--error' : ''), text: r && r.error ? r.error : 'Заполните поля — результат появится сразу.' }));
        return;
      }
      result.appendChild(h('div', { class: 'calc-main' }, [h('div', { class: 'calc-main-label', text: r.main.label }), h('div', { class: 'calc-main-value', text: r.main.value })]));
      const dl = h('dl', { class: 'calc-rows' });
      r.rows.forEach(([k, val]) => { dl.appendChild(h('dt', { text: k })); dl.appendChild(h('dd', { text: val })); });
      result.appendChild(dl);
      if (r.note) result.appendChild(h('p', { class: 'calc-note', text: r.note }));
      // --- Действия с расчётом ---
      const shareText = () => {
        const lines = [document.title.split(' · ')[0].split(':')[0], '', r.main.label + ': ' + r.main.value].concat(r.rows.map(([k, val]) => '• ' + k + ': ' + val));
        const costLines = costRows(r).filter((c) => c.sum != null).map((c) => '• ' + c.label + ' — ' + fmt(c.amount) + ' ' + c.unit + ' = ' + money(c.sum));
        if (costLines.length) lines.push('', 'Стоимость:', ...costLines, 'ИТОГО: ' + money(costRows(r).reduce((s2, c) => s2 + (c.sum || 0), 0)));
        lines.push('', 'Открыть этот расчёт: ' + shareUrl(), 'Посчитано на kor-nil.ru — тот же калькулятор есть в приложении ЧатЯдро');
        return lines.join('\n');
      };
      const actions = h('div', { class: 'calc-actions' });
      const flash = (b, txt) => { const old = b.textContent; b.textContent = txt; setTimeout(() => { b.textContent = old; }, 1600); };
      // Поделиться: системное меню телефона (Telegram, WhatsApp, VK, MAX, СМС…), на компьютере — ссылки
      const share = h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Поделиться' });
      share.addEventListener('click', async () => {
        const data = { title: document.title, text: shareText(), url: shareUrl() };
        if (navigator.share) { try { await navigator.share(data); } catch (e) { /* отменил */ } return; }
        const menu = actions.querySelector('.calc-share-menu');
        if (menu) { menu.remove(); return; }
        const u = encodeURIComponent(shareUrl()), t = encodeURIComponent(r.main.label + ': ' + r.main.value);
        actions.appendChild(h('div', { class: 'calc-share-menu' }, [
          h('a', { href: 'https://t.me/share/url?url=' + u + '&text=' + t, target: '_blank', rel: 'noopener', text: 'Telegram' }),
          h('a', { href: 'https://vk.com/share.php?url=' + u + '&title=' + t, target: '_blank', rel: 'noopener', text: 'ВКонтакте' }),
          h('a', { href: 'https://connect.ok.ru/offer?url=' + u + '&title=' + t, target: '_blank', rel: 'noopener', text: 'Одноклассники' }),
          h('a', { href: 'mailto:?subject=' + encodeURIComponent('Расчёт: ' + r.main.value) + '&body=' + encodeURIComponent(shareText()), text: 'Почта' }),
        ]));
      });
      const copy = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Скопировать' });
      copy.addEventListener('click', () => navigator.clipboard.writeText(shareText()).then(() => flash(copy, 'Скопировано ✓')));
      const link = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Ссылка на расчёт' });
      link.addEventListener('click', () => navigator.clipboard.writeText(shareUrl()).then(() => flash(link, 'Ссылка скопирована ✓')));
      const pdf = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Скачать PDF' });
      pdf.addEventListener('click', () => { result.dataset.printDate = new Date().toLocaleDateString('ru-RU'); window.print(); });
      actions.appendChild(share); actions.appendChild(copy); actions.appendChild(link); actions.appendChild(pdf);
      if (!vizBox.hidden && vizBox.querySelector('svg')) {
        const png = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Схема PNG' });
        png.addEventListener('click', () => svgToPng(vizBox.querySelector('svg'), (key || 'scheme') + '-schema.png').catch(() => flash(png, 'Не удалось')));
        actions.appendChild(png);
      }
      result.appendChild(actions);
      syncHash();
      // --- Приложение: здесь, когда польза уже получена ---
      result.appendChild(h('div', { class: 'calc-app' }, [
        h('p', { text: 'В приложении ЧатЯдро этот расчёт сохраняется, цены запоминаются, а результат уходит соседям или мастеру в чат одной кнопкой.' }),
        h('a', { href: 'https://www.rustore.ru/catalog/app/ru.sntchat.app', target: '_blank', rel: 'noopener', class: 'btn btn-secondary btn-sm', text: 'Установить ЧатЯдро из RuStore →' }),
      ]));
      renderCost(r);
      if (render.after) render.after();
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
          body.appendChild(h('div', { class: 'calc-field', 'data-group': p.group || '' }, [h('label', { for: id, text: p.label }), h('div', { class: 'calc-input' }, [input, h('span', { class: 'calc-unit', text: p.unit })])]));
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

    // Расчёт по ссылке: всё введённое лежит в #c=… — получатель открывает те же цифры и рисунок
    function encodeState() {
      const obj = { c: key, m: state.mode, v: state.values, s: state.sel, y: Math.round(state.yaw * 100) / 100,
        x: { plan: state.extras.plan, room: state.extras.room, openings: state.extras.openings } };
      return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function decodeState(code) {
      try { return JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; }
    }
    function shareUrl() { return location.origin + location.pathname + '#c=' + encodeState(); }
    let hashTimer = null;
    function syncHash() {
      clearTimeout(hashTimer);
      hashTimer = setTimeout(() => { try { history.replaceState(null, '', '#c=' + encodeState()); } catch (e) { /* file:// */ } }, 300);
    }
    const restored = (() => {
      const m = location.hash.match(/#c=([A-Za-z0-9_-]+)/); if (!m) return false;
      const obj = decodeState(m[1]); if (!obj || obj.c !== key) return false;
      if (def.modes.some((md) => md.id === obj.m)) state.mode = obj.m;
      if (obj.v && typeof obj.v === 'object') state.values = obj.v;
      if (obj.s && typeof obj.s === 'object') Object.keys(obj.s).forEach((k2) => { if (state.sel[k2] !== undefined) state.sel[k2] = obj.s[k2]; });
      if (typeof obj.y === 'number') state.yaw = obj.y;
      if (obj.x) { if (obj.x.plan) state.extras.plan = obj.x.plan; if (obj.x.room) state.extras.room = obj.x.room; if (Array.isArray(obj.x.openings)) state.extras.openings = obj.x.openings; }
      return true;
    })();

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
    form.appendChild(planBox);
    form.appendChild(roomBox);
    form.appendChild(presetsBox);
    form.appendChild(vizBox);
    form.appendChild(result);
    form.appendChild(costBox);
    root.innerHTML = '';
    if (!root.previousElementSibling || !root.previousElementSibling.classList.contains('calc-topline')) {
      root.parentNode.insertBefore(h('p', { class: 'calc-topline', html: 'Тот же калькулятор есть в приложении <a href="/projects/chatyadro/">ЧатЯдро</a>: там расчёт сохраняется и уходит соседям в чат. ' + (restored ? '<strong>Открыт расчёт по ссылке.</strong>' : '') }), root);
    }
    root.appendChild(form);
    renderFields();
    render();
  }

  document.querySelectorAll('.calc[data-calc]').forEach(mount);
})();
