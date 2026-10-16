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
  const DEFAULT_PITCH = 32 * Math.PI / 180;
  function project(p, yaw, pitch) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const x = p[0] * c - p[1] * s;
    const y = p[0] * s + p[1] * c;
    return { sx: x, sy: y * Math.sin(pitch) - p[2] * Math.cos(pitch), depth: y * Math.cos(pitch) + p[2] * Math.sin(pitch) };
  }
  // Призма: poly [[x,y],…] (против часовой), z — низ, dz — высота. Брусок — частный случай.
  function toPrism(b) {
    if (b.poly) return b;
    return { poly: [[b.x, b.y], [b.x + b.dx, b.y], [b.x + b.dx, b.y + b.dy], [b.x, b.y + b.dy]], z: b.z, dz: b.dz, color: b.color };
  }
  // Свой цвет детали (#rrggbb): грани светлее/темнее по их стороне, как у серых брусков
  const SHADE = { top: 1.12, side: 0.92, side2: 0.74, bottom: 0.6 };
  function tint(hex, k) {
    const n = parseInt(hex.slice(1), 16), c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return 'rgb(' + c(n >> 16) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
  }
  // Мин/макс без разворота массива в аргументы: на тысячах деталей тот падает
  const lo = (a) => { let m = Infinity; for (const x of a) if (x < m) m = x; return m; };
  const hi = (a) => { let m = -Infinity; for (const x of a) if (x > m) m = x; return m; };
  function prismFaces(pr) {
    let poly = pr.poly;
    let a = 0; for (let i = 0; i < poly.length; i++) { const q = poly[i], r = poly[(i + 1) % poly.length]; a += q[0] * r[1] - r[0] * q[1]; }
    if (a < 0) poly = poly.slice().reverse();
    const z0 = pr.z, z1 = pr.z + pr.dz, top = z1;
    const faces = [{ pts: poly.map((q) => [q[0], q[1], z1]), shade: 'top', z: top },
                   { pts: poly.slice().reverse().map((q) => [q[0], q[1], z0]), shade: 'bottom', z: z0 }];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      // оттенок стороны по её ориентации — свет условно слева-спереди
      const nx = q[1] - p[1], ny = -(q[0] - p[0]);
      faces.push({ pts: [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], shade: (nx * 0.6 - ny * 0.8) > 0 ? 'side' : 'side2', z: top });
    }
    return faces;
  }
  const FILL = {
    top: '#c9d3df', side: '#9aa8b8', side2: '#7f8ea0', bottom: '#6e7c8c',
    // в земле — рыжеватый, полупрозрачный: видно, что это ниже уровня грунта
    utop: '#c8b08e', uside: '#a88f6d', uside2: '#8f7a5c', ubottom: '#7a6750',
  };

  function iso(container, boxes, dims, opts) {
    opts = opts || {};
    // Тысячи деталей на схеме не разглядеть, а браузер на них падает — такую схему не рисуем
    if (boxes.length > 4000) { const old = container.querySelector('svg'); if (old) old.remove(); return; }
    const yaw = opts.yaw == null ? -0.6 : opts.yaw;
    const pitch = opts.pitch == null ? DEFAULT_PITCH : Math.max(0.12, Math.min(1.45, opts.pitch));
    const zoom = opts.zoom == null ? 1 : Math.max(0.4, Math.min(4, opts.zoom));
    const ELEV = pitch;
    const pr = (p) => project(p, yaw, pitch);

    // Масштаб НЕ зависит от угла: берём радиус модели вокруг её центра, иначе при
    // вращении картинка «дышит» и кажется, что искажается.
    const prs = boxes.map(toPrism);
    // Линии (поручень): ломаные [[x,y,z],…]; режем на короткие куски, чтобы каждый
    // встал в общий порядок рисования рядом с ближайшими брусками
    const segs = [];
    (opts.lines || []).forEach((ln) => {
      for (let i = 1; i < ln.pts.length; i++) {
        const a = ln.pts[i - 1], b = ln.pts[i], k = ln.whole ? 1 : Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
        for (let j = 0; j < k; j++) {
          const at = (f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
          segs.push({ a: at(j / k), b: at((j + 1) / k), cls: ln.cls || 'viz-rail', color: ln.color, width: ln.width, sort: ln.sort });
        }
      }
    });
    const lp = segs.flatMap((sg) => [sg.a, sg.b]);
    const xs = prs.flatMap((b) => b.poly.map((q) => q[0])).concat(lp.map((q) => q[0])), ys = prs.flatMap((b) => b.poly.map((q) => q[1])).concat(lp.map((q) => q[1])), zs = prs.flatMap((b) => [b.z, b.z + b.dz]).concat(lp.map((q) => q[2]));
    const x0 = lo(xs), x1 = hi(xs), y0 = lo(ys), y1 = hi(ys), z0 = lo(zs), z1 = hi(zs);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const gm = opts.ground ? Math.max(0.6, (x1 - x0) * 0.18) : 0;
    const rx = (x1 - x0) / 2 + gm, ry = (y1 - y0) / 2 + gm, rz = (z1 - z0) / 2;
    const radiusXY = Math.hypot(rx, ry);
    const W = 640, H = 400, pad = 64;
    const scale = Math.min((W - pad * 2) / (2 * radiusXY), (H - pad * 2) / (2 * (radiusXY * 1 + rz * 1))) * zoom;
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
      const g = [[x0 - gm, y0 - gm, 0], [x1 + gm, y0 - gm, 0], [x1 + gm, y1 + gm, 0], [x0 - gm, y1 + gm, 0]];
      svg.appendChild(el('polygon', { points: poly(g.map(pr)), fill: '#7cb083', 'fill-opacity': '0.28', stroke: '#5f9466', 'stroke-opacity': '0.5' }));
    }

    // Порядок рисования: бруски от дальних к ближним по центру, внутри бруска — только
    // видимые грани (отсечение задних по знаку площади на экране). Так соседние бруски
    // кольца не «протыкают» друг друга при повороте.
    // Слои вдоль стенки (забор: дальний ряд штакетин, лаги, ближний ряд) — sort: { at, n, o }:
    // глубина точки на оси стенки плюс сдвиг слоя в сторону зрителя. По центру детали длинная
    // лага и узкая штакетина сортируются неверно, и лага вылезает поперёк штакетин.
    const o0 = pr([0, 0, 0]).depth;
    const layered = (st) => pr(st.at).depth + st.o * 50 * Math.sign(pr([st.n[0], st.n[1], 0]).depth - o0);
    const items = prs.map((b) => {
      if (b.sort) return { b, depth: layered(b.sort) };
      const cx2 = b.poly.reduce((s, q) => s + q[0], 0) / b.poly.length, cy2 = b.poly.reduce((s, q) => s + q[1], 0) / b.poly.length;
      const c = pr([cx2, cy2, b.z + b.dz / 2]);
      return { b, depth: c.depth };
    }).concat(segs.map((sg) => ({ sg, depth: sg.sort ? layered(sg.sort) : pr([(sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2, (sg.a[2] + sg.b[2]) / 2]).depth }))).sort((a, b) => a.depth - b.depth);
    items.forEach(({ b, sg }) => {
      if (sg) {
        const a = pr(sg.a), q = pr(sg.b), at = { x1: X(a).toFixed(1), y1: Y(a).toFixed(1), x2: X(q).toFixed(1), y2: Y(q).toFixed(1), class: sg.cls };
        if (sg.color) at.stroke = sg.color; if (sg.width) at['stroke-width'] = sg.width;
        svg.appendChild(el('line', at)); return;
      }
      prismFaces(b).forEach((fc) => {
        const p = fc.pts.map(pr);
        // площадь со знаком: грань видна, если её обход на экране против часовой (с учётом порядка вершин)
        let area = 0;
        for (let i = 0; i < p.length; i++) { const a = p[i], q = p[(i + 1) % p.length]; area += a.sx * q.sy - q.sx * a.sy; }
        if (area <= 0) return;
        if (b.color) { svg.appendChild(el('polygon', { points: poly(p), fill: tint(b.color, SHADE[fc.shade]), stroke: tint(b.color, 0.45), 'stroke-width': '0.5', 'stroke-opacity': '0.7' })); return; }
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
    const old = container.querySelector('svg'); if (old) old.remove();
    container.insertBefore(svg, container.firstChild);
    container.classList.remove('viz-flat');
    declutter(svg, W, H);
    return svg;
  }

  // На телефоне шрифт подписей крупнее (иначе не прочесть), и они наезжают друг на друга.
  // После вставки меряем настоящие рамки: подпись, которая легла на уже поставленную,
  // сдвигаем вверх-вниз на высоту строки, вылезшую за край — внутрь; длинную подпись внизу
  // переносим на две строки. Если схема скрыта (рамки нулевые) — ничего не трогаем.
  function declutter(svg, W, H, again) {
    // Первый рисунок делается, пока блок схемы ещё скрыт: рамок нет — повторяем на следующем кадре
    const first = svg.querySelector('text.viz-label, text.viz-small, text.viz-caption');
    let shown = false; try { shown = !!(first && first.getBBox().width); } catch (e) { /* не в документе */ }
    if (first && !shown) { if (!again) requestAnimationFrame(() => { if (svg.isConnected) declutter(svg, W, H, true); }); return; }
    const placed = [];
    svg.querySelectorAll('text.viz-big').forEach((t) => { try { const bb = t.getBBox(); if (bb.width) placed.push(bb); } catch (e) { /* скрыта */ } });
    const hit = (a) => placed.some((b) => a.x < b.x + b.width + 2 && b.x < a.x + a.width + 2 && a.y < b.y + b.height && b.y < a.y + a.height);
    svg.querySelectorAll('text.viz-label, text.viz-small').forEach((t) => {
      let bb; try { bb = t.getBBox(); } catch (e) { return; }
      if (!bb.width) return;
      const shiftX = bb.x < 2 ? 2 - bb.x : bb.x + bb.width > W - 2 ? W - 2 - bb.x - bb.width : 0;
      if (shiftX) t.setAttribute('x', +t.getAttribute('x') + shiftX);
      const box = { x: bb.x + shiftX, y: bb.y, width: bb.width, height: bb.height };
      const step = bb.height * 0.9;
      for (const k of [0, -1, 1, -2, 2, -3, 3]) {
        const cand = { x: box.x, y: box.y + k * step, width: box.width, height: box.height };
        if (cand.y < 0 || cand.y + cand.height > H) continue;
        if (!hit(cand)) { if (k) t.setAttribute('y', +t.getAttribute('y') + k * step); placed.push(cand); return; }
      }
      placed.push(box);
    });
    const cap = svg.querySelector('text.viz-caption');
    if (cap && cap.textContent.indexOf(' ') > 0) {
      let len = 0; try { len = cap.getComputedTextLength(); } catch (e) { /* скрыта */ }
      if (len > W - 16) {
        const txt = cap.textContent, mid = txt.length / 2;
        let cut = -1;
        for (let i = 0; i < txt.length; i++) if (txt[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
        const lh = parseFloat(getComputedStyle(cap).fontSize) || 16, y = +cap.getAttribute('y');
        cap.textContent = '';
        cap.appendChild(el('tspan', { x: W / 2, y: y - lh * 1.15 }, txt.slice(0, cut)));
        cap.appendChild(el('tspan', { x: W / 2, y }, txt.slice(cut + 1)));
      }
    }
  }

  // Вращение и масштаб: тянем — поворот (влево-вправо) и наклон (вверх-вниз), колесо или щипок — масштаб,
  // кнопки +/−/сброс. get() → {yaw, pitch, zoom}, set(view) → перерисовать.
  function rotatable(container, get, set) {
    let drag = null; const pointers = new Map(); let pinch = null;
    container.style.touchAction = 'none';
    const bar = document.createElement('div'); bar.className = 'viz-controls';
    const mk = (txt, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); bar.appendChild(b); return b; };
    mk('+', 'Увеличить', () => { const v = get(); set({ yaw: v.yaw, pitch: v.pitch, zoom: v.zoom * 1.25 }); });
    mk('−', 'Уменьшить', () => { const v = get(); set({ yaw: v.yaw, pitch: v.pitch, zoom: v.zoom / 1.25 }); });
    mk('⟲', 'Сбросить вид', () => set({ yaw: -0.6, pitch: DEFAULT_PITCH, zoom: 1 }));
    container.appendChild(bar);
    container.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.viz-controls')) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      container.setPointerCapture(e.pointerId);
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: get().zoom }; drag = null; }
      else { const v = get(); drag = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch }; }
    });
    container.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); set(Object.assign({}, get(), { zoom: pinch.zoom * d / pinch.d })); return; }
      if (!drag) return;
      set({ yaw: drag.yaw + (e.clientX - drag.x) / 120, pitch: drag.pitch + (e.clientY - drag.y) / 160, zoom: get().zoom });
    });
    const stop = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null; };
    container.addEventListener('pointerup', stop); container.addEventListener('pointercancel', stop);
    container.addEventListener('wheel', (e) => { e.preventDefault(); const v = get(); set({ yaw: v.yaw, pitch: v.pitch, zoom: v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1) }); }, { passive: false });
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
    if (placed < items.length) svg.appendChild(el('text', { x: W / 2, y: H - 8, class: 'viz-caption', 'text-anchor': 'middle' }, `Не поместилось на схеме проёмов: ${items.length - placed}. В расчёте учтены все.`));
    else if (opts && opts.caption) svg.appendChild(el('text', { x: W / 2, y: H - 8, class: 'viz-caption', 'text-anchor': 'middle' }, opts.caption));
    const old = container.querySelector('svg'); if (old) old.remove(); container.insertBefore(svg, container.firstChild);
    container.classList.add('viz-flat');
  }

  /* ---------- Плоская фигура (участок, потолок) ----------
     pts: [[x,y],…] в метрах, dims: [{ from:[x,y], to:[x,y], label, offset }] */
  function shape(container, pts, dims, opts) {
    // Подпись снизу живёт в своей полосе под чертежом: раньше она попадала ровно
    // туда же, где стоит подпись нижнего размера, и они налезали друг на друга.
    const W = 640, H = 340, pad = 50;
    const capH = (opts && opts.caption) ? 26 : 0;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min((W - pad * 2) / Math.max(maxX - minX, 0.01), (H - pad * 2) / Math.max(maxY - minY, 0.01));
    const X = (p) => pad + (p[0] - minX) * scale + ((W - pad * 2) - (maxX - minX) * scale) / 2;
    const Y = (p) => H - pad - (p[1] - minY) * scale - ((H - pad * 2) - (maxY - minY) * scale) / 2;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H + capH}`, class: 'viz-svg', role: 'img', 'aria-label': (opts && opts.title) || 'Схема' });
    if (opts && opts.circle) {
      const r = opts.circle.r * scale;
      svg.appendChild(el('circle', { cx: X([opts.circle.cx, opts.circle.cy]), cy: Y([opts.circle.cx, opts.circle.cy]), r, class: 'viz-area' }));
    } else {
      svg.appendChild(el('polygon', { points: pts.map((p) => X(p).toFixed(1) + ',' + Y(p).toFixed(1)).join(' '), class: 'viz-area' }));
    }
    // Слой поверх контура (планки кварцвинила): рисует вызывающий, в тех же координатах
    if (opts && opts.under) {
      opts.under(svg, X, Y, el);
      svg.appendChild(el('polygon', { points: pts.map((p) => X(p).toFixed(1) + ',' + Y(p).toFixed(1)).join(' '), class: 'viz-outline' }));
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
    if (opts && opts.caption) svg.appendChild(el('text', { x: W / 2, y: H + capH - 8, class: 'viz-caption', 'text-anchor': 'middle' }, opts.caption));
    const old = container.querySelector('svg'); if (old) old.remove(); container.insertBefore(svg, container.firstChild);
    container.classList.add('viz-flat');
    declutter(svg, W, H + capH);
  }

  /* ---------- Забор: вид сбоку со столбами, воротами и калиткой ---------- */
  /* ---------- Кровля: скаты как наклонные многоугольники поверх коробки дома ----------
     faces: [[x,y,z], …] — вершины ската в метрах; walls — призма стен (необязательно). */
  function roof(container, faces, wallPrisms, dims, opts) {
    opts = opts || {};
    const yaw = opts.yaw == null ? -0.6 : opts.yaw;
    const pitch = opts.pitch == null ? DEFAULT_PITCH : Math.max(0.12, Math.min(1.45, opts.pitch));
    const zoom = opts.zoom == null ? 1 : Math.max(0.4, Math.min(4, opts.zoom));
    const pr = (p) => project(p, yaw, pitch);
    const allPts = faces.flat().concat((wallPrisms || []).flatMap((b) => b.poly.map((q) => [q[0], q[1], b.z])).concat((wallPrisms || []).flatMap((b) => b.poly.map((q) => [q[0], q[1], b.z + b.dz]))));
    const xs = allPts.map((p) => p[0]), ys = allPts.map((p) => p[1]), zs = allPts.map((p) => p[2]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2, ry = (Math.max(...ys) - Math.min(...ys)) / 2, rz = (Math.max(...zs) - Math.min(...zs)) / 2;
    const radiusXY = Math.hypot(rx, ry) + 0.6;
    const W = 640, H = 400, pad = 64;
    const scale = Math.min((W - pad * 2) / (2 * radiusXY), (H - pad * 2) / (2 * (radiusXY + rz))) * zoom;
    const c0 = pr([cx, cy, cz]);
    const X = (q) => W / 2 + (q.sx - c0.sx) * scale, Y = (q) => H / 2 + (q.sy - c0.sy) * scale;
    const poly = (pts) => pts.map((q) => X(q).toFixed(1) + ',' + Y(q).toFixed(1)).join(' ');
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': opts.title || 'Схема кровли' });
    const defs = el('defs');
    const mk = el('marker', { id: 'viz-arr', viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    mk.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'viz-arrhead' })); defs.appendChild(mk); svg.appendChild(defs);
    if (opts.ground) {
      const m = Math.max(0.8, rx * 0.25);
      const g = [[cx - rx - m, cy - ry - m, 0], [cx + rx + m, cy - ry - m, 0], [cx + rx + m, cy + ry + m, 0], [cx - rx - m, cy + ry + m, 0]].map(pr);
      svg.appendChild(el('polygon', { points: poly(g), fill: '#7cb083', 'fill-opacity': '0.28', stroke: '#5f9466', 'stroke-opacity': '0.5' }));
    }
    // Стены рисуем первыми: они всегда под кровлей, иначе верх стены закрывает дальний скат.
    (wallPrisms || []).forEach((b) => {
      prismFaces(b).forEach((fc) => {
        if (fc.shade === 'top') return; // верх стены всё равно под крышей
        const p = fc.pts.map(pr); let area = 0;
        for (let i = 0; i < p.length; i++) { const a = p[i], q = p[(i + 1) % p.length]; area += a.sx * q.sy - q.sx * a.sy; }
        if (area <= 0) return;
        svg.appendChild(el('polygon', { points: poly(p), fill: FILL[fc.shade], 'fill-opacity': '0.85', stroke: '#2b3440', 'stroke-width': '0.8', 'stroke-opacity': '0.5' }));
      });
    });
    // Скаты — от дальних к ближним
    faces.map((f, i) => {
      const c = [f.reduce((s2, q) => s2 + q[0], 0) / f.length, f.reduce((s2, q) => s2 + q[1], 0) / f.length, f.reduce((s2, q) => s2 + q[2], 0) / f.length];
      return { f, i, depth: pr(c).depth };
    }).sort((a, b) => a.depth - b.depth).forEach((it) => {
      svg.appendChild(el('polygon', { points: poly(it.f.map(pr)), class: 'viz-roof' + (it.i % 2 ? ' viz-roof--alt' : '') }));
    });
    (dims || []).forEach((d) => {
      const a = pr(d.from), b = pr(d.to);
      const ax = X(a), ay = Y(a), bx = X(b), by = Y(b), off = d.offset || 0;
      let nx = -(by - ay), ny = bx - ax; const len = Math.hypot(nx, ny) || 1; nx = nx / len * off; ny = ny / len * off;
      const x1 = ax + nx, y1 = ay + ny, x2 = bx + nx, y2 = by + ny;
      if (off) { svg.appendChild(el('line', { x1: ax, y1: ay, x2: x1, y2: y1, class: 'viz-ext' })); svg.appendChild(el('line', { x1: bx, y1: by, x2: x2, y2: y2, class: 'viz-ext' })); }
      svg.appendChild(el('line', { x1, y1, x2, y2, class: 'viz-dim', 'marker-start': 'url(#viz-arr)', 'marker-end': 'url(#viz-arr)' }));
      svg.appendChild(el('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, class: 'viz-label', 'text-anchor': 'middle' }, d.label));
    });
    if (opts.caption) svg.appendChild(el('text', { x: W / 2, y: H - 10, class: 'viz-caption', 'text-anchor': 'middle' }, opts.caption));
    const old2 = container.querySelector('svg'); if (old2) old2.remove();
    container.insertBefore(svg, container.firstChild);
    container.classList.remove('viz-flat');
    declutter(svg, W, H);
  }

  window.CalcViz = { iso, rotatable, walls, shape, roof };
})();
