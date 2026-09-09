// calc-plan.js — редактор плана ленточного фундамента произвольной формы.
// Контур — замкнутый многоугольник в метрах (против часовой стрелки). У каждой стороны
// своя ширина ленты и глубина (по умолчанию общие). Внутренние ленты — отрезки.
// Геометрия: внутренний контур строится смещением каждой стороны внутрь на её ширину
// и пересечением соседних линий; объём стороны = площадь четырёхугольника между
// наружной и внутренней линией × высота этой стороны. Углы не считаются дважды.
// Отдаёт window.CalcPlan: { geometry, editor, prisms }.

(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  const fmt = (v, d) => { const s = (Math.round(v * 100) / 100).toFixed(d == null ? 2 : d).replace(/\.?0+$/, ''); return s.replace('.', ','); };
  const snap = (v) => Math.round(v * 10) / 10;

  /* ---------- Геометрия ---------- */
  function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
  function ensureCCW(p) { return signedArea(p) < 0 ? p.slice().reverse() : p; }
  function intersect(p, d, q, e) {
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  }
  // Внутренний контур: сторона i смещается внутрь (влево от направления обхода) на widths[i].
  function innerPolygon(verts, widths) {
    const n = verts.length, lines = [];
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len; // влево = внутрь для CCW
      lines.push({ p: [a[0] + nx * widths[i], a[1] + ny * widths[i]], d: [dx, dy] });
    }
    const inner = [];
    for (let i = 0; i < n; i++) {
      const prev = lines[(i - 1 + n) % n], cur = lines[i];
      const x = intersect(prev.p, prev.d, cur.p, cur.d);
      inner.push(x || cur.p);
    }
    return inner;
  }
  // Полный расчёт: контур, ширины/глубины по сторонам, внутренние ленты.
  function geometry(plan, def) {
    const verts = ensureCCW(plan.verts);
    const n = verts.length;
    const widths = verts.map((_, i) => ((plan.edges[i] && plan.edges[i].w) || def.w) / 100);
    const depths = verts.map((_, i) => ((plan.edges[i] && plan.edges[i].depth) || def.depth) / 100);
    const above = (def.above || 0) / 100;
    const inner = innerPolygon(verts, widths);
    let volume = 0, footprint = 0, perimeter = 0;
    const edges = [];
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % n], ia = inner[i], ib = inner[(i + 1) % n];
      const quad = [a, b, ib, ia];
      const area = Math.abs(signedArea(quad));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const h = depths[i] + above;
      volume += area * h; footprint += area; perimeter += len;
      edges.push({ a, b, ia, ib, len, w: widths[i], depth: depths[i], h, area });
    }
    const inners = (plan.inner || []).map((t) => {
      const w = def.w / 100, h = def.depth / 100 + above;
      const len = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]);
      volume += len * w * h; footprint += len * w;
      return { a: t.a, b: t.b, len, w, h };
    });
    const outerArea = Math.abs(signedArea(verts));
    return { verts, inner, edges, inners, volume, footprint, perimeter, outerArea, above, valid: n >= 3 && outerArea > 0.01 && !selfIntersects(verts) };
  }
  function selfIntersects(p) {
    const n = p.length;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const segX = (a, b, c, d) => (cross(a, b, c) * cross(a, b, d) < 0) && (cross(c, d, a) * cross(c, d, b) < 0);
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true; }
    return false;
  }

  // Призмы для объёмного рисунка: каждая сторона — четырёхугольник, подземная часть и цоколь отдельно.
  function prisms(g) {
    const out = [];
    const push = (poly, z, dz) => { if (dz > 0) out.push({ poly, z, dz }); };
    g.edges.forEach((e) => {
      const quad = [e.a, e.b, e.ib, e.ia];
      push(quad, -e.depth, e.depth);
      push(quad, 0, g.above);
    });
    g.inners.forEach((t) => {
      const dx = t.b[0] - t.a[0], dy = t.b[1] - t.a[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * t.w / 2, ny = dx / len * t.w / 2;
      const quad = [[t.a[0] + nx, t.a[1] + ny], [t.b[0] + nx, t.b[1] + ny], [t.b[0] - nx, t.b[1] - ny], [t.a[0] - nx, t.a[1] - ny]];
      push(quad, -(t.h - g.above), t.h - g.above);
      push(quad, 0, g.above);
    });
    return out;
  }

  /* ---------- Заготовки ---------- */
  const PRESETS = {
    rect: { label: 'Прямоугольник', make: () => [[0, 0], [6, 0], [6, 4], [0, 4]] },
    L: { label: 'Г-образный', make: () => [[0, 0], [8, 0], [8, 3], [4, 3], [4, 6], [0, 6]] },
    T: { label: 'Т-образный', make: () => [[0, 0], [8, 0], [8, 3], [5.5, 3], [5.5, 6], [2.5, 6], [2.5, 3], [0, 3]] },
    U: { label: 'П-образный', make: () => [[0, 0], [8, 0], [8, 6], [5.5, 6], [5.5, 3], [2.5, 3], [2.5, 6], [0, 6]] },
    pent: { label: 'Пятиугольник', make: () => regular(5, 3) },
    hex: { label: 'Шестиугольник', make: () => regular(6, 3) },
    circle: { label: 'Круг (беседка)', make: (d) => regular(24, (d || 4) / 2), circle: true },
  };
  // Заготовки для комнаты: ниша и выступ
  const ROOM_PRESETS = {
    rect: { label: 'Прямоугольник', make: () => [[0, 0], [5, 0], [5, 4], [0, 4]] },
    niche: { label: 'С нишей', make: () => [[0, 0], [5, 0], [5, 4], [3.5, 4], [3.5, 3], [1.5, 3], [1.5, 4], [0, 4]] },
    bay: { label: 'С выступом', make: () => [[0, 0], [5, 0], [5, 4], [3.5, 4], [3.5, 5], [1.5, 5], [1.5, 4], [0, 4]] },
    L: { label: 'Г-образная', make: () => [[0, 0], [6, 0], [6, 2.5], [3, 2.5], [3, 5], [0, 5]] },
    corridor: { label: 'Коридор', make: () => [[0, 0], [8, 0], [8, 1.5], [0, 1.5]] },
  };
  // Заготовки участка (сотки): 6 соток 20×30, Г-образный, пятиугольник, трапеция
  const PLOT_PRESETS = {
    rect: { label: 'Прямоугольник 20×30', make: () => [[0, 0], [20, 0], [20, 30], [0, 30]] },
    square: { label: 'Квадрат 25×25', make: () => [[0, 0], [25, 0], [25, 25], [0, 25]] },
    L: { label: 'Г-образный', make: () => [[0, 0], [30, 0], [30, 15], [15, 15], [15, 30], [0, 30]] },
    trap: { label: 'Трапеция', make: () => [[0, 0], [24, 0], [20, 30], [4, 30]] },
    pent: { label: 'Пятиугольник', make: () => [[0, 0], [22, 0], [26, 18], [11, 32], [-4, 18]] },
  };
  function regular(n, r) { const p = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; p.push([snap(r + r * Math.cos(a)), snap(r + r * Math.sin(a))]); } return p; }

  /* ---------- Редактор ---------- */
  // container — куда рисовать; plan — состояние {verts, edges, inner, preset, diameter}; onChange() — пересчёт.
  function editor(container, plan, getDefaults, onChange, opts) {
    opts = opts || {};
    const simple = !!opts.simple; // только контур: без ширины/глубины и внутренних лент (комната, фасад)
    const presets = opts.presets || PRESETS;
    const VW = 640, VH = simple ? 380 : 420, PAD = 36;
    let sel = null; // { type: 'edge', i } | { type: 'vertex', i }
    let drag = null; let tf = null;

    const wrap = document.createElement('div'); wrap.className = 'plan';
    const bar = document.createElement('div'); bar.className = 'calc-presets';
    const lbl = document.createElement('span'); lbl.className = 'calc-presets-label'; lbl.textContent = 'Заготовка:'; bar.appendChild(lbl);
    Object.keys(presets).forEach((k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'calc-preset'; b.textContent = presets[k].label;
      b.addEventListener('click', () => { plan.verts = presets[k].make(plan.diameter); plan.edges = []; plan.inner = []; plan.preset = k; sel = null; redraw(); onChange(); });
      bar.appendChild(b);
    });
    const svg = el('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'viz-svg plan-svg', role: 'img', 'aria-label': 'План фундамента' });
    const panel = document.createElement('div'); panel.className = 'plan-panel';
    const hint = document.createElement('p'); hint.className = 'calc-note'; hint.textContent = simple
      ? 'Тяните углы, чтобы менять форму. Нажмите на сторону, чтобы задать её длину. «+ угол» добавляет угол на выбранной стороне. Номера сторон — это номера стен ниже.'
      : 'Тяните углы, чтобы менять форму. Нажмите на сторону, чтобы задать её длину, ширину и глубину. «+ угол» добавляет угол на выбранной стороне.';
    wrap.appendChild(bar); wrap.appendChild(svg); wrap.appendChild(panel); wrap.appendChild(hint);
    container.innerHTML = ''; container.appendChild(wrap);

    function fit() {
      const pts = plan.verts.concat((plan.inner || []).flatMap((t) => [t.a, t.b]));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 1, minY = Math.min(...ys) - 1, maxY = Math.max(...ys) + 1;
      const s = Math.min((VW - PAD * 2) / (maxX - minX), (VH - PAD * 2) / (maxY - minY));
      tf = { s, ox: PAD + ((VW - PAD * 2) - (maxX - minX) * s) / 2 - minX * s, oy: VH - PAD - ((VH - PAD * 2) - (maxY - minY) * s) / 2 + minY * s };
    }
    const X = (p) => tf.ox + p[0] * tf.s, Y = (p) => tf.oy - p[1] * tf.s;
    function toM(evt) {
      const r = svg.getBoundingClientRect();
      const px = (evt.clientX - r.left) / r.width * VW, py = (evt.clientY - r.top) / r.height * VH;
      return [snap((px - tf.ox) / tf.s), snap((tf.oy - py) / tf.s)];
    }

    function redraw() {
      if (!drag) fit();
      svg.innerHTML = '';
      const g = geometry(plan, simple ? { w: 1, depth: 1, above: 0 } : getDefaults());
      // сетка 1 м
      const gx0 = Math.floor((0 - tf.ox) / tf.s), gx1 = Math.ceil((VW - tf.ox) / tf.s), gy0 = Math.floor((tf.oy - VH) / tf.s), gy1 = Math.ceil(tf.oy / tf.s);
      for (let x = gx0; x <= gx1; x++) svg.appendChild(el('line', { x1: X([x, 0]), y1: 0, x2: X([x, 0]), y2: VH, class: 'plan-grid' }));
      for (let y = gy0; y <= gy1; y++) svg.appendChild(el('line', { x1: 0, y1: Y([0, y]), x2: VW, y2: Y([0, y]), class: 'plan-grid' }));
      // лента: наружный − внутренний
      if (simple) {
        svg.appendChild(el('polygon', { points: g.verts.map((p) => X(p) + ',' + Y(p)).join(' '), class: g.valid ? 'viz-area' : 'plan-tape plan-tape--bad' }));
      } else {
        const path = 'M ' + g.verts.map((p) => X(p) + ' ' + Y(p)).join(' L ') + ' Z M ' + g.inner.map((p) => X(p) + ' ' + Y(p)).join(' L ') + ' Z';
        svg.appendChild(el('path', { d: path, class: g.valid ? 'plan-tape' : 'plan-tape plan-tape--bad', 'fill-rule': 'evenodd' }));
      }
      // внутренние ленты
      if (!simple) (plan.inner || []).forEach((t, i) => {
        const line = el('line', { x1: X(t.a), y1: Y(t.a), x2: X(t.b), y2: Y(t.b), class: 'plan-inner', 'stroke-width': Math.max(4, g.inners[i].w * tf.s) });
        svg.appendChild(line);
        line.addEventListener('pointerdown', (e) => { sel = { type: 'inner', i }; redraw(); e.preventDefault(); });
        if (sel && sel.type === 'inner' && sel.i === i) line.classList.add('is-selected');
        [['a', t.a], ['b', t.b]].forEach(([k, p]) => {
          const c = el('circle', { cx: X(p), cy: Y(p), r: 9, class: 'plan-handle plan-handle--inner' });
          c.addEventListener('pointerdown', (e) => { sel = { type: 'inner', i }; drag = { type: 'inner', i, k }; c.setPointerCapture(e.pointerId); e.preventDefault(); });
          svg.appendChild(c);
        });
      });
      // стороны: невидимые толстые линии для клика + подписи длин
      g.edges.forEach((e, i) => {
        const hit = el('line', { x1: X(e.a), y1: Y(e.a), x2: X(e.b), y2: Y(e.b), class: 'plan-edge' + (sel && sel.type === 'edge' && sel.i === i ? ' is-selected' : '') });
        hit.addEventListener('pointerdown', (ev) => { sel = { type: 'edge', i }; redraw(); ev.preventDefault(); });
        svg.appendChild(hit);
        if (g.edges.length <= 8) {
          const mx = (X(e.a) + X(e.b)) / 2, my = (Y(e.a) + Y(e.b)) / 2;
          const nx = -(Y(e.b) - Y(e.a)), ny = X(e.b) - X(e.a); const l = Math.hypot(nx, ny) || 1;
          svg.appendChild(el('text', { x: mx - nx / l * 14, y: my - ny / l * 14 + 4, class: 'viz-label', 'text-anchor': 'middle' }, (simple ? (i + 1) + ': ' : '') + fmt(e.len) + ' м'));
        }
      });
      // углы
      g.verts.forEach((p, i) => {
        const c = el('circle', { cx: X(p), cy: Y(p), r: 11, class: 'plan-handle' + (sel && sel.type === 'vertex' && sel.i === i ? ' is-selected' : '') });
        c.addEventListener('pointerdown', (e) => { drag = { type: 'vertex', i }; sel = { type: 'vertex', i }; c.setPointerCapture(e.pointerId); e.preventDefault(); });
        svg.appendChild(c);
      });
      svg.appendChild(el('text', { x: VW / 2, y: VH - 8, class: 'viz-caption', 'text-anchor': 'middle' },
        !g.valid ? 'Контур пересекает сам себя — поправьте углы'
          : simple ? `Площадь ${fmt(g.outerArea)} м² · периметр ${fmt(g.perimeter)} м · стен ${g.edges.length}`
          : `Лента: ${fmt(g.footprint)} м² в плане · периметр ${fmt(g.perimeter)} м`));
      renderPanel(g);
    }

    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = toM(e);
      if (drag.type === 'vertex') plan.verts[drag.i] = p;
      else if (drag.type === 'inner') plan.inner[drag.i][drag.k] = p;
      redraw(); onChange();
    });
    const stop = () => { if (drag) { drag = null; redraw(); } };
    svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop);

    function num(labelText, value, unit, onInput) {
      const l = document.createElement('label'); l.className = 'calc-opening-f';
      const sp = document.createElement('span'); sp.textContent = labelText + (unit ? ', ' + unit : '');
      const inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = value == null ? '' : String(value);
      inp.addEventListener('change', () => onInput(inp.value.replace(',', '.')));
      l.appendChild(sp); l.appendChild(inp); return l;
    }
    function btn(text, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = cls || 'btn btn-secondary btn-sm'; b.textContent = text; b.addEventListener('click', fn); return b; }

    function renderPanel(g) {
      panel.innerHTML = '';
      const d = getDefaults();
      if (plan.preset === 'circle') {
        panel.appendChild(num('Диаметр круга', plan.diameter || 4, 'м', (v) => { const dm = Math.max(1, Number(v) || 4); plan.diameter = dm; plan.verts = PRESETS.circle.make(dm); plan.edges = []; redraw(); onChange(); }));
      }
      if (sel && sel.type === 'edge' && g.edges[sel.i]) {
        const e = g.edges[sel.i], i = sel.i;
        const t = document.createElement('p'); t.className = 'plan-panel-title'; t.textContent = 'Сторона ' + (i + 1);
        panel.appendChild(t);
        panel.appendChild(num('Длина', fmt(e.len), 'м', (v) => {
          const len = Number(v); if (!(len > 0)) return;
          const n = plan.verts.length; const a = plan.verts[i], b = plan.verts[(i + 1) % n];
          const dx = b[0] - a[0], dy = b[1] - a[1], cur = Math.hypot(dx, dy) || 1;
          plan.verts[(i + 1) % n] = [snap(a[0] + dx / cur * len), snap(a[1] + dy / cur * len)];
          redraw(); onChange();
        }));
        const ov = plan.edges[i] || {};
        if (!simple) panel.appendChild(num('Ширина ленты', ov.w || '', 'см (пусто = ' + d.w + ')', (v) => { plan.edges[i] = Object.assign({}, plan.edges[i], { w: Number(v) > 0 ? Number(v) : null }); redraw(); onChange(); }));
        if (!simple) panel.appendChild(num('Глубина в земле', ov.depth || '', 'см (пусто = ' + d.depth + ')', (v) => { plan.edges[i] = Object.assign({}, plan.edges[i], { depth: Number(v) > 0 ? Number(v) : null }); redraw(); onChange(); }));
        panel.appendChild(btn('+ угол на этой стороне', 'btn btn-secondary btn-sm', () => {
          const n = plan.verts.length; const a = plan.verts[i], b = plan.verts[(i + 1) % n];
          plan.verts.splice(i + 1, 0, [snap((a[0] + b[0]) / 2), snap((a[1] + b[1]) / 2)]);
          plan.edges.splice(i + 1, 0, null); plan.preset = null; sel = { type: 'vertex', i: i + 1 }; redraw(); onChange();
        }));
      } else if (sel && sel.type === 'inner' && plan.inner && plan.inner[sel.i]) {
        const t = document.createElement('p'); t.className = 'plan-panel-title'; t.textContent = 'Внутренняя лента ' + (sel.i + 1) + ': тяните её концы на плане';
        panel.appendChild(t);
        panel.appendChild(btn('− убрать эту ленту', 'btn btn-secondary btn-sm', () => { plan.inner.splice(sel.i, 1); sel = null; redraw(); onChange(); }));
      } else if (sel && sel.type === 'vertex') {
        const t = document.createElement('p'); t.className = 'plan-panel-title'; t.textContent = 'Угол ' + (sel.i + 1) + ': тяните его на плане';
        panel.appendChild(t);
        if (plan.verts.length > 3) panel.appendChild(btn('− убрать этот угол', 'btn btn-secondary btn-sm', () => { plan.verts.splice(sel.i, 1); plan.edges.splice(sel.i, 1); plan.preset = null; sel = null; redraw(); onChange(); }));
      } else {
        const t = document.createElement('p'); t.className = 'plan-panel-title'; t.textContent = 'Нажмите на сторону или угол, чтобы изменить';
        panel.appendChild(t);
      }
      const inner = document.createElement('div'); inner.className = 'calc-presets';
      if (!simple) inner.appendChild(btn('+ внутренняя лента', 'calc-preset', () => {
        const xs = plan.verts.map((p) => p[0]), ys = plan.verts.map((p) => p[1]);
        const cy = snap((Math.min(...ys) + Math.max(...ys)) / 2);
        plan.inner = plan.inner || []; plan.inner.push({ a: [snap(Math.min(...xs) + 0.4), cy], b: [snap(Math.max(...xs) - 0.4), cy] });
        sel = { type: 'inner', i: plan.inner.length - 1 };
        redraw(); onChange();
      }));
      if (!simple && (plan.inner || []).length) inner.appendChild(btn('− убрать последнюю внутреннюю', 'calc-preset', () => { plan.inner.pop(); sel = null; redraw(); onChange(); }));
      panel.appendChild(inner);
    }

    redraw();
    return { redraw };
  }

  window.CalcPlan = { geometry, prisms, editor, PRESETS, ROOM_PRESETS, PLOT_PRESETS };
})();
