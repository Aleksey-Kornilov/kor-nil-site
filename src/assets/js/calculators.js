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
  // Разряды — неразрывным пробелом, чтобы «16 085» не рвалось на две строки.
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
      if (i > 0 && (digits.length - i) % 3 === 0) out += '\u00a0';
      out += digits[i];
    }
    if (parts.length > 1) out += ',' + parts[1];
    return neg ? '-' + out : out;
  }

  const fmt = (v, maxDecimals) => formatNumber(v, maxDecimals === undefined ? 2 : maxDecimals);
  const fmtInt = (v) => formatNumber(v, 0);
  const money = (v) => formatNumber(Math.round(v), 0) + ' ₽';
  // Стяжка тоньше 30 мм бывает только наливной — при переходе на пескобетон или ЦПС возвращаем обычные 50
  const screedThick = (vals) => ((parseNum(vals.thick) || 0) < 30 ? { thick: '50' } : {});

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
    // compact — во сколько раз рыхлого материала больше, чем выйдет слоя после трамбовки (усадки)
    sand: { name: 'Песок', density: 1.55, compact: 1.15, hint: 'карьерный сухой; влажный тяжелее на 10–15%' },
    gravel: { name: 'Щебень', density: 1.35, compact: 1.3, hint: 'гранитный, фракция 20–40' },
    pgs: { name: 'ПГС', density: 1.65, compact: 1.2, hint: 'песчано-гравийная смесь' },
    screening: { name: 'Отсев', density: 1.40, compact: 1.2, hint: 'гранитный отсев' },
    soil: { name: 'Земля, чернозём', density: 1.30, compact: 1.2, hint: 'рыхлый грунт' },
    peat: { name: 'Торф', density: 0.50, compact: 1.25, hint: 'верховой, влажность средняя' },
    expandedClay: { name: 'Керамзит', density: 0.40, compact: 1.1, hint: 'фракция 10–20' },
  };
  // Чем возят: грузоподъёмность — что реально берут, а не по паспорту.
  const TRUCKS = [
    { id: 'gazel', name: 'Газель', tons: 1.5 },
    { id: 't5', name: 'Самосвал 5 т', tons: 5 },
    { id: 't10', name: 'КамАЗ, самосвал 10 т', tons: 10 },
    { id: 't20', name: 'Самосвал 20 т (тонар)', tons: 20 },
  ];

  // Профили и планки фиксированной длины L: целые — на длинные отрезки, короткие куски
  // раскладываем «самый длинный — в первый, куда влезет», так обрезки идут в дело, а не в мусор
  function packBars(pieces, L) {
    let n = 0; const rest = [], free = [];
    pieces.forEach((p) => { const full = Math.floor(p / L + 1e-9); n += full; if (p - full * L > 0.01) rest.push(p - full * L); });
    rest.sort((x, y) => y - x).forEach((r) => {
      const k = free.findIndex((f) => f >= r - 1e-9);
      if (k >= 0) free[k] -= r; else { n++; free.push(L - r); }
    });
    return n;
  }

  /* ---------- Кварцвинил: раскладка планок ряд за рядом (всё в сантиметрах) ---------- */

  // Ряды поперёк направления планок. Если последний выходит полоской уже трети планки,
  // первый и последний режут поровну — так кладут мастера, узкая полоса у стены отходит.
  function plankBands(span, w) {
    const n = Math.max(1, Math.ceil(span / w - 1e-9));
    const last = span - (n - 1) * w;
    const ws = Array(n).fill(w);
    const balanced = n > 1 && last < w / 3 - 1e-9;
    if (balanced) ws[0] = ws[n - 1] = (last + w) / 2; else ws[n - 1] = last;
    let y = 0;
    return { n, last, balanced, edge: ws[0], bands: ws.map((bw) => { const b = [y, y + bw]; y += bw; return b; }) };
  }

  // Куски ряда [y0, y1] внутри многоугольника: объединение сечений по краям ряда и у вершин
  function bandSegs(poly, y0, y1) {
    const ys = [y0 + 0.01, y1 - 0.01];
    poly.forEach((p) => { if (p[1] > y0 && p[1] < y1) ys.push(p[1] - 0.01, p[1] + 0.01); });
    const iv = [];
    ys.forEach((y) => {
      const xs = [];
      poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length]; if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); });
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) iv.push([xs[i], xs[i + 1]]);
    });
    iv.sort((p, q) => p[0] - q[0]);
    const out = [];
    iv.forEach((s) => { const l = out[out.length - 1]; if (l && s[0] <= l[1] + 0.01) l[1] = Math.max(l[1], s[1]); else out.push(s.slice()); });
    return out;
  }

  // Раскладка: rows — [{ segs: [[x0, x1], …] }], куски ряда между стенами и проёмами; P — длина планки.
  // У отпиленной планки замок остаётся только на одном конце, поэтому обрезков две кучки:
  // starts — правые концы (остались от конца ряда), ими начинают ряд; ends — левые концы
  // (остались, когда ряд начали отпиленной планкой), ими ряд заканчивают. Короче minPiece — в отход.
  // free — «вразбежку»: ряд начинается обрезком, если стыки не ближе shift к стыкам прошлого ряда;
  // third / half — стыки по сетке со смещением на 1/3 или 1/2 планки, сетку сдвигаем так,
  // чтобы у стен не оставались узкие куски.
  function plankLayout(rows, P, o, pools) {
    pools = pools || { starts: [], ends: [] };
    const m = Math.min(Math.max(o.minPiece || 0, 0), P / 2), S = Math.min(Math.max(o.shift || 0, 0), P / 2);
    const n = o.pattern === 'half' ? 2 : o.pattern === 'third' ? 3 : 0;
    const res = { fresh: 0, reused: 0, forced: 0, pieces: [], pools };
    const keep = (pool, l) => { if (l >= m - 1e-6 && l >= 1) pool.push(l); };
    const take = (pool, need) => { let bi = -1; pool.forEach((l, i) => { if (l >= need - 1e-6 && (bi < 0 || l < pool[bi])) bi = i; }); return bi < 0 ? null : pool.splice(bi, 1)[0]; };
    const startAt = (s, ri, x0) => { const a = ((s + (ri % n) * P / n - x0) % P + P) % P; return a < 1e-6 ? P : a; };
    let phase = 0;
    if (n) {
      let best = -1;
      for (let s = 0; s < P / n - 1e-9; s += 1) {
        let worst = Infinity;
        rows.forEach((row, ri) => row.segs.forEach(([x0, x1]) => {
          const len = x1 - x0, a = startAt(s, ri, x0);
          if (a >= len - 1e-6) return;
          worst = Math.min(worst, a);
          const b = (len - a) % P; if (b > 1e-6 && P - b > 1e-6) worst = Math.min(worst, b);
        }));
        if (worst > best + 1e-6) { best = worst; phase = s; }
      }
    }
    let prevJ = [];
    rows.forEach((row, ri) => {
      const J = [];
      row.segs.forEach(([x0, x1]) => {
        const len = x1 - x0;
        const piece = (a, b, kind) => res.pieces.push({ x0: a, x1: b, row: ri, kind });
        const okJ = (a) => { for (let x = x0 + a; x < x1 - 1e-6; x += P) if (prevJ.some((q) => Math.abs(q - x) < S - 1e-6)) return false; return true; };
        const okEnd = (a) => { if (a >= len - 1e-6) return true; const b = (len - a) % P; return b < 1e-6 || P - b < 1e-6 || b >= m - 1e-6; };
        const lo = Math.min(m, len);
        let a = null, kind = null;
        if (n) {
          a = Math.min(startAt(phase, ri, x0), len);
          if (a >= P - 1e-6) { kind = 'full'; res.fresh++; }
          else if (take(pools.starts, a) != null) { kind = 'reuse'; res.reused++; }
          else { kind = 'cut'; res.fresh++; keep(pools.ends, P - a); }
        } else {
          // Сначала обрезок как есть, потом подрезанный, и только потом новая планка — по возможности целая
          const fits = (from, to) => { for (let t = from; t >= to - 1e-6; t -= 1) if (okJ(t) && okEnd(t)) return t; return null; };
          const order = pools.starts.map((l, i) => i).sort((p, q) => pools.starts[q] - pools.starts[p]);
          for (const i of order) {
            const l = pools.starts[i], t = Math.min(l, len);
            if (t >= lo - 1e-6 && okJ(t) && okEnd(t)) { a = t; pools.starts.splice(i, 1); if (l > len) keep(pools.starts, l - len); break; }
          }
          if (a == null) for (const i of order) { const t = fits(Math.min(pools.starts[i], len) - 1, lo); if (t != null) { a = t; pools.starts.splice(i, 1); break; } }
          if (a != null) { kind = 'reuse'; res.reused++; } else {
            let t = fits(Math.min(P, len), lo);
            if (t == null) { t = Math.min(P, len); res.forced++; }
            a = t; res.fresh++; kind = t >= P - 1e-6 ? 'full' : 'cut';
            if (kind === 'cut') keep(pools.ends, P - t);
          }
        }
        piece(x0, x0 + a, kind);
        let x = x0 + a;
        if (x < x1 - 1e-6) J.push(x);
        while (x1 - x >= P - 1e-6) { piece(x, x + P, 'full'); res.fresh++; x += P; if (x < x1 - 1e-6) J.push(x); }
        const b = x1 - x;
        if (b > 1e-6) {
          if (take(pools.ends, b) != null) { piece(x, x1, 'reuse'); res.reused++; } else { piece(x, x1, 'cut'); res.fresh++; keep(pools.starts, P - b); }
        }
      });
      prevJ = J;
    });
    return res;
  }

  // Ёлочка ставит короткие планки 60×12 — при возврате к обычной укладке возвращаем обычные 122×18,3
  const LVT_BACK = (vals) => ((parseNum(vals.plankL) || 0) <= 80 && (parseNum(vals.plankW) || 0) <= 15 ? { plankL: '122', plankW: '18.3', perPack: '10' } : {});

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
          { id: 'cCount', label: 'Количество столбов', unit: 'шт', value: '1', int: true },
        ] },
      ],
      common: [
        { id: 'rebarD', label: 'Арматура основная, диаметр', unit: 'мм', value: '12', group: 'rebar' },
        { id: 'gridStep', label: 'Шаг сетки', unit: 'см', value: '20', group: 'rebarSlab' },
        { id: 'rods', label: 'Продольных прутков в сечении', unit: 'шт', value: '4', int: true, group: 'rebarRods' },
        { id: 'clampD', label: 'Хомуты, диаметр прутка', unit: 'мм', value: '8', group: 'rebarRods' },
        { id: 'clampStep', label: 'Шаг хомутов', unit: 'см', value: '40', group: 'rebarRods' },
      ],
      selects: [
        { id: 'grade', label: 'Марка бетона', default: 'm200',
          choices: Object.keys(GRADES).map((k) => ({ id: k, label: GRADES[k].name, hint: GRADES[k].use })) },
        { id: 'source', label: 'Откуда бетон', default: 'mix', choices: [
          { id: 'mix', label: 'Мешаю сам', hint: 'цемент, песок и щебень в бетономешалке' },
          { id: 'ready', label: 'Готовый с завода', hint: 'миксер привозит нужную марку, заказ кратно 0,5 м³' },
        ] },
        { id: 'rebar', label: 'Арматура', default: 'no', choices: [
          { id: 'no', label: 'Не считать', hint: 'только бетон' },
          { id: 'yes', label: 'Посчитать', hint: 'плита — сетки, лента и столбы — каркас из прутков и хомутов' },
        ] },
      ],
      prices: [
        { id: 'cement', label: 'Цемент М400', unit: '₽ за мешок 50 кг', group: 'mix' },
        { id: 'sand', label: 'Песок', unit: '₽ за тонну', group: 'mix' },
        { id: 'gravel', label: 'Щебень', unit: '₽ за тонну', group: 'mix' },
        { id: 'ready', label: 'Готовый бетон', unit: '₽ за м³', group: 'ready' },
        { id: 'rebar', label: 'Арматура', unit: '₽ за тонну', group: 'rebar' },
        { id: 'wire', label: 'Вязальная проволока', unit: '₽ за кг', group: 'rebar' },
      ],
      groups(v, mode, extras, sel) {
        const rb = sel.rebar === 'yes';
        return { mix: sel.source !== 'ready', ready: sel.source === 'ready', rebar: rb,
          rebarSlab: rb && mode === 'slab', rebarRods: rb && mode !== 'slab' };
      },
      // Арматура обычной схемой: плита — сетки (две при толщине от 15 см), лента и столбы —
      // продольные прутки и хомуты с защитным слоем 5 см. Метры с запасом 10% на нахлёсты и обрезки.
      rebarCalc(v, mode, extras) {
        const kgm = (d) => 0.00617 * d * d;
        const cover = 0.05, hook = 0.1;
        if (!pos(v.rebarD)) return null;
        if (mode === 'slab') {
          if (!(pos(v.len) && pos(v.wid) && pos(v.thick) && pos(v.gridStep))) return null;
          const st = v.gridStep / 100, layers = v.thick >= 15 ? 2 : 1;
          const nL = Math.floor(v.wid / st) + 1, nW = Math.floor(v.len / st) + 1;
          return { layers, main: layers * (nL * v.len + nW * v.wid) * 1.1, clamp: 0, ties: layers * nL * nW, kgm };
        }
        if (!(pos(v.rods) && pos(v.clampD) && pos(v.clampStep))) return null;
        const cs = v.clampStep / 100, rods = Math.round(v.rods);
        // Отрезки ленты: длина по оси, ширина и полная высота сечения
        let parts = [];
        if (mode === 'strip') {
          const L = v.hLen, W = v.hWid, w = (v.sWid || 0) / 100, h = ((v.sDepth || 0) + (v.sAbove || 0)) / 100;
          if (!(pos(L) && pos(W) && pos(w) && pos(h))) return null;
          parts = [{ len: 2 * (L + W) - 4 * w, w, h }];
          if (pos(v.sInner)) parts.push({ len: v.sInner, w, h });
        } else if (mode === 'plan') {
          const P = window.CalcPlan; if (!P || !extras.plan || !pos(v.pW) || !pos(v.pDepth)) return null;
          const g = P.geometry(extras.plan, { w: v.pW, depth: v.pDepth, above: v.pAbove || 0 });
          if (!g.valid) return null;
          parts = g.edges.map((e) => ({ len: Math.max(0, e.len - e.w), w: e.w, h: e.h }))
            .concat(g.inners.map((e) => ({ len: e.len, w: e.w, h: e.h })));
        } else {
          if (!(pos(v.cSide) && pos(v.cHei) && pos(v.cCount))) return null;
          const n = Math.round(v.cCount), s = v.cSide / 100;
          parts = Array.from({ length: n }, () => ({ len: v.cHei, w: s, h: s }));
        }
        let main = 0, clamp = 0, ties = 0;
        for (const p of parts) {
          const k = Math.ceil(p.len / cs) + 1;
          const per = 2 * (Math.max(0, p.w - 2 * cover) + Math.max(0, p.h - 2 * cover)) + hook;
          main += rods * p.len; clamp += k * per; ties += k * rods;
        }
        return { main: main * 1.1, clamp: clamp * 1.1, ties, kgm };
      },
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
          ], { yaw: yaw.yaw, pitch: yaw.pitch, zoom: yaw.zoom, caption: 'Плита. Потяните, чтобы повернуть.' });
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
          V.iso(box, boxes, dims, { yaw: yaw.yaw, pitch: yaw.pitch, zoom: yaw.zoom, ground: true, caption: 'Зелёное — уровень земли. Потяните, чтобы повернуть.' });
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
          V.iso(box, P.prisms(g), dims, { yaw: yaw.yaw, pitch: yaw.pitch, zoom: yaw.zoom, ground: true, caption: 'Зелёное — уровень земли. Потяните, чтобы повернуть.' });
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
          ], { yaw: yaw.yaw, pitch: yaw.pitch, zoom: yaw.zoom, ground: true, caption: fmtInt(n) + ' ' + plural(n, 'столб', 'столба', 'столбов') + '. Потяните, чтобы повернуть.' });
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
        let res;
        if (sel.source === 'ready') {
          // Заводской бетон не теряется на замесах: запас 5% и заказ кратно 0,5 м³
          const order = Math.ceil(volume * 1.05 * 2 - 1e-9) / 2;
          res = {
            main: { label: 'Заказать бетона ' + g.name, value: fmt(order, 1) + ' м³' },
            rows: [
              ['Чистый объём', fmt(volume) + ' м³'],
              ['С запасом 5%', fmt(volume * 1.05) + ' м³, заводы возят кратно 0,5 м³'],
            ],
            note: 'Цена готового бетона — за 1 м³ марки ' + g.name + ' с завода. Доставку миксером и бетононасос завод обычно считает отдельно.',
            cost: [{ label: 'Бетон ' + g.name, amount: order, unit: 'м³', priceId: 'ready' }],
          };
        } else {
          const withReserve = volume * 1.1;
          const cementKg = withReserve * g.cement;
          const bags = Math.ceil(cementKg / 50);
          const sandKg = withReserve * g.sand;
          const gravelKg = withReserve * g.gravel;
          const waterL = withReserve * g.water;
          res = {
            main: { label: 'Нужно бетона (с запасом 10%)', value: fmt(withReserve) + ' м³' },
            rows: [
              ['Чистый объём', fmt(volume) + ' м³'],
              ['Цемент М400', fmtInt(cementKg) + ' кг (≈ ' + fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' по 50 кг)'],
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
        }
        const rb = sel.rebar === 'yes' ? this.rebarCalc(v, mode, extras) : null;
        if (rb) {
          const mainKg = rb.main * rb.kgm(v.rebarD), clampKg = rb.clamp * rb.kgm(v.clampD || 0);
          const tons = (mainKg + clampKg) / 1000;
          const wireKg = Math.ceil(rb.ties * 0.3 * 0.0121 * 2) / 2;   // ~30 см проволоки 1,4 мм на узел
          if (mode === 'slab') {
            res.rows.push(['Арматура ⌀' + fmt(v.rebarD, 0) + ', ' + (rb.layers === 2 ? 'две сетки' : 'одна сетка'), fmtInt(rb.main) + ' м = ' + fmtInt(mainKg) + ' кг']);
          } else {
            res.rows.push(['Арматура ⌀' + fmt(v.rebarD, 0) + ', продольная', fmtInt(rb.main) + ' м = ' + fmtInt(mainKg) + ' кг']);
            res.rows.push(['Хомуты ⌀' + fmt(v.clampD, 0), fmtInt(rb.clamp) + ' м = ' + fmtInt(clampKg) + ' кг']);
          }
          res.rows.push(['Арматура всего', fmt(tons, 3) + ' т, в метрах с запасом 10% на нахлёсты']);
          res.rows.push(['Вязальная проволока', '≈ ' + fmt(wireKg, 1) + ' кг (' + fmtInt(rb.ties) + ' ' + plural(rb.ties, 'узел', 'узла', 'узлов') + ')']);
          res.note += ' Арматура — обычная схема для частного дома' + (mode === 'slab' ? ' (вторая сетка при толщине от 15 см)' : '') + ', не проект.';
          res.cost.push({ label: 'Арматура', amount: tons, unit: 'т', priceId: 'rebar' });
          res.cost.push({ label: 'Вязальная проволока', amount: wireKg, unit: 'кг', priceId: 'wire' });
        }
        return res;
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
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
        ] },
        { id: 'custom', label: 'Своя площадь (краска)', fields: [
          { id: 'area', label: 'Площадь поверхности', unit: 'м²', value: '20' },
        ] },
      ],
      common: [
        { id: 'coats', label: 'Слоёв краски', unit: '', value: '2', group: 'paint', int: true },
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
          if (p.cans != null) rows.push(['Банок по ' + fmt(v.can) + ' л', '≈ ' + fmtInt(p.cans) + ' шт']);
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
              mains.push('обои ' + fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов'));
              rows.push(['Обои: стен', fmtInt(m.paper.n) + ' ' + plural(m.paper.n, 'стена', 'стены', 'стен') + ', ' + fmt(m.paper.area) + ' м² (с проёмами ' + fmt(m.paper.len * v.hei) + ')']);
              rows.push(['Полос', strips + ' по ' + fmt(stripLen) + ' м' + (pos(v.rapport) ? ' (с подгонкой рисунка)' : '')]);
              rows.push(['Полос из рулона', String(perRoll)]);
              if (glue != null) rows.push(['Клей', fmtInt(glue) + ' ' + plural(glue, 'пачка', 'пачки', 'пачек') + ' (на ' + fmt(m.paper.area) + ' м²)']);
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
            rows.push(['Краска: стен', fmtInt(m.paint.n) + ' ' + plural(m.paint.n, 'стена', 'стены', 'стен') + ', ' + fmt(m.paint.area) + ' м² × ' + fmt(coats) + ' сл.']);
            rows.push(['Без запаса', fmt(p.liters) + ' л']);
            if (p.cans != null) { rows.push(['Банок по ' + fmt(v.can) + ' л', '≈ ' + fmtInt(p.cans) + ' шт']); cost.push({ label: 'Краска', amount: p.cans, unit: plural(p.cans, 'банка', 'банки', 'банок'), priceId: 'can' }); }
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
        { id: 'gables', label: 'Фронтонов (треугольники под крышей)', unit: 'шт', value: '2', group: 'gable', int: true },
        { id: 'gableW', label: 'Ширина фронтона', unit: 'м, пусто — по короткой стороне дома', group: 'gable' },
        { id: 'gableH', label: 'Высота фронтона', unit: 'м', value: '2', group: 'gable' },
        { id: 'panelL', label: 'Длина панели сайдинга', unit: 'м', value: '3.66', group: 'siding' },
        { id: 'panelW', label: 'Рабочая ширина панели', unit: 'м', value: '0.23', group: 'siding' },
        { id: 'sidingWaste', label: 'Запас на подрезку', unit: '%', value: '10', group: 'siding' },
        { id: 'profL', label: 'Длина профилей', unit: 'м (стартовая, финишная, углы, J)', value: '3', group: 'siding' },
        { id: 'plasterRate', label: 'Расход штукатурки', unit: 'кг/м² при вашей толщине', value: '15', group: 'plaster' },
        { id: 'plasterBag', label: 'Мешок штукатурки', unit: 'кг', value: '25', group: 'plaster' },
        { id: 'coats', label: 'Слоёв краски', unit: '', value: '2', group: 'paint', int: true },
        { id: 'rate', label: 'Расход краски (м² на 1 литр)', unit: 'на банке', value: '8', group: 'paint' },
        { id: 'can', label: 'Объём банки', unit: 'л', value: '9', group: 'paint' },
      ],
      selects: [{ id: 'gableFinish', label: 'Отделка фронтонов', default: 'siding',
        choices: [{ id: 'siding', label: 'Сайдинг', hint: 'как у стен из сайдинга' }, { id: 'plaster', label: 'Штукатурка', hint: '' }, { id: 'paint', label: 'Краска', hint: '' }, { id: 'none', label: 'Без отделки', hint: 'фронтоны не считаем' }] },
        { id: 'panelBuy', label: 'Сайдинг продают', default: 'piece', group: 'siding', choices: [
          { id: 'piece', label: 'За панель', hint: 'цена одной панели' },
          { id: 'm2', label: 'За м²', hint: 'по полезной площади панели: длина × рабочая ширина' },
        ] }],
      prices: [
        { id: 'panel', label: 'Панель сайдинга', unit: '₽ за штуку', group: 'panelPiece' },
        { id: 'panelM2', label: 'Сайдинг', unit: '₽ за м²', group: 'panelM2' },
        { id: 'startP', label: 'Стартовая планка', unit: '₽ за штуку', group: 'siding' },
        { id: 'finishP', label: 'Финишная планка', unit: '₽ за штуку', group: 'siding' },
        { id: 'outerP', label: 'Наружный угол', unit: '₽ за штуку', group: 'siding' },
        { id: 'innerP', label: 'Внутренний угол', unit: '₽ за штуку', group: 'siding' },
        { id: 'jP', label: 'J-профиль', unit: '₽ за штуку', group: 'siding' },
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
        out.panelPiece = out.siding && sel.panelBuy !== 'm2'; out.panelM2 = out.siding && sel.panelBuy === 'm2';
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
        V.iso(box, [{ poly: verts, z: 0, dz: v.hei }], dims, { yaw: yaw.yaw, pitch: yaw.pitch, zoom: yaw.zoom, ground: true, caption: 'Коробка дома без кровли. Номера — стены на развёртке. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
        if (mode === 'plan' && !lens && extras.plan) return { error: 'Контур дома пересекает сам себя — поправьте углы на плане.' };
        if (!R || !extras.room || !lens || !pos(v.hei)) return null;
        const m = R.measure(extras.room, lens, v.hei, this.finishes, extras.room.defaultFinish || 'siding');
        let verts = null;
        if (mode === 'rect') verts = [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]];
        else { const g = window.CalcPlan.geometry(extras.plan, { w: 1, depth: 1, above: 0 }); if (g.valid) verts = g.verts; }
        // Фронтон обычно на торцах, по короткой стороне дома — если ширину не ввели, берём её
        const xs = verts ? verts.map((p) => p[0]) : [], ys = verts ? verts.map((p) => p[1]) : [];
        const gableW = pos(v.gableW) ? v.gableW : verts ? Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : null;
        const gableArea = (pos(v.gables) && pos(gableW) && pos(v.gableH)) ? v.gables * gableW * v.gableH / 2 : 0;
        const area = { siding: m.by.siding.area, plaster: m.by.plaster.area, paint: m.by.paint.area };
        if (gableArea > 0 && area[sel.gableFinish] != null) area[sel.gableFinish] += gableArea;
        const rows = [], cost = [], mains = [];
        if (area.siding > 0 && pos(v.panelL) && pos(v.panelW)) {
          const need = area.siding * (1 + (v.sidingWaste || 0) / 100);
          const panels = Math.ceil(need / (v.panelL * v.panelW));
          const start = m.by.siding.len;
          // У проёма от самой земли (дверь) J-профиль только с трёх сторон: снизу его нет
          const sideOps = extras.room.openings.filter((o) => m.walls[o.wall] && m.walls[o.wall].finish === 'siding' && o.w > 0 && o.h > 0);
          const jLen = sideOps.reduce((s2, o) => s2 + 2 * o.h + (o.y > 0.01 ? 2 : 1) * o.w, 0);
          mains.push('сайдинг ' + fmtInt(panels) + ' ' + plural(panels, 'панель', 'панели', 'панелей'));
          rows.push(['Сайдинг: площадь', fmt(area.siding) + ' м² (+' + fmt(v.sidingWaste || 0) + '% подрезка = ' + fmt(need) + ')']);
          rows.push(['Стартовая планка', fmt(start) + ' м']);
          // Углы, где сходятся стены с сайдингом: наружный угол — наружный профиль, внутренний (Г-образный дом) — свой
          let outer = 0, inner = 0;
          if (verts && verts.length === m.walls.length) {
            const n = verts.length;
            const sgn = Math.sign(verts.reduce((s2, a, i) => { const b = verts[(i + 1) % n]; return s2 + a[0] * b[1] - b[0] * a[1]; }, 0));
            for (let i = 0; i < n; i++) {
              const prev = (i - 1 + n) % n;
              if (m.walls[i].finish !== 'siding' && m.walls[prev].finish !== 'siding') continue;
              const a = verts[prev], b = verts[i], c = verts[(i + 1) % n];
              const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
              if (Math.sign(cross) === sgn) outer++; else inner++;
            }
          }
          // Профили по 3 м, обрезки раскладываются по профилям (packBars)
          const L = pos(v.profL) ? v.profL : 3;
          const bars = (pieces) => packBars(pieces, L);
          const sideWalls = m.walls.filter((w) => w.finish === 'siding');
          const startN = bars(sideWalls.map((w) => w.len));
          const outerN = bars(Array(outer).fill(v.hei)), innerN = bars(Array(inner).fill(v.hei));
          const jPieces = [];
          sideOps.forEach((o) => { jPieces.push(o.w + 0.05, o.h + 0.05, o.h + 0.05); if (o.y > 0.01) jPieces.push(o.w + 0.05); });
          const jN = bars(jPieces);
          const pcs = (n) => fmtInt(n) + ' шт по ' + fmt(L) + ' м';
          rows[rows.length - 1] = ['Стартовая планка', fmt(start) + ' м → ' + pcs(startN)];
          rows.push(['Финишная планка', 'под карнизом, столько же: ' + pcs(startN)]);
          rows.push(['Наружный угол', fmtInt(outer) + ' ' + plural(outer, 'угол', 'угла', 'углов') + ' × ' + fmt(v.hei) + ' м = ' + fmt(outer * v.hei) + ' м → ' + pcs(outerN)]);
          if (inner) rows.push(['Внутренний угол', fmtInt(inner) + ' ' + plural(inner, 'угол', 'угла', 'углов') + ' × ' + fmt(v.hei) + ' м = ' + fmt(inner * v.hei) + ' м → ' + pcs(innerN)]);
          if (jLen > 0) rows.push(['J-профиль вокруг проёмов', fmt(jLen) + ' м → ' + pcs(jN) + ' (по 5 см на подрезку угла)']);
          if (sel.panelBuy === 'm2') {
            const m2 = Math.round(panels * v.panelL * v.panelW * 100) / 100;
            rows.push(['Сайдинг в м²', fmtInt(panels) + ' × ' + fmt(v.panelL) + ' × ' + fmt(v.panelW) + ' м = ' + fmt(m2) + ' м² полезной площади']);
            cost.push({ label: 'Сайдинг, ' + fmtInt(panels) + ' ' + plural(panels, 'панель', 'панели', 'панелей'), amount: m2, unit: 'м²', priceId: 'panelM2' });
          } else cost.push({ label: 'Сайдинг', amount: panels, unit: plural(panels, 'панель', 'панели', 'панелей'), priceId: 'panel' });
          if (startN) cost.push({ label: 'Стартовая планка', amount: startN, unit: 'шт', priceId: 'startP' }, { label: 'Финишная планка', amount: startN, unit: 'шт', priceId: 'finishP' });
          if (outerN) cost.push({ label: 'Наружный угол', amount: outerN, unit: 'шт', priceId: 'outerP' });
          if (innerN) cost.push({ label: 'Внутренний угол', amount: innerN, unit: 'шт', priceId: 'innerP' });
          if (jN) cost.push({ label: 'J-профиль', amount: jN, unit: 'шт', priceId: 'jP' });
        }
        if (area.plaster > 0 && pos(v.plasterRate) && pos(v.plasterBag)) {
          const kg = area.plaster * v.plasterRate, bags = Math.ceil(kg / v.plasterBag);
          mains.push('штукатурка ' + fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков'));
          rows.push(['Штукатурка', fmt(area.plaster) + ' м² × ' + fmt(v.plasterRate) + ' кг = ' + fmtInt(kg) + ' кг']);
          cost.push({ label: 'Штукатурка', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: 'plaster' });
        }
        if (area.paint > 0 && pos(v.rate)) {
          const coats = v.coats == null ? 1 : v.coats, liters = area.paint * coats / v.rate * 1.1;
          const cans = pos(v.can) ? Math.ceil(liters / v.can) : null;
          mains.push('краска ' + fmt(liters) + ' л');
          rows.push(['Краска', fmt(area.paint) + ' м² × ' + fmt(coats) + ' сл., с запасом 10%' + (cans != null ? ', ' + fmtInt(cans) + ' ' + plural(cans, 'банка', 'банки', 'банок') : '')]);
          if (cans != null) cost.push({ label: 'Краска', amount: cans, unit: plural(cans, 'банка', 'банки', 'банок'), priceId: 'can' });
        }
        if (!mains.length) return { error: 'У всех стен выбрано «без отделки» — отметьте на развёртке, чем отделываем.' };
        if (gableArea > 0) rows.push(['Фронтоны', fmtInt(v.gables) + ' × ' + fmt(gableW) + '×' + fmt(v.gableH) + ' / 2 = ' + fmt(gableArea) + ' м² → ' + this.finishes[sel.gableFinish] + (pos(v.gableW) ? '' : ' (ширина по короткой стороне дома)')]);
        m.walls.forEach((w) => rows.push(['Стена ' + (w.i + 1) + ' · ' + this.finishes[w.finish], fmt(w.net) + ' м²' + (w.count ? ' (проёмов ' + w.count + ')' : '')]));
        return { main: { label: 'Нужно на фасад', value: mains.join(' · ') }, rows,
          note: 'Проёмы вычтены (' + fmt(m.openings) + ' м²). Сайдинг: панели по площади с запасом, стартовая планка по длине стен, угловой профиль по углам — наружный и внутренний отдельно, J-профиль по периметру проёмов. Расход штукатурки указан на мешке для вашей толщины слоя.', cost };
      },
    },

    /* --- Лестница: ступени по высоте этажа, формула удобного шага, ограждение --- */
    stairs: {
      modeLabel: 'Тип лестницы',
      modes: [
        { id: 'straight', label: 'Прямая (один марш)', fields: [
          { id: 'height', label: 'Высота этажа (от пола до пола)', unit: 'м', value: '2.8' },
          { id: 'riser', label: 'Желаемая высота ступени', unit: 'см', value: '17' },
          { id: 'tread', label: 'Глубина ступени (проступь)', unit: 'см', value: '28' },
          { id: 'width', label: 'Ширина марша', unit: 'м', value: '0.9' },
        ] },
        { id: 'turn', label: 'С поворотом на 90° (площадка)', fields: [
          { id: 'height', label: 'Высота этажа', unit: 'м', value: '2.8' },
          { id: 'riser', label: 'Желаемая высота ступени', unit: 'см', value: '17' },
          { id: 'tread', label: 'Глубина ступени', unit: 'см', value: '28' },
          { id: 'width', label: 'Ширина марша', unit: 'м', value: '0.9' },
          { id: 'split', label: 'Ступеней в нижнем марше', unit: 'шт, до площадки', value: '8', int: true },
        ] },
      ],
      common: [
        { id: 'thick', label: 'Толщина ступени', unit: 'мм', value: '40', group: 'steps' },
        { id: 'slabT', label: 'Толщина плиты марша', unit: 'см, под ступенями', value: '15', group: 'concrete' },
        { id: 'rebarRate', label: 'Арматуры на 1 м³ бетона', unit: 'кг', value: '90', group: 'concrete' },
        { id: 'balusterStep', label: 'Шаг балясин', unit: 'м', value: '0.5' },
        { id: 'headroom', label: 'Нужный просвет над головой', unit: 'м', value: '2' },
        { id: 'slab', label: 'Толщина перекрытия', unit: 'м, для проёма', value: '0.2' },
      ],
      selects: [
        { id: 'material', label: 'Из чего лестница', default: 'wood', choices: [
          { id: 'wood', label: 'Деревянная на косоурах', hint: 'ступени лежат на двух брусьях-косоурах' },
          { id: 'metal', label: 'Металлокаркас и деревянные ступени', hint: 'каркас из профильной трубы, ступени — дерево' },
          { id: 'concrete', label: 'Бетонная монолитная', hint: 'заливается на месте: бетон, арматура, опалубка из фанеры' },
        ] },
        { id: 'risers', label: 'Подступенки', default: 'yes', group: 'steps', choices: [
          { id: 'yes', label: 'Есть', hint: 'вертикальные доски между ступенями закрывают лестницу' },
          { id: 'no', label: 'Открытая лестница', hint: 'без подступенков: легче и светлее' },
        ] },
      ],
      prices: [
        { id: 'step', label: 'Ступень', unit: '₽ за штуку', group: 'steps' },
        { id: 'riser', label: 'Подступенок', unit: '₽ за штуку', group: 'riser' },
        { id: 'stringer', label: 'Брус на косоуры и стойки', unit: '₽ за метр', group: 'wood' },
        { id: 'tube', label: 'Профильная труба', unit: '₽ за метр', group: 'metal' },
        { id: 'landing', label: 'Щит площадки', unit: '₽ за м²', group: 'landing' },
        { id: 'concrete', label: 'Бетон', unit: '₽ за м³', group: 'concrete' },
        { id: 'rebar', label: 'Арматура', unit: '₽ за кг', group: 'concrete' },
        { id: 'plywood', label: 'Фанера на опалубку', unit: '₽ за лист 1,22×2,44 м', group: 'concrete' },
        { id: 'clad', label: 'Накладка на бетонную ступень', unit: '₽ за штуку, необязательно', group: 'concrete' },
        { id: 'baluster', label: 'Балясина', unit: '₽ за штуку' },
        { id: 'rail', label: 'Поручень', unit: '₽ за метр' },
      ],
      groups(v, mode, extras, sel) {
        const m = sel.material, wooden = m !== 'concrete';
        return { wood: m === 'wood', metal: m === 'metal', concrete: m === 'concrete', steps: wooden,
          riser: wooden && sel.risers === 'yes', landing: wooden && mode === 'turn' };
      },
      // Марши: сколько ступеней, длина по полу и высота подъёма каждого — для косоуров, каркаса и бетона
      flights(c, v, mode) {
        const r = c.riser / 100, t = v.tread / 100;
        const one = (k, rises) => ({ treads: k, run: k * t, rise: rises * r, len: Math.hypot(k * t, rises * r) });
        if (mode === 'straight') return [one(c.steps, c.n)];
        return [one(c.split, c.split + 1), one(c.upper, c.n - c.split - 1)];
      },
      calc(v, mode) {
        if (!pos(v.height) || !pos(v.riser) || !pos(v.tread)) return null;
        const H = v.height * 100;                       // высота этажа в см
        const n = Math.max(2, Math.round(H / v.riser));  // число подъёмов
        const riser = H / n;                             // фактическая высота ступени
        const steps = n - 1;                             // ступеней (верхняя — это пол этажа)
        const run = steps * v.tread;                     // длина по полу, см
        const comfort = 2 * riser + v.tread;             // формула удобного шага, 60–65 см
        const angle = Math.atan2(riser, v.tread) * 180 / Math.PI;
        // С поворотом одна «ступень» на высоте площадки — это сама площадка, в верхнем марше хотя бы одна ступень
        const split = Math.max(1, Math.min(steps - 2, Math.round(pos(v.split) ? v.split : Math.ceil(steps / 2))));
        return { n, riser, steps, run: run / 100, comfort, angle, H, split, upper: steps - split - 1 };
      },
      draw(v, mode, box, view) {
        const V = window.CalcViz; const c = this.calc(v, mode);
        if (!V || !c || !pos(v.width)) return false;
        const t = (v.tread || 0) / 100, r = c.riser / 100, w = v.width, th = (v.thick || 40) / 1000;
        const prisms = [];
        if (mode === 'straight') {
          for (let i = 0; i < c.steps; i++) prisms.push({ poly: [[i * t, 0], [(i + 1) * t, 0], [(i + 1) * t, w], [i * t, w]], z: (i + 1) * r - th, dz: th });
        } else {
          const split = c.split;
          // Нижний марш идёт вдоль X у левого края
          for (let i = 0; i < split; i++) prisms.push({ poly: [[i * t, 0], [(i + 1) * t, 0], [(i + 1) * t, w], [i * t, w]], z: (i + 1) * r - th, dz: th });
          // Площадка — квадрат в ширину марша
          const px = split * t;
          prisms.push({ poly: [[px, 0], [px + w, 0], [px + w, w], [px, w]], z: (split + 1) * r - th, dz: th });
          // Верхний марш уходит вбок под 90°: вдоль Y от дальнего края площадки
          for (let i = 0; i < c.steps - split - 1; i++) {
            const y = w + i * t;
            prisms.push({ poly: [[px, y], [px + w, y], [px + w, y + t], [px, y + t]], z: (split + 2 + i) * r - th, dz: th });
          }
        }
        const dims = [{ from: [0, 0, 0], to: [0, 0, v.height], label: 'высота ' + fmt(v.height) + ' м', offset: -28 }];
        if (mode === 'straight') dims.push({ from: [0, 0, 0], to: [c.run, 0, 0], label: 'по полу ' + fmt(c.run) + ' м', offset: 24 });
        else {
          const split = c.split;
          const px = split * t, upper = c.upper * t;
          dims.push({ from: [0, 0, 0], to: [px + w, 0, 0], label: 'нижний марш ' + fmt(px) + ' м', offset: 24 });
          dims.push({ from: [px + w, 0, 0], to: [px + w, w + upper, 0], label: 'верхний ' + fmt(upper) + ' м', offset: -24 });
        }
        V.iso(box, prisms, dims, { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, ground: true, caption: (mode === 'straight' ? c.steps : c.steps - 1) + ' ' + plural(mode === 'straight' ? c.steps : c.steps - 1, 'ступень', 'ступени', 'ступеней') + (mode === 'straight' ? '' : ' и площадка') + ' по ' + fmt(c.riser) + ' см, уклон ' + fmt(c.angle) + '°. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel) {
        const c = this.calc(v, mode);
        if (!c) return null;
        if (c.riser < 12 || c.riser > 22) return { error: 'Высота ступени получилась ' + fmt(c.riser) + ' см. Удобный диапазон 15–19 см, допустимо 12–22. Измените желаемую высоту ступени.' };
        const rows = [], cost = [];
        const turn = mode !== 'straight';
        const treads = turn ? c.steps - 1 : c.steps;   // с поворотом одну ступень заменяет площадка
        const W = v.width || 0.9;
        rows.push(['Подъёмов', c.n + ' по ' + fmt(c.riser) + ' см (задавали ' + fmt(v.riser) + ')']);
        rows.push(['Ступеней', fmtInt(treads) + ' шт' + (turn ? ' и площадка' : '') + ': верхняя ступень — это пол второго этажа']);
        rows.push(['Уклон', fmt(c.angle) + '° ' + (c.angle > 42 ? '— круто, для дома лучше до 40°' : c.angle < 25 ? '— полого, займёт много места' : '— в норме для дома')]);
        rows.push(['Формула удобства', '2 × ' + fmt(c.riser) + ' + ' + fmt(v.tread) + ' = ' + fmt(c.comfort) + ' см ' + (c.comfort >= 60 && c.comfort <= 65 ? '(в норме 60–65)' : '(норма 60–65: подберите глубину ступени)')]);
        if (mode === 'straight') rows.push(['Займёт по полу', fmt(c.run) + ' м при ширине марша ' + fmt(v.width || 0.9) + ' м']);
        else {
          const split = c.split, stW = (k) => fmtInt(k) + ' ' + plural(k, 'ступень', 'ступени', 'ступеней');
          const asked = pos(v.split) && Math.round(v.split) !== split ? ' (задали ' + fmt(v.split) + ', при ' + c.steps + ' ступенях больше ' + (c.steps - 2) + ' не получится)' : '';
          rows.push(['Нижний марш', stW(split) + ', ' + fmt(split * v.tread / 100) + ' м' + asked]);
          rows.push(['Площадка', fmt(W) + ' × ' + fmt(W) + ' м на высоте ' + fmt((split + 1) * c.riser / 100) + ' м']);
          rows.push(['Верхний марш', stW(c.upper) + ', ' + fmt(c.upper * v.tread / 100) + ' м']);
          rows.push(['Займёт в плане', fmt(split * v.tread / 100 + W) + ' × ' + fmt(W + c.upper * v.tread / 100) + ' м']);
        }
        const mat = sel.material || 'wood', fl = this.flights(c, v, mode);
        const landH = turn ? (c.split + 1) * c.riser / 100 : 0;
        if (mat !== 'concrete') {
          rows.push(['Размер ступени', fmt(v.tread) + '×' + fmt(W * 100) + ' см, толщина ' + fmt(v.thick || 40) + ' мм' + (turn ? '; площадка — щит ' + fmt(W) + '×' + fmt(W) + ' м' : '')]);
          cost.push({ label: 'Ступени', amount: treads, unit: 'шт', priceId: 'step' });
          if (sel.risers === 'yes') {
            rows.push(['Подступенки', fmtInt(c.n) + ' шт ' + fmt(c.riser) + '×' + fmt(W * 100) + ' см']);
            cost.push({ label: 'Подступенки', amount: c.n, unit: 'шт', priceId: 'riser' });
          }
          if (turn) cost.push({ label: 'Щит площадки', amount: Math.round(W * W * 100) / 100, unit: 'м²', priceId: 'landing' });
        }
        const flTxt = fl.map((f) => fmt(f.len)).join(' и ');
        if (mat === 'wood') {
          // Два косоура на каждый марш, площадку держат четыре стойки
          const len = 2 * fl.reduce((s2, f) => s2 + f.len, 0) + (turn ? 4 * landH : 0);
          rows.push(['Косоуры', '2 на ' + (turn ? 'каждый марш по ' + flTxt + ' м' : 'марш по ' + flTxt + ' м') + (turn ? ', и 4 стойки площадки по ' + fmt(landH) + ' м' : '') + ' — всего ' + fmt(len) + ' м бруса']);
          cost.push({ label: 'Брус на косоуры' + (turn ? ' и стойки' : ''), amount: Math.ceil(len * 10) / 10, unit: 'м', priceId: 'stringer' });
        } else if (mat === 'metal') {
          // Каркас: два косоура из трубы на марш, поперечина под каждую ступень; у площадки рама, перемычка и четыре ноги
          const strL = 2 * fl.reduce((s2, f) => s2 + f.len, 0), crossL = treads * W, landL = turn ? 5 * W + 4 * landH : 0;
          const len = strL + crossL + landL;
          rows.push(['Каркас из трубы', 'косоуры ' + fmt(strL) + ' м + поперечины под ступени ' + fmt(crossL) + ' м' + (turn ? ' + площадка ' + fmt(landL) + ' м' : '') + ' = ' + fmt(len) + ' м']);
          cost.push({ label: 'Профильная труба', amount: Math.ceil(len * 10) / 10, unit: 'м', priceId: 'tube' });
        } else {
          // Монолит: наклонная плита под каждым маршем, сверху треугольники ступеней, площадка — плита
          if (!pos(v.slabT)) return null;
          const ts = v.slabT / 100, r = c.riser / 100, t = v.tread / 100;
          const volF = fl.reduce((s2, f) => s2 + W * f.len * ts + f.treads * (r * t / 2) * W, 0);
          const vol = volF + (turn ? W * W * ts : 0);
          const rebar = vol * (v.rebarRate || 0);
          // Опалубка: дно маршей и площадки, щиты на подступенки, боковины с двух сторон
          const form = fl.reduce((s2, f) => s2 + W * f.len + 2 * (f.len * ts + f.treads * r * t / 2), 0) + c.n * r * W + (turn ? W * W + 2 * W * ts : 0);
          const sheets = Math.ceil(form * 1.15 / (1.22 * 2.44) - 1e-9);
          rows.push(['Бетон', fmt(vol) + ' м³: плита ' + fmt(v.slabT) + ' см под ' + (turn ? 'маршами' : 'маршем') + ' и ступени' + (turn ? ', площадка' : '')]);
          if (rebar > 0) rows.push(['Арматура', fmtInt(rebar) + ' кг (' + fmt(v.rebarRate) + ' кг на м³)']);
          rows.push(['Опалубка', fmt(form) + ' м² → ' + fmtInt(sheets) + ' ' + plural(sheets, 'лист', 'листа', 'листов') + ' фанеры 1,22×2,44 м (+15% на подрезку)']);
          cost.push({ label: 'Бетон', amount: Math.round(vol * 100) / 100, unit: 'м³', priceId: 'concrete' });
          if (rebar > 0) cost.push({ label: 'Арматура', amount: Math.ceil(rebar), unit: 'кг', priceId: 'rebar' });
          cost.push({ label: 'Фанера', amount: sheets, unit: plural(sheets, 'лист', 'листа', 'листов'), priceId: 'plywood' });
          cost.push({ label: 'Накладки на ступени', amount: treads, unit: 'шт', priceId: 'clad' });
        }
        const railLen = mode === 'straight' ? Math.hypot(c.run, v.height) : Math.hypot(c.run, v.height) + (v.width || 0.9);
        if (pos(v.balusterStep)) {
          const bal = Math.ceil(railLen / v.balusterStep) + 1;
          rows.push(['Ограждение', 'поручень ' + fmt(railLen) + ' м, балясины ' + fmtInt(bal) + ' шт с шагом ' + fmt(v.balusterStep) + ' м']);
          cost.push({ label: 'Балясины', amount: bal, unit: 'шт', priceId: 'baluster' });
          cost.push({ label: 'Поручень', amount: Math.ceil(railLen * 10) / 10, unit: 'м', priceId: 'rail' });
        }
        if (pos(v.headroom)) {
          // Проём нужен над теми ступенями, с которых до низа перекрытия меньше нужного просвета:
          // ступень на высоте h требует проёма, если h + просвет > высота этажа − толщина перекрытия
          const r = c.riser / 100, t = v.tread / 100, hT = v.height - (v.slab || 0) - v.headroom;
          const need = (k) => k * r > hT + 1e-9;   // k-я ступень снизу
          let txt;
          if (!turn) {
            let k = 0; for (let i = 1; i <= c.steps; i++) if (need(i)) k++;
            txt = k ? 'примерно ' + fmt(k * t) + ' × ' + fmt(W) + ' м: над ' + (k === 1 ? 'последней ступенью' : 'последними ' + k + ' ступенями') : 'не нужен, просвет и так есть';
          } else {
            let up = 0; for (let i = 0; i < c.upper; i++) if (need(c.split + 2 + i)) up++;
            let low = 0; for (let i = 1; i <= c.split; i++) if (need(i)) low++;
            const land = need(c.split + 1);
            const parts = [];
            if (up) parts.push('над верхним маршем ' + fmt(up * t) + ' м');
            if (land) parts.push('над площадкой ' + fmt(W) + ' × ' + fmt(W) + ' м');
            if (low) parts.push('над нижним маршем ' + fmt(low * t) + ' м');
            txt = parts.length ? parts.join(', ') + ', ширина ' + fmt(W) + ' м' : 'не нужен, просвет и так есть';
          }
          rows.push(['Проём в перекрытии', txt + ' (просвет ' + fmt(v.headroom) + ' м, перекрытие ' + fmt(v.slab || 0) + ' м)']);
        }
        return { main: { label: 'Лестница', value: fmtInt(treads) + ' ' + plural(treads, 'ступень', 'ступени', 'ступеней') + (turn ? ' и площадка' : '') + ' по ' + fmt(c.riser) + ' см' }, rows, cost,
          note: 'Число подъёмов = высота этажа ÷ желаемую высоту ступени с округлением, дальше высота выравнивается: все ступени должны быть одинаковыми. Формула удобного шага: два подъёма плюс проступь = 60–65 см. Для дома уклон до 40°, ширина марша от 90 см. ' + ({
            wood: 'Косоуры обычно из бруса или доски 50×300 мм; длина считается по маршу, к покупке берите с запасом на запилы.',
            metal: 'Каркас обычно из трубы 80×40 или 60×40 мм; длина посчитана без отходов на резку, крепёж и покраска — отдельно.',
            concrete: 'Арматура — ориентир для монолитной лестницы; опалубке нужны ещё стойки и брус, их считайте по месту. Отделку ступеней можно вписать в «Накладку».',
          })[mat] };
      },
    },

    /* --- Септик и бак: объём по числу людей и запасу --- */
    septic: {
      modeLabel: 'Что считаем',
      modes: [
        { id: 'septic', label: 'Септик', sets: { perDay: '200', days: '3' }, fields: [
          { id: 'people', label: 'Человек в доме', unit: '', value: '4', int: true },
          { id: 'perDay', label: 'Расход воды на человека', unit: 'л/сутки', value: '200' },
          { id: 'days', label: 'Запас по времени', unit: 'суток (норма 3)', value: '3' },
          { id: 'guests', label: 'Гости по выходным', unit: 'человек, необязательно', int: true },
        ] },
        { id: 'tank', label: 'Бак для воды / накопитель', sets: { perDay: '100', days: '2' }, fields: [
          { id: 'people', label: 'Человек', unit: '', value: '4', int: true },
          { id: 'perDay', label: 'Расход на человека', unit: 'л/сутки', value: '100' },
          { id: 'days', label: 'На сколько суток запас', unit: '', value: '2' },
          { id: 'garden', label: 'Полив', unit: 'л/сутки, необязательно', value: '200' },
        ] },
      ],
      common: [
        { id: 'ringD', label: 'Диаметр кольца', unit: 'м (КС-10 = 1, КС-15 = 1,5, КС-20 = 2)', value: '1' },
        { id: 'ringH', label: 'Высота кольца', unit: 'м', value: '0.9' },
      ],
      presets: [{ label: 'Кольца', fieldId: 'ringD', unit: 'м', items: [['КС-10', '1'], ['КС-15', '1.5'], ['КС-20', '2']] }],
      prices: [
        { id: 'ring', label: 'Кольцо', unit: '₽ за штуку' },
        { id: 'pump', label: 'Откачка', unit: '₽ за вызов', group: 'pump' },
      ],
      // Откачку ассенизатором считаем только у септика; бак для воды не откачивают
      groups(v, mode) { return { pump: mode === 'septic' }; },
      draw(v, mode, box, view) {
        const V = window.CalcViz; if (!V || !pos(v.ringD) || !pos(v.ringH)) return false;
        const r = v.ringD / 2;
        const need = this.volume(v, mode); if (!need) return false;
        const rings = this.rings(v, mode, need / 1000).total;
        const poly = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; poly.push([r + r * Math.cos(a), r + r * Math.sin(a)]); }
        const prisms = [];
        for (let i = 0; i < rings; i++) prisms.push({ poly, z: -(i + 1) * v.ringH, dz: v.ringH * 0.94 });
        V.iso(box, prisms, [
          { from: [0, r, 0], to: [v.ringD, r, 0], label: '⌀ ' + fmt(v.ringD) + ' м', offset: 0 },
          { from: [r, 0, -rings * v.ringH], to: [r, 0, 0], label: 'глубина ' + fmt(rings * v.ringH) + ' м', offset: 40 },
        ], { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, ground: true, caption: fmtInt(rings) + ' ' + plural(rings, 'кольцо', 'кольца', 'колец') + ' по ' + fmt(v.ringH) + ' м. Потяните, чтобы повернуть.' });
        return true;
      },
      // Гости считаются на пике: септик должен разом принять выходные с гостями, а не их среднее за неделю
      volume(v, mode) {
        if (!pos(v.people) || !pos(v.perDay) || !pos(v.days)) return null;
        const base = v.people * v.perDay * v.days;
        const extra = mode === 'septic' ? (v.guests || 0) * v.perDay * Math.min(2, v.days) : (v.garden || 0) * v.days;
        return base + extra;   // литры
      },
      // У септика рабочий объём — до перелива: труба заходит ниже промерзания, кольцо над ней стоков не держит
      rings(v, mode, m3) {
        const r = v.ringD / 2, ringVol = Math.PI * r * r * v.ringH;
        const work = Math.max(1, Math.ceil(m3 / ringVol - 1e-9));
        const top = mode === 'septic' ? 1 : 0;
        return { work, top, total: work + top, ringVol };
      },
      compute(v, mode, sel) {
        const need = this.volume(v, mode);
        if (!need) return null;
        const m3 = need / 1000;
        const rows = [], cost = [];
        const daily = v.people * v.perDay + (mode === 'tank' ? (v.garden || 0) : 0);
        rows.push(['Суточный расход', fmtInt(daily) + ' л' + (mode === 'tank' && pos(v.garden) ? ' (с учётом полива)' : '')]);
        rows.push(['Запас', fmt(v.days) + ' ' + plural(Math.round(v.days), 'сутки', 'суток', 'суток')]);
        if (mode === 'septic' && pos(v.guests)) rows.push(['Гости', fmtInt(v.guests) + ' чел. × ' + fmt(v.perDay) + ' л × ' + fmt(Math.min(2, v.days)) + ' ' + plural(Math.min(2, v.days), 'день', 'дня', 'дней') + ' выходных = ' + fmtInt(v.guests * v.perDay * Math.min(2, v.days)) + ' л сверху']);
        if (pos(v.ringD) && pos(v.ringH)) {
          const R = this.rings(v, mode, m3), rings = R.total;
          rows.push(['Кольца', fmtInt(rings) + ' шт ⌀' + fmt(v.ringD) + ' м по ' + fmt(v.ringH) + ' м, глубина ' + fmt(rings * v.ringH) + ' м'
            + (R.top ? ': ' + fmtInt(R.work) + ' под стоки (' + fmt(R.work * R.ringVol) + ' м³) и 1 сверху — над входом трубы' : ' = ' + fmt(rings * R.ringVol) + ' м³')]);
          rows.push(['Плюс сверху', 'плита перекрытия с люком и днище или подушка из щебня']);
          cost.push({ label: 'Кольца', amount: rings, unit: 'шт', priceId: 'ring' });
        }
        if (mode === 'septic') {
          rows.push(['Откачка', 'ассенизатор берёт обычно 3,6 м³ за вызов: ' + fmtInt(Math.max(1, Math.ceil(m3 / 3.6))) + ' ' + plural(Math.max(1, Math.ceil(m3 / 3.6)), 'вызов', 'вызова', 'вызовов') + ' на полный объём']);
          cost.push({ label: 'Откачка', amount: Math.max(1, Math.ceil(m3 / 3.6)), unit: 'вызов', priceId: 'pump' });
          rows.push(['Расстояния по нормам', 'от дома от 5 м, от границы участка от 2 м; колодец — не ближе 50 м и выше по потоку грунтовых вод']);
        } else {
          const std = [200, 500, 750, 1000, 1500, 2000, 3000, 5000].find((x) => x >= need);
          rows.push(['Если бак пластиковый', std ? 'ближайший стандартный объём: ' + fmtInt(std) + ' л' : 'больше 5 000 л в один бак не войдёт: ' + fmtInt(Math.ceil(need / 5000)) + ' ' + plural(Math.ceil(need / 5000), 'бак', 'бака', 'баков') + ' по 5 000 л, соединённых трубой, или подземная ёмкость']);
        }
        return { main: { label: 'Нужен объём', value: fmt(m3) + ' м³ (' + fmtInt(need) + ' л)' }, rows, cost,
          note: mode === 'septic'
            ? 'Норма: трёхсуточный запас при расходе 200 л на человека в сутки. Гости считаются на пике: септик должен принять выходные с ними целиком. Верхнее кольцо стоит над входом трубы, стоки в нём не держатся, поэтому в объём не входит. Расстояния до дома, колодца и границы участка — по санитарным нормам, уточняйте для своего участка.'
            : 'Объём = расход на человека × людей × суток, плюс полив. Для питьевой воды бак нужен из пищевого пластика и с защитой от света, иначе зацветёт.' };
      },
    },

    /* --- Проценты: доля, прибавить/вычесть, разница, НДС, скидка, наценка --- */
    percent: {
      signed: true,
      modeLabel: 'Что считаем',
      modes: [
        { id: 'of', label: 'Сколько процентов от числа', fields: [
          { id: 'ofP', label: 'Процент', unit: '%', value: '15' },
          { id: 'ofA', label: 'от числа', unit: '', value: '2500' },
        ] },
        { id: 'ratio', label: 'Число от числа в процентах', fields: [
          { id: 'rA', label: 'Число', unit: '', value: '375' },
          { id: 'rB', label: 'от числа', unit: '', value: '2500' },
        ] },
        { id: 'add', label: 'Прибавить или вычесть процент', fields: [
          { id: 'adA', label: 'Число', unit: '', value: '2500' },
          { id: 'adP', label: 'Процент', unit: '% (минус — вычесть)', value: '15' },
        ] },
        { id: 'diff', label: 'На сколько процентов отличаются', fields: [
          { id: 'dA', label: 'Было', unit: '', value: '2500' },
          { id: 'dB', label: 'Стало', unit: '', value: '2875' },
        ] },
        { id: 'vat', label: 'НДС', fields: [
          { id: 'vA', label: 'Сумма', unit: '', value: '120000' },
          { id: 'vRate', label: 'Ставка НДС', unit: '%', value: '20' },
        ] },
        { id: 'discount', label: 'Скидка или наценка', fields: [
          { id: 'scA', label: 'Цена', unit: '', value: '4990' },
          { id: 'scP', label: 'Скидка', unit: '%', value: '30' },
        ] },
      ],
      selects: [{ id: 'vatMode', label: 'НДС считаем', default: 'add', group: 'vat', choices: [
        { id: 'add', label: 'Начислить сверху', hint: 'сумма без НДС → с НДС' },
        { id: 'extract', label: 'Выделить из суммы', hint: 'сумма уже с НДС → сколько в ней налога' },
      ] }],
      groups(v, mode) { return { vat: mode === 'vat' }; },
      compute(v, mode, sel) {
        const num = (x) => x != null && Number.isFinite(x);
        const f = (x) => fmt(x, 2);
        if (mode === 'of') {
          if (!num(v.ofP) || !num(v.ofA)) return null;
          const r = v.ofA * v.ofP / 100;
          return { main: { label: fmt(v.ofP) + '% от ' + fmt(v.ofA), value: f(r) }, rows: [
            ['Формула', fmt(v.ofA) + ' × ' + fmt(v.ofP) + ' ÷ 100'],
            ['Число плюс этот процент', f(v.ofA + r)],
            ['Число минус этот процент', f(v.ofA - r)],
          ], note: 'Процент от числа: умножаем число на процент и делим на сто.', cost: [] };
        }
        if (mode === 'ratio') {
          if (!num(v.rA) || !pos(v.rB)) return null;
          const r = v.rA / v.rB * 100;
          return { main: { label: fmt(v.rA) + ' от ' + fmt(v.rB) + ' — это', value: f(r) + '%' }, rows: [
            ['Формула', fmt(v.rA) + ' ÷ ' + fmt(v.rB) + ' × 100'],
            ['Остаток до целого', f(100 - r) + '% = ' + f(v.rB - v.rA)],
          ], note: 'Доля числа: делим одно на другое и умножаем на сто.', cost: [] };
        }
        if (mode === 'add') {
          if (!num(v.adA) || !num(v.adP)) return null;
          const r = v.adA * (1 + v.adP / 100);
          return { main: { label: fmt(v.adA) + (v.adP < 0 ? ' минус ' : ' плюс ') + fmt(Math.abs(v.adP)) + '%', value: f(r) }, rows: [
            ['Сам процент', f(v.adA * v.adP / 100)],
            ['Формула', fmt(v.adA) + ' × (1 ' + (v.adP < 0 ? '−' : '+') + ' ' + fmt(Math.abs(v.adP)) + ' ÷ 100)'],
          ], note: 'Чтобы вычесть процент, введите его со знаком минус.', cost: [] };
        }
        if (mode === 'diff') {
          if (!pos(v.dA) || !num(v.dB)) return null;
          const d = (v.dB - v.dA) / v.dA * 100;
          return { main: { label: v.dB >= v.dA ? 'Рост' : 'Падение', value: f(Math.abs(d)) + '%' }, rows: [
            ['Разница', f(v.dB - v.dA)],
            ['Формула', '(' + fmt(v.dB) + ' − ' + fmt(v.dA) + ') ÷ ' + fmt(v.dA) + ' × 100'],
            ['Обратно', 'чтобы вернуться с ' + fmt(v.dB) + ' к ' + fmt(v.dA) + ', нужно ' + (v.dB > v.dA ? 'снизить' : 'поднять') + ' на ' + f(Math.abs((v.dA - v.dB) / v.dB * 100)) + '%'],
          ], note: 'Проценты роста и падения считаются от разных баз: рост на 25% и падение на 25% не возвращают к исходному числу.', cost: [] };
        }
        if (mode === 'vat') {
          if (!num(v.vA) || !pos(v.vRate)) return null;
          const k = v.vRate / 100;
          if (sel.vatMode === 'add') {
            const tax = v.vA * k;
            return { main: { label: 'Сумма с НДС ' + fmt(v.vRate) + '%', value: f(v.vA + tax) }, rows: [
              ['Без НДС', f(v.vA)], ['НДС', f(tax)],
              ['Формула', fmt(v.vA) + ' × ' + fmt(v.vRate) + ' ÷ 100'],
            ], note: 'Начисление сверху: налог считается от суммы без НДС.', cost: [] };
          }
          const tax = v.vA * k / (1 + k);
          return { main: { label: 'НДС ' + fmt(v.vRate) + '% в сумме', value: f(tax) }, rows: [
            ['С НДС', f(v.vA)], ['Без НДС', f(v.vA - tax)],
            ['Формула', fmt(v.vA) + ' × ' + fmt(v.vRate) + ' ÷ (100 + ' + fmt(v.vRate) + ')'],
          ], note: 'Выделение из суммы: делим на 120 и умножаем на 20 при ставке 20%. Просто вычесть 20% нельзя — получится меньше.', cost: [] };
        }
        if (!num(v.scA) || !num(v.scP)) return null;
        const off = v.scA * v.scP / 100;
        return { main: { label: 'Цена со скидкой ' + fmt(v.scP) + '%', value: f(v.scA - off) }, rows: [
          ['Скидка в деньгах', f(off)],
          ['Если это наценка', f(v.scA + off)],
          ['Чтобы вернуть исходную цену', 'нужна наценка ' + f(off / (v.scA - off) * 100) + '%'],
        ], note: 'После скидки 30% нужна наценка не 30, а больше: база стала меньше.', cost: [] };
      },
    },

    /* --- Пол: плитка, ламинат, линолеум по комнате (прямоугольник или свой план) --- */
    floor: {
      modeLabel: 'Форма помещения',
      modes: [
        { id: 'rect', label: 'Прямоугольная комната', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
        ] },
        { id: 'plan', label: 'Свой план (ниши, выступы)', plan: { simple: true, presetsKey: 'ROOM_PRESETS' }, fields: [] },
        { id: 'bath', label: 'Ванная: пол и стены', room: true, sets: { len: '1.7', wid: '1.5' }, fields: [
          { id: 'len', label: 'Длина', unit: 'м', value: '1.7' },
          { id: 'wid', label: 'Ширина', unit: 'м', value: '1.5' },
          { id: 'hei', label: 'Высота укладки на стенах', unit: 'м (до потолка или фартук)', value: '2.5' },
        ] },
      ],
      common: [
        { id: 'tileL', label: 'Длина плитки', unit: 'см', value: '60', group: 'tile' },
        { id: 'tileW', label: 'Ширина плитки', unit: 'см', value: '60', group: 'tile' },
        { id: 'seam', label: 'Шов', unit: 'мм', value: '2', group: 'tile' },
        { id: 'glueRate', label: 'Расход клея', unit: 'кг/м² (гребёнка 8–10 мм ≈ 5)', value: '5', group: 'tile' },
        { id: 'glueBag', label: 'Мешок клея', unit: 'кг', value: '25', group: 'tile' },
        { id: 'tileT', label: 'Толщина плитки', unit: 'мм, для расхода затирки', value: '9', group: 'tile' },
        { id: 'boardL', label: 'Длина доски', unit: 'см', value: '138', group: 'board' },
        { id: 'boardW', label: 'Ширина доски', unit: 'см', value: '19', group: 'board' },
        { id: 'packM2', label: 'В упаковке', unit: 'м²', value: '2.1', group: 'board' },
        { id: 'underlay', label: 'Подложка в рулоне', unit: 'м²', value: '10', group: 'board' },
        { id: 'lvtPack', label: 'В упаковке', unit: 'м²', value: '2.23', group: 'lvt' },
        { id: 'lvtL', label: 'Длина планки', unit: 'см', value: '122', group: 'lvt' },
        { id: 'lvtW', label: 'Ширина планки', unit: 'см', value: '18', group: 'lvt' },
        { id: 'lvtGlueRate', label: 'Расход клея для кварцвинила', unit: 'кг/м²', value: '0.35', group: 'lvtGlue' },
        { id: 'lvtGlueBucket', label: 'Ведро клея', unit: 'кг', value: '13', group: 'lvtGlue' },
        { id: 'lvtUnderlay', label: 'Подложка в рулоне', unit: 'м², 0 = без подложки', value: '10', group: 'lvtClick' },
        { id: 'rollW2', label: 'Ширина рулона', unit: 'м', value: '3', group: 'roll' },
        { id: 'skirting', label: 'Плинтус: длина планки', unit: 'м', value: '2.5', group: 'skirt' },
        { id: 'doorways', label: 'Дверные проёмы (вычесть из плинтуса)', unit: 'шт', value: '1', group: 'skirt', int: true },
      ],
      roomOpts: {
        finishes: { tile: 'Плитка', none: 'Без плитки' }, defaultFinish: 'tile', wallWord: 'Стена',
        openingsTitle: 'Двери и окна на этой стене (вычитаются из площади):',
        hint: 'Нажмите на стену, чтобы включить или выключить плитку. Дверь и окно тяните по стене.',
      },
      selects: [
        { id: 'material', label: 'Покрытие', default: 'tile', choices: [
          { id: 'tile', label: 'Плитка / керамогранит', hint: 'клей, затирка, крестики' },
          { id: 'board', label: 'Ламинат / паркетная доска', hint: 'упаковки, подложка, зазор у стен' },
          { id: 'lvtClick', label: 'Кварцвинил замковый', hint: 'плавающий пол: подложка, зазор у стен, без клея' },
          { id: 'lvtGlue', label: 'Кварцвинил клеевой', hint: 'на клей по ровному основанию: подложки нет, зазор не нужен' },
          { id: 'roll', label: 'Линолеум / ковролин', hint: 'рулон одним куском, без швов' },
        ] },
        { id: 'layout', label: 'Раскладка', default: 'straight', choices: [
          { id: 'straight', label: 'Прямая', hint: 'запас 5%' },
          { id: 'offset', label: 'Со смещением (вразбежку)', hint: 'запас 10%' },
          { id: 'diagonal', label: 'По диагонали', hint: 'запас 15%: много подрезки по углам' },
        ] },
      ],
      prices: [
        // Свой ценник у каждого покрытия и всегда за м², как в магазине: штуки и упаковки калькулятор переводит сам
        { id: 'tileM2', label: 'Плитка', unit: '₽ за м²', group: 'tile' },
        { id: 'boardM2', label: 'Ламинат', unit: '₽ за м²', group: 'board' },
        { id: 'lvtM2', label: 'Кварцвинил', unit: '₽ за м²', group: 'lvt' },
        { id: 'linoM2', label: 'Линолеум', unit: '₽ за м²', group: 'roll' },
        { id: 'glue', label: 'Клей', unit: '₽ за мешок', group: 'tile' },
        { id: 'grout', label: 'Затирка', unit: '₽ за кг', group: 'tile' },
        { id: 'underlay', label: 'Подложка', unit: '₽ за рулон', group: 'board' },
        { id: 'lvtGlue', label: 'Клей для кварцвинила', unit: '₽ за ведро', group: 'lvtGlue' },
        { id: 'lvtUnderlay', label: 'Подложка', unit: '₽ за рулон', group: 'lvtClick' },
        { id: 'skirt', label: 'Плинтус', unit: '₽ за планку', group: 'skirt' },
      ],
      groups(v, mode, extras, sel) {
        const m = sel.material;
        const lvt = m === 'lvtClick' || m === 'lvtGlue';
        return { tile: m === 'tile', board: m === 'board', roll: m === 'roll',
          lvt, lvtGlue: m === 'lvtGlue', lvtClick: m === 'lvtClick', skirt: mode !== 'bath' };
      },
      lens(v, mode) { return (mode === 'bath' && pos(v.len) && pos(v.wid)) ? [v.len, v.wid, v.len, v.wid] : null; },
      // Площадь стен под плиткой минус двери и окна
      wallsArea(v, mode, extras) {
        if (mode !== 'bath') return null;
        const R = window.CalcRoom; const lens = this.lens(v, mode);
        if (!R || !extras.room || !lens || !pos(v.hei)) return null;
        const m = R.measure(extras.room, lens, v.hei, this.roomOpts.finishes, 'tile');
        return { area: m.by.tile.area, n: m.by.tile.n, openings: m.openings, walls: m.walls };
      },
      shape(v, mode, extras) {
        if (mode === 'rect' || mode === 'bath') return (pos(v.len) && pos(v.wid)) ? { area: v.len * v.wid, per: 2 * (v.len + v.wid), L: v.len, W: v.wid, pts: [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]] } : null;
        const P = window.CalcPlan; if (!P || !extras.plan) return null;
        const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
        if (!g.valid) return null;
        const xs = g.verts.map((p) => p[0]), ys = g.verts.map((p) => p[1]);
        return { area: g.outerArea, per: g.perimeter, L: Math.max(...xs) - Math.min(...xs), W: Math.max(...ys) - Math.min(...ys), pts: g.verts };
      },
      draw(v, mode, box, view, extras) {
        const V = window.CalcViz; const sh = this.shape(v, mode, extras);
        if (!V || !sh) return false;
        const dims = (mode === 'rect' || mode === 'bath')
          ? [{ from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 }, { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 }]
          : sh.pts.map((a, i) => { const b = sh.pts[(i + 1) % sh.pts.length]; return { from: a, to: b, label: fmt(Math.hypot(b[0] - a[0], b[1] - a[1])) + ' м', offset: 20 }; });
        V.shape(box, sh.pts, dims, { center: fmt(sh.area) + ' м²', title: 'Пол', caption: 'Площадь пола ' + fmt(sh.area) + ' м², периметр ' + fmt(sh.per) + ' м' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const sh = this.shape(v, mode, extras);
        if (mode === 'plan' && !sh && extras.plan) return { error: 'Контур помещения пересекает сам себя — поправьте углы на плане.' };
        if (!sh) return null;
        const waste = { straight: 1.05, offset: 1.10, diagonal: 1.15 }[sel.layout] || 1.05;
        const wastePct = Math.round((waste - 1) * 100);
        const rows = [], cost = []; let main, unitCost;
        const m = sel.material;
        const wa = this.wallsArea(v, mode, extras);
        if (mode === 'bath' && wa && wa.n === 0 && !(sh.area > 0)) return { error: 'Плитка нигде не выбрана: включите её хотя бы на одной стене.' };
        // На стены идут только плитка и клеевой кварцвинил; замковый, ламинат и линолеум — только пол
        const onWalls = m === 'tile' || m === 'lvtGlue';
        const totalArea = sh.area + (wa && onWalls ? wa.area : 0);
        if (m === 'tile') {
          if (!pos(v.tileL) || !pos(v.tileW)) return null;
          const seam = (v.seam || 0) / 1000;
          const tileArea = (v.tileL / 100 + seam) * (v.tileW / 100 + seam);
          const tiles = Math.ceil(totalArea * waste / tileArea);
          const perM2 = 1 / tileArea;
          const glueKg = totalArea * (v.glueRate || 0);
          const bags = pos(v.glueBag) ? Math.ceil(glueKg / v.glueBag) : null;
          // Затирка, кг/м² = (A + B) / (A × B) × толщина × шов × 1,6 (плотность), A и B в мм; +10% запас
          const grout = (v.seam > 0 && v.tileT > 0) ? totalArea * (v.tileL * 10 + v.tileW * 10) / (v.tileL * 10 * v.tileW * 10) * v.tileT * v.seam * 1.6 * 1.1 : 0;
          main = fmtInt(tiles) + ' ' + plural(tiles, 'плитка', 'плитки', 'плиток');
          rows.push(['Плитка', fmtInt(tiles) + ' шт ' + fmt(v.tileL) + '×' + fmt(v.tileW) + ' см (' + fmt(perM2) + ' шт/м², запас ' + wastePct + '%)']);
          if (wa) {
            rows.push(['Пол', fmt(sh.area) + ' м²']);
            rows.push(['Стены', fmt(wa.area) + ' м²: ' + fmtInt(wa.n) + ' ' + plural(wa.n, 'стена', 'стены', 'стен') + ' до ' + fmt(v.hei) + ' м' + (wa.openings ? ', проёмы ' + fmt(wa.openings) + ' м² вычтены' : '')]);
            rows.push(['Всего под плитку', fmt(totalArea) + ' м²']);
          }
          if (glueKg > 0) rows.push(['Клей', fmtInt(glueKg) + ' кг' + (bags != null ? ' ≈ ' + fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') : '')]);
          if (grout > 0) rows.push(['Затирка', fmt(grout) + ' кг (' + fmt(grout / totalArea) + ' кг/м² при шве ' + fmt(v.seam) + ' мм)']);
          rows.push(['Крестики', '≈ ' + fmtInt(Math.ceil(tiles * 2)) + ' шт']);
          unitCost = { label: 'Плитка, ' + fmtInt(tiles) + ' шт', amount: Math.round(tiles * v.tileL * v.tileW / 100) / 100, unit: 'м²', priceId: 'tileM2' };
          if (bags != null) cost.push({ label: 'Клей', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: 'glue' });
          if (grout > 0) cost.push({ label: 'Затирка', amount: Math.ceil(grout), unit: 'кг', priceId: 'grout' });
        } else if (m === 'lvtClick' || m === 'lvtGlue') {
          if (!pos(v.lvtPack)) return null;
          const packs = Math.ceil(totalArea * waste / v.lvtPack);
          const planks = (pos(v.lvtL) && pos(v.lvtW)) ? Math.ceil(totalArea * waste / (v.lvtL / 100 * v.lvtW / 100)) : null;
          main = fmtInt(packs) + ' ' + plural(packs, 'упаковка', 'упаковки', 'упаковок');
          rows.push(['Кварцвинил', packs + ' упак. по ' + fmt(v.lvtPack) + ' м² (площадь ' + fmt(totalArea) + ' м², запас ' + wastePct + '%)' + (planks ? ', это ≈ ' + planks + ' планок' : '')]);
          if (m === 'lvtGlue') {
            const glueKg = totalArea * (v.lvtGlueRate || 0);
            const buckets = pos(v.lvtGlueBucket) ? Math.ceil(glueKg / v.lvtGlueBucket) : null;
            if (glueKg > 0) {
              rows.push(['Клей', fmt(glueKg) + ' кг' + (buckets != null ? ' ≈ ' + fmtInt(buckets) + ' ' + plural(buckets, 'ведро', 'ведра', 'вёдер') + ' по ' + fmt(v.lvtGlueBucket) + ' кг' : '')]);
              if (buckets != null) cost.push({ label: 'Клей', amount: buckets, unit: plural(buckets, 'ведро', 'ведра', 'вёдер'), priceId: 'lvtGlue' });
            }
            rows.push(['Основание', 'клеевой кварцвинил кладут на ровное основание: перепад не больше 2 мм на 2 м, иначе нужна наливная смесь']);
            rows.push(['Зазор у стен', 'не нужен: покрытие приклеено и не «гуляет»']);
          } else {
            const rolls = pos(v.lvtUnderlay) ? Math.ceil(totalArea / v.lvtUnderlay) : null;
            if (rolls != null) {
              rows.push(['Подложка', fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов') + ' по ' + fmt(v.lvtUnderlay) + ' м², только тонкая 1–1,5 мм под кварцвинил']);
              cost.push({ label: 'Подложка', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'lvtUnderlay' });
            }
            rows.push(['Зазор у стен', '5–8 мм по периметру: замковый кварцвинил плавающий']);
          }
          unitCost = { label: 'Кварцвинил, ' + fmtInt(packs) + ' упак.', amount: Math.round(packs * v.lvtPack * 100) / 100, unit: 'м²', priceId: 'lvtM2' };
        } else if (m === 'board') {
          if (!pos(v.packM2)) return null;
          const packs = Math.ceil(sh.area * waste / v.packM2);
          const boards = (pos(v.boardL) && pos(v.boardW)) ? Math.ceil(sh.area * waste / (v.boardL / 100 * v.boardW / 100)) : null;
          const rolls = pos(v.underlay) ? Math.ceil(sh.area / v.underlay) : null;
          main = fmtInt(packs) + ' ' + plural(packs, 'упаковка', 'упаковки', 'упаковок');
          rows.push(['Ламинат', fmtInt(packs) + ' упак. по ' + fmt(v.packM2) + ' м² (площадь ' + fmt(sh.area) + ' м², запас ' + wastePct + '%)' + (boards ? ', это ≈ ' + fmtInt(boards) + ' ' + plural(boards, 'доска', 'доски', 'досок') : '')]);
          if (rolls != null) { rows.push(['Подложка', fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов') + ' по ' + fmt(v.underlay) + ' м²']); cost.push({ label: 'Подложка', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'underlay' }); }
          rows.push(['Зазор у стен', '8–10 мм по всему периметру — под плинтус, ламинат должен «гулять»']);
          unitCost = { label: 'Ламинат, ' + fmtInt(packs) + ' упак.', amount: Math.round(packs * v.packM2 * 100) / 100, unit: 'м²', priceId: 'boardM2' };
        } else {
          if (!pos(v.rollW2)) return null;
          // Две раскладки: полосы вдоль длины или поперёк. Берём ту, где рулона меньше, при равенстве — где меньше швов
          const opt = (across, along) => { const strips = Math.ceil(along / v.rollW2 - 1e-9); return { strips, piece: across + 0.1, len: strips * (across + 0.1) }; };
          const a = opt(sh.L, sh.W), b = opt(sh.W, sh.L);
          const best = (b.len < a.len - 1e-9 || (Math.abs(b.len - a.len) < 1e-9 && b.strips < a.strips)) ? b : a;
          const { strips, piece, len } = best;
          main = fmt(len) + ' м рулона';
          rows.push(['Линолеум', strips === 1
            ? 'одним куском ' + fmt(piece) + ' м при ширине рулона ' + fmt(v.rollW2) + ' м'
            : fmtInt(strips) + ' ' + plural(strips, 'полоса', 'полосы', 'полос') + ' по ' + fmt(piece) + ' м = ' + fmt(len) + ' м (' + (strips === 2 ? 'шов посередине' : (strips - 1) + ' ' + plural(strips - 1, 'шов', 'шва', 'швов')) + ')']);
          rows.push(['Площадь', fmt(len * v.rollW2) + ' м² при площади пола ' + fmt(sh.area) + ' м²']);
          unitCost = { label: 'Линолеум, ' + fmt(len) + ' м рулона', amount: Math.round(len * v.rollW2 * 100) / 100, unit: 'м²', priceId: 'linoM2' };
        }
        if (mode === 'bath') {
          if (m === 'tile') rows.push(['Затирочный уголок и профили', 'по внутренним углам ' + fmt(4 * v.hei) + ' м и по низу стен ' + fmt(sh.per) + ' м']);
          else if (m === 'lvtGlue') rows.push(['На стены', 'клеевой кварцвинил держится на стене и потолке, замковый — нет: он рассчитан на пол']);
          else rows.push(['Стены', 'посчитан только пол: ' + ({ lvtClick: 'замковый кварцвинил', board: 'ламинат', roll: 'линолеум' })[m] + ' на стены не кладут. Для стен выберите плитку или клеевой кварцвинил' + (wa && wa.area ? ' (под них ' + fmt(wa.area) + ' м²)' : '')]);
          rows.push(['Площадь пола', fmt(sh.area) + ' м², периметр ' + fmt(sh.per) + ' м']);
          cost.unshift(unitCost);
          return { main: { label: onWalls ? 'Нужно на ванную' : 'Нужно на пол ванной', value: main + ' · ' + fmt(totalArea) + ' м²' }, rows, cost,
            note: 'Пол и стены считаются вместе: материал берут одной партией, иначе оттенок разойдётся. Двери и окна вычитаются из площади стен. Запас на подрезку: прямая раскладка 5%, вразбежку 10%, по диагонали 15%.' };
        }
        // Плинтус общий для всех
        if (pos(v.skirting)) {
          const doors = (v.doorways || 0) * 0.9;
          const skirtLen = Math.max(0, sh.per - doors);
          const planks = Math.ceil(skirtLen / v.skirting);
          rows.push(['Плинтус', fmt(skirtLen) + ' м → ' + fmtInt(planks) + ' ' + plural(planks, 'планка', 'планки', 'планок') + ' по ' + fmt(v.skirting) + ' м']);
          cost.push({ label: 'Плинтус', amount: planks, unit: plural(planks, 'планка', 'планки', 'планок'), priceId: 'skirt' });
        }
        rows.push(['Площадь пола', fmt(sh.area) + ' м², периметр ' + fmt(sh.per) + ' м']);
        cost.unshift(unitCost);
        return { main: { label: 'Нужно на пол', value: main + ' · ' + fmt(sh.area) + ' м²' }, rows, cost,
          note: 'Запас на подрезку: прямая раскладка 5%, вразбежку 10%, по диагонали 15%. Плитка считается с учётом шва: при шве 2 мм плитка 60×60 занимает 60,2×60,2. Ламинат кладут с зазором 8–10 мм у стен, он закрывается плинтусом.' };
      },
    },

    /* --- Кварцвинил: пол и стены, раскладка планок ряд за рядом --- */
    lvt: {
      modeLabel: 'Где кладём',
      modes: [
        { id: 'rect', label: 'Пол: прямоугольная комната', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
        ] },
        { id: 'plan', label: 'Пол: свой план (ниши, выступы)', plan: { simple: true, presetsKey: 'ROOM_PRESETS' }, fields: [] },
        { id: 'walls', label: 'Стены', room: true, fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '4' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '3' },
          { id: 'hei', label: 'Высота укладки', unit: 'м (до потолка или панель)', value: '2.7' },
        ] },
        { id: 'area', label: 'Пол: знаю площадь', fields: [
          { id: 'area', label: 'Площадь пола', unit: 'м²', value: '20' },
          { id: 'per', label: 'Периметр комнаты', unit: 'м, для плинтуса; 0 = без него', value: '18' },
        ] },
      ],
      common: [
        { id: 'plankL', label: 'Длина планки', unit: 'см', value: '122' },
        { id: 'plankW', label: 'Ширина планки', unit: 'см', value: '18.3' },
        { id: 'perPack', label: 'Планок в упаковке', unit: 'шт', value: '10', int: true },
        { id: 'shift', label: 'Смещение стыков соседних рядов', unit: 'см, не меньше', value: '30', group: 'free' },
        { id: 'minPiece', label: 'Самый короткий кусок в ряду', unit: 'см', value: '20', group: 'rows' },
        { id: 'gap', label: 'Зазор у стен', unit: 'мм', value: '5', group: 'click' },
        { id: 'underlay', label: 'Подложка в рулоне', unit: 'м², 0 = без подложки', value: '10', group: 'click' },
        { id: 'glueRate', label: 'Расход клея', unit: 'кг/м²', value: '0.35', group: 'glue' },
        { id: 'glueBucket', label: 'Ведро клея', unit: 'кг', value: '13', group: 'glue' },
        { id: 'primerRate', label: 'Расход грунтовки', unit: 'л/м²', value: '0.15', group: 'glue' },
        { id: 'primerCan', label: 'Канистра грунтовки', unit: 'л', value: '10', group: 'glue' },
        { id: 'skirting', label: 'Плинтус: длина планки', unit: 'м, 0 = без плинтуса', value: '2.5', group: 'floor' },
        { id: 'doorways', label: 'Дверных проёмов', unit: 'шт: порожки и минус из плинтуса', value: '1', group: 'floor', int: true },
        { id: 'profL', label: 'Торцевой профиль: длина', unit: 'м', value: '2.7', group: 'edges' },
      ],
      roomOpts: {
        finishes: { lvt: 'Кварцвинил', none: 'Без отделки' }, defaultFinish: 'lvt', wallWord: 'Стена',
        openingsTitle: 'Окна и двери на этой стене (вычитаются из площади):',
        hint: 'Нажмите на стену, чтобы включить или выключить кварцвинил: например, только акцентная стена за кроватью. Окно и дверь тяните по стене.',
      },
      selects: [
        { id: 'type', label: 'Кварцвинил', default: 'click', group: 'floor', choices: [
          { id: 'click', label: 'Замковый', hint: 'плавающий пол: подложка 1–1,5 мм, зазор у стен, без клея' },
          { id: 'glue', label: 'Клеевой', hint: 'на клей по ровному основанию: подложки и зазора нет, подходит и для стен' },
        ] },
        { id: 'pattern', label: 'Укладка', default: 'free', choices: [
          { id: 'free', label: 'Вразбежку', hint: 'обрезок с конца ряда начинает следующий ряд — отхода меньше всего', sets: (vals) => LVT_BACK(vals) },
          { id: 'third', label: 'Со смещением на треть', hint: 'стыки «лесенкой»: каждый ряд сдвинут на 1/3 планки', sets: (vals) => LVT_BACK(vals) },
          { id: 'half', label: 'Со смещением на половину', hint: 'как кирпичная кладка: стык ровно посередине соседней планки', sets: (vals) => LVT_BACK(vals) },
          { id: 'herring', label: 'Ёлочка', hint: 'нужны специальные планки «ёлочка» двух видов, A и B; запас 15%', sets: (vals) => ((parseNum(vals.plankL) || 0) > 80 ? { plankL: '60', plankW: '12', perPack: '20' } : {}) },
        ] },
        { id: 'dir', label: 'Планки', default: 'long', group: 'dir', choices: [
          { id: 'long', label: 'Вдоль длинной стены', hint: 'стыков меньше, комната кажется длиннее' },
          { id: 'short', label: 'Поперёк', hint: 'визуально расширяет узкую комнату' },
        ] },
      ],
      prices: [
        // Кварцвинил продают за м² (решение Алексея 12.10): за упаковки калькулятор пересчитывает сам
        { id: 'lvtM2', label: 'Кварцвинил', unit: '₽ за м²' },
        { id: 'underlay', label: 'Подложка', unit: '₽ за рулон', group: 'underlayP' },
        { id: 'glue', label: 'Клей', unit: '₽ за ведро', group: 'glue' },
        { id: 'primer', label: 'Грунтовка', unit: '₽ за канистру', group: 'glue' },
        { id: 'skirt', label: 'Плинтус', unit: '₽ за планку', group: 'skirtP' },
        { id: 'threshold', label: 'Порожек', unit: '₽ за шт', group: 'thr' },
        { id: 'profile', label: 'Торцевой профиль', unit: '₽ за шт', group: 'edges' },
      ],
      groups(v, mode, extras, sel) {
        const floor = mode !== 'walls', click = floor && sel.type === 'click';
        const rows = mode !== 'area' && sel.pattern !== 'herring';
        let edges = false;
        if (!floor) {
          const R = window.CalcRoom, lens = this.lens(v, mode);
          if (R && extras.room && lens && pos(v.hei)) edges = this.wallEdges(v, R.measure(extras.room, lens, v.hei, this.roomOpts.finishes, 'lvt')).length > 0;
        }
        return { floor, click, glue: !click, walls: !floor, edges, rows, free: rows && sel.pattern === 'free',
          dir: (mode === 'rect' || mode === 'plan') && sel.pattern !== 'herring',
          underlayP: click && pos(v.underlay), skirtP: floor && pos(v.skirting) && (mode !== 'area' || pos(v.per)), thr: floor && pos(v.doorways) };
      },
      lens(v, mode) { return (mode === 'walls' && pos(v.len) && pos(v.wid)) ? [v.len, v.wid, v.len, v.wid] : null; },
      // Пол: контур, площадь, периметр и раскладка рядов вдоль выбранной стороны
      floorLayout(v, mode, extras, sel, noLayout) {
        let pts;
        if (mode === 'rect') {
          if (!pos(v.len) || !pos(v.wid)) return null;
          pts = [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]];
        } else {
          const P = window.CalcPlan; if (!P || !extras.plan) return null;
          const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
          if (!g.valid) return { error: 'Контур помещения пересекает сам себя — поправьте углы на плане.' };
          pts = g.verts;
        }
        let area = 0, per = 0;
        pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); });
        const out = { pts, area: Math.abs(area) / 2, per };
        const P = v.plankL, w = v.plankW;
        // Огромная площадь мелкой планкой подвесит браузер — тогда считаем по запасу в процентах
        if (noLayout || !pos(P) || !pos(w) || out.area / (P * w / 10000) > 20000) return out;
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const minX = Math.min(...xs), minY = Math.min(...ys), spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
        const tr = (sel.dir === 'short') === (spanX >= spanY);
        const cm = pts.map((p) => (tr ? [(p[1] - minY) * 100, (p[0] - minX) * 100] : [(p[0] - minX) * 100, (p[1] - minY) * 100]));
        const g = sel.type === 'click' ? Math.max(0, v.gap || 0) / 10 : 0;
        const H = (tr ? spanX : spanY) * 100 - 2 * g;
        if (!(H > 0)) return out;
        const bandsInfo = plankBands(H, w);
        const rows = bandsInfo.bands.map(([b0, b1]) => {
          const y0 = g + b0, y1 = g + b1;
          return { y0, y1, segs: bandSegs(cm, y0, y1).map(([a, b]) => [a + g, b - g]).filter(([a, b]) => b - a > 0.5) };
        });
        const lay = plankLayout(rows, P, { pattern: sel.pattern, shift: v.shift, minPiece: v.minPiece });
        return Object.assign(out, lay, { bandsInfo, rows, tr, minX, minY, along: (tr ? spanY : spanX) });
      },
      // Видимые края под торцевой профиль: стена рядом без кварцвинила и откосы проёмов.
      // Внутренний угол двух покрытых стен стыкуют без профиля
      wallEdges(v, wm) {
        const ws = wm.walls, n = ws.length, edges = [];
        ws.forEach((wl, i) => {
          if (wl.finish !== 'lvt') return;
          if (ws[(i + n - 1) % n].finish !== 'lvt') edges.push(v.hei);
          if (ws[(i + 1) % n].finish !== 'lvt') edges.push(v.hei);
          wl.ops.forEach((o) => {
            edges.push(o.h, o.h);
            if (o.y > 0.01) edges.push(o.w);
            if (o.y + o.h < v.hei - 0.01) edges.push(o.w);
          });
        });
        return edges;
      },
      // Стены: ряды снизу вверх, проёмы вырезают куски ряда; обрезки ходят со стены на стену
      wallLayout(v, sel, m) {
        const pools = { starts: [], ends: [] };
        const bandsInfo = plankBands(v.hei * 100, v.plankW);
        const tot = { fresh: 0, reused: 0, forced: 0, pools, bandsInfo };
        m.walls.forEach((wl) => {
          if (wl.finish !== 'lvt') return;
          const L = wl.len * 100;
          const rows = bandsInfo.bands.map(([y0, y1]) => {
            let segs = [[0, L]];
            wl.ops.forEach((o) => {
              if ((o.y + o.h) * 100 <= y0 + 0.5 || o.y * 100 >= y1 - 0.5) return;
              const ox0 = o.x * 100, ox1 = (o.x + o.w) * 100;
              segs = segs.flatMap(([a, b]) => { if (ox1 <= a || ox0 >= b) return [[a, b]]; const r = []; if (ox0 > a) r.push([a, ox0]); if (ox1 < b) r.push([ox1, b]); return r; });
            });
            return { y0, y1, segs: segs.filter(([a, b]) => b - a > 0.5) };
          });
          const lay = plankLayout(rows, v.plankL, { pattern: sel.pattern, shift: v.shift, minPiece: v.minPiece }, pools);
          tot.fresh += lay.fresh; tot.reused += lay.reused; tot.forced += lay.forced;
        });
        return tot;
      },
      draw(v, mode, box, view, extras) {
        const V = window.CalcViz; const sel = this._sel || {};
        if (!V || (mode !== 'rect' && mode !== 'plan')) return false;
        const fl = this.floorLayout(v, mode, extras, sel, sel.pattern === 'herring');
        if (!fl || fl.error) return false;
        const pts = fl.pts;
        const dims = mode === 'rect'
          ? [{ from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 }, { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 }]
          : pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return { from: a, to: b, label: fmt(Math.hypot(b[0] - a[0], b[1] - a[1])) + ' м', offset: 20 }; });
        const toM = (x, y) => (fl.tr ? [fl.minX + y / 100, fl.minY + x / 100] : [fl.minX + x / 100, fl.minY + y / 100]);
        const under = fl.pieces ? (svg, X, Y, el) => {
          fl.pieces.forEach((p) => {
            const r = fl.rows[p.row], a = toM(p.x0, r.y0), b = toM(p.x1, r.y1);
            const x1 = X(a), x2 = X(b), y1 = Y(a), y2 = Y(b);
            svg.appendChild(el('rect', { x: Math.min(x1, x2).toFixed(1), y: Math.min(y1, y2).toFixed(1), width: Math.abs(x2 - x1).toFixed(1), height: Math.abs(y2 - y1).toFixed(1), class: 'viz-plank viz-plank--' + p.kind }));
          });
        } : null;
        V.shape(box, pts, dims, { title: 'Раскладка кварцвинила', under, center: under ? null : fmt(fl.area) + ' м²',
          caption: under ? 'Светлые — целые, тёмные — отпиленные, зелёные — из обрезков' : 'Ёлочка считается по площади с запасом 15%' });
        return true;
      },
      compute(v, mode, sel, extras) {
        if (!pos(v.plankL) || !pos(v.plankW) || !pos(v.perPack)) return null;
        const P = v.plankL, w = v.plankW, plankA = P * w / 10000, packA = plankA * v.perPack;
        const floor = mode !== 'walls', click = floor && sel.type === 'click', herring = sel.pattern === 'herring';
        const rows = [], cost = [];
        let area, per = null, lay = null, wm = null;
        if (mode === 'walls') {
          const R = window.CalcRoom; const lens = this.lens(v, mode);
          if (!R || !extras.room || !lens || !pos(v.hei)) return null;
          wm = R.measure(extras.room, lens, v.hei, this.roomOpts.finishes, 'lvt');
          if (wm.by.lvt.n === 0) return { error: 'Кварцвинил не выбран ни на одной стене — нажмите на стену на развёртке, чтобы включить.' };
          area = wm.by.lvt.area;
          if (!(area > 0)) return null;
          if (!herring && area / plankA <= 20000) lay = this.wallLayout(v, sel, wm);
        } else if (mode === 'area') {
          if (!pos(v.area)) return null;
          area = v.area; per = v.per || 0;
        } else {
          const fl = this.floorLayout(v, mode, extras, sel, herring);
          if (fl && fl.error) return fl;
          if (!fl) return null;
          area = fl.area; per = fl.per;
          if (fl.pieces) lay = fl;
        }
        const pct = { free: 5, third: 7, half: 10, herring: 15 }[sel.pattern] || 5;
        let planks = lay ? lay.fresh : Math.ceil(area * (1 + pct / 100) / plankA - 1e-9);
        if (herring && planks % 2) planks++;
        const packs = Math.ceil(planks / v.perPack);
        const spare = packs * v.perPack - planks;
        rows.push(['Планок', fmtInt(planks) + ' шт ' + fmt(P) + '×' + fmt(w) + ' см' + (lay ? ' — по раскладке' : ' — с запасом ' + pct + '%') + (herring ? ', поровну A и B' : '')]);
        rows.push(['Упаковок', fmtInt(packs) + ' по ' + fmtInt(v.perPack) + ' шт (' + fmt(packA) + ' м²)' + (spare ? ', ' + fmtInt(spare) + ' ' + plural(spare, 'планка останется', 'планки останутся', 'планок останется') + ' в запас' : '')]);
        if (lay) {
          const b = lay.bandsInfo;
          let rowsTxt = fmtInt(b.n) + ' ' + plural(b.n, 'ряд', 'ряда', 'рядов') + ' по ' + fmt(w) + ' см';
          if (b.balanced) rowsTxt += '; ' + (floor ? 'первый и последний' : 'нижний и верхний') + ' режут вдоль, по ' + fmt(b.edge, 1) + ' см: иначе последний вышел бы полоской ' + fmt(b.last, 1) + ' см';
          else if (b.n > 1 && b.last < w - 0.05) rowsTxt += '; последний — ' + fmt(b.last, 1) + ' см, планки режут вдоль';
          rows.push(['Рядов', rowsTxt]);
          rows.push(['Стыки', sel.pattern === 'free' ? 'соседние ряды не ближе ' + fmt(Math.min(v.shift || 0, P / 2)) + ' см друг к другу, кусок у стены не короче ' + fmt(Math.min(v.minPiece || 0, P / 2)) + ' см'
            : 'каждый ряд сдвинут на ' + fmt(P / (sel.pattern === 'half' ? 2 : 3), 1) + ' см; сетку стыков калькулятор сдвинул так, чтобы у стен не было узких кусков']);
          if (lay.reused) rows.push(['Из обрезков', fmtInt(lay.reused) + ' ' + plural(lay.reused, 'кусок', 'куска', 'кусков') + ' взяты из обрезков прошлых рядов — новых планок на них не ушло']);
          const waste = planks * plankA - area;
          rows.push(['Отход', fmt(Math.max(0, waste)) + ' м², ' + fmt(Math.max(0, waste) / area * 100, 1) + '% от площади' + (click ? ' (с полосой зазора у стен)' : '')]);
          const left = lay.pools.starts.length + lay.pools.ends.length;
          if (left) rows.push(['Останутся обрезки', fmtInt(left) + ' ' + plural(left, 'годный кусок', 'годных куска', 'годных кусков') + ' — пригодятся при ремонте']);
          if (lay.forced) rows.push(['⚠ Смещение', 'в ' + fmtInt(lay.forced) + ' ' + plural(lay.forced, 'ряду', 'рядах', 'рядах') + ' не вышло выдержать смещение и длину куска — уменьшите их или выберите смещение на треть']);
        }
        rows.push(['Площадь', fmt(area) + ' м²' + (wm ? ': ' + fmtInt(wm.by.lvt.n) + ' ' + plural(wm.by.lvt.n, 'стена', 'стены', 'стен') + ' до ' + fmt(v.hei) + ' м' + (wm.openings ? ', проёмы ' + fmt(wm.openings) + ' м² вычтены' : '') : '') + (per ? ', периметр ' + fmt(per) + ' м' : '')]);
        cost.push({ label: 'Кварцвинил, ' + fmtInt(packs) + ' упак.', amount: Math.round(packs * packA * 100) / 100, unit: 'м²', priceId: 'lvtM2' });
        if (click) {
          if (pos(v.underlay)) {
            const rolls = Math.ceil(area / v.underlay);
            rows.push(['Подложка', fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов') + ' по ' + fmt(v.underlay) + ' м², только тонкая 1–1,5 мм: на толстой замки ломаются']);
            cost.push({ label: 'Подложка', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'underlay' });
          }
          rows.push(['Зазор у стен', fmt(v.gap || 0) + ' мм по периметру, его закроет плинтус: замковый кварцвинил плавающий']);
        } else {
          const glueKg = area * (v.glueRate || 0);
          if (glueKg > 0) {
            const buckets = pos(v.glueBucket) ? Math.ceil(glueKg / v.glueBucket) : null;
            rows.push(['Клей', fmt(glueKg) + ' кг' + (buckets != null ? ' ≈ ' + fmtInt(buckets) + ' ' + plural(buckets, 'ведро', 'ведра', 'вёдер') + ' по ' + fmt(v.glueBucket) + ' кг' : '')]);
            if (buckets != null) cost.push({ label: 'Клей', amount: buckets, unit: plural(buckets, 'ведро', 'ведра', 'вёдер'), priceId: 'glue' });
          }
          const primerL = area * (v.primerRate || 0);
          if (primerL > 0) {
            const cans = pos(v.primerCan) ? Math.ceil(primerL / v.primerCan) : null;
            rows.push(['Грунтовка', fmt(primerL) + ' л' + (cans != null ? ' ≈ ' + fmtInt(cans) + ' ' + plural(cans, 'канистра', 'канистры', 'канистр') + ' по ' + fmt(v.primerCan) + ' л' : '') + ': под клей основание грунтуют обязательно']);
            if (cans != null) cost.push({ label: 'Грунтовка', amount: cans, unit: plural(cans, 'канистра', 'канистры', 'канистр'), priceId: 'primer' });
          }
          rows.push([floor ? 'Основание' : 'Стены', 'ровные и сухие: перепад не больше 2 мм на 2 м, ' + (floor ? 'иначе нужна наливная смесь — клеевой повторит каждую неровность' : 'по штукатурке или гипсокартону; неровности проступят через планку')]);
        }
        if (floor) {
          const doors = v.doorways || 0;
          if (pos(v.skirting) && per > 0) {
            const skirtLen = Math.max(0, per - doors * 0.9);
            const sk = Math.ceil(skirtLen / v.skirting - 1e-9);
            rows.push(['Плинтус', fmt(skirtLen) + ' м → ' + fmtInt(sk) + ' ' + plural(sk, 'планка', 'планки', 'планок') + ' по ' + fmt(v.skirting) + ' м']);
            cost.push({ label: 'Плинтус', amount: sk, unit: plural(sk, 'планка', 'планки', 'планок'), priceId: 'skirt' });
          }
          if (doors > 0) {
            rows.push(['Порожки', fmtInt(doors) + ' шт в дверные проёмы' + (click ? ': плавающий пол между комнатами режут, иначе его поведёт' : '')]);
            cost.push({ label: 'Порожки', amount: doors, unit: 'шт', priceId: 'threshold' });
          }
        } else {
          const edges = this.wallEdges(v, wm);
          const eLen = edges.reduce((s, x) => s + x, 0);
          if (eLen > 0 && pos(v.profL)) {
            const bars = packBars(edges, v.profL);
            rows.push(['Торцевой профиль', fmt(eLen) + ' м → ' + fmtInt(bars) + ' шт по ' + fmt(v.profL) + ' м: края у стен без кварцвинила и вокруг окон и дверей']);
            cost.push({ label: 'Торцевой профиль', amount: bars, unit: 'шт', priceId: 'profile' });
          }
          wm.walls.forEach((wl) => rows.push(['Стена ' + (wl.i + 1) + ' · ' + this.roomOpts.finishes[wl.finish], fmt(wl.net) + ' м²' + (wl.count ? ' (проёмов ' + wl.count + ')' : '')]));
        }
        const main = fmtInt(packs) + ' ' + plural(packs, 'упаковка', 'упаковки', 'упаковок') + ' · ' + fmt(area) + ' м²';
        return { main: { label: floor ? 'Нужно на пол' : 'Нужно на стены', value: main }, rows, cost,
          note: (lay ? 'Счёт по раскладке: каждый ряд собран из целых планок и обрезков, поэтому запас точнее процентов. ' : 'Запас в процентах: вразбежку 5%, на треть 7%, на половину 10%, ёлочка 15%. ')
            + 'Запаса на брак тут нет — если кладёте впервые, возьмите ещё упаковку. Всё берите из одной партии: у разных партий расходится оттенок.' };
      },
    },

    /* --- Кровля: одно-, двух- и четырёхскатная; листы, обрешётка, водосток, утеплитель --- */
    roof: {
      modeLabel: 'Форма крыши',
      modes: [
        { id: 'gable', label: 'Двускатная', fields: [
          { id: 'len', label: 'Длина дома (по коньку)', unit: 'м', value: '9' },
          { id: 'wid', label: 'Ширина дома', unit: 'м', value: '8' },
          { id: 'angle', label: 'Угол наклона', unit: '° (или задайте высоту)', value: '30' },
          { id: 'ridgeH', label: 'Высота конька над стенами', unit: 'м, вместо угла' },
          { id: 'over', label: 'Свес по краям', unit: 'м', value: '0.5' },
        ] },
        { id: 'shed', label: 'Односкатная', fields: [
          { id: 'len', label: 'Длина дома', unit: 'м', value: '9' },
          { id: 'wid', label: 'Ширина (по уклону)', unit: 'м', value: '8' },
          { id: 'angle', label: 'Угол наклона', unit: '°', value: '20' },
          { id: 'ridgeH', label: 'Перепад высоты', unit: 'м, вместо угла' },
          { id: 'over', label: 'Свес по краям', unit: 'м', value: '0.5' },
        ] },
        { id: 'hip', label: 'Четырёхскатная (вальмовая)', fields: [
          { id: 'len', label: 'Длина дома', unit: 'м', value: '9' },
          { id: 'wid', label: 'Ширина дома', unit: 'м', value: '8' },
          { id: 'angle', label: 'Угол наклона', unit: '°', value: '30' },
          { id: 'ridgeH', label: 'Высота конька над стенами', unit: 'м, вместо угла' },
          { id: 'over', label: 'Свес по краям', unit: 'м', value: '0.5' },
        ] },
      ],
      common: [
        { id: 'sheetL', label: 'Длина листа', unit: 'м', value: '2', group: 'sheet' },
        { id: 'sheetW', label: 'Рабочая ширина листа', unit: 'м', value: '1.1', group: 'sheet' },
        { id: 'sheetWFull', label: 'Полная ширина листа', unit: 'м, по ней магазин считает м²', value: '1.19', group: 'full' },
        { id: 'overlapV', label: 'Нахлёст по вертикали', unit: 'м', value: '0.15', group: 'sheet' },
        { id: 'rollW', label: 'Ширина рулона', unit: 'м', value: '1', group: 'roll' },
        { id: 'rollL', label: 'Длина рулона', unit: 'м', value: '10', group: 'roll' },
        { id: 'rollOver', label: 'Нахлёст', unit: 'м', value: '0.1', group: 'roll' },
        { id: 'packM2', label: 'Площадь в упаковке', unit: 'м²', value: '3', group: 'piece' },
        { id: 'battenStep', label: 'Шаг обрешётки', unit: 'м', value: '0.35' },
        { id: 'rafterStep', label: 'Шаг стропил', unit: 'м', value: '0.6' },
        { id: 'insulation', label: 'Утеплитель: толщина', unit: 'см, 0 = холодная крыша', value: '0' },
        { id: 'insulPack', label: 'Объём упаковки утеплителя', unit: 'м³, написан на упаковке', value: '0.3', group: 'insulPack' },
        { id: 'rafterW', label: 'Стропило: толщина', unit: 'мм', value: '50', group: 'woodCube' },
        { id: 'rafterH', label: 'Стропило: ширина', unit: 'мм', value: '150', group: 'woodCube' },
        { id: 'battenW', label: 'Обрешётка: толщина', unit: 'мм', value: '25', group: 'battenCube' },
        { id: 'battenH', label: 'Обрешётка: ширина', unit: 'мм', value: '100', group: 'battenCube' },
        { id: 'plankL', label: 'Длина доборной планки', unit: 'м (конёк, ветровая, карнизная)', value: '2' },
        { id: 'plankOver', label: 'Нахлёст планок', unit: 'м', value: '0.1' },
        { id: 'gutterL', label: 'Длина желоба', unit: 'м', value: '3' },
        { id: 'downH', label: 'Высота от карниза до земли', unit: 'м, 0 = без водосточных труб', value: '3' },
        { id: 'pipeL', label: 'Длина водосточной трубы', unit: 'м', value: '3' },
      ],
      selects: [{ id: 'material', label: 'Покрытие', default: 'metal', choices: [
        { id: 'metal', label: 'Металлочерепица', hint: 'листы, нахлёст по волне и по длине', sets: { sheetL: '2', sheetW: '1.1', sheetWFull: '1.19', overlapV: '0.15' } },
        { id: 'prof', label: 'Профнастил', hint: 'листы, обрешётка реже', sets: { sheetL: '2', sheetW: '1.1', sheetWFull: '1.15', overlapV: '0.15' } },
        { id: 'ondulin', label: 'Ондулин', hint: 'листы 2×0,95 м, рабочая ширина 0,86', sets: { sheetL: '2', sheetW: '0.86', overlapV: '0.2' } },
        { id: 'soft', label: 'Мягкая черепица', hint: 'гонт в упаковках по 3 м², сплошная обрешётка', sets: { packM2: '3' } },
        { id: 'seam', label: 'Фальцевая кровля', hint: 'картины из рулона' },
      ] },
        { id: 'profBuy', label: 'Профнастил продают', default: 'sheet', group: 'prof', choices: [
          { id: 'sheet', label: 'За лист', hint: 'цена листа нужной длины' },
          { id: 'm2', label: 'За м²', hint: 'по полной ширине листа, как считает магазин' },
        ] },
        { id: 'woodBuy', label: 'Стропила и обрешётку продают', default: 'meter', choices: [
          { id: 'meter', label: 'За метр', hint: 'строительные магазины' },
          { id: 'cube', label: 'За куб', hint: 'пилорамы и базы: цена за 1 м³ доски или бруса нужного сечения' },
        ] },
        { id: 'insulBuy', label: 'Утеплитель продают', default: 'cube', group: 'insul', choices: [
          { id: 'cube', label: 'За куб', hint: 'цена за 1 м³' },
          { id: 'pack', label: 'За упаковку', hint: 'объём упаковки написан на ней' },
        ] }],
      prices: [
        // Свой ценник у каждого покрытия — в той единице, в какой его продают
        { id: 'metalM2', label: 'Металлочерепица', unit: '₽ за м²', group: 'metal' },
        { id: 'profSheet', label: 'Лист профнастила', unit: '₽ за лист', group: 'profSheet' },
        { id: 'profM2', label: 'Профнастил', unit: '₽ за м²', group: 'profM2' },
        { id: 'ondulinSheet', label: 'Лист ондулина', unit: '₽ за лист', group: 'ondulin' },
        { id: 'softPack', label: 'Упаковка мягкой черепицы', unit: '₽ за упаковку', group: 'soft' },
        { id: 'seamM2', label: 'Сталь для фальца', unit: '₽ за м²', group: 'seam' },
        { id: 'batten', label: 'Обрешётка', unit: '₽ за метр', group: 'battenM' },
        { id: 'battenM3', label: 'Обрешётка (доска)', unit: '₽ за м³', group: 'battenCube' },
        { id: 'rafter', label: 'Стропило', unit: '₽ за метр', group: 'woodM' },
        { id: 'rafterM3', label: 'Стропило (доска или брус)', unit: '₽ за м³', group: 'woodCube' },
        { id: 'film', label: 'Плёнки (гидро- и пароизоляция)', unit: '₽ за м²' },
        { id: 'insul', label: 'Утеплитель', unit: '₽ за м³', group: 'insulCube' },
        { id: 'insulPackP', label: 'Утеплитель', unit: '₽ за упаковку', group: 'insulPack' },
        { id: 'ridgeP', label: 'Коньковая планка', unit: '₽ за штуку', group: 'ridge' },
        { id: 'windP', label: 'Ветровая планка', unit: '₽ за штуку', group: 'wind' },
        { id: 'eaveP', label: 'Карнизная планка', unit: '₽ за штуку' },
        { id: 'gutter', label: 'Желоб', unit: '₽ за штуку' },
        { id: 'bracket', label: 'Кронштейн желоба', unit: '₽ за штуку' },
        { id: 'pipe', label: 'Водосточная труба', unit: '₽ за штуку', group: 'down' },
        { id: 'elbow', label: 'Колено трубы', unit: '₽ за штуку', group: 'down' },
        { id: 'funnel', label: 'Воронка', unit: '₽ за штуку', group: 'down' },
      ],
      groups(v, mode, extras, sel) {
        const m = sel.material;
        return { sheet: m === 'metal' || m === 'prof' || m === 'ondulin', roll: m === 'seam', piece: m === 'soft',
          metal: m === 'metal', prof: m === 'prof', ondulin: m === 'ondulin', soft: m === 'soft', seam: m === 'seam',
          ridge: mode !== 'shed', wind: mode !== 'hip', down: pos(v.downH),
          full: m === 'metal' || (m === 'prof' && sel.profBuy === 'm2'), profSheet: m === 'prof' && sel.profBuy !== 'm2', profM2: m === 'prof' && sel.profBuy === 'm2',
          // У мягкой черепицы обрешётка сплошная (фанера, ОСП) — цены рейки ей не нужны; утеплитель — только когда задана толщина
          woodM: sel.woodBuy !== 'cube', woodCube: sel.woodBuy === 'cube',
          battenM: m !== 'soft' && sel.woodBuy !== 'cube', battenCube: m !== 'soft' && sel.woodBuy === 'cube',
          insul: pos(v.insulation), insulCube: pos(v.insulation) && sel.insulBuy !== 'pack', insulPack: pos(v.insulation) && sel.insulBuy === 'pack' };
      },
      // Геометрия: возвращает площадь скатов, длины конька, ребёр, ендов, карниза
      geom(v, mode) {
        if (!pos(v.len) || !pos(v.wid)) return null;
        // Вальмовая симметрична: конёк всегда идёт вдоль длинной стороны
        let len = v.len, wid = v.wid;
        if (mode === 'hip' && wid > len) [len, wid] = [wid, len];
        const over = v.over || 0;
        const L = len + 2 * over, W = wid + 2 * over;
        // Высоту конька меряют над стенами, поэтому угол — по ширине дома без свеса.
        // Свес продолжает скат под тем же углом.
        const run = mode === 'shed' ? wid : wid / 2;
        const a = pos(v.ridgeH) ? Math.atan2(v.ridgeH, run) : (v.angle || 0) * Math.PI / 180;
        if (!(a > 0 && a < Math.PI / 2)) return { len, wid, L, W, rise: 0, angle: a * 180 / Math.PI };
        const angle = a * 180 / Math.PI;
        if (mode === 'shed') {
          const rise = W * Math.tan(a);
          const slope = W / Math.cos(a);
          // водосток только по нижнему краю, торцы — ветровая планка
          return { area: L * slope, ridge: 0, eaves: L, wind: 2 * slope, hips: 0, rise, slopeLen: slope, len, wid, L, W, faces: 1, angle };
        }
        const half = W / 2;
        const rise = half * Math.tan(a);
        const slope = half / Math.cos(a);
        if (mode === 'gable') {
          return { area: 2 * L * slope, ridge: L, eaves: 2 * L, wind: 4 * slope, hips: 0, rise, slopeLen: slope, len, wid, L, W, faces: 2, angle };
        }
        // вальмовая: два трапециевидных ската + два треугольных, конёк короче на ширину
        const ridge = len - wid;                   // при квадратном доме 0 — шатровая
        const trap = (L + ridge) / 2 * slope;      // площадь одного трапециевидного ската
        const tri = half * slope;                  // площадь одного вальмового треугольника
        const hip = Math.hypot(slope, half);       // длина накосного ребра
        return { area: 2 * trap + 2 * tri, ridge, eaves: 2 * (L + W), wind: 0, hips: 4 * hip, rise, slopeLen: slope, len, wid, L, W, faces: 4, angle };
      },
      draw(v, mode, box, view) {
        const V = window.CalcViz; const g = this.geom(v, mode);
        if (!V || !g) return false;
        const wallH = 0.6; // условная высота стен под кровлей, чтобы схема читалась
        const L = g.L, W = g.W, o = v.over || 0;
        if (!(g.rise > 0)) return false;
        const walls = [{ poly: [[o, o], [o + g.len, o], [o + g.len, o + g.wid], [o, o + g.wid]], z: 0, dz: wallH }];
        let faces = [], dims = [];
        const z0 = wallH;
        if (mode === 'shed') {
          faces = [[[0, 0, z0], [L, 0, z0], [L, W, z0 + g.rise], [0, W, z0 + g.rise]]];
          dims = [
            { from: [0, 0, z0], to: [L, 0, z0], label: 'длина ' + fmt(g.len) + ' м', offset: 24 },
            { from: [0, W, z0 + g.rise], to: [0, 0, z0], label: 'скат ' + fmt(g.slopeLen) + ' м', offset: -26 },
          ];
        } else if (mode === 'gable') {
          const mid = W / 2, top = z0 + g.rise;
          faces = [
            [[0, 0, z0], [L, 0, z0], [L, mid, top], [0, mid, top]],
            [[0, W, z0], [L, W, z0], [L, mid, top], [0, mid, top]],
          ];
          dims = [
            { from: [0, 0, z0], to: [L, 0, z0], label: 'длина ' + fmt(g.len) + ' м', offset: 24 },
            { from: [0, mid, top], to: [L, mid, top], label: 'конёк ' + fmt(g.ridge) + ' м', offset: -22 },
            { from: [0, 0, z0], to: [0, mid, top], label: 'скат ' + fmt(g.slopeLen) + ' м', offset: -26 },
          ];
        } else {
          const mid = W / 2, top = z0 + g.rise, r0 = (L - g.ridge) / 2, r1 = r0 + g.ridge;
          faces = [
            [[0, 0, z0], [L, 0, z0], [r1, mid, top], [r0, mid, top]],
            [[0, W, z0], [L, W, z0], [r1, mid, top], [r0, mid, top]],
            [[0, 0, z0], [0, W, z0], [r0, mid, top]],
            [[L, 0, z0], [L, W, z0], [r1, mid, top]],
          ];
          dims = [
            { from: [0, 0, z0], to: [L, 0, z0], label: 'длина ' + fmt(g.len) + ' м', offset: 24 },
            { from: [r0, mid, top], to: [r1, mid, top], label: 'конёк ' + fmt(g.ridge) + ' м', offset: -22 },
            { from: [0, 0, z0], to: [r0, mid, top], label: 'ребро ' + fmt(Math.hypot(g.slopeLen, W / 2)) + ' м', offset: -26 },
          ];
        }
        V.roof(box, faces, walls, dims, { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, ground: true, caption: 'Крыша со свесом ' + fmt(o) + ' м, уклон ' + fmt(g.angle) + '°. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel) {
        const g = this.geom(v, mode);
        if (!g) return null;
        if (!(g.rise > 0)) return { error: g.angle >= 90 ? 'Угол должен быть меньше 90°.' : 'Укажите угол наклона или высоту конька.' };
        const m = sel.material;
        const minAngle = { metal: 12, prof: 12, ondulin: 10, soft: 12, seam: 3 }[m];
        if (g.angle < minAngle) return { error: 'Уклон ' + fmt(g.angle) + '° слишком мал для этого покрытия: металлочерепице и профнастилу нужно от 12°, ондулину от 10°, мягкой черепице от 12°. Фальцевую кровлю кладут от 3°.' };
        const rows = [], cost = [];
        let main, unitCost = null;
        if (g.angle > 75) return { error: 'Уклон ' + fmt(g.angle) + '° — это уже стена, а не скат. Проверьте угол: у жилых домов обычно 20–45°.' };
        if (g.angle > 60) rows.push(['Крутая крыша', 'уклон больше 60°: проверьте угол, площадь растёт очень быстро']);
        if (m === 'metal' || m === 'prof' || m === 'ondulin') {
          if (!pos(v.sheetL) || !pos(v.sheetW)) return null;
          const useful = v.sheetL - (v.overlapV || 0);
          if (useful <= 0) return { error: 'Нахлёст больше длины листа — проверьте размеры.' };
          const rowsCount = Math.ceil(g.slopeLen / useful - 1e-9);
          const cols = Math.ceil(g.L / v.sheetW - 1e-9);
          const byGrid = rowsCount * cols * (g.faces === 1 ? 1 : 2);
          const total = g.faces === 4 ? Math.ceil(g.area / (useful * v.sheetW) * 1.15) : Math.ceil(byGrid * 1.05);
          main = fmtInt(total) + ' ' + plural(total, 'лист', 'листа', 'листов');
          rows.push(['Листы', g.faces === 4
            ? fmtInt(total) + ' шт по площади ' + fmt(g.area) + ' м² (+15% на подрезку вальм)'
            : fmtInt(total) + ' шт: ' + rowsCount + ' по скату × ' + cols + ' по длине' + (g.faces === 2 ? ' × 2 ската' : '') + ' = ' + byGrid + ' + 5% запас']);
          rows.push(['Саморезы кровельные', '≈ ' + fmtInt(Math.ceil(g.area * 8)) + ' шт (8 на м²)']);
          if (m === 'metal') {
            const fullW = pos(v.sheetWFull) ? v.sheetWFull : v.sheetW;
            const m2 = Math.round(total * v.sheetL * fullW * 100) / 100;
            rows.push(['Металлочерепица в м²', fmtInt(total) + ' × ' + fmt(v.sheetL) + ' × ' + fmt(fullW) + ' м = ' + fmt(m2) + ' м² по полной ширине листа — так считает магазин']);
            unitCost = { label: 'Металлочерепица, ' + fmtInt(total) + ' ' + plural(total, 'лист', 'листа', 'листов'), amount: m2, unit: 'м²', priceId: 'metalM2' };
          } else if (m === 'prof' && sel.profBuy === 'm2') {
            const fullW = pos(v.sheetWFull) ? v.sheetWFull : v.sheetW;
            const m2 = Math.round(total * v.sheetL * fullW * 100) / 100;
            rows.push(['Профнастил в м²', fmtInt(total) + ' × ' + fmt(v.sheetL) + ' × ' + fmt(fullW) + ' м = ' + fmt(m2) + ' м² по полной ширине листа']);
            unitCost = { label: 'Профнастил, ' + fmtInt(total) + ' ' + plural(total, 'лист', 'листа', 'листов'), amount: m2, unit: 'м²', priceId: 'profM2' };
          } else unitCost = { label: m === 'prof' ? 'Профнастил' : 'Ондулин', amount: total, unit: plural(total, 'лист', 'листа', 'листов'), priceId: m === 'prof' ? 'profSheet' : 'ondulinSheet' };
        } else if (m === 'soft') {
          if (!pos(v.packM2)) return null;
          const packs = Math.ceil(g.area * 1.1 / v.packM2);
          main = fmtInt(packs) + ' ' + plural(packs, 'упаковка', 'упаковки', 'упаковок');
          rows.push(['Мягкая черепица', packs + ' упак. по ' + fmt(v.packM2) + ' м² (площадь ' + fmt(g.area) + ' м² + 10% на подрезку)']);
          rows.push(['Сплошная обрешётка', fmt(g.area * 1.05) + ' м² фанеры или ОСП']);
          rows.push(['Подкладочный ковёр', fmt(g.area * 1.1) + ' м²']);
          rows.push(['Гвозди', '≈ ' + fmtInt(Math.ceil(g.area * 20)) + ' шт (20 на м²)']);
          unitCost = { label: 'Мягкая черепица', amount: packs, unit: plural(packs, 'упаковка', 'упаковки', 'упаковок'), priceId: 'softPack' };
        } else {
          if (!pos(v.rollW) || !pos(v.rollL)) return null;
          const eff = v.rollW - (v.rollOver || 0);
          if (eff <= 0) return { error: 'Нахлёст больше ширины рулона — проверьте размеры.' };
          const strips = Math.ceil(g.L / eff - 1e-9) * (g.faces === 1 ? 1 : 2);
          const perRoll = Math.floor(v.rollL / g.slopeLen);
          const rolls = perRoll > 0 ? Math.ceil(strips / perRoll) : Math.ceil(strips * g.slopeLen / v.rollL);
          main = fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов');
          rows.push(['Картины', fmtInt(strips) + ' шт по ' + fmt(g.slopeLen) + ' м' + (perRoll > 0 ? ' (из рулона ' + perRoll + ')' : '')]);
          unitCost = { label: 'Сталь для фальца, ' + fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов'), amount: Math.round(rolls * v.rollW * v.rollL * 100) / 100, unit: 'м²', priceId: 'seamM2' };
        }
        rows.push(['Площадь скатов', fmt(g.area) + ' м², уклон ' + fmt(g.angle) + '°, длина ската ' + fmt(g.slopeLen) + ' м']);
        // обрешётка и стропила
        if (pos(v.battenStep) && m !== 'soft') {
          const lines = Math.ceil(g.slopeLen / v.battenStep) + 1;
          const battenLen = g.faces === 4 ? g.area / v.battenStep : lines * g.L * (g.faces === 1 ? 1 : 2);
          rows.push(['Обрешётка', g.faces === 4
            ? fmt(battenLen) + ' м (площадь ' + fmt(g.area) + ' м² ÷ шаг ' + fmt(v.battenStep) + ' м)'
            : fmtInt(lines) + ' ' + plural(lines, 'ряд', 'ряда', 'рядов') + ' × ' + fmt(g.L) + ' м' + (g.faces === 2 ? ' × 2 ската' : '') + ' = ' + fmt(battenLen) + ' м']);
          if (sel.woodBuy === 'cube' && pos(v.battenW) && pos(v.battenH)) {
            const m3 = Math.ceil(battenLen) * v.battenW * v.battenH / 1e6;
            rows.push(['Обрешётка в кубах', fmtInt(Math.ceil(battenLen)) + ' м × ' + fmt(v.battenW, 0) + '×' + fmt(v.battenH, 0) + ' мм = ' + fmt(m3, 3) + ' м³']);
            cost.push({ label: 'Обрешётка, ' + fmtInt(Math.ceil(battenLen)) + ' м', amount: Math.round(m3 * 1000) / 1000, unit: 'м³', priceId: 'battenM3' });
          } else cost.push({ label: 'Обрешётка', amount: Math.ceil(battenLen), unit: 'м', priceId: 'batten' });
        }
        if (pos(v.rafterStep)) {
          const pairs = Math.ceil(g.L / v.rafterStep) + 1;
          const rafterLen = pairs * g.slopeLen * (g.faces === 1 ? 1 : 2);
          rows.push(['Стропила', pairs + (g.faces === 1 ? ' шт' : ' пар') + ' по ' + fmt(g.slopeLen) + ' м = ' + fmt(rafterLen) + ' м']);
          if (sel.woodBuy === 'cube' && pos(v.rafterW) && pos(v.rafterH)) {
            const m3 = Math.ceil(rafterLen) * v.rafterW * v.rafterH / 1e6;
            rows.push(['Стропила в кубах', fmtInt(Math.ceil(rafterLen)) + ' м × ' + fmt(v.rafterW, 0) + '×' + fmt(v.rafterH, 0) + ' мм = ' + fmt(m3, 3) + ' м³']);
            cost.push({ label: 'Стропила, ' + fmtInt(Math.ceil(rafterLen)) + ' м', amount: Math.round(m3 * 1000) / 1000, unit: 'м³', priceId: 'rafterM3' });
          } else cost.push({ label: 'Стропила', amount: Math.ceil(rafterLen), unit: 'м', priceId: 'rafter' });
        }
        // Доборы: планки внахлёст, полезная длина каждой = длина − нахлёст. Считаем по каждому
        // отрезку отдельно (каждый карниз, торец, ребро): обрезок с одной стороны на другую не перенести
        const usefulP = (v.plankL || 0) - (v.plankOver || 0);
        const planks = (runs) => (usefulP > 0 ? runs.reduce((n, l) => n + (l > 0 ? Math.ceil(l / usefulP - 1e-9) : 0), 0) : 0);
        const P = (n) => fmtInt(n) + ' шт по ' + fmt(v.plankL) + ' м';
        const eaveRuns = g.faces === 4 ? [g.L, g.L, g.W, g.W] : g.faces === 2 ? [g.L, g.L] : [g.L];
        if (g.faces !== 1) {
          const n = planks([g.ridge].concat(g.hips ? [g.hips / 4, g.hips / 4, g.hips / 4, g.hips / 4] : []));
          rows.push(['Конёк', (g.ridge > 0 ? fmt(g.ridge) + ' м' : 'нет, все скаты сходятся в точку (шатровая крыша)') + (g.hips ? ', накосные рёбра ' + fmt(g.hips) + ' м' : '') + (n ? ' → ' + P(n) + ' коньковой планки' : '')]);
          if (n) cost.push({ label: 'Коньковая планка', amount: n, unit: 'шт', priceId: 'ridgeP' });
        }
        if (g.wind) {
          const n = planks(Array(g.faces * 2).fill(g.slopeLen));
          rows.push(['Ветровая планка', fmt(g.wind) + ' м по торцам скатов' + (n ? ' → ' + P(n) : '')]);
          if (n) cost.push({ label: 'Ветровая планка', amount: n, unit: 'шт', priceId: 'windP' });
        }
        const eaveN = planks(eaveRuns);
        rows.push(['Карнизная планка', fmt(g.eaves) + ' м' + (g.faces === 2 ? ' (по двум скатам)' : g.faces === 1 ? ' (по нижнему краю)' : '') + (eaveN ? ' → ' + P(eaveN) : '')]);
        if (eaveN) cost.push({ label: 'Карнизная планка', amount: eaveN, unit: 'шт', priceId: 'eaveP' });
        // Водосток по каждому карнизу: желоб встык на соединителях, кронштейны через 60 см,
        // водосточная труба на каждые 10 м желоба, но не меньше одной на карниз
        if (pos(v.gutterL)) {
          const gut = eaveRuns.reduce((n, l) => n + Math.ceil(l / v.gutterL - 1e-9), 0);
          const br = eaveRuns.reduce((n, l) => n + Math.ceil(l / 0.6 - 1e-9) + 1, 0);
          rows.push(['Желоб', fmt(g.eaves) + ' м → ' + fmtInt(gut) + ' шт по ' + fmt(v.gutterL) + ' м, кронштейнов ' + fmtInt(br) + ' (через 60 см)']);
          cost.push({ label: 'Желоб', amount: gut, unit: 'шт', priceId: 'gutter' });
          cost.push({ label: 'Кронштейны желоба', amount: br, unit: 'шт', priceId: 'bracket' });
        }
        if (pos(v.downH) && pos(v.pipeL)) {
          const downs = eaveRuns.reduce((n, l) => n + Math.max(1, Math.ceil(l / 10 - 1e-9)), 0);
          const pipes = downs * Math.ceil(v.downH / v.pipeL - 1e-9), elbows = downs * 3;
          rows.push(['Водосточные трубы', fmtInt(downs) + ' ' + plural(downs, 'стояк', 'стояка', 'стояков') + ' по ' + fmt(v.downH) + ' м → ' + fmtInt(pipes) + ' шт по ' + fmt(v.pipeL) + ' м, ' + fmtInt(downs) + ' ' + plural(downs, 'воронка', 'воронки', 'воронок') + ', ' + fmtInt(elbows) + ' ' + plural(elbows, 'колено', 'колена', 'колен') + ' (по 2 у карниза и 1 на слив)']);
          cost.push({ label: 'Водосточные трубы', amount: pipes, unit: 'шт', priceId: 'pipe' });
          cost.push({ label: 'Колена', amount: elbows, unit: 'шт', priceId: 'elbow' });
          cost.push({ label: 'Воронки', amount: downs, unit: 'шт', priceId: 'funnel' });
        }
        const films = g.area * 1.15;
        rows.push(['Гидроизоляция', fmt(films) + ' м² (+15% на нахлёсты)']);
        cost.push({ label: 'Плёнки', amount: Math.ceil(films), unit: 'м²', priceId: 'film' });
        if (pos(v.insulation)) {
          const vol = g.area * v.insulation / 100;
          rows.push(['Утеплитель', fmt(v.insulation) + ' см × ' + fmt(g.area) + ' м² = ' + fmt(vol) + ' м³, пароизоляция ' + fmt(films) + ' м²']);
          if (sel.insulBuy === 'pack' && pos(v.insulPack)) {
            const packs = Math.ceil(vol / v.insulPack - 1e-9);
            rows.push(['Утеплитель в упаковках', fmt(vol) + ' м³ ÷ ' + fmt(v.insulPack, 3) + ' м³ = ' + fmtInt(packs) + ' ' + plural(packs, 'упаковка', 'упаковки', 'упаковок')]);
            cost.push({ label: 'Утеплитель', amount: packs, unit: plural(packs, 'упаковка', 'упаковки', 'упаковок'), priceId: 'insulPackP' });
          } else cost.push({ label: 'Утеплитель', amount: Math.ceil(vol * 10) / 10, unit: 'м³', priceId: 'insul' });
        }
        cost.unshift(unitCost);
        return { main: { label: 'Нужно на кровлю', value: main + ' · ' + fmt(g.area) + ' м²' }, rows, cost,
          note: 'Площадь считается по скатам со свесами, а не по площади дома: при уклоне ' + fmt(g.angle) + '° скат длиннее половины ширины. Металлочерепице и профнастилу нужен уклон от 12°, ондулину от 10°, мягкой черепице от 12°, фальцевой кровле от 3°. Стропила и сечение бруса под снеговую нагрузку считает проектировщик.' };
      },
    },

    /* --- Кладка стен: блоки или кирпич по плану дома, проёмы, перемычки, армирование --- */
    masonry: {
      modeLabel: 'Форма дома',
      finishes: { wall: 'Кладка', none: 'Без кладки (уже есть, соседняя)' },
      modes: [
        { id: 'rect', label: 'Прямоугольный дом', room: true, fields: [
          { id: 'len', label: 'Длина дома', unit: 'м', value: '9' },
          { id: 'wid', label: 'Ширина дома', unit: 'м', value: '8' },
          { id: 'hei', label: 'Высота стен', unit: 'м', value: '3' },
        ] },
        { id: 'plan', label: 'Дом по своему плану', room: true, plan: { simple: true }, fields: [
          { id: 'hei', label: 'Высота стен', unit: 'м', value: '3' },
        ] },
      ],
      common: [
        { id: 'thick', label: 'Толщина наружной стены', unit: 'мм', value: '400' },
        { id: 'inner', label: 'Внутренние стены (перегородки)', unit: 'м, необязательно' },
        { id: 'innerThick', label: 'Толщина перегородок', unit: 'мм', value: '150' },
        { id: 'waste', label: 'Запас на бой и подрезку', unit: '%', value: '5' },
        { id: 'mortar', label: 'Раствор или клей', unit: 'кг сухой смеси на м³ кладки (клей для блока ≈ 25, раствор для кирпича ≈ 400)', value: '25' },
        { id: 'bagKg', label: 'Мешок раствора', unit: 'кг', value: '25' },
        { id: 'meshStep', label: 'Армирование через каждые', unit: 'рядов, 0 = без сетки', value: '4', int: true },
        { id: 'palletN', label: 'Кирпичей на поддоне', unit: 'шт', value: '480', int: true, group: 'pallet' },
      ],
      presets: [{ label: 'Расход смеси', fieldId: 'mortar', unit: 'кг/м³', items: [['Клей для блоков', '25'], ['Кирпич полуторный', '330'], ['Кирпич одинарный', '400']] }],
      selects: [{ id: 'unit', label: 'Из чего кладём', default: 'gas', choices: [
        { id: 'gas', label: 'Газоблок 600×300×200', hint: 'кладка на клей, 27,8 шт в м³', sets: { mortar: '25', innerThick: '150' } },
        { id: 'foam', label: 'Пеноблок 600×300×200', hint: 'то же, 27,8 шт в м³', sets: { mortar: '25', innerThick: '150' } },
        { id: 'brick', label: 'Кирпич одинарный 250×120×65', hint: '394 шт в м³ со швом 10 мм, раствора ≈ 0,23 м³', sets: { mortar: '400', innerThick: '120', palletN: '480' } },
        { id: 'brick15', label: 'Кирпич полуторный 250×120×88', hint: '302 шт в м³ со швом 10 мм, раствора ≈ 0,19 м³', sets: { mortar: '330', innerThick: '120', palletN: '352' } },
        { id: 'ceramo', label: 'Керамоблок 380×250×219', hint: '48 шт в м³, вертикальные швы на пазах', sets: { mortar: '100', innerThick: '120' } },
      ] },
        { id: 'blockBuy', label: 'Блоки продают', default: 'piece', group: 'blocks', choices: [
          { id: 'piece', label: 'За штуку', hint: 'строительные магазины' },
          { id: 'cube', label: 'За куб', hint: 'заводы и базы: цена за 1 м³ блоков' },
        ] },
        { id: 'brickBuy', label: 'Кирпич продают', default: 'piece', group: 'bricks', choices: [
          { id: 'piece', label: 'За штуку', hint: 'магазины и небольшие партии' },
          { id: 'pallet', label: 'За поддон', hint: 'заводы и базы: целыми поддонами' },
        ] }],
      // Кирпич или блок; и в чём его цена: штука, куб блоков, поддон кирпича
      buy(sel) {
        const brick = sel.unit === 'brick' || sel.unit === 'brick15';
        return brick ? (sel.brickBuy === 'pallet' ? 'pallet' : 'piece') : (sel.blockBuy === 'cube' ? 'cube' : 'piece');
      },
      groups(v, mode, extras, sel) {
        const u = sel.unit, b = this.buy(sel), brick = u === 'brick' || u === 'brick15';
        const out = { blocks: !brick, bricks: brick, pallet: brick && b === 'pallet', glue: u === 'gas' || u === 'foam', mortar: u !== 'gas' && u !== 'foam' };
        ['gas', 'foam', 'brick', 'brick15', 'ceramo'].forEach((k) => { out[k] = u === k && b === 'piece'; out[k + '_alt'] = u === k && b !== 'piece'; });
        return out;
      },
      prices: [
        // Свой ценник у каждого блока и кирпича: кирпич дешевле газоблока в разы, одна цена на всё врала.
        // Прежние общие цены вводились под газоблок на клею (он по умолчанию) — к нему и переезжают
        { id: 'gas', label: 'Газоблок', unit: '₽ за штуку', group: 'gas', from: 'unit' },
        { id: 'foam', label: 'Пеноблок', unit: '₽ за штуку', group: 'foam' },
        { id: 'brick', label: 'Кирпич одинарный', unit: '₽ за штуку', group: 'brick' },
        { id: 'brick15', label: 'Кирпич полуторный', unit: '₽ за штуку', group: 'brick15' },
        { id: 'ceramo', label: 'Керамоблок', unit: '₽ за штуку', group: 'ceramo' },
        { id: 'gasM3', label: 'Газоблок', unit: '₽ за м³', group: 'gas_alt' },
        { id: 'foamM3', label: 'Пеноблок', unit: '₽ за м³', group: 'foam_alt' },
        { id: 'ceramoM3', label: 'Керамоблок', unit: '₽ за м³', group: 'ceramo_alt' },
        { id: 'brickPal', label: 'Кирпич одинарный', unit: '₽ за поддон', group: 'brick_alt' },
        { id: 'brick15Pal', label: 'Кирпич полуторный', unit: '₽ за поддон', group: 'brick15_alt' },
        { id: 'glue', label: 'Клей для блоков', unit: '₽ за мешок', group: 'glue', from: 'mortar' },
        { id: 'mortar', label: 'Кладочный раствор', unit: '₽ за мешок', group: 'mortar' },
        { id: 'mesh', label: 'Кладочная сетка', unit: '₽ за метр' },
        { id: 'lintel', label: 'Перемычка', unit: '₽ за метр' },
      ],
      roomOpts: {
        finishes: { wall: 'Кладка', none: 'Без кладки (уже есть, соседняя)' }, defaultFinish: 'wall', wallWord: 'Стена',
        openingsTitle: 'Окна и двери на этой стене (нажмите на проём в развёртке, чтобы найти его):',
        hint: 'Нажмите на стену, чтобы включить или выключить кладку. Окна и двери тяните по стене, можно перетащить на соседнюю.',
      },
      // Штук в кубометре кладки с учётом шва: кирпич со швом 10 мм (260×130×75 и 260×130×98),
      // блоки на клей и керамоблок на пазах — по размеру изделия
      perM3(id) {
        return { gas: 27.8, foam: 27.8, brick: 394, brick15: 302, ceramo: 48 }[id] || 27.8;
      },
      lens(v, mode, extras) {
        if (mode === 'rect') return (pos(v.len) && pos(v.wid)) ? [v.len, v.wid, v.len, v.wid] : null;
        const P = window.CalcPlan; if (!P || !extras.plan) return null;
        const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
        return g.valid ? g.edges.map((e) => e.len) : null;
      },
      draw(v, mode, box, view, extras) {
        const V = window.CalcViz; if (!V || !pos(v.hei) || !pos(v.thick)) return false;
        let verts = null;
        if (mode === 'rect') { if (pos(v.len) && pos(v.wid)) verts = [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]]; }
        else { const P = window.CalcPlan; if (P && extras.plan) { const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 }); if (g.valid) verts = g.verts; } }
        if (!verts) return false;
        const R = window.CalcRoom;
        const lens = verts.map((a, i) => { const b = verts[(i + 1) % verts.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
        const m = R && extras.room ? R.measure(extras.room, lens, v.hei, this.finishes, 'wall') : null;
        const t = v.thick / 1000;
        // Каждая стена — своя призма толщиной t, внутрь от контура
        const prisms = [];
        verts.forEach((a, i) => {
          if (m && m.walls[i] && m.walls[i].finish !== 'wall') return;
          const b = verts[(i + 1) % verts.length];
          const len = lens[i], dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
          const nx = -dy * t, ny = dx * t;
          prisms.push({ poly: [a, b, [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], z: 0, dz: v.hei });
        });
        if (!prisms.length) return false;
        const dims = verts.length <= 8 ? verts.map((a, i) => { const b = verts[(i + 1) % verts.length]; return { from: [a[0], a[1], v.hei], to: [b[0], b[1], v.hei], label: (i + 1) + ': ' + fmt(lens[i]) + ' м', offset: -18 }; }) : [];
        dims.push({ from: [verts[0][0], verts[0][1], 0], to: [verts[0][0], verts[0][1], v.hei], label: 'высота ' + fmt(v.hei) + ' м', offset: -28 });
        V.iso(box, prisms, dims, { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, ground: true, caption: 'Коробка стен, толщина ' + fmt(v.thick) + ' мм. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
        if (mode === 'plan' && !lens && extras.plan) return { error: 'Контур дома пересекает сам себя — поправьте углы на плане.' };
        if (!R || !extras.room || !lens || !pos(v.hei) || !pos(v.thick)) return null;
        const m = R.measure(extras.room, lens, v.hei, this.finishes, 'wall');
        const walls = m.by.wall;
        if (!walls.n) return { error: 'У всех стен выбрано «без кладки» — отметьте на развёртке, какие стены кладём.' };
        const t = v.thick / 1000;
        const innerLen = v.inner || 0;
        const areaInner = innerLen * v.hei;
        const ti = pos(v.innerThick) ? v.innerThick / 1000 : t;
        // Стены меряются по наружному контуру: на внешнем углу кусок t×t посчитан у обеих стен,
        // на внутреннем (Г-образный дом) его нет ни у одной. Поправка по каждому углу,
        // где кладём обе соседние стены.
        let verts = null;
        if (mode === 'rect') verts = [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]];
        else { const g = window.CalcPlan.geometry(extras.plan, { w: 1, depth: 1, above: 0 }); if (g.valid) verts = g.verts; }
        let corners = 0;
        if (verts && verts.length === m.walls.length) {
          const n = verts.length;
          const sgn = Math.sign(verts.reduce((s2, a, i) => { const b = verts[(i + 1) % n]; return s2 + a[0] * b[1] - b[0] * a[1]; }, 0));
          for (let i = 0; i < n; i++) {
            const prev = (i - 1 + n) % n;
            if (m.walls[i].finish !== 'wall' || m.walls[prev].finish !== 'wall') continue;
            const a = verts[prev], b = verts[i], c = verts[(i + 1) % n];
            const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            corners += Math.sign(cross) === sgn ? 1 : -1;  // выпуклый угол: минус кусок, внутренний: плюс
          }
        }
        const areaOuter = Math.max(0, walls.area - corners * t * v.hei); // за вычетом проёмов и двойных углов
        const area = areaOuter + areaInner;
        const volume = areaOuter * t + areaInner * ti;
        const per = this.perM3(sel.unit);
        const waste = 1 + (v.waste || 0) / 100;
        const units = Math.ceil(volume * per * waste);
        const mortarKg = volume * (v.mortar || 0);
        const bags = pos(v.bagKg) ? Math.ceil(mortarKg / v.bagKg) : null;
        // Перемычки: по ширине проёмов + 250 мм опоры с каждой стороны
        const ops = extras.room.openings.filter((o) => m.walls[o.wall] && m.walls[o.wall].finish === 'wall' && o.w > 0);
        const lintel = ops.reduce((s2, o) => s2 + o.w + 0.5, 0);
        // Армирование: ряды по высоте блока, сетка через каждые N рядов, длина = длина стен
        const rowH = ({ gas: 0.2, foam: 0.2, brick: 0.065 + 0.01, brick15: 0.088 + 0.01, ceramo: 0.219 + 0.01 })[sel.unit] || 0.2;
        const rowsTotal = Math.floor(v.hei / rowH);
        const meshRows = pos(v.meshStep) ? Math.floor(rowsTotal / v.meshStep) : 0;
        const meshLen = meshRows * (walls.len + innerLen);
        const rows = [
          ['Кладка', (innerLen
            ? 'наружные ' + fmt(areaOuter) + ' м² × ' + fmt(t) + ' м + перегородки ' + fmt(areaInner) + ' м² × ' + fmt(ti) + ' м = ' + fmt(volume) + ' м³'
            : fmt(area) + ' м² × ' + fmt(t) + ' м = ' + fmt(volume) + ' м³') + (corners ? ', углы не задвоены' : '')],
          ['В кубометре', fmt(per) + ' шт, запас ' + fmt(v.waste || 0) + '%'],
          ['Рядов по высоте', fmtInt(rowsTotal) + ' (высота ряда ' + fmt(rowH * 100) + ' см)'],
        ];
        const UNIT_NAME = { gas: 'Газоблок', foam: 'Пеноблок', brick: 'Кирпич одинарный', brick15: 'Кирпич полуторный', ceramo: 'Керамоблок' };
        const uName = UNIT_NAME[sel.unit] || 'Блоки или кирпич', buy = this.buy(sel);
        let cost;
        if (buy === 'cube') {
          // Блоки берут целыми штуками, а цена за куб — переводим штуки в кубы изделия
          const m3 = Math.round(units / per * 100) / 100;
          rows.push(['Блоков в кубах', fmtInt(units) + ' шт ÷ ' + fmt(per) + ' шт/м³ = ' + fmt(m3) + ' м³']);
          cost = [{ label: uName + ', ' + fmtInt(units) + ' шт', amount: m3, unit: 'м³', priceId: sel.unit + 'M3' }];
        } else if (buy === 'pallet' && pos(v.palletN)) {
          const pal = Math.ceil(units / v.palletN - 1e-9);
          rows.push(['Поддонов', fmtInt(units) + ' шт ÷ ' + fmtInt(v.palletN) + ' на поддоне = ' + fmtInt(pal) + ' (с округлением вверх, остаток ' + fmtInt(pal * v.palletN - units) + ' шт)']);
          cost = [{ label: uName + ', ' + fmtInt(units) + ' шт', amount: pal, unit: plural(pal, 'поддон', 'поддона', 'поддонов'), priceId: sel.unit + 'Pal' }];
        } else cost = [{ label: uName, amount: units, unit: 'шт', priceId: sel.unit }];
        if (mortarKg > 0) {
          rows.push(['Раствор или клей', fmtInt(mortarKg) + ' кг' + (bags != null ? ' ≈ ' + fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' по ' + fmt(v.bagKg) + ' кг' : '')]);
          const glued = sel.unit === 'gas' || sel.unit === 'foam';
          if (bags != null) cost.push({ label: glued ? 'Клей' : 'Раствор', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: glued ? 'glue' : 'mortar' });
        }
        if (meshLen > 0) {
          rows.push(['Кладочная сетка', fmtInt(meshRows) + ' ' + plural(meshRows, 'ряд', 'ряда', 'рядов') + ' × ' + fmt(walls.len + innerLen) + ' м = ' + fmt(meshLen) + ' м']);
          cost.push({ label: 'Сетка', amount: Math.ceil(meshLen), unit: 'м', priceId: 'mesh' });
        }
        if (lintel > 0) {
          rows.push(['Перемычки', fmtInt(ops.length) + ' ' + plural(ops.length, 'проём', 'проёма', 'проёмов') + ' → ' + fmt(lintel) + ' м (ширина + 25 см опоры с каждой стороны)']);
          cost.push({ label: 'Перемычки', amount: Math.ceil(lintel), unit: 'м', priceId: 'lintel' });
        }
        m.walls.forEach((w) => rows.push(['Стена ' + (w.i + 1) + ' · ' + this.finishes[w.finish], fmt(w.net) + ' м²' + (w.count ? ' (проёмов ' + w.count + ')' : '')]));
        return { main: { label: 'Нужно', value: fmtInt(units) + ' ' + plural(units, 'штука', 'штуки', 'штук') + ' · ' + fmt(volume) + ' м³ кладки' }, rows, cost,
          note: 'Проёмы вычтены (' + fmt(m.openings) + ' м²). Объём = площадь стен × толщина, штуки по числу изделий в кубометре с учётом швов. Перемычки считаются по ширине проёма плюс опора 25 см с каждой стороны. Толщину стены и марку блока подбирает проектировщик под нагрузку и климат.' };
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
          { id: 'picket', label: 'Штакетник (дерево или металл)', hint: 'односторонний: штакетины с зазором' },
          { id: 'picket2', label: 'Штакетник шахматный', hint: 'с двух сторон вразбежку — штакетин почти вдвое больше, зато просветов нет' },
          { id: 'plank', label: 'Деревянный сплошной (доска)', hint: 'доска встык или с малым зазором, плюс пропитка' },
          { id: 'chainlink', label: 'Сетка-рабица', hint: 'рулоны по длине' },
          { id: 'block', label: 'Блоки / кирпич', hint: 'кладка: штук на м² и раствор' },
        ] },
        { id: 'gateType', label: 'Ворота', default: 'swing', choices: [
          { id: 'swing', label: 'Распашные', hint: 'две створки, два столба' },
          { id: 'sliding', label: 'Откатные', hint: 'нужен фундамент под ролики и свободное место вдоль забора ≈ 1,5 ширины ворот' },
          { id: 'lift', label: 'Подъёмные', hint: 'секционные/подъёмно-поворотные, обычно в гараж; нужен проём с перемычкой' },
        ] },
        { id: 'gatePrice', label: 'Цена ворот', default: 'piece', group: 'gates', choices: [
          { id: 'piece', label: 'За штуку', hint: 'готовый комплект из магазина: створки, петли, запор' },
          { id: 'meter', label: 'За метр ширины', hint: 'на заказ у сварщика и откатные: цена × ширина ворот' },
        ] },
        { id: 'sheetBuy', label: 'Профнастил продают', default: 'sheet', group: 'proflist', choices: [
          { id: 'sheet', label: 'За лист', hint: 'цена листа нужной высоты' },
          { id: 'm2', label: 'За м²', hint: 'по полной ширине листа, как считает магазин' },
        ] },
        { id: 'lagBuy', label: 'Лаги продают', default: 'piece', group: 'lags', choices: [
          { id: 'piece', label: 'За штуку', hint: 'профтруба по 6 м' },
          { id: 'meter', label: 'За метр', hint: 'цена погонного метра' },
        ] },
      ],
      common: [
        { id: 'sheetW', label: 'Рабочая ширина листа', unit: 'м', value: '1.15', group: 'proflist' },
        { id: 'sheetWFull', label: 'Полная ширина листа', unit: 'м, по ней магазин считает м²', value: '1.2', group: 'sheetM2' },
        { id: 'plankW', label: 'Ширина штакетины', unit: 'м', value: '0.1', group: 'picket' },
        { id: 'gap', label: 'Зазор между штакетинами', unit: 'м', value: '0.05', group: 'picket' },
        { id: 'plankW2', label: 'Ширина штакетины', unit: 'м', value: '0.1', group: 'picket2' },
        { id: 'gap2', label: 'Зазор на одной стороне', unit: 'м, между соседними штакетинами одной стороны', value: '0.08', group: 'picket2' },
        { id: 'boardW', label: 'Ширина доски', unit: 'м', value: '0.15', group: 'plank' },
        { id: 'boardGap', label: 'Зазор между досками', unit: 'м, 0 = встык', value: '0.02', group: 'plank' },
        { id: 'stain', label: 'Пропитка (антисептик)', unit: 'л на м² одной стороны', value: '0.25', group: 'plank' },
        { id: 'rollL', label: 'Длина рулона сетки', unit: 'м', value: '10', group: 'chainlink' },
        { id: 'perM2', label: 'Блоков / кирпичей на м²', unit: 'шт (блок 390×190 ≈ 12,5; кирпич в полкирпича ≈ 51)', value: '12.5', group: 'block' },
        { id: 'mortar', label: 'Раствор', unit: 'кг/м² кладки', value: '30', group: 'block' },
        { id: 'postDepth', label: 'Столб в земле', unit: 'м', value: '1' },
        { id: 'lagRows', label: 'Рядов лаг (поперечин)', unit: 'шт', value: '2', group: 'lags', int: true },
        { id: 'screwsPer', label: 'Саморезов на лист', unit: 'шт (обычно 8–10)', value: '8', group: 'proflist' },
        { id: 'screwPack', label: 'Саморезов в упаковке', unit: 'шт', value: '250', group: 'screws' },
      ],
      presets: [{ label: 'Кладка', fieldId: 'perM2', unit: 'шт/м²', group: 'block', items: [['Блок 390×190', '12.5'], ['Кирпич в полкирпича', '51'], ['Кирпич в кирпич', '102']] }],
      prices: [
        // Свой ценник у каждого материала: иначе цена листа профнастила умножалась на сотни штакетин.
        // from — прежняя общая цена; она была введена для профнастила (он по умолчанию) и переезжает только к нему
        { id: 'sheet', label: 'Лист профнастила', unit: '₽ за лист', group: 'sheetPiece', from: 'unit' },
        { id: 'sheetM2', label: 'Профнастил', unit: '₽ за м²', group: 'sheetM2' },
        { id: 'picket', label: 'Штакетина', unit: '₽ за штуку', group: 'pickets' },
        { id: 'board', label: 'Доска', unit: '₽ за штуку', group: 'plank' },
        { id: 'chainRoll', label: 'Рулон сетки-рабицы', unit: '₽ за рулон', group: 'chainlink' },
        { id: 'block', label: 'Блок или кирпич', unit: '₽ за штуку', group: 'block' },
        { id: 'post', label: 'Столб', unit: '₽ за штуку' },
        { id: 'gate', label: 'Ворота', unit: '₽ за штуку, комплект', group: 'gatePiece' },
        { id: 'gateM', label: 'Ворота', unit: '₽ за метр ширины', group: 'gateMeter' },
        { id: 'wicket', label: 'Калитка', unit: '₽ за штуку', group: 'wickets' },
        { id: 'cement', label: 'Цемент под столбы', unit: '₽ за мешок 50 кг' },
        { id: 'lag', label: 'Лага 6 м', unit: '₽ за штуку', group: 'lagPiece' },
        { id: 'lagM', label: 'Лага', unit: '₽ за метр', group: 'lagMeter' },
        { id: 'screws', label: 'Саморезы', unit: '₽ за упаковку', group: 'screws' },
        { id: 'stain', label: 'Пропитка', unit: '₽ за литр', group: 'plank' },
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
        const screws = t === 'proflist' || t === 'picket' || t === 'picket2' || t === 'plank';
        // Ворота и калитки: по самой сводке, а пока её нет — по введённым ширинам
        const sm = this.summary(v, mode, sel, extras), ok = sm && !sm.error;
        const gates = ok ? sm.gates > 0 : mode === 'plan' || (v.gate || 0) > 0;
        const wickets = ok ? sm.wickets > 0 : mode === 'plan' || (v.wicket || 0) > 0;
        return { proflist: t === 'proflist', picket: t === 'picket', picket2: t === 'picket2', pickets: t === 'picket' || t === 'picket2', plank: t === 'plank', chainlink: t === 'chainlink', block: t === 'block', lags: t !== 'block' && t !== 'chainlink', screws,
          gates, gatePiece: gates && sel.gatePrice !== 'meter', gateMeter: gates && sel.gatePrice === 'meter', wickets,
          sheetPiece: t === 'proflist' && sel.sheetBuy !== 'm2', sheetM2: t === 'proflist' && sel.sheetBuy === 'm2',
          lagPiece: t !== 'block' && t !== 'chainlink' && sel.lagBuy !== 'meter', lagMeter: t !== 'block' && t !== 'chainlink' && sel.lagBuy === 'meter' };
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
        V.iso(box, prisms, dims, { yaw: yaw.yaw, pitch: yaw.pitch, zoom: yaw.zoom, ground: true, caption: 'Забор по участку: разрывы — ворота и калитки. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const sm = this.summary(v, mode, sel, extras);
        if (!sm) return null; if (sm.error) return sm;
        const { net, sections, posts, gates, wickets, gateLen } = sm;
        const rows = [], cost = []; let main, unitCost = null, screws = 0, screwNote = '';
        const rowsL = v.lagRows == null ? 2 : v.lagRows;
        const postLen = v.hei + (v.postDepth || 1);
        const holes = posts * Math.PI * 0.1 * 0.1 * (v.postDepth || 1);
        const cementBags = Math.ceil(holes * 1.1 * 286 / 50);
        const P = (n, a, b, c) => fmtInt(n) + ' ' + plural(n, a, b, c);
        const t = sel.type;
        if (t === 'proflist') {
          if (!pos(v.sheetW)) return null;
          const sheets = Math.ceil(net / v.sheetW - 1e-9);
          main = P(sheets, 'лист', 'листа', 'листов') + ' · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Листы профнастила', fmtInt(sheets) + ' шт высотой ' + fmt(v.hei) + ' м (рабочая ширина ' + fmt(v.sheetW) + ' м)']);
          screws = sheets * (pos(v.screwsPer) ? Math.round(v.screwsPer) : 8); screwNote = 'по ' + (pos(v.screwsPer) ? Math.round(v.screwsPer) : 8) + ' на лист';
          if (sel.sheetBuy === 'm2') {
            const fullW = pos(v.sheetWFull) ? v.sheetWFull : v.sheetW, m2 = Math.round(sheets * v.hei * fullW * 100) / 100;
            rows.push(['Профнастил в м²', fmtInt(sheets) + ' × ' + fmt(v.hei) + ' × ' + fmt(fullW) + ' м = ' + fmt(m2) + ' м² по полной ширине листа']);
            unitCost = { label: 'Профнастил, ' + fmtInt(sheets) + ' ' + plural(sheets, 'лист', 'листа', 'листов'), amount: m2, unit: 'м²', priceId: 'sheetM2' };
          } else unitCost = { label: 'Профнастил', amount: sheets, unit: plural(sheets, 'лист', 'листа', 'листов'), priceId: 'sheet' };
        } else if (t === 'picket' || t === 'picket2') {
          const pw = t === 'picket' ? v.plankW : v.plankW2, gp = t === 'picket' ? (v.gap || 0) : (v.gap2 || 0);
          if (!pos(pw)) return null;
          const planks = Math.ceil(net / (pw + gp) - 1e-9) * (t === 'picket2' ? 2 : 1);
          main = P(planks, 'штакетина', 'штакетины', 'штакетин') + ' · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Штакетины', fmtInt(planks) + ' шт × ' + fmt(v.hei) + ' м' + (t === 'picket2' ? ' (шахматка: с двух сторон вразбежку, на каждой шаг ' + fmt(pw + gp) + ' м)' : ', шаг ' + fmt(pw + gp) + ' м')]);
          if (t === 'picket2' && gp >= pw) rows.push(['Просветы', 'зазор ' + fmt(gp) + ' м не меньше ширины штакетины ' + fmt(pw) + ' м — вторая сторона его не закроет, забор будет просвечивать']);
          screws = planks * rowsL * 2; screwNote = 'по 2 на каждый ряд лаг';
          unitCost = { label: 'Штакетник', amount: planks, unit: plural(planks, 'штакетина', 'штакетины', 'штакетин'), priceId: 'picket' };
        } else if (t === 'plank') {
          if (!pos(v.boardW)) return null;
          const boards = Math.ceil(net / (v.boardW + (v.boardGap || 0)) - 1e-9);
          const area = net * v.hei, liters = pos(v.stain) ? area * 2 * v.stain : 0;
          main = P(boards, 'доска', 'доски', 'досок') + ' · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Доски', fmtInt(boards) + ' шт × ' + fmt(v.hei) + ' м, ширина ' + fmt(v.boardW) + ' м' + ((v.boardGap || 0) > 0 ? ', зазор ' + fmt(v.boardGap) + ' м' : ', встык')]);
          if (liters > 0) { rows.push(['Пропитка', fmt(liters) + ' л (' + fmt(area) + ' м² × 2 стороны × ' + fmt(v.stain) + ' л/м²)']); cost.push({ label: 'Пропитка', amount: Math.ceil(liters), unit: 'л', priceId: 'stain' }); }
          screws = boards * rowsL * 2; screwNote = 'по 2 на каждый ряд лаг';
          unitCost = { label: 'Доска', amount: boards, unit: plural(boards, 'доска', 'доски', 'досок'), priceId: 'board' };
        } else if (t === 'chainlink') {
          if (!pos(v.rollL)) return null;
          const rolls = Math.ceil(net / v.rollL - 1e-9);
          main = P(rolls, 'рулон', 'рулона', 'рулонов') + ' сетки · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Сетка-рабица', fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов') + ' по ' + fmt(v.rollL) + ' м, высота ' + fmt(v.hei) + ' м']);
          unitCost = { label: 'Сетка', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'chainRoll' };
        } else {
          if (!pos(v.perM2)) return null;
          const area = net * v.hei, blocks = Math.ceil(area * v.perM2 * 1.05), mortarKg = area * (v.mortar || 0), bags = Math.ceil(mortarKg / 25);
          main = P(blocks, 'блок', 'блока', 'блоков') + ' · ' + P(posts, 'столб', 'столба', 'столбов');
          rows.push(['Кладка', fmt(area) + ' м² × ' + fmt(v.perM2) + ' шт/м² + 5% бой = ' + fmtInt(blocks) + ' шт']);
          if (mortarKg > 0) rows.push(['Раствор', fmtInt(mortarKg) + ' кг ≈ ' + fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' по 25 кг']);
          unitCost = { label: 'Блоки / кирпич', amount: blocks, unit: 'шт', priceId: 'block' };
        }
        rows.push(['Пролётов', sections + ' по ' + fmt(v.step) + ' м (полезная длина ' + fmt(net) + ' м)']);
        rows.push(['Столбы', fmtInt(posts) + ' шт длиной ' + fmt(postLen) + ' м (' + fmt(v.postDepth || 1) + ' м в земле)' + (sm.corners ? ', угловые общие' : '')]);
        if (gates || wickets) {
          const gt = { swing: 'распашные', sliding: 'откатные', lift: 'подъёмные' }[sel.gateType];
          let note = gates ? P(gates, 'ворота', 'ворот', 'ворот') + ' ' + gt : '';
          if (wickets) note += (note ? ', ' : '') + P(wickets, 'калитка', 'калитки', 'калиток');
          if (gates && sel.gateType === 'sliding') note += '. Откатным нужно ≈ ' + fmt(gateLen * 1.5) + ' м свободного места вдоль забора и фундамент под ролики';
          if (gates && sel.gateType === 'lift') note += '. Подъёмные: проём с жёсткой перемычкой сверху, обычно в гараж';
          rows.push(['Проёмы', note]);
        }
        if (t !== 'block' && t !== 'chainlink') {
          const lagPieces = Math.ceil(rowsL * net / 6 - 1e-9);
          rows.push(['Лаги', fmtInt(rowsL) + ' ' + plural(rowsL, 'ряд', 'ряда', 'рядов') + ' × ' + fmt(net) + ' м → ' + fmtInt(lagPieces) + ' шт по 6 м']);
          cost.push(sel.lagBuy === 'meter'
            ? { label: 'Лаги, ' + fmtInt(lagPieces) + ' шт по 6 м', amount: lagPieces * 6, unit: 'м', priceId: 'lagM' }
            : { label: 'Лаги', amount: lagPieces, unit: 'шт', priceId: 'lag' });
        }
        if (screws > 0) {
          const pack = pos(v.screwPack) ? Math.round(v.screwPack) : 250, packs = Math.ceil(screws / pack);
          rows.push(['Саморезы', '≈ ' + fmtInt(screws) + ' шт (' + screwNote + ') → ' + fmtInt(packs) + ' ' + plural(packs, 'упаковка', 'упаковки', 'упаковок') + ' по ' + pack]);
          cost.push({ label: 'Саморезы', amount: packs, unit: plural(packs, 'упаковка', 'упаковки', 'упаковок') + ' по ' + pack, priceId: 'screws' });
        }
        rows.push(['Бетон под столбы', fmt(holes) + ' м³ (лунки ⌀20 см) ≈ ' + fmtInt(cementBags) + ' ' + plural(cementBags, 'мешок', 'мешка', 'мешков') + ' цемента']);
        if (sm.sides) sm.sides.forEach((w) => rows.push(['Сторона ' + (w.i + 1), fmt(w.len) + ' м' + (w.opLen ? ', проёмы ' + fmt(w.opLen) + ' м' : '')]));
        cost.unshift(unitCost, { label: 'Столбы', amount: posts, unit: plural(posts, 'столб', 'столба', 'столбов'), priceId: 'post' });
        cost.push({ label: 'Цемент под столбы', amount: cementBags, unit: plural(cementBags, 'мешок', 'мешка', 'мешков'), priceId: 'cement' });
        if (gates) {
          const gl = 'Ворота ' + { swing: 'распашные', sliding: 'откатные', lift: 'подъёмные' }[sel.gateType];
          cost.push(sel.gatePrice === 'meter'
            ? { label: gl + ', ширина', amount: gateLen, unit: 'м', priceId: 'gateM' }
            : { label: gl, amount: gates, unit: 'шт', priceId: 'gate' });
        }
        if (wickets) cost.push({ label: 'Калитка', amount: wickets, unit: 'шт', priceId: 'wicket' });
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
        choices: Object.keys(MATERIALS).map((k) => ({ id: k, label: MATERIALS[k].name, hint: fmt(MATERIALS[k].density) + ' т/м³ — ' + MATERIALS[k].hint })) },
        { id: 'compact', label: 'Слой', default: 'yes', group: 'layer', choices: [
          { id: 'yes', label: 'Утрамбуем', hint: 'толщина — после трамбовки: рыхлого материала нужно больше' },
          { id: 'no', label: 'Насыпаем как есть', hint: 'грядка, отсыпка без трамбовки' },
        ] },
        { id: 'priceUnit', label: 'Материал продают', default: 'ton', choices: [
          { id: 'ton', label: 'За тонну', hint: 'карьеры и большинство баз' },
          { id: 'cube', label: 'За куб', hint: 'часть баз и почти всегда земля, торф, керамзит' },
        ] },
        { id: 'truck', label: 'Чем везут', default: 't10', choices: TRUCKS.map((t) => ({ id: t.id, label: t.name, hint: 'берёт до ' + fmt(t.tons) + ' т за рейс' })) }],
      groups(v, mode, extras, sel) {
        const out = { layer: mode === 'area', ton: sel.priceUnit !== 'cube', cube: sel.priceUnit === 'cube' };
        TRUCKS.forEach((t) => { out['truck_' + t.id] = sel.truck === t.id; });
        return out;
      },
      prices: [
        { id: 'perTon', label: 'Цена материала', unit: '₽ за тонну', group: 'ton' },
        { id: 'perM3', label: 'Цена материала', unit: '₽ за м³', group: 'cube' },
        // Рейс у каждой машины свой; прежняя общая цена доставки — к КамАЗу, он по умолчанию
        ...TRUCKS.map((t) => ({ id: 'del_' + t.id, label: 'Доставка: ' + t.name, unit: '₽ за рейс, необязательно', group: 'truck_' + t.id, from: t.id === 't10' ? 'delivery' : undefined })),
      ],
      draw(v, mode, box, yaw) {
        const V = window.CalcViz; if (!V || mode !== 'area' || !(pos(v.len) && pos(v.wid) && pos(v.thick))) return false;
        const t = v.thick / 100;
        V.iso(box, [{ x: 0, y: 0, z: 0, dx: v.len, dy: v.wid, dz: t }], [
          { from: [0, v.wid, 0], to: [v.len, v.wid, 0], label: 'длина ' + fmt(v.len) + ' м', offset: 22 },
          { from: [v.len, 0, 0], to: [v.len, v.wid, 0], label: 'ширина ' + fmt(v.wid) + ' м', offset: -22 },
          { from: [0, 0, 0], to: [0, 0, t], label: 'слой ' + fmt(v.thick) + ' см', offset: -22 },
        ], { yaw: yaw.yaw, pitch: yaw.pitch, zoom: yaw.zoom, caption: 'Слой засыпки. Потяните, чтобы повернуть.' });
        return true;
      },
      compute(v, mode, sel) {
        const m = MATERIALS[sel.material];
        let cubes = null;
        if (mode === 'volume') cubes = pos(v.vol) ? v.vol : null;
        else if (mode === 'area') { if (pos(v.len) && pos(v.wid) && pos(v.thick)) cubes = v.len * v.wid * (v.thick / 100); }
        else cubes = pos(v.weight) ? v.weight / m.density : null;
        if (cubes == null) return null;
        const rows = [['Насыпная плотность', fmt(m.density) + ' т/м³']];
        if (mode === 'area' && sel.compact === 'yes') {
          rows.push(['Уплотнение', fmt(cubes) + ' м³ готового слоя × ' + fmt(m.compact) + ' = ' + fmt(cubes * m.compact) + ' м³ рыхлого']);
          cubes *= m.compact;
        }
        const tons = cubes * m.density;
        const truck = TRUCKS.find((t) => t.id === sel.truck) || TRUCKS[2];
        const trips = Math.ceil(tons / truck.tons - 1e-9);
        TRUCKS.forEach((t) => {
          const n = Math.ceil(tons / t.tons - 1e-9);
          if (n > 0 && (n <= 12 || t === truck)) rows.push([t.name + (t === truck ? ' ✓' : ''), n === 1 ? 'один рейс' : fmtInt(n) + ' ' + plural(n, 'рейс', 'рейса', 'рейсов')]);
        });
        return {
          main: { label: 'Нужно: ' + m.name.toLowerCase(), value: fmt(cubes) + ' м³ · ' + fmt(tons) + ' т' },
          rows,
          note: 'Плотность усреднённая: ' + m.hint + '. Тонны и кубы связаны через неё, поэтому берите с запасом 5–10% — часть уйдёт в просыпь'
            + (mode === 'area' && sel.compact === 'yes' ? '. Усадка при трамбовке уже учтена.' : mode === 'area' ? '.' : ', а если слой будут трамбовать — добавьте ещё 15–30% на усадку.'),
          cost: [
            sel.priceUnit === 'cube'
              ? { label: m.name, amount: cubes, unit: 'м³', priceId: 'perM3' }
              : { label: m.name, amount: tons, unit: 'т', priceId: 'perTon' },
            { label: 'Доставка: ' + truck.name, amount: trips, unit: plural(trips, 'рейс', 'рейса', 'рейсов'), priceId: 'del_' + truck.id, optional: true },
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
          { id: 'qdiag', label: 'Диагональ: от переднего правого угла до заднего левого', unit: 'м, необязательно' },
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
            { from: B, to: D, label: 'диагональ ' + m(q.diag) + (q.assumed ? ' (принято)' : ''), offset: 0 },
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
          // «6,5 сотки», но «6 соток»: у дробного числа всегда родительный единственного
          main: { label: 'Площадь', value: fmt(area / 100) + ' ' + (Math.round(area) % 100 ? 'сотки' : plural(Math.round(area / 100), 'сотка', 'сотки', 'соток')) },
          rows,
          note: mode === 'quad'
            ? (this.quad(v).assumed ? 'Диагональ не введена: угол у переднего левого принят прямым. Если он на деле отличается на 10–15°, площадь уйдёт на несколько процентов. Измерьте диагональ рулеткой от переднего правого до заднего левого угла и введите — расчёт станет точным. ' : 'По четырём сторонам и диагонали: точный расчёт. ') + '1 сотка = 100 м².'
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

    /* --- Штукатурка стен: комната по размерам или своему плану, проёмы, маяки --- */
    plaster: {
      modeLabel: 'Что штукатурим',
      modes: [
        { id: 'room', label: 'Стены комнаты', room: true, fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
          { id: 'hei', label: 'Высота потолка', unit: 'м', value: '2.7' },
        ] },
        { id: 'roomplan', label: 'Комната: свой план (ниши, выступы)', room: true, plan: { simple: true, presetsKey: 'ROOM_PRESETS' }, fields: [
          { id: 'hei', label: 'Высота потолка', unit: 'м', value: '2.7' },
        ] },
        { id: 'ceiling', label: 'Потолок', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
        ] },
        { id: 'custom', label: 'Своя площадь', fields: [
          { id: 'area', label: 'Площадь под штукатурку', unit: 'м²', value: '30' },
        ] },
      ],
      roomOpts: {
        finishes: { plaster: 'Штукатурим', none: 'Не штукатурим' }, defaultFinish: 'plaster', wallWord: 'Стена',
        openingsTitle: 'Окна и двери на этой стене (вычитаются из площади):',
        hint: 'Нажмите на стену, чтобы включить или выключить штукатурку. Окно и дверь тяните по стене.',
      },
      common: [
        { id: 'thick', label: 'Средняя толщина слоя', unit: 'мм', value: '20' },
        { id: 'rateMm', label: 'Расход смеси', unit: 'кг/м² на 1 мм слоя', value: '1', group: 'own' },
        { id: 'bag', label: 'Мешок смеси', unit: 'кг', value: '30' },
        { id: 'primerRate', label: 'Расход грунтовки', unit: 'л/м²', value: '0.15', group: 'primer' },
        { id: 'primerCan', label: 'Канистра грунтовки', unit: 'л', value: '10', group: 'primer' },
        { id: 'beaconStep', label: 'Шаг маяков', unit: 'м (правило минус 20–30 см)', value: '1.2', group: 'beacon' },
        { id: 'beaconLen', label: 'Длина маячного профиля', unit: 'м', value: '3', group: 'beacon' },
      ],
      selects: [
        { id: 'mix', label: 'Смесь', default: 'gypsum', choices: [
          { id: 'gypsum', label: 'Гипсовая', hint: 'сухие комнаты, ≈0,9 кг/м² на 1 мм, слой до 50 мм' },
          { id: 'cement', label: 'Цементная', hint: 'ванная, кухня, фасад, ≈1,7 кг/м² на 1 мм' },
          { id: 'own', label: 'Свой расход', hint: 'цифра с мешка вашей смеси' },
        ] },
        { id: 'beacons', label: 'Маяки', default: 'yes', choices: [
          { id: 'yes', label: 'По маякам', hint: 'ровная плоскость, считаем профили' },
          { id: 'no', label: 'Без маяков', hint: 'подмазка, тонкий слой' },
        ] },
        { id: 'primer', label: 'Грунтовка', default: 'yes', choices: [
          { id: 'yes', label: 'Считать', hint: 'обязательна и до, и после штукатурки' },
          { id: 'no', label: 'Не считать', hint: '' },
        ] },
      ],
      presets: [
        { label: 'Толщина слоя', fieldId: 'thick', unit: 'мм', items: [['Под обои, ровные стены', '10'], ['Обычная', '20'], ['Кривые стены', '30'], ['Максимум за проход', '50']] },
        { label: 'Мешок', fieldId: 'bag', unit: 'кг', items: [['Гипсовая 30', '30'], ['Цементная 25', '25'], ['Большой 40', '40']] },
      ],
      prices: [
        { id: 'bag', label: 'Цена мешка смеси', unit: '₽ за мешок' },
        { id: 'primer', label: 'Цена грунтовки', unit: '₽ за канистру', group: 'primer' },
        { id: 'beacon', label: 'Цена маячного профиля', unit: '₽ за штуку', group: 'beacon' },
      ],
      RATES: { gypsum: 0.9, cement: 1.7 },
      groups(v, mode, extras, sel) {
        const walls = mode === 'room' || mode === 'roomplan';
        return { own: sel.mix === 'own', primer: sel.primer === 'yes', beacon: sel.beacons === 'yes' && walls };
      },
      lens(v, mode, extras) {
        if (mode === 'room') return (pos(v.len) && pos(v.wid)) ? [v.len, v.wid, v.len, v.wid] : null;
        if (mode === 'roomplan') {
          const P = window.CalcPlan; if (!P || !extras.plan) return null;
          const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
          return g.valid ? g.edges.map((e) => e.len) : null;
        }
        return null;
      },
      draw(v, mode, box) {
        const V = window.CalcViz; if (!V) return false;
        if (mode === 'ceiling' && pos(v.len) && pos(v.wid)) {
          V.shape(box, [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]], [
            { from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 },
            { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 },
          ], { center: fmt(v.len * v.wid) + ' м²', title: 'Потолок' });
          return true;
        }
        return false;
      },
      compute(v, mode, sel, extras) {
        const rate = sel.mix === 'own' ? v.rateMm : this.RATES[sel.mix];
        if (!pos(rate) || !pos(v.thick)) return null;

        // Площадь: стены комнаты минус проёмы, потолок или своя цифра
        let area = null, wallRows = [], beacons = null, m = null;
        if (mode === 'ceiling') area = (pos(v.len) && pos(v.wid)) ? v.len * v.wid : null;
        else if (mode === 'custom') area = pos(v.area) ? v.area : null;
        else {
          const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
          if (mode === 'roomplan' && !lens && extras.plan) return { error: 'Контур комнаты пересекает сам себя — поправьте углы на плане.' };
          if (!R || !extras.room || !lens || !pos(v.hei)) return null;
          m = R.measure(extras.room, lens, v.hei, this.roomOpts.finishes, 'plaster');
          if (m.by.plaster.n === 0) return { error: 'Все стены отмечены «не штукатурим» — включите хотя бы одну на развёртке.' };
          area = m.by.plaster.area;
          // Маяки: по каждой стене свой ряд, крайние по углам
          if (sel.beacons === 'yes' && pos(v.beaconStep)) {
            const count = m.by.plaster.walls.reduce((s, w) => s + Math.ceil(w.len / v.beaconStep - 1e-9) + 1, 0);
            // Маяк выше профиля стыкуют из целого и добора; доборы режут из одного профиля на несколько маяков
            let profiles = count;
            if (pos(v.beaconLen)) {
              const L = v.beaconLen, full = Math.floor(v.hei / L + 1e-9), rest = v.hei - full * L;
              profiles = count * full + (rest > 0.01 ? Math.ceil(count / Math.max(1, Math.floor(L / rest + 1e-9))) : 0);
            }
            beacons = { count, profiles };
          }
          wallRows = m.walls.map((w) => ['Стена ' + (w.i + 1) + ' · ' + this.roomOpts.finishes[w.finish], fmt(w.net) + ' м²' + (w.count ? ' (проёмов ' + w.count + ')' : '')]);
        }
        if (!(area > 0)) return null;

        const perM2 = rate * v.thick;              // кг на квадратный метр при этой толщине
        const kg = area * perM2;
        const bags = pos(v.bag) ? Math.ceil(kg * 1.1 / v.bag) : null;
        const rows = [
          ['Площадь', fmt(area) + ' м²' + (m && m.openings ? ', проёмы ' + fmt(m.openings) + ' м² вычтены' : '')],
          ['Расход при ' + fmt(v.thick) + ' мм', fmt(perM2) + ' кг/м² (' + fmt(rate) + ' кг/м² на 1 мм)'],
          ['Смеси без запаса', fmtInt(kg) + ' кг'],
        ];
        const cost = [];
        if (bags != null) {
          rows.push(['Мешков по ' + fmt(v.bag) + ' кг', fmtInt(bags) + ' шт (запас 10%)']);
          cost.push({ label: 'Смесь', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: 'bag' });
        }
        if (sel.primer === 'yes' && pos(v.primerRate)) {
          const liters = area * v.primerRate * 2;  // до штукатурки и под финиш
          const cans = pos(v.primerCan) ? Math.ceil(liters / v.primerCan) : null;
          rows.push(['Грунтовка', fmt(liters) + ' л на два прохода' + (cans != null ? ' ≈ ' + fmtInt(cans) + ' ' + plural(cans, 'канистра', 'канистры', 'канистр') : '')]);
          if (cans != null) cost.push({ label: 'Грунтовка', amount: cans, unit: plural(cans, 'канистра', 'канистры', 'канистр'), priceId: 'primer' });
        }
        if (beacons) {
          rows.push(['Маяки', fmtInt(beacons.count) + ' шт с шагом ' + fmt(v.beaconStep) + ' м → ' + fmtInt(beacons.profiles) + ' ' + plural(beacons.profiles, 'профиль', 'профиля', 'профилей') + ' по ' + fmt(v.beaconLen) + ' м']);
          cost.push({ label: 'Маяки', amount: beacons.profiles, unit: plural(beacons.profiles, 'профиль', 'профиля', 'профилей'), priceId: 'beacon' });
        }
        wallRows.forEach((r) => rows.push(r));

        let note = 'Расход берите с мешка вашей смеси: у разных производителей он отличается на 10–20%. ';
        if (sel.mix === 'gypsum' && v.thick > 50) note += 'Слой больше 50 мм гипсовой смесью за один проход не кладут: делайте два слоя с армирующей сеткой. ';
        if (sel.mix === 'cement' && v.thick > 30) note += 'Цементную штукатурку толще 30 мм кладут в два слоя по сетке. ';
        if (v.thick > 30) note += 'При слое больше 30 мм нужна штукатурная сетка. ';
        note += 'Толщину считают по средней: замерьте перепад стены правилом и возьмите половину плюс минимальный слой 5 мм.';

        return {
          main: { label: 'Нужно штукатурки', value: bags != null ? fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' (' + fmtInt(kg * 1.1) + ' кг)' : fmtInt(kg) + ' кг' },
          rows, note, cost,
        };
      },
    },

    /* --- Стяжка пола: пескобетон, цемент с песком или наливной пол --- */
    screed: {
      modeLabel: 'Форма помещения',
      modes: [
        { id: 'rect', label: 'Прямоугольная комната', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
        ] },
        { id: 'plan', label: 'Свой план (ниши, выступы)', plan: { simple: true, presetsKey: 'ROOM_PRESETS' }, fields: [] },
        { id: 'custom', label: 'Своя площадь', fields: [
          { id: 'area', label: 'Площадь пола', unit: 'м²', value: '20' },
        ] },
      ],
      common: [
        { id: 'thick', label: 'Толщина стяжки', unit: 'мм', value: '50' },
        { id: 'readyRate', label: 'Расход смеси', unit: 'кг/м² на 1 см слоя', value: '20', group: 'ready' },
        { id: 'readyBag', label: 'Мешок пескобетона', unit: 'кг', value: '40', group: 'ready' },
        { id: 'cemPerM3', label: 'Цемента на 1 м³ раствора', unit: 'кг', value: '490', group: 'cps' },
        { id: 'sandPerM3', label: 'Песка на 1 м³ раствора', unit: 'кг', value: '1450', group: 'cps' },
        { id: 'cemBag', label: 'Мешок цемента', unit: 'кг', value: '50', group: 'cps' },
        { id: 'selfRate', label: 'Расход наливного пола', unit: 'кг/м² на 1 мм слоя', value: '1.5', group: 'self' },
        { id: 'selfBag', label: 'Мешок наливного пола', unit: 'кг', value: '20', group: 'self' },
        { id: 'damperRoll', label: 'Демпферная лента в рулоне', unit: 'м, 0 = не считать', value: '50', group: 'damperField' },
        { id: 'fiberRate', label: 'Фиброволокно', unit: 'кг на 1 м³ раствора', value: '0.8', group: 'fiber' },
        { id: 'fiberPack', label: 'Упаковка фиброволокна', unit: 'кг', value: '0.6', group: 'fiber' },
        { id: 'meshSheet', label: 'Карта или рулон сетки', unit: 'м²', value: '6', group: 'mesh' },
      ],
      selects: [
        { id: 'mix', label: 'Из чего', default: 'ready', choices: [
          { id: 'ready', label: 'Готовая смесь (пескобетон М300)', hint: 'мешки, ≈20 кг/м² на каждый сантиметр', sets: screedThick },
          { id: 'cps', label: 'Цемент и песок 1:3', hint: 'мешки цемента и тонны песка', sets: screedThick },
          { id: 'self', label: 'Наливной пол', hint: 'самовыравнивающийся, слой от 5 мм', sets: { thick: '10' } },
        ] },
        { id: 'sandBuy', label: 'Песок продают', default: 'ton', group: 'cps', choices: [
          { id: 'ton', label: 'За тонну', hint: 'карьеры и большинство баз' },
          { id: 'cube', label: 'За куб', hint: 'пересчёт по насыпной плотности 1,55 т/м³' },
        ] },
        { id: 'reinf', label: 'Армирование', default: 'fiber', group: 'reinf', choices: [
          { id: 'fiber', label: 'Фиброволокно', hint: 'мешается в раствор, держит от усадочных трещин' },
          { id: 'mesh', label: 'Сетка', hint: 'карты внахлёст, считаем с запасом 10%' },
          { id: 'none', label: 'Без армирования', hint: '' },
        ] },
      ],
      presets: [
        { label: 'Толщина', fieldId: 'thick', unit: 'мм', items: [['Наливной пол', '10'], ['Минимум по плите', '30'], ['Обычная', '50'], ['По утеплителю', '70'], ['С трубами тёплого пола', '80']] },
        { label: 'Мешок пескобетона', fieldId: 'readyBag', unit: 'кг', group: 'ready', items: [['40 кг', '40'], ['25 кг', '25'], ['50 кг', '50']] },
      ],
      prices: [
        { id: 'readyBag', label: 'Цена пескобетона', unit: '₽ за мешок', group: 'ready' },
        { id: 'cem', label: 'Цена цемента', unit: '₽ за мешок', group: 'cps' },
        { id: 'sand', label: 'Цена песка', unit: '₽ за тонну', group: 'sandTon' },
        { id: 'sandM3', label: 'Цена песка', unit: '₽ за м³', group: 'sandCube' },
        { id: 'selfBag', label: 'Цена наливного пола', unit: '₽ за мешок', group: 'self' },
        { id: 'damper', label: 'Цена демпферной ленты', unit: '₽ за рулон', group: 'damper' },
        { id: 'fiber', label: 'Цена фиброволокна', unit: '₽ за упаковку', group: 'fiber' },
        { id: 'mesh', label: 'Цена сетки', unit: '₽ за карту', group: 'mesh' },
      ],
      groups(v, mode, extras, sel) {
        // Демпферная лента идёт по периметру — в «своей площади» его нет, поле и цену прячем
        const dmp = mode !== 'custom';
        return { damperField: dmp, damper: dmp && pos(v.damperRoll), ready: sel.mix === 'ready', cps: sel.mix === 'cps', self: sel.mix === 'self',
          sandTon: sel.mix === 'cps' && sel.sandBuy !== 'cube', sandCube: sel.mix === 'cps' && sel.sandBuy === 'cube',
          fiber: sel.reinf === 'fiber' && sel.mix !== 'self', mesh: sel.reinf === 'mesh' && sel.mix !== 'self', reinf: sel.mix !== 'self' };
      },
      shape(v, mode, extras) {
        if (mode === 'rect') return (pos(v.len) && pos(v.wid)) ? { area: v.len * v.wid, per: 2 * (v.len + v.wid), pts: [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]] } : null;
        if (mode === 'custom') return pos(v.area) ? { area: v.area, per: null, pts: null } : null;
        const P = window.CalcPlan; if (!P || !extras.plan) return null;
        const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
        return g.valid ? { area: g.outerArea, per: g.perimeter, pts: g.verts } : null;
      },
      draw(v, mode, box, view, extras) {
        const V = window.CalcViz; const sh = this.shape(v, mode, extras);
        if (!V || !sh || !sh.pts) return false;
        const dims = mode === 'rect'
          ? [{ from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 }, { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 }]
          : sh.pts.map((a, i) => { const b = sh.pts[(i + 1) % sh.pts.length]; return { from: a, to: b, label: fmt(Math.hypot(b[0] - a[0], b[1] - a[1])) + ' м', offset: 20 }; });
        V.shape(box, sh.pts, dims, { center: fmt(sh.area) + ' м²', title: 'Стяжка',
          caption: 'Площадь ' + fmt(sh.area) + ' м², периметр ' + fmt(sh.per) + ' м, слой ' + fmt(v.thick) + ' мм' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const sh = this.shape(v, mode, extras);
        if (mode === 'plan' && !sh && extras.plan) return { error: 'Контур помещения пересекает сам себя — поправьте углы на плане.' };
        if (!sh || !pos(v.thick)) return null;
        if (sel.mix === 'self' && v.thick > 30) return { error: 'Наливной пол толще 30 мм не льют: это дорого и он трескается. Выберите пескобетон или цемент с песком.' };
        if (sel.mix !== 'self' && v.thick < 20) return { error: 'Стяжка тоньше 20 мм по плите трескается и отслаивается. Возьмите наливной пол или увеличьте слой.' };

        const area = sh.area, vol = area * v.thick / 1000;
        const rows = [['Площадь', fmt(area) + ' м²'], ['Объём стяжки', fmt(vol) + ' м³ (' + fmt(v.thick) + ' мм)']];
        const cost = []; let main = null;

        if (sel.mix === 'ready') {
          if (!pos(v.readyRate)) return null;
          const perM2 = v.readyRate * v.thick / 10, kg = area * perM2;
          const bags = pos(v.readyBag) ? Math.ceil(kg * 1.05 / v.readyBag) : null;
          rows.push(['Расход при ' + fmt(v.thick) + ' мм', fmt(perM2) + ' кг/м²']);
          rows.push(['Смеси', fmtInt(kg) + ' кг без запаса']);
          if (bags != null) {
            rows.push(['Мешков по ' + fmt(v.readyBag) + ' кг', fmtInt(bags) + ' шт (запас 5%)']);
            main = fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' пескобетона';
            cost.push({ label: 'Пескобетон', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: 'readyBag' });
          } else main = fmtInt(kg) + ' кг смеси';
        } else if (sel.mix === 'cps') {
          if (!pos(v.cemPerM3) || !pos(v.sandPerM3)) return null;
          const cem = vol * v.cemPerM3, sand = vol * v.sandPerM3;
          const cemBags = pos(v.cemBag) ? Math.ceil(cem * 1.05 / v.cemBag) : null;
          const sandT = sand * 1.05 / 1000;
          rows.push(['Цемент М400', fmtInt(cem) + ' кг' + (cemBags != null ? ' ≈ ' + fmtInt(cemBags) + ' ' + plural(cemBags, 'мешок', 'мешка', 'мешков') + ' по ' + fmt(v.cemBag) + ' кг' : '')]);
          rows.push(['Песок', fmt(sandT) + ' т с запасом 5% (≈ ' + fmt(sandT / MATERIALS.sand.density) + ' м³)']);
          rows.push(['Вода', '≈ ' + fmtInt(cem * 0.45) + ' л, доливать по консистенции']);
          main = (cemBags != null ? fmtInt(cemBags) + ' ' + plural(cemBags, 'мешок', 'мешка', 'мешков') + ' цемента' : fmtInt(cem) + ' кг цемента') + ' · ' + fmt(sandT) + ' т песка';
          if (cemBags != null) cost.push({ label: 'Цемент', amount: cemBags, unit: plural(cemBags, 'мешок', 'мешка', 'мешков'), priceId: 'cem' });
          // Насыпная плотность песка — та же, что в калькуляторе песка и щебня
          cost.push(sel.sandBuy === 'cube'
            ? { label: 'Песок', amount: Math.round(sandT / MATERIALS.sand.density * 100) / 100, unit: 'м³', priceId: 'sandM3' }
            : { label: 'Песок', amount: sandT, unit: 'т', priceId: 'sand' });
        } else {
          if (!pos(v.selfRate)) return null;
          const perM2 = v.selfRate * v.thick, kg = area * perM2;
          const bags = pos(v.selfBag) ? Math.ceil(kg * 1.05 / v.selfBag) : null;
          rows.push(['Расход при ' + fmt(v.thick) + ' мм', fmt(perM2) + ' кг/м²']);
          rows.push(['Смеси', fmtInt(kg) + ' кг без запаса']);
          if (bags != null) {
            rows.push(['Мешков по ' + fmt(v.selfBag) + ' кг', fmtInt(bags) + ' шт (запас 5%)']);
            main = fmtInt(bags) + ' ' + plural(bags, 'мешок', 'мешка', 'мешков') + ' наливного пола';
            cost.push({ label: 'Наливной пол', amount: bags, unit: plural(bags, 'мешок', 'мешка', 'мешков'), priceId: 'selfBag' });
          } else main = fmtInt(kg) + ' кг смеси';
        }

        if (sel.mix !== 'self' && sel.reinf === 'fiber' && pos(v.fiberRate)) {
          const kg = vol * v.fiberRate;
          const packs = pos(v.fiberPack) ? Math.ceil(kg / v.fiberPack) : null;
          rows.push(['Фиброволокно', fmt(kg) + ' кг' + (packs != null ? ' ≈ ' + fmtInt(packs) + ' ' + plural(packs, 'упаковка', 'упаковки', 'упаковок') : '')]);
          if (packs != null) cost.push({ label: 'Фиброволокно', amount: packs, unit: plural(packs, 'упаковка', 'упаковки', 'упаковок'), priceId: 'fiber' });
        }
        if (sel.mix !== 'self' && sel.reinf === 'mesh' && pos(v.meshSheet)) {
          const sheets = Math.ceil(area * 1.1 / v.meshSheet);
          rows.push(['Сетка', fmtInt(sheets) + ' ' + plural(sheets, 'карта', 'карты', 'карт') + ' по ' + fmt(v.meshSheet) + ' м² (нахлёст 10%)']);
          cost.push({ label: 'Сетка', amount: sheets, unit: plural(sheets, 'карта', 'карты', 'карт'), priceId: 'mesh' });
        }
        if (sh.per && pos(v.damperRoll)) {
          const rolls = Math.ceil(sh.per / v.damperRoll);
          rows.push(['Демпферная лента', fmt(sh.per) + ' м по периметру → ' + fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов')]);
          cost.push({ label: 'Демпферная лента', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'damper' });
        }
        const self = sel.mix === 'self';
        const density = self && pos(v.selfRate) ? v.selfRate * 1000 : 2000;
        rows.push(['Вес на перекрытие', fmtInt(v.thick / 1000 * density) + ' кг/м² (всего ' + fmtInt(vol * density) + ' кг)']);
        if (self && v.thick < 5) rows.push(['Тонкий слой', 'тоньше 5 мм обычный наливной пол не льют: нужен финишный, от 2–3 мм — проверьте на мешке, на какой слой он рассчитан']);

        let note = 'Вес считаем по плотности ' + fmtInt(density) + ' кг/м³. ';
        if (v.thick >= 70) note += 'Слой от 70 мм — это заметная нагрузка на перекрытие: в квартире её стоит проверить. ';
        note += 'Демпферная лента по периметру обязательна: без неё стяжка упирается в стены и трескается. ';
        note += self
          ? 'По наливному полу ходят через 4–6 часов, а покрытие кладут, когда он высохнет: срок написан на мешке, обычно от 3 дней под плитку до 1–2 недель под ламинат.'
          : 'Ходить можно через 2–3 дня, класть покрытие — когда высохнет: примерно неделя на каждый сантиметр первых 4 см, толще — ещё дольше. Под ламинат и паркет стяжку сушат дольше, чем под плитку.';

        return { main: { label: 'Нужно на стяжку', value: main }, rows, note, cost };
      },
    },


    /* --- Гипсокартон: листы, профиль, подвесы и расходники --- */
    drywall: {
      modeLabel: 'Что обшиваем',
      modes: [
        { id: 'wall', label: 'Стены комнаты', room: true, fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
          { id: 'hei', label: 'Высота потолка', unit: 'м', value: '2.7' },
        ] },
        { id: 'ceiling', label: 'Потолок', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
        ] },
        { id: 'partition', label: 'Перегородка', fields: [
          { id: 'plen', label: 'Длина перегородки', unit: 'м', value: '4' },
          { id: 'phei', label: 'Высота перегородки', unit: 'м', value: '2.7' },
          { id: 'pdoor', label: 'Дверных проёмов', unit: 'шт', value: '1', int: true },
          { id: 'pdoorW', label: 'Ширина проёма', unit: 'м', value: '0.9' },
          { id: 'pdoorH', label: 'Высота проёма', unit: 'м', value: '2.1' },
        ] },
        { id: 'custom', label: 'Своя площадь', fields: [
          { id: 'area', label: 'Площадь обшивки', unit: 'м²', value: '30' },
        ] },
      ],
      roomOpts: {
        finishes: { gkl: 'Обшиваем', none: 'Не обшиваем' }, defaultFinish: 'gkl', wallWord: 'Стена',
        openingsTitle: 'Окна и двери на этой стене (вычитаются из площади):',
        hint: 'Нажмите на стену, чтобы включить или выключить обшивку. Окно и дверь тяните по стене.',
      },
      common: [
        { id: 'sheetL', label: 'Длина листа', unit: 'см', value: '250' },
        { id: 'sheetW', label: 'Ширина листа', unit: 'см', value: '120' },
        { id: 'waste', label: 'Запас на подрезку', unit: '%', value: '10' },
        { id: 'studStep', label: 'Шаг стоек (на потолке — поперечных профилей)', unit: 'мм', value: '600' },
        { id: 'profileLen', label: 'Длина профиля', unit: 'м', value: '3' },
        { id: 'mainStep', label: 'Шаг основных профилей', unit: 'м, на подвесах', value: '1', group: 'ceil' },
        { id: 'hangerStep', label: 'Шаг подвесов вдоль основного профиля', unit: 'м', value: '0.8', group: 'ceil' },
        { id: 'screwRate', label: 'Саморезов по гипсокартону', unit: 'шт на 1 м² обшивки', value: '23' },
        { id: 'tapeRate', label: 'Ленты для швов', unit: 'м на 1 м²', value: '1.1' },
        { id: 'tapeRoll', label: 'Лента в рулоне', unit: 'м', value: '20' },
        { id: 'puttyRate', label: 'Шпаклёвка для швов', unit: 'кг на 1 м²', value: '0.5' },
        { id: 'primerRate', label: 'Грунтовка', unit: 'л на 1 м², 0 = не считать', value: '0.15' },
      ],
      selects: [
        { id: 'layers', label: 'Слоёв обшивки', default: 'one', choices: [
          { id: 'one', label: 'Один слой', hint: 'обычная обшивка' },
          { id: 'two', label: 'Два слоя', hint: 'жёсткость и звукоизоляция: листов и саморезов вдвое больше' },
        ] },
        { id: 'profBuy', label: 'Профиль продают', default: 'piece', group: 'prof', choices: [
          { id: 'piece', label: 'За штуку', hint: 'профиль целой длины, обычно 3 м' },
          { id: 'meter', label: 'За метр', hint: 'цена за погонный метр — умножим на длину профиля' },
        ] },
      ],
      presets: [
        { label: 'Лист', fieldId: 'sheetL', unit: 'см', items: [['Стандарт 2500', '250'], ['Малый 2000', '200'], ['Длинный 3000', '300']] },
        { label: 'Шаг профиля', fieldId: 'studStep', unit: 'мм', items: [['Стандарт', '600'], ['Под плитку', '400'], ['Экономный', '625']] },
      ],
      prices: [
        { id: 'sheet', label: 'Цена листа', unit: '₽ за лист' },
        { id: 'stud', label: 'Цена несущего профиля', unit: '₽ за штуку', group: 'profPiece' },
        { id: 'track', label: 'Цена направляющего профиля', unit: '₽ за штуку', group: 'profPiece' },
        { id: 'studM', label: 'Цена несущего профиля', unit: '₽ за метр', group: 'profMeter' },
        { id: 'trackM', label: 'Цена направляющего профиля', unit: '₽ за метр', group: 'profMeter' },
        { id: 'hanger', label: 'Цена подвеса', unit: '₽ за штуку', group: 'ceil' },
        { id: 'crab', label: 'Цена краба', unit: '₽ за штуку', group: 'ceil' },
        { id: 'ext', label: 'Цена удлинителя профиля', unit: '₽ за штуку', group: 'ceil' },
        { id: 'tape', label: 'Цена ленты', unit: '₽ за рулон' },
        { id: 'putty', label: 'Цена шпаклёвки', unit: '₽ за килограмм' },
      ],
      groups(v, mode, extras, sel) {
        // В «своей площади» каркаса нет — и цен профиля тоже
        const prof = mode !== 'custom';
        return { ceil: mode === 'ceiling', prof, profPiece: prof && sel.profBuy !== 'meter', profMeter: prof && sel.profBuy === 'meter' };
      },
      lens(v, mode, extras) {
        return (mode === 'wall' && pos(v.len) && pos(v.wid)) ? [v.len, v.wid, v.len, v.wid] : null;
      },
      draw(v, mode, box) {
        const V = window.CalcViz; if (!V) return false;
        if (mode === 'ceiling' && pos(v.len) && pos(v.wid)) {
          const step = (v.studStep || 600) / 1000;
          V.shape(box, [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]], [
            { from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 },
            { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 },
          ], { center: fmt(v.len * v.wid) + ' м²', title: 'Потолок', caption: 'Основные профили вдоль длинной стороны через ' + fmt(v.mainStep || 1) + ' м, поперечные через ' + fmt(step) + ' м' });
          return true;
        }
        return false;
      },
      compute(v, mode, sel, extras) {
        const layers = sel.layers === 'two' ? 2 : 1;
        const step = (v.studStep || 0) / 1000;
        if (!pos(v.sheetL) || !pos(v.sheetW)) return null;
        const sheetArea = v.sheetL / 100 * (v.sheetW / 100);

        // Площадь обшивки и каркас считаются по-разному для стен, потолка и перегородки
        let area = null, per = null, studs = null, trackLen = null, hangers = null, crabs = null, exts = null, note = '';
        const rows = [], cost = [], extra = [];

        if (mode === 'wall') {
          const R = window.CalcRoom; const lens = this.lens(v, mode, extras);
          if (!R || !extras.room || !lens || !pos(v.hei)) return null;
          const m = R.measure(extras.room, lens, v.hei, this.roomOpts.finishes, 'gkl');
          if (m.by.gkl.n === 0) return { error: 'Все стены отмечены «не обшиваем» — включите хотя бы одну на развёртке.' };
          area = m.by.gkl.area;
          const runLen = m.by.gkl.len;                    // погонные метры обшиваемых стен
          if (!pos(step)) return null;
          const studCount = m.by.gkl.walls.reduce((s, w) => s + Math.ceil(w.len / step - 1e-9) + 1, 0);
          studs = studCount * Math.ceil(v.hei / (v.profileLen || 3) - 1e-9);
          trackLen = runLen * 2;                          // по полу и по потолку
          extra.push(['Обшиваем', fmtInt(m.by.gkl.n) + ' ' + plural(m.by.gkl.n, 'стена', 'стены', 'стен') + ', ' + fmt(runLen) + ' погонных метров' + (m.openings ? ', проёмы ' + fmt(m.openings) + ' м² вычтены' : '')]);
          m.walls.forEach((w) => extra.push(['Стена ' + (w.i + 1) + ' · ' + this.roomOpts.finishes[w.finish], fmt(w.net) + ' м²' + (w.count ? ' (проёмов ' + w.count + ')' : '')]));
        } else if (mode === 'ceiling') {
          if (!pos(v.len) || !pos(v.wid) || !pos(step)) return null;
          area = v.len * v.wid; per = 2 * (v.len + v.wid);
          // Одноуровневый каркас: основные профили вдоль длинной стороны висят на подвесах,
          // поперечные между ними через шаг стоек, на каждом пересечении краб. Края лежат в направляющем.
          if (!pos(v.mainStep)) return null;
          const long = Math.max(v.len, v.wid), short = Math.min(v.len, v.wid), pl = v.profileLen || 3;
          const mains = Math.max(1, Math.ceil(short / v.mainStep - 1e-9) - 1);
          const cross = Math.max(1, Math.ceil(long / step - 1e-9) - 1);
          const perMain = Math.ceil(long / pl - 1e-9);
          studs = mains * perMain + Math.ceil(cross * short / pl - 1e-9);
          exts = mains * (perMain - 1);
          trackLen = per;                                                     // направляющий по периметру
          if (pos(v.hangerStep)) hangers = mains * Math.max(1, Math.ceil(long / v.hangerStep - 1e-9) - 1);
          crabs = mains * cross;
          extra.push(['Основные профили', fmtInt(mains) + ' ' + plural(mains, 'ряд', 'ряда', 'рядов') + ' по ' + fmt(long) + ' м через ' + fmt(v.mainStep) + ' м']);
          extra.push(['Поперечные профили', fmtInt(cross) + ' ' + plural(cross, 'ряд', 'ряда', 'рядов') + ' по ' + fmt(short) + ' м через ' + fmt(step) + ' м']);
        } else if (mode === 'partition') {
          if (!pos(v.plen) || !pos(v.phei) || !pos(step)) return null;
          const doors = Math.max(0, Math.round(v.pdoor || 0));
          if (doors && doors * (v.pdoorW || 0) > v.plen - 0.2) return { error: 'Проёмы шире перегородки: ' + fmtInt(doors) + ' × ' + fmt(v.pdoorW) + ' м не помещаются в ' + fmt(v.plen) + ' м вместе со стойками. Проверьте ширину и число проёмов.' };
          if (doors && (v.pdoorH || 0) >= v.phei) return { error: 'Проём выше перегородки — проверьте высоту проёма.' };
          const doorArea = doors * (v.pdoorW || 0) * (v.pdoorH || 0);
          const oneSide = v.plen * v.phei - doorArea;
          if (oneSide <= 0) return { error: 'Проёмы занимают всю перегородку — проверьте размеры.' };
          area = oneSide * 2;                                                 // обшивка с двух сторон
          per = 2 * (v.plen + v.phei);
          const studCount = Math.ceil(v.plen / step - 1e-9) + 1 + doors * 2;  // плюс стойки по краям проёмов
          studs = studCount * Math.ceil(v.phei / (v.profileLen || 3) - 1e-9);
          trackLen = v.plen * 2;
          extra.push(['Обшивка', fmt(oneSide) + ' м² × 2 стороны = ' + fmt(area) + ' м²' + (doorArea ? ' (проёмы ' + fmt(doorArea) + ' м² вычтены)' : '')]);
          extra.push(['Стойки', fmtInt(studCount) + ' шт: по шагу ' + fmt(step) + ' м плюс по две на каждый проём']);
          note += 'Каркас перегородки один, а обшивка с двух сторон — это уже учтено. ';
        } else {
          area = pos(v.area) ? v.area : null;
          if (!(area > 0)) return null;
          note += 'В режиме «своя площадь» каркас не считается: для профиля укажите комнату, потолок или перегородку. ';
        }
        if (!(area > 0)) return null;

        const covered = area * layers;
        const sheets = Math.ceil(covered * (1 + (v.waste || 0) / 100) / sheetArea);
        rows.push(['Площадь обшивки', fmt(area) + ' м²' + (layers > 1 ? ' × 2 слоя = ' + fmt(covered) + ' м²' : '')]);
        rows.push(['Листы ' + fmt(v.sheetL) + '×' + fmt(v.sheetW) + ' см', fmtInt(sheets) + ' шт по ' + fmt(sheetArea) + ' м² (запас ' + fmt(v.waste || 0) + '%)']);
        cost.push({ label: 'Гипсокартон', amount: sheets, unit: plural(sheets, 'лист', 'листа', 'листов'), priceId: 'sheet' });

        if (studs != null) {
          rows.push(['Несущий профиль', fmtInt(studs) + ' ' + plural(studs, 'штука', 'штуки', 'штук') + ' по ' + fmt(v.profileLen || 3) + ' м']);
          cost.push(sel.profBuy === 'meter'
            ? { label: 'Несущий профиль, ' + fmtInt(studs) + ' шт', amount: studs * (v.profileLen || 3), unit: 'м', priceId: 'studM' }
            : { label: 'Несущий профиль', amount: studs, unit: plural(studs, 'штука', 'штуки', 'штук'), priceId: 'stud' });
        }
        if (trackLen != null && pos(v.profileLen)) {
          const tracks = Math.ceil(trackLen / v.profileLen);
          rows.push(['Направляющий профиль', fmt(trackLen) + ' м → ' + fmtInt(tracks) + ' ' + plural(tracks, 'штука', 'штуки', 'штук') + ' по ' + fmt(v.profileLen) + ' м']);
          cost.push(sel.profBuy === 'meter'
            ? { label: 'Направляющий профиль, ' + fmtInt(tracks) + ' шт', amount: tracks * v.profileLen, unit: 'м', priceId: 'trackM' }
            : { label: 'Направляющий профиль', amount: tracks, unit: plural(tracks, 'штука', 'штуки', 'штук'), priceId: 'track' });
        }
        if (exts) {
          rows.push(['Удлинители профиля', fmtInt(exts) + ' шт: основной профиль длиннее ' + fmt(v.profileLen || 3) + ' м наращивают']);
          cost.push({ label: 'Удлинители', amount: exts, unit: 'шт', priceId: 'ext' });
        }
        if (hangers != null) {
          rows.push(['Подвесы', fmtInt(hangers) + ' шт с шагом ' + fmt(v.hangerStep) + ' м (' + fmt(hangers / area, 1) + ' на м²)']);
          cost.push({ label: 'Подвесы', amount: hangers, unit: 'шт', priceId: 'hanger' });
        }
        if (crabs != null) {
          rows.push(['Соединители (крабы)', fmtInt(crabs) + ' шт, по одному на пересечение основного и поперечного']);
          cost.push({ label: 'Соединители', amount: crabs, unit: 'шт', priceId: 'crab' });
        }
        if (pos(v.screwRate)) rows.push(['Саморезы по гипсокартону', fmtInt(Math.ceil(covered * v.screwRate)) + ' шт']);
        if (pos(v.tapeRate)) {
          const tapeM = area * v.tapeRate;
          const rolls = pos(v.tapeRoll) ? Math.ceil(tapeM / v.tapeRoll) : null;
          rows.push(['Лента для швов', fmt(tapeM) + ' м' + (rolls != null ? ' → ' + fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов') : '')]);
          if (rolls != null) cost.push({ label: 'Лента', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'tape' });
        }
        if (pos(v.puttyRate)) {
          const kg = area * v.puttyRate;
          rows.push(['Шпаклёвка для швов', fmt(kg) + ' кг']);
          cost.push({ label: 'Шпаклёвка', amount: Math.ceil(kg), unit: 'кг', priceId: 'putty' });
        }
        if (pos(v.primerRate)) rows.push(['Грунтовка', fmt(area * v.primerRate) + ' л']);
        extra.forEach((r) => rows.push(r));
        const tall = mode === 'wall' ? v.hei : mode === 'partition' ? v.phei : 0;
        if (pos(v.profileLen) && tall > v.profileLen && tall <= 4) rows.push(['Длина профиля', 'стена ' + fmt(tall) + ' м выше профиля ' + fmt(v.profileLen) + ' м — каждую стойку пришлось бы наращивать, поэтому их посчитано вдвое. Есть профиль 4 м: поставьте 4 в поле «Длина профиля»']);

        note += 'Саморезы, лента и шпаклёвка считаются по нормам расхода — их можно поменять под систему вашего производителя. ';
        note += 'Под плитку и в местах, где будет висеть тяжёлое, шаг профиля уменьшают до 400 мм и ставят закладные.';

        return { main: { label: 'Нужно материалов', value: fmtInt(sheets) + ' ' + plural(sheets, 'лист', 'листа', 'листов') + (studs != null ? ' · ' + fmtInt(studs) + ' ' + plural(studs, 'профиль', 'профиля', 'профилей') : '') }, rows, note, cost };
      },
    },

    /* --- Тёплый пол: длина трубы и число контуров или мощность кабеля --- */
    warmfloor: {
      modeLabel: 'Форма помещения',
      modes: [
        { id: 'rect', label: 'Прямоугольная комната', fields: [
          { id: 'len', label: 'Длина комнаты', unit: 'м', value: '5' },
          { id: 'wid', label: 'Ширина комнаты', unit: 'м', value: '4' },
        ] },
        { id: 'plan', label: 'Свой план (ниши, выступы)', plan: { simple: true, presetsKey: 'ROOM_PRESETS' }, fields: [] },
        { id: 'custom', label: 'Своя площадь', fields: [
          { id: 'area', label: 'Площадь пола', unit: 'м²', value: '20' },
        ] },
      ],
      common: [
        { id: 'edge', label: 'Отступ от стен', unit: 'м', value: '0.1' },
        { id: 'skip', label: 'Не греем под мебелью и сантехникой', unit: 'м²', value: '0' },
        { id: 'step', label: 'Шаг укладки трубы', unit: 'мм', value: '150', group: 'water' },
        { id: 'loopMax', label: 'Максимальная длина контура', unit: 'м', value: '100', group: 'water' },
        { id: 'supply', label: 'Подводка до коллектора', unit: 'м в одну сторону', value: '5', group: 'water' },
        { id: 'coil', label: 'Труба в бухте', unit: 'м', value: '200', group: 'water' },
        { id: 'clips', label: 'Клипсы крепления', unit: 'шт на 1 м трубы', value: '2', group: 'water' },
        { id: 'power', label: 'Нужная мощность', unit: 'Вт/м²', value: '150', group: 'el' },
        { id: 'cableW', label: 'Мощность кабеля', unit: 'Вт на 1 м', value: '20', group: 'cable' },
        { id: 'matW', label: 'Мощность мата', unit: 'Вт/м²', value: '150', group: 'mat' },
        { id: 'volt', label: 'Напряжение сети', unit: 'В', value: '220', group: 'el' },
        { id: 'damperRoll', label: 'Демпферная лента в рулоне', unit: 'м, 0 = не считать', value: '50', group: 'damperField' },
      ],
      selects: [
        { id: 'type', label: 'Тип пола', default: 'water', choices: [
          { id: 'water', label: 'Водяной', hint: 'труба в стяжке, длина и число контуров' },
          { id: 'cable', label: 'Электрический кабель', hint: 'секция кабеля в стяжку, шаг укладки' },
          { id: 'mat', label: 'Электрический мат', hint: 'под плитку в слой клея, считаем квадратные метры' },
        ] },
        { id: 'layout', label: 'Схема укладки трубы', default: 'snail', group: 'water', choices: [
          { id: 'snail', label: 'Улитка', hint: 'подача и обратка рядом, пол греет равномернее' },
          { id: 'snake', label: 'Змейка', hint: 'проще уложить, но у дальней стены прохладнее' },
        ] },
        { id: 'pipeBuy', label: 'Трубу продают', default: 'meter', group: 'water', choices: [
          { id: 'meter', label: 'За метр', hint: 'цена погонного метра' },
          { id: 'coil', label: 'За бухту', hint: 'бухтами целиком: число бухт — по целым контурам' },
        ] },
      ],
      presets: [
        { label: 'Шаг укладки', fieldId: 'step', unit: 'мм', group: 'water', items: [['Основное отопление', '100'], ['Комфорт', '150'], ['Дополнительный обогрев', '200'], ['Экономный', '300']] },
        { label: 'Мощность', fieldId: 'power', unit: 'Вт/м²', group: 'el', items: [['Комфортный подогрев', '130'], ['Основной обогрев', '180'], ['Балкон, лоджия', '200']] },
      ],
      prices: [
        { id: 'pipe', label: 'Цена трубы', unit: '₽ за метр', group: 'pipeM' },
        { id: 'coilP', label: 'Цена бухты трубы', unit: '₽ за бухту', group: 'pipeCoil' },
        { id: 'clip', label: 'Цена клипсы', unit: '₽ за штуку', group: 'water' },
        { id: 'cable', label: 'Цена кабеля', unit: '₽ за метр', group: 'cable' },
        { id: 'mat', label: 'Цена мата', unit: '₽ за м²', group: 'mat' },
        { id: 'collector', label: 'Цена коллектора', unit: '₽ за штуку в сборе, на нужное число выходов', group: 'water' },
        { id: 'thermo', label: 'Цена терморегулятора', unit: '₽ за штуку', group: 'el' },
        { id: 'insul', label: 'Цена теплоизоляции', unit: '₽ за м²' },
        { id: 'damper', label: 'Цена демпферной ленты', unit: '₽ за рулон', group: 'damper' },
      ],
      // Ориентир теплоотдачи водяного пола под плиткой при подаче 40–45 °C
      HEAT: [[100, 90], [150, 75], [200, 60], [250, 50], [300, 45]],
      groups(v, mode, extras, sel) {
        const w = sel.type === 'water';
        const dmp = mode !== 'custom';   // в «своей площади» периметра нет — ленту не считаем
        return { damperField: dmp, damper: dmp && pos(v.damperRoll), water: w, el: !w, cable: sel.type === 'cable', mat: sel.type === 'mat', pipeM: w && sel.pipeBuy !== 'coil', pipeCoil: w && sel.pipeBuy === 'coil' };
      },
      shape(v, mode, extras) {
        if (mode === 'rect') return (pos(v.len) && pos(v.wid)) ? { area: v.len * v.wid, per: 2 * (v.len + v.wid), minDim: Math.min(v.len, v.wid), pts: [[0, 0], [v.len, 0], [v.len, v.wid], [0, v.wid]] } : null;
        if (mode === 'custom') return pos(v.area) ? { area: v.area, per: null, pts: null } : null;
        const P = window.CalcPlan; if (!P || !extras.plan) return null;
        const g = P.geometry(extras.plan, { w: 1, depth: 1, above: 0 });
        if (!g.valid) return null;
        const xs = g.verts.map((p) => p[0]), ys = g.verts.map((p) => p[1]);
        return { area: g.outerArea, per: g.perimeter, pts: g.verts,
          minDim: Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) };
      },
      // Полезная площадь: минус рамка вдоль стен и минус то, что не греем.
      // Для прямоугольника area − периметр×отступ + 4×отступ² — это ровно (L−2e)(W−2e).
      // Если отступ съедает комнату целиком, площадь обогрева нулевая, а не отрицательная.
      // Терморегулятор: один на комнату, а если ток больше 16 А — по одному на каждую зону
      thermo(v, watts, rows, cost, sensor) {
        const zones = pos(v.volt) ? Math.max(1, Math.ceil(watts / v.volt / 16)) : 1;
        rows.push(['Терморегулятор', fmtInt(zones) + ' шт' + (zones > 1 ? ', по одному на зону' : ' на комнату') + ', ' + sensor]);
        cost.push({ label: 'Терморегулятор', amount: zones, unit: 'шт', priceId: 'thermo' });
      },
      heated(v, sh) {
        if (!sh) return null;
        const e = v.edge || 0;
        let inset = sh.area;
        if (sh.per && e > 0) {
          inset = (sh.minDim && 2 * e >= sh.minDim) ? 0 : Math.max(0, sh.area - sh.per * e + 4 * e * e);
        }
        return Math.max(0, inset - (v.skip || 0));
      },
      draw(v, mode, box, view, extras) {
        const V = window.CalcViz; const sh = this.shape(v, mode, extras);
        if (!V || !sh || !sh.pts) return false;
        const dims = mode === 'rect'
          ? [{ from: [0, 0], to: [v.len, 0], label: fmt(v.len) + ' м', offset: 22 }, { from: [v.len, 0], to: [v.len, v.wid], label: fmt(v.wid) + ' м', offset: 22 }]
          : sh.pts.map((a, i) => { const b = sh.pts[(i + 1) % sh.pts.length]; return { from: a, to: b, label: fmt(Math.hypot(b[0] - a[0], b[1] - a[1])) + ' м', offset: 20 }; });
        const H = this.heated(v, sh);
        V.shape(box, sh.pts, dims, { center: fmt(H) + ' м²', title: 'Обогрев',
          caption: 'Пол ' + fmt(sh.area) + ' м², греем ' + fmt(H) + ' м² (отступ от стен ' + fmt(v.edge || 0) + ' м)' });
        return true;
      },
      compute(v, mode, sel, extras) {
        const sh = this.shape(v, mode, extras);
        if (mode === 'plan' && !sh && extras.plan) return { error: 'Контур помещения пересекает сам себя — поправьте углы на плане.' };
        if (!sh) return null;
        const H = this.heated(v, sh);
        if (!(H > 0)) return { error: 'После отступа от стен и вычета мебели греть нечего — уменьшите отступ или площадь под мебелью.' };

        // Отступ от стен можно посчитать только по контуру: в режиме «своя площадь» его нет
        const cut = [];
        if (sh.per && v.edge) cut.push('отступ от стен ' + fmt(v.edge) + ' м');
        if (v.skip) cut.push('минус ' + fmt(v.skip) + ' м² под мебелью');
        if (!sh.per && v.edge) cut.push('отступ от стен не учтён: в режиме «своя площадь» контура нет');
        const rows = [['Площадь пола', fmt(sh.area) + ' м²'],
          ['Площадь обогрева', fmt(H) + ' м²' + (cut.length ? ' (' + cut.join(', ') + ')' : '')]];
        const cost = []; let main;

        if (sel.type === 'water') {
          const step = (v.step || 0) / 1000;
          if (!pos(step)) return null;
          const supply = (v.supply || 0) * 2;   // до коллектора и обратно, на каждый контур
          const field = H / step;               // труба в самом полу, без подводки
          // Подводка идёт к каждому контуру, поэтому число контуров подбираем с ней заодно
          let loops = 1;
          if (pos(v.loopMax)) {
            if (supply >= v.loopMax) return { error: 'Подводка до коллектора длиннее предела контура — коллектор стоит слишком далеко.' };
            while (field / loops + supply > v.loopMax && loops < 40) loops++;
          }
          const pipe = field + supply * loops;
          const perLoop = pipe / loops;
          if (pos(v.loopMax) && perLoop > v.loopMax) return { error: 'Не получается уложиться в длину контура — увеличьте шаг укладки или поставьте коллектор ближе.' };
          // Контур кладут одним куском — сращивать трубу в стяжке нельзя, поэтому бухты считаем
          // по целым контурам: сколько контуров влезает в одну бухту, а не метры ÷ длина бухты
          const perCoil = pos(v.coil) ? Math.floor(v.coil / Math.ceil(perLoop)) : 0;
          const coils = perCoil > 0 ? Math.ceil(loops / perCoil) : null;
          const heat = this.HEAT.reduce((best, [s, w]) => Math.abs(s - v.step) < Math.abs(best[0] - v.step) ? [s, w] : best, this.HEAT[0])[1];
          main = fmtInt(pipe) + ' м трубы · ' + fmtInt(loops) + ' ' + plural(loops, 'контур', 'контура', 'контуров');
          rows.push(['Длина трубы', fmt(H) + ' м² ÷ ' + fmt(step) + ' м = ' + fmtInt(field) + ' м в полу + подводка ' + fmtInt(supply * loops) + ' м = ' + fmtInt(pipe) + ' м']);
          rows.push(['Контуров', fmtInt(loops) + ' по ' + fmtInt(perLoop) + ' м (предел ' + fmt(v.loopMax) + ' м)']);
          rows.push(['Коллектор', 'на ' + fmtInt(loops) + ' ' + plural(loops, 'выход', 'выхода', 'выходов')]);
          if (coils != null) rows.push(['Бухты по ' + fmt(v.coil) + ' м', fmtInt(coils) + ' шт' + (loops > 1 ? ' (из одной бухты ' + fmtInt(perCoil) + ' ' + plural(perCoil, 'контур', 'контура', 'контуров') + ' целиком, без сращивания)' : '')]);
          else if (pos(v.coil)) rows.push(['⚠ Бухта', 'контур ' + fmtInt(perLoop) + ' м длиннее бухты ' + fmt(v.coil) + ' м: возьмите бухту длиннее — трубу в стяжке не сращивают']);
          if (pos(v.clips)) rows.push(['Клипсы крепления', fmtInt(Math.ceil(pipe * v.clips)) + ' шт']);
          rows.push(['Ориентир теплоотдачи', '≈ ' + heat + ' Вт/м², всего ≈ ' + fmtInt(H * heat) + ' Вт']);
          // За бухту — только когда контур в неё влезает; иначе выше предупреждение взять бухту длиннее
          if (sel.pipeBuy === 'coil') { if (coils != null) cost.push({ label: 'Труба, бухты по ' + fmt(v.coil) + ' м', amount: coils, unit: 'шт', priceId: 'coilP' }); }
          else cost.push({ label: 'Труба', amount: Math.ceil(pipe), unit: 'м', priceId: 'pipe' });
          if (pos(v.clips)) cost.push({ label: 'Клипсы', amount: Math.ceil(pipe * v.clips), unit: 'шт', priceId: 'clip' });
          cost.push({ label: 'Коллектор на ' + fmtInt(loops) + ' ' + plural(loops, 'выход', 'выхода', 'выходов'), amount: 1, unit: 'шт', priceId: 'collector' });
        } else if (sel.type === 'cable') {
          if (!pos(v.power) || !pos(v.cableW)) return null;
          const watts = H * v.power;
          const cable = watts / v.cableW;
          const step = H / cable * 1000;
          main = fmtInt(cable) + ' м кабеля · ' + fmtInt(watts) + ' Вт';
          rows.push(['Мощность', fmt(v.power) + ' Вт/м² × ' + fmt(H) + ' м² = ' + fmtInt(watts) + ' Вт (' + fmt(watts / 1000) + ' кВт)']);
          rows.push(['Длина кабеля', fmtInt(watts) + ' Вт ÷ ' + fmt(v.cableW) + ' Вт/м = ' + fmtInt(cable) + ' м']);
          rows.push(['Шаг укладки', '≈ ' + fmtInt(step) + ' мм']);
          if (pos(v.volt)) rows.push(['Ток', '≈ ' + fmt(watts / v.volt) + ' А при ' + fmt(v.volt) + ' В']);
          if (pos(v.volt) && watts / v.volt > 16) rows.push(['⚠ Больше 16 А', 'на одну линию с автоматом 16 А и один терморегулятор столько не вешают: разделите пол на зоны до 16 А, у каждой свой регулятор']);
          cost.push({ label: 'Кабель', amount: Math.ceil(cable), unit: 'м', priceId: 'cable' });
          this.thermo(v, watts, rows, cost, 'датчик в гофре между витками кабеля');
          if (step < 80) rows.push(['⚠ Проверьте', 'шаг меньше 80 мм — возьмите кабель мощнее']);
        } else {
          if (!pos(v.matW)) return null;
          const watts = H * v.matW;
          main = fmt(H) + ' м² мата · ' + fmtInt(watts) + ' Вт';
          rows.push(['Мат', fmt(H) + ' м² по ' + fmt(v.matW) + ' Вт/м²']);
          rows.push(['Мощность', fmtInt(watts) + ' Вт (' + fmt(watts / 1000) + ' кВт)']);
          if (pos(v.volt)) rows.push(['Ток', '≈ ' + fmt(watts / v.volt) + ' А при ' + fmt(v.volt) + ' В']);
          if (pos(v.volt) && watts / v.volt > 16) rows.push(['⚠ Больше 16 А', 'на одну линию с автоматом 16 А и один терморегулятор столько не вешают: разделите пол на зоны до 16 А, у каждой свой регулятор']);
          cost.push({ label: 'Мат', amount: H, unit: 'м²', priceId: 'mat' });
          this.thermo(v, watts, rows, cost, 'датчик в гофре между витками мата');
        }

        cost.push({ label: 'Теплоизоляция', amount: Math.ceil(sh.area), unit: 'м²', priceId: 'insul' });
        rows.push(['Теплоизоляция под пол', fmt(sh.area) + ' м²']);
        if (sh.per && pos(v.damperRoll)) {
          const rolls = Math.ceil(sh.per / v.damperRoll);
          rows.push(['Демпферная лента', fmt(sh.per) + ' м по периметру → ' + fmtInt(rolls) + ' ' + plural(rolls, 'рулон', 'рулона', 'рулонов')]);
          cost.push({ label: 'Демпферная лента', amount: rolls, unit: plural(rolls, 'рулон', 'рулона', 'рулонов'), priceId: 'damper' });
        }

        let note = '';
        if (sel.type === 'water') {
          note += sel.layout === 'snail'
            ? 'Улитка: труба идёт к центру и обратно, горячая подача чередуется с обраткой, поэтому пол греет ровнее. '
            : 'Змейка: проще укладывать, но к дальней стене вода приходит остывшей. Её обычно пускают вдоль холодной стены. ';
          note += 'Контуры делают примерно одинаковой длины: иначе короткий заберёт весь поток, а длинный останется холодным. ';
          note += 'Теплоотдача — ориентир для плитки при подаче 40–45 °C; под ламинатом и ковром она заметно ниже.';
        } else {
          note += 'Электрический пол нельзя укладывать под мебель без ножек: кабель перегреется. Терморегулятору нужна отдельная линия, а во влажных комнатах — УЗО.';
        }
        return { main: { label: 'Нужно на тёплый пол', value: main }, rows, note, cost };
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
    const state = { mode: def.modes[0].id, sel: {}, values: {}, prices: {}, extras: { openings: [] }, yaw: -0.6, pitch: 32 * Math.PI / 180, zoom: 1 };
    (def.selects || []).forEach((s) => { state.sel[s.id] = s.default; });
    const storageKey = (id) => 'kn_calc_price_' + key + '_' + id;
    (def.prices || []).forEach((p) => {
      try {
        let val = localStorage.getItem(storageKey(p.id)) || '';
        // Цена переехала в новое поле (общую цену разделили по материалам) — забираем её один раз
        if (!val && p.from) { val = localStorage.getItem(storageKey(p.from)) || ''; if (val) { localStorage.setItem(storageKey(p.id), val); localStorage.removeItem(storageKey(p.from)); } }
        state.prices[p.id] = val;
      } catch (e) { state.prices[p.id] = ''; }
    });

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
      // Отрицательное там, где оно не имеет смысла, и астрономические числа не берём в расчёт, а подсвечиваем;
      // штуки (столбы, проёмы, ряды) округляем до целых
      const bad = [];
      mode.fields.concat(def.common || []).forEach((f) => {
        let x = parseNum(state.values[f.id]);
        const wrong = x != null && (Math.abs(x) > 1e9 || (x < 0 && !(f.signed || def.signed)));
        if (wrong) { x = null; bad.push(f.label); } else if (x != null && f.int) x = Math.round(x);
        v[f.id] = x;
        const inp = fieldsBox.querySelector('[name="' + f.id + '"]');
        if (inp) { inp.closest('.calc-field').classList.toggle('calc-field--bad', wrong); inp.setAttribute('aria-invalid', wrong ? 'true' : 'false'); }
      });
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
      def._sel = state.sel;
      drawViz();
      let r = def.compute(v, state.mode, state.sel, extras);
      if (!r && bad.length) r = { error: bad.map((l) => '«' + l + '»').join(', ') + ': ' + (bad.length > 1 ? 'нужны положительные числа' : 'нужно положительное число') + ' — исправьте, и результат появится.' };
      if (r && !r.error && bad.length) r.rows.unshift(['⚠ Не учтено', bad.map((l) => '«' + l + '»').join(', ') + ': ' + (bad.length > 1 ? 'нужны положительные числа' : 'нужно положительное число')]);
      result.innerHTML = '';
      costBox.hidden = !r || !!r.error || !(def.prices && def.prices.length);
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
        if (window.ymGoal) window.ymGoal('calc_share', { how: 'share' });
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
      copy.addEventListener('click', () => { if (window.ymGoal) window.ymGoal('calc_share', { how: 'copy' }); navigator.clipboard.writeText(shareText()).then(() => flash(copy, 'Скопировано ✓')); });
      const link = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Ссылка на расчёт' });
      link.addEventListener('click', () => { if (window.ymGoal) window.ymGoal('calc_share', { how: 'link' }); navigator.clipboard.writeText(shareUrl()).then(() => flash(link, 'Ссылка скопирована ✓')); });
      const pdf = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Скачать PDF' });
      pdf.addEventListener('click', () => { if (window.ymGoal) window.ymGoal('calc_share', { how: 'pdf' }); result.dataset.printDate = new Date().toLocaleDateString('ru-RU'); window.print(); });
      actions.appendChild(share); actions.appendChild(copy); actions.appendChild(link); actions.appendChild(pdf);
      // Первый готовый расчёт — мягко подсвечиваем, что делать дальше
      if (!render.hadResult) {
        render.hadResult = true;
        share.classList.add('is-fresh');
        setTimeout(() => share.classList.remove('is-fresh'), 7000);
        if (window.ymGoal) window.ymGoal('calc_result', { calc: key || 'unknown' });
      }
      if (!vizBox.hidden && vizBox.querySelector('svg')) {
        const png = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Схема PNG' });
        png.addEventListener('click', () => svgToPng(vizBox.querySelector('svg'), (key || 'scheme') + '-schema.png').catch(() => flash(png, 'Не удалось')));
        actions.appendChild(png);
      }
      result.appendChild(actions);
      syncHash();
      // --- Приложение: здесь, когда польза уже получена ---
      result.appendChild(h('div', { class: 'app-cta app-cta--result' }, [
        h('img', { src: '/assets/images/chatyadro-icon-128.webp', width: '64', height: '64', alt: 'ЧатЯдро', class: 'app-cta-icon', loading: 'lazy' }),
        h('div', { class: 'app-cta-body' }, [
          h('p', { class: 'app-cta-title', text: 'Этот расчёт — в приложении ЧатЯдро' }),
          h('p', { class: 'app-cta-text', text: 'Сохраняется, помнит ваши цены и уходит соседям или мастеру в чат одной кнопкой.' }),
          h('a', { href: 'https://www.rustore.ru/catalog/app/ru.sntchat.app', target: '_blank', rel: 'noopener', class: 'btn btn-primary btn-sm', text: 'Установить из RuStore →' }),
        ]),
      ]));
      renderCost(r);
      if (render.after) render.after();
    }

    let lastViz = null;
    function drawViz() {
      if (!def.draw || !lastViz) { vizBox.hidden = true; return; }
      const ok = def.draw(lastViz.v, state.mode, vizBox, { yaw: state.yaw, pitch: state.pitch, zoom: state.zoom }, lastViz.extras);
      vizBox.hidden = !ok;
      if (ok && !vizBox.querySelector('svg')) vizBox.hidden = true;
    }
    if (window.CalcViz) window.CalcViz.rotatable(vizBox, () => ({ yaw: state.yaw, pitch: state.pitch, zoom: state.zoom }), (view) => { state.yaw = view.yaw; state.pitch = view.pitch; state.zoom = view.zoom; drawViz(); syncHash(); });

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
      const obj = { c: key, m: state.mode, v: state.values, s: state.sel, y: Math.round(state.yaw * 100) / 100, p: Math.round(state.pitch * 100) / 100, z: Math.round(state.zoom * 100) / 100,
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
      if (obj.s && typeof obj.s === 'object') Object.keys(obj.s).forEach((k2) => {
        const sd = (def.selects || []).find((x) => x.id === k2);
        if (sd && sd.choices.some((x) => x.id === obj.s[k2])) state.sel[k2] = obj.s[k2];
      });
      if (typeof obj.y === 'number') state.yaw = obj.y;
      if (typeof obj.p === 'number') state.pitch = obj.p;
      if (typeof obj.z === 'number') state.zoom = obj.z;
      if (obj.x) { if (obj.x.plan) state.extras.plan = obj.x.plan; if (obj.x.room) state.extras.room = obj.x.room; if (Array.isArray(obj.x.openings)) state.extras.openings = obj.x.openings; }
      return true;
    })();

    // Режим или вариант с sets: {поле: значение} подставляет свои значения при переключении,
    // иначе поле с тем же id тащит число из прошлого режима (клей 25 кг в кирпич и т.п.).
    // sets функцией — когда подстановка зависит от того, что уже введено.
    const applySets = (o) => {
      const sets = o && o.sets && (typeof o.sets === 'function' ? o.sets(state.values) : o.sets);
      if (sets) Object.keys(sets).forEach((f) => { state.values[f] = sets[f]; });
      return sets || {};
    };
    form.appendChild(chips(key + '-mode', def.modeLabel, def.modes, state.mode, (id) => { state.mode = id; applySets(def.modes.find((md) => md.id === id)); renderFields(); render(); }));
    (def.selects || []).forEach((s) => {
      const hint = h('p', { class: 'calc-hint', 'data-group': s.group || '' });
      const update = () => { const c = s.choices.find((x) => x.id === state.sel[s.id]); hint.textContent = c.hint ? c.label + ' — ' + c.hint : c.label; };
      const box = chips(key + '-' + s.id, s.label, s.choices, state.sel[s.id], (id) => {
        state.sel[s.id] = id;
        const c = s.choices.find((x) => x.id === id);
        const sets = applySets(c);
        Object.keys(sets).forEach((f) => { const input = fieldsBox.querySelector('[name="' + f + '"]'); if (input) input.value = sets[f]; });
        update(); render();
      });
      box.dataset.group = s.group || '';
      selectsBox.appendChild(box);
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
      root.parentNode.insertBefore(h('p', { class: 'calc-topline', html: '<img src="/assets/images/chatyadro-icon-64.webp" width="22" height="22" alt="" class="calc-topline-icon"><span>Тот же калькулятор есть в приложении <a href="/projects/chatyadro/">ЧатЯдро</a>: там расчёт сохраняется и уходит соседям в чат. ' + (restored ? '<strong>Открыт расчёт по ссылке.</strong>' : '') + '</span>' }), root);
    }
    root.appendChild(form);
    renderFields();
    render();
  }

  document.querySelectorAll('.calc[data-calc]').forEach(mount);
})();
