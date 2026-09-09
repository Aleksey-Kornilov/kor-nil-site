// calc-room.js — редактор комнаты: развёртка четырёх стен, проёмы ставятся на нужную стену
// и двигаются мышью/пальцем, у каждой стены своя отделка (краска, обои, без отделки).
// Отдаёт window.CalcRoom: { editor, measure }. Расчёт краски и обоев — в calculators.js.
//
// Состояние room: { walls: [{finish}] ×4, openings: [{ kind, w, h, wall, x, y }] } — метры,
// x — от левого края стены, y — от пола до низа проёма.

(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  const fmt = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  const snap = (v) => Math.round(v * 20) / 20; // шаг 5 см
  const FINISH = { paint: 'Краска', paper: 'Обои', none: 'Без отделки' };
  const wallName = (i) => 'Стена ' + (i + 1);

  // Площади по стенам с учётом проёмов на них. lens — длины стен по порядку, H — высота.
  // finishes — допустимые отделки {id: label}, defaultFinish — если у стены не задана.
  function measure(room, lens, H, finishes, defaultFinish) {
    finishes = finishes || FINISH; defaultFinish = defaultFinish || Object.keys(finishes)[0];
    const walls = lens.map((len, i) => {
      const ops = room.openings.filter((o) => o.wall === i && o.w > 0 && o.h > 0);
      const opArea = ops.reduce((s, o) => s + Math.min(o.w, len) * Math.min(o.h, H), 0);
      const f = room.walls[i] && room.walls[i].finish;
      const finish = f && finishes[f] ? f : defaultFinish;
      return { i, len, finish, gross: len * H, openings: opArea, net: Math.max(0, len * H - opArea), count: ops.length };
    });
    const sum = (arr, k) => arr.reduce((s, w) => s + w[k], 0);
    const by = {};
    Object.keys(finishes).forEach((f) => { const ws = walls.filter((w) => w.finish === f); by[f] = { area: sum(ws, 'net'), gross: sum(ws, 'gross'), len: sum(ws, 'len'), n: ws.length, walls: ws }; });
    return Object.assign({ walls, openings: sum(walls, 'openings'), by }, by);
  }

  function editor(container, room, getDims, onChange, opts) {
    opts = opts || {};
    const finishes = opts.finishes || FINISH;
    const defaultFinish = opts.defaultFinish || Object.keys(finishes)[0];
    const VW = 680, PAD = 34, GAP = 8, TOP = 44; let VH = 320;
    let sel = 0; let selOpening = null; let drag = null; let geom = null;

    const wrap = document.createElement('div'); wrap.className = 'room';
    const svg = el('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'viz-svg room-svg', role: 'img', 'aria-label': 'Развёртка стен комнаты' });
    const panel = document.createElement('div'); panel.className = 'plan-panel';
    const hint = document.createElement('p'); hint.className = 'calc-note'; hint.textContent = 'Нажмите на стену, чтобы выбрать отделку. Проёмы тяните по стене, их можно перетащить на соседнюю стену.';
    wrap.appendChild(svg); wrap.appendChild(panel); wrap.appendChild(hint);
    container.innerHTML = ''; container.appendChild(wrap);

    function layout() {
      const { lens, H } = getDims();
      const total = lens.reduce((s, x) => s + x, 0);
      // Высота рисунка подстраивается под стены: масштаб от ширины, но не выше 260px по высоте
      const scale = Math.min((VW - PAD * 2 - GAP * (lens.length - 1)) / total, 260 / H);
      let x = PAD;
      const walls = lens.map((len) => { const w = { x, wpx: len * scale, len }; x += len * scale + GAP; return w; });
      const hpx = H * scale;
      geom = { scale, walls, hpx, top: TOP, H };
      VH = TOP + hpx + 40;
      svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
    }
    const wallOf = (px) => { const n = geom.walls.length; for (let i = 0; i < n; i++) { const w = geom.walls[i]; if (px >= w.x - GAP / 2 && px <= w.x + w.wpx + GAP / 2) return i; } return px < geom.walls[0].x ? 0 : n - 1; };
    function toLocal(evt) {
      const r = svg.getBoundingClientRect();
      return { px: (evt.clientX - r.left) / r.width * VW, py: (evt.clientY - r.top) / r.height * VH };
    }

    function redraw() {
      const dims = getDims();
      if (!(dims.lens && dims.lens.length >= 3 && dims.lens.every((x) => x > 0) && dims.H > 0)) { svg.innerHTML = ''; panel.innerHTML = ''; return; }
      if (sel >= dims.lens.length) sel = 0;
      room.openings.forEach((o) => { if (o.wall >= dims.lens.length) o.wall = dims.lens.length - 1; });
      layout();
      svg.innerHTML = '';
      const m = measure(room, dims.lens, dims.H, finishes, defaultFinish);
      geom.walls.forEach((w, i) => {
        const finish = m.walls[i].finish;
        const rect = el('rect', { x: w.x, y: geom.top, width: w.wpx, height: geom.hpx, class: 'room-wall room-wall--' + finish + (sel === i ? ' is-selected' : '') });
        rect.addEventListener('pointerdown', (e) => { sel = i; selOpening = null; redraw(); e.preventDefault(); });
        svg.appendChild(rect);
        const many = geom.walls.length > 6;
        svg.appendChild(el('text', { x: w.x + w.wpx / 2, y: geom.top - 10, class: many ? 'viz-small' : 'viz-label', 'text-anchor': 'middle' }, many ? `${i + 1}: ${fmt(w.len)}` : `${wallName(i)} · ${fmt(w.len)} м`));
        svg.appendChild(el('text', { x: w.x + w.wpx / 2, y: geom.top + geom.hpx + 16, class: 'viz-small', 'text-anchor': 'middle' }, many ? fmt(m.walls[i].net) : `${finishes[finish]} · ${fmt(m.walls[i].net)} м²`));
      });
      room.openings.forEach((o, idx) => {
        const w = geom.walls[o.wall]; if (!w || !(o.w > 0 && o.h > 0)) return;
        const ox = w.x + o.x * geom.scale, oy = geom.top + geom.hpx - (o.y + o.h) * geom.scale;
        const g = el('g', { class: 'room-opening' + (selOpening === idx ? ' is-selected' : '') });
        g.appendChild(el('rect', { x: ox, y: oy, width: o.w * geom.scale, height: o.h * geom.scale, class: o.kind === 'door' ? 'viz-door' : 'viz-window' }));
        g.appendChild(el('text', { x: ox + o.w * geom.scale / 2, y: oy + o.h * geom.scale / 2 + 4, class: 'viz-small', 'text-anchor': 'middle' }, `${fmt(o.w)}×${fmt(o.h)}`));
        g.addEventListener('pointerdown', (e) => {
          const p = toLocal(e);
          // Клик по проёму выбирает его стену и сам проём — параметры и «убрать» появляются в панели
          sel = o.wall; selOpening = idx;
          drag = { idx, dx: p.px - ox, dy: p.py - oy };
          g.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
          renderPanel(m);
        });
        svg.appendChild(g);
      });
      svg.appendChild(el('text', { x: PAD - 8, y: geom.top + geom.hpx / 2, class: 'viz-label', 'text-anchor': 'end', transform: `rotate(-90 ${PAD - 8} ${geom.top + geom.hpx / 2})` }, `${fmt(dims.H)} м`));
      renderPanel(m);
    }

    svg.addEventListener('pointermove', (e) => {
      if (!drag || !geom) return;
      const o = room.openings[drag.idx]; if (!o) return;
      const p = toLocal(e);
      const wi = wallOf(p.px - drag.dx + o.w * geom.scale / 2);
      const w = geom.walls[wi];
      o.wall = wi;
      o.x = snap(Math.max(0, Math.min(w.len - o.w, (p.px - drag.dx - w.x) / geom.scale)));
      const bottom = (geom.top + geom.hpx - (p.py - drag.dy)) / geom.scale - o.h;
      o.y = snap(Math.max(0, Math.min(geom.H - o.h, bottom)));
      redraw(); onChange();
    });
    const stop = () => { if (drag) { drag = null; redraw(); } };
    svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop);

    function btn(text, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.addEventListener('click', fn); return b; }
    function num(labelText, value, onInput) {
      const l = document.createElement('label'); l.className = 'calc-opening-f';
      const sp = document.createElement('span'); sp.textContent = labelText;
      const inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = String(value);
      inp.addEventListener('change', () => onInput(Number(inp.value.replace(',', '.'))));
      l.appendChild(sp); l.appendChild(inp); return l;
    }
    const OPENING_PRESETS = [
      { kind: 'window', label: '+ окно', w: 1.4, h: 1.4, y: 0.9 },
      { kind: 'door', label: '+ дверь', w: 0.9, h: 2.1, y: 0 },
      { kind: 'window', label: '+ балконная дверь', w: 0.8, h: 2.1, y: 0 },
    ];

    function renderPanel(m) {
      panel.innerHTML = '';
      const t = document.createElement('p'); t.className = 'plan-panel-title';
      t.textContent = `${wallName(sel)}: ${fmt(m.walls[sel].len)} м, под отделку ${fmt(m.walls[sel].net)} м²`;
      panel.appendChild(t);
      const fs = document.createElement('div'); fs.className = 'calc-chips';
      Object.keys(finishes).forEach((f) => {
        const id = 'room-finish-' + f;
        const input = document.createElement('input'); input.type = 'radio'; input.name = 'room-finish'; input.id = id; input.value = f;
        input.checked = m.walls[sel].finish === f;
        input.addEventListener('change', () => { room.walls[sel] = { finish: f }; redraw(); onChange(); });
        const label = document.createElement('label'); label.htmlFor = id; label.textContent = finishes[f];
        const d = document.createElement('div'); d.className = 'calc-chip'; d.appendChild(input); d.appendChild(label); fs.appendChild(d);
      });
      panel.appendChild(fs);
      const all = document.createElement('div'); all.className = 'calc-presets';
      Object.keys(finishes).filter((f) => f !== 'none').forEach((f) => all.appendChild(btn('Все стены — ' + finishes[f].toLowerCase(), 'calc-preset', () => { room.walls = m.walls.map(() => ({ finish: f })); redraw(); onChange(); })));
      panel.appendChild(all);
      // проёмы на выбранной стене; выбранный кликом — подсвечен
      const ops = room.openings.map((o, idx) => ({ o, idx })).filter(({ o }) => o.wall === sel);
      if (ops.length) { const st = document.createElement('p'); st.className = 'calc-openings-title'; st.textContent = 'Проёмы на этой стене (нажмите на проём в развёртке, чтобы найти его):'; panel.appendChild(st); }
      const len = m.walls[sel].len;
      ops.forEach(({ o, idx }) => {
        const row = document.createElement('div'); row.className = 'calc-opening' + (selOpening === idx ? ' is-selected' : '');
        const kind = document.createElement('span'); kind.className = 'calc-opening-kind'; kind.textContent = o.kind === 'door' ? 'Дверь' : 'Окно'; row.appendChild(kind);
        const clamp = () => { o.w = Math.min(o.w, len); o.h = Math.min(o.h, geom.H); o.x = Math.max(0, Math.min(len - o.w, o.x)); o.y = Math.max(0, Math.min(geom.H - o.h, o.y)); };
        row.appendChild(num('ширина, м', o.w, (v) => { if (v > 0) o.w = v; clamp(); redraw(); onChange(); }));
        row.appendChild(num('высота, м', o.h, (v) => { if (v > 0) o.h = v; clamp(); redraw(); onChange(); }));
        row.appendChild(num('от левого края, м', o.x, (v) => { o.x = v; clamp(); redraw(); onChange(); }));
        row.appendChild(num('от пола, м', o.y, (v) => { o.y = v; clamp(); redraw(); onChange(); }));
        row.appendChild(btn('× убрать', 'calc-opening-del calc-opening-del--text', () => { room.openings.splice(idx, 1); selOpening = null; redraw(); onChange(); }));
        panel.appendChild(row);
      });
      const others = room.openings.length - ops.length;
      if (others > 0) { const p2 = document.createElement('p'); p2.className = 'calc-note'; p2.textContent = 'Ещё ' + others + ' проём(а) на других стенах: нажмите на стену или на сам проём.'; panel.appendChild(p2); }
      const adders = document.createElement('div'); adders.className = 'calc-presets';
      OPENING_PRESETS.forEach((p) => adders.appendChild(btn(`${p.label} ${p.w}×${p.h}`, 'calc-preset', () => {
        const len = geom.walls[sel].len;
        const used = room.openings.filter((o) => o.wall === sel).reduce((s, o) => Math.max(s, o.x + o.w), 0);
        room.openings.push({ kind: p.kind, w: p.w, h: p.h, wall: sel, x: snap(Math.min(Math.max(0, len - p.w), used + 0.3)), y: Math.min(p.y, Math.max(0, geom.H - p.h)) });
        selOpening = room.openings.length - 1;
        redraw(); onChange();
      })));
      panel.appendChild(adders);
    }

    redraw();
    return { redraw };
  }

  window.CalcRoom = { editor, measure, FINISH, wallName };
})();
