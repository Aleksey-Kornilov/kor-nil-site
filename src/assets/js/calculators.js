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
          { id: 'sLen', label: 'Длина ленты (по всему периметру)', unit: 'м' },
          { id: 'sWid', label: 'Ширина ленты', unit: 'см' },
          { id: 'sDepth', label: 'Глубина заложения (в земле)', unit: 'см' },
          { id: 'sAbove', label: 'Высота над землёй (цоколь)', unit: 'см, необязательно' },
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
      compute(v, mode, sel) {
        let volume = null;
        if (mode === 'slab') {
          const l = v.len, w = v.wid, t = v.thick;
          if (pos(l) && pos(w) && pos(t)) volume = l * w * (t / 100);
        } else if (mode === 'strip') {
          // Полная высота ленты = часть в земле + часть над землёй (цоколь).
          const l = v.sLen, w = v.sWid, h = (v.sDepth || 0) + (v.sAbove || 0);
          if (pos(l) && pos(w) && pos(v.sDepth)) volume = l * (w / 100) * (h / 100);
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
          { id: 'open', label: 'Окна и двери (вычесть)', unit: 'м², необязательно' },
        ] },
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
      compute(v, mode) {
        let area = null;
        if (mode === 'walls') {
          if (pos(v.len) && pos(v.wid) && pos(v.hei)) {
            const a = 2 * (v.len + v.wid) * v.hei - (v.open || 0);
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
    const state = { mode: def.modes[0].id, sel: {}, values: {}, prices: {} };
    (def.selects || []).forEach((s) => { state.sel[s.id] = s.default; });
    const storageKey = (id) => 'kn_calc_price_' + key + '_' + id;
    (def.prices || []).forEach((p) => { try { state.prices[p.id] = localStorage.getItem(storageKey(p.id)) || ''; } catch (e) { state.prices[p.id] = ''; } });

    const form = h('form', { class: 'calc-form', novalidate: '' });
    form.addEventListener('submit', (e) => e.preventDefault());
    const fieldsBox = h('div', { class: 'calc-fields' });
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

    function renderFields() {
      fieldsBox.innerHTML = '';
      const mode = def.modes.find((m) => m.id === state.mode);
      mode.fields.forEach((f) => fieldsBox.appendChild(field(f)));
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
      const r = def.compute(v, state.mode, state.sel);
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
    form.appendChild(presetsBox);
    form.appendChild(result);
    form.appendChild(costBox);
    root.innerHTML = '';
    root.appendChild(form);
    renderFields();
    render();
  }

  document.querySelectorAll('.calc[data-calc]').forEach(mount);
})();
