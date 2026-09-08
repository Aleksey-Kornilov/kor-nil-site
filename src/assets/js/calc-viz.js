// calc-viz.js — рисунки для калькуляторов: объёмная схема (SVG, изометрия с поворотом
// мышью/пальцем) и плоские схемы (стены под покраску, форма участка).
// Подключается перед calculators.js и отдаёт window.CalcViz. Без библиотек.

(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  const f1 = (v) => String(Math.round(v * 100) / 100).replace('.', ',');

  /* ---------- Объёмная схема ----------
     boxes: [{ x, y, z, dx, dy, dz, kind }] — параллелепипеды в метрах, z вверх, z<0 — в земле.
     dims:  [{ from:[x,y,z], to:[x,y,z], label }] — размерные линии.
     opts:  { yaw, ground: bool }
  */
  const ELEV = 32 * Math.PI / 180;
  function project(p, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const x = p[0] * c - p[1] * s;
    const y = p[0] * s + p[1] * c;
    return { sx: x, sy: y * Math.sin(ELEV) - p[2] * Math.cos(ELEV), depth: y * Math.cos(ELEV) + p[2] * Math.sin(ELEV) };
  }
  function boxFaces(b) {
    const { x, y, z, dx, dy, dz } = b;
    const P = [[x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z],
               [x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]];
    return [
      { pts: [P[4], P[5], P[6], P[7]], shade: 'top', kind: b.kind, z: z + dz },
      { pts: [P[0], P[1], P[5], P[4]], shade: 'side', kind: b.kind, z: z + dz },
      { pts: [P[1], P[2], P[6], P[5]], shade: 'side2', kind: b.kind, z: z + dz },
      { pts: [P[2], P[3], P[7], P[6]], shade: 'side', kind: b.kind, z: z + dz },
      { pts: [P[3], P[0], P[4], P[7]], shade: 'side2', kind: b.kind, z: z + dz },
      { pts: [P[0], P[3], P[2], P[1]], shade: 'bottom', kind: b.kind, z: z },
    ];
  }
  const FILL = {
    top: '#c9d3df', side: '#9aa8b8', side2: '#7f8ea0', bottom: '#6e7c8c',
    // в земле — рыжеватый, полупрозрачный: видно, что это ниже уровня грунта
    utop: '#c8b08e', uside: '#a88f6d', uside2: '#8f7a5c', ubottom: '#7a6750',
  };

  function iso(container, boxes, dims, opts) {
    opts = opts || {};
    const yaw = opts.yaw == null ? -0.6 : opts.yaw;
    const pr = (p) => project(p, yaw);

    // Масштаб НЕ зависит от угла: берём радиус модели вокруг её центра, иначе при
    // вращении картинка «дышит» и кажется, что искажается.
    const xs = boxes.flatMap((b) => [b.x, b.x + b.dx]), ys = boxes.flatMap((b) => [b.y, b.y + b.dy]), zs = boxes.flatMap((b) => [b.z, b.z + b.dz]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const gm = opts.ground ? Math.max(0.6, (Math.max(...xs) - Math.min(...xs)) * 0.18) : 0;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + gm, ry = (Math.max(...ys) - Math.min(...ys)) / 2 + gm, rz = (Math.max(...zs) - Math.min(...zs)) / 2;
    const radiusXY = Math.hypot(rx, ry);
    const W = 640, H = 400, pad = 64;
    const scale = Math.min((W - pad * 2) / (2 * radiusXY), (H - pad * 2) / (2 * (radiusXY * Math.sin(ELEV) + rz * Math.cos(ELEV))));
    const c0 = pr([cx, cy, cz]);
    const X = (q) => W / 2 + (q.sx - c0.sx) * scale;
    const Y = (q) => H / 2 + (q.sy - c0.sy) * scale;
    const poly = (pts) => pts.map((q) => X(q).toFixed(1) + ',' + Y(q).toFixed(1)).join(' ');

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': opts.title || 'Схема' });
    const defs = el('defs');
    const mk = el('marker', { id: 'viz-arr', viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    mk.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'viz-arrhead' }));
    defs.appendChild(mk); svg.appendChild(defs);

    if (opts.ground) {
      const g = [[Math.min(...xs) - gm, Math.min(...ys) - gm, 0], [Math.max(...xs) + gm, Math.min(...ys) - gm, 0], [Math.max(...xs) + gm, Math.max(...ys) + gm, 0], [Math.min(...xs) - gm, Math.max(...ys) + gm, 0]];
      svg.appendChild(el('polygon', { points: poly(g.map(pr)), fill: '#7cb083', 'fill-opacity': '0.28', stroke: '#5f9466', 'stroke-opacity': '0.5' }));
    }

    // Порядок рисования: бруски от дальних к ближним по центру, внутри бруска — только
    // видимые грани (отсечение задних по знаку площади на экране). Так соседние бруски
    // кольца не «протыкают» друг друга при повороте.
    const items = boxes.map((b) => {
      const c = pr([b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz / 2]);
      return { b, depth: c.depth };
    }).sort((a, b) => a.depth - b.depth);
    items.forEach(({ b }) => {
      boxFaces(b).forEach((fc) => {
        const p = fc.pts.map(pr);
        // площадь со знаком: грань видна, если её обход на экране против часовой (с учётом порядка вершин)
        let area = 0;
        for (let i = 0; i < 4; i++) { const a = p[i], q = p[(i + 1) % 4]; area += a.sx * q.sy - q.sx * a.sy; }
        if (area <= 0) return;
        const under = fc.z <= 0.0001;
        const fill = FILL[(under ? 'u' : '') + fc.shade];
        svg.appendChild(el('polygon', { points: poly(p), fill, 'fill-opacity': under ? '0.9' : '1', stroke: '#2b3440', 'stroke-width': '0.8', 'stroke-opacity': '0.6' }));
      });
    });

    (dims || []).forEach((d) => {
      const a = pr(d.from), b = pr(d.to);
      const ax = X(a), ay = Y(a), bx = X(b), by = Y(b);
      const off = d.offset || 0;
      let nx = -(by - ay), ny = bx - ax; const len = Math.hypot(nx, ny) || 1; nx = nx / len * off; ny = ny / len * off;
      const x1 = ax + nx, y1 = ay + ny, x2 = bx + nx, y2 = by + ny;
      if (off) { svg.appendChild(el('line', { x1: ax, y1: ay, x2: x1, y2: y1, class: 'viz-ext' })); svg.appendChild(el('line', { x1: bx, y1: by, x2: x2, y2: y2, class: 'viz-ext' })); }
      svg.appendChild(el('line', { x1, y1, x2, y2, class: 'viz-dim', 'marker-start': 'url(#viz-arr)', 'marker-end': 'url(#viz-arr)' }));
      svg.appendChild(el('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, class: 'viz-label', 'text-anchor': 'middle' }, d.label));
    });
    if (opts.caption) svg.appendChild(el('text', { x: W / 2, y: H - 10, class: 'viz-caption', 'text-anchor': 'middle' }, opts.caption));
    container.innerHTML = '';
    container.appendChild(svg);
    return svg;
  }

  // Поворот мышью/пальцем: горизонтальное движение меняет угол, вызывается redraw(yaw).
  function rotatable(container, getYaw, redraw) {
    let dragging = false, startX = 0, startYaw = 0;
    container.style.touchAction = 'pan-y';
    container.addEventListener('pointerdown', (e) => { dragging = true; startX = e.clientX; startYaw = getYaw(); container.setPointerCapture(e.pointerId); });
    container.addEventListener('pointermove', (e) => { if (!dragging) return; redraw(startYaw + (e.clientX - startX) / 120); });
    const stop = () => { dragging = false; };
    container.addEventListener('pointerup', stop); container.addEventListener('pointercancel', stop);
  }

  /* ---------- Стены под покраску (развёртка) ----------
     walls: [{ label, len }] в метрах, height, openings: [{ kind, w, h, count }]
     Проёмы раскладываются по стенам по порядку, пока помещаются. */
  function walls(container, wallsArr, height, openings, opts) {
    const total = wallsArr.reduce((s, w) => s + w.len, 0);
    const W = 640, H = 300, pad = 40, gap = 6;
    const scale = Math.min((W - pad * 2 - gap * (wallsArr.length - 1)) / total, (H - pad * 2 - 30) / height);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': 'Развёртка стен с проёмами' });
    let x = pad; const top = pad + 10; const hpx = height * scale;
    // проёмы по порядку
    const items = [];
    (openings || []).forEach((o) => { for (let i = 0; i < (o.count || 1); i++) items.push(o); });
    let placed = 0;
    wallsArr.forEach((w, idx) => {
      const wpx = w.len * scale;
      svg.appendChild(el('rect', { x, y: top, width: wpx, height: hpx, class: 'viz-wall' }));
      svg.appendChild(el('text', { x: x + wpx / 2, y: top + hpx + 18, class: 'viz-label', 'text-anchor': 'middle' }, `${w.label} ${f1(w.len)} м`));
      // раскладка проёмов на этой стене
      let cx = x + 0.3 * scale;
      while (placed < items.length) {
        const o = items[placed]; const ow = o.w * scale, oh = o.h * scale;
        if (cx + ow > x + wpx - 0.2 * scale || oh > hpx) break;
        const oy = o.kind === 'door' ? top + hpx - oh : top + (hpx - oh) * 0.45;
        svg.appendChild(el('rect', { x: cx, y: oy, width: ow, height: oh, class: o.kind === 'door' ? 'viz-door' : 'viz-window' }));
        svg.appendChild(el('text', { x: cx + ow / 2, y: oy + oh / 2 + 4, class: 'viz-small', 'text-anchor': 'middle' }, `${f1(o.w)}×${f1(o.h)}`));
        cx += ow + 0.4 * scale; placed++;
      }
      x += wpx + gap;
    });
    svg.appendChild(el('text', { x: pad - 6, y: top + hpx / 2, class: 'viz-label', 'text-anchor': 'end', transform: `rotate(-90 ${pad - 6} ${top + hpx / 2})` }, `${f1(height)} м`));
    if (placed < items.length) svg.appendChild(el('text', { x: W / 2, y: H - 8, class: 'viz-caption', 'text-anchor': 'middle' }, `Не поместилось на схеме: ${items.length - placed} проём(а). В расчёте учтены все.`));
    else if (opts && opts.caption) svg.appendChild(el('text', { x: W / 2, y: H - 8, class: 'viz-caption', 'text-anchor': 'middle' }, opts.caption));
    container.innerHTML = ''; container.appendChild(svg);
  }

  /* ---------- Плоская фигура (участок, потолок) ----------
     pts: [[x,y],…] в метрах, dims: [{ from:[x,y], to:[x,y], label, offset }] */
  function shape(container, pts, dims, opts) {
    const W = 640, H = 340, pad = 50;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min((W - pad * 2) / Math.max(maxX - minX, 0.01), (H - pad * 2) / Math.max(maxY - minY, 0.01));
    const X = (p) => pad + (p[0] - minX) * scale + ((W - pad * 2) - (maxX - minX) * scale) / 2;
    const Y = (p) => H - pad - (p[1] - minY) * scale - ((H - pad * 2) - (maxY - minY) * scale) / 2;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': (opts && opts.title) || 'Схема' });
    if (opts && opts.circle) {
      const r = opts.circle.r * scale;
      svg.appendChild(el('circle', { cx: X([opts.circle.cx, opts.circle.cy]), cy: Y([opts.circle.cx, opts.circle.cy]), r, class: 'viz-area' }));
    } else {
      svg.appendChild(el('polygon', { points: pts.map((p) => X(p).toFixed(1) + ',' + Y(p).toFixed(1)).join(' '), class: 'viz-area' }));
    }
    const defs = el('defs');
    const mk = el('marker', { id: 'viz-arr2', viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    mk.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'viz-arrhead' })); defs.appendChild(mk); svg.appendChild(defs);
    (dims || []).forEach((d) => {
      const ax = X(d.from), ay = Y(d.from), bx = X(d.to), by = Y(d.to);
      let nx = -(by - ay), ny = bx - ax; const len = Math.hypot(nx, ny) || 1; const off = d.offset == null ? 22 : d.offset; nx = nx / len * off; ny = ny / len * off;
      svg.appendChild(el('line', { x1: ax + nx, y1: ay + ny, x2: bx + nx, y2: by + ny, class: 'viz-dim', 'marker-start': 'url(#viz-arr2)', 'marker-end': 'url(#viz-arr2)' }));
      svg.appendChild(el('text', { x: (ax + bx) / 2 + nx * 1.6, y: (ay + by) / 2 + ny * 1.6 + 4, class: 'viz-label', 'text-anchor': 'middle' }, d.label));
    });
    if (opts && opts.center) svg.appendChild(el('text', { x: W / 2, y: H / 2 + 5, class: 'viz-big', 'text-anchor': 'middle' }, opts.center));
    if (opts && opts.caption) svg.appendChild(el('text', { x: W / 2, y: H - 10, class: 'viz-caption', 'text-anchor': 'middle' }, opts.caption));
    container.innerHTML = ''; container.appendChild(svg);
  }

  window.CalcViz = { iso, rotatable, walls, shape };
})();
