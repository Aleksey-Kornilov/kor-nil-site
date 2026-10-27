// blog-figures-planks.mjs — схемы раскладки планок для статьи про кварцвинил.
// Раскладку считает тот же код, что работает в калькуляторе на сайте: функции берутся
// прямо из src/assets/js/calculators.js при сборке. Поправили алгоритм — схемы в статье
// перерисуются сами и не разойдутся с калькулятором.

import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/assets/js/calculators.js', import.meta.url), 'utf8');
const from = SRC.indexOf('  function plankBands(');
const to = SRC.indexOf('    return res;\n  }', from);
if (from < 0 || to < 0) throw new Error('blog-figures-planks: не нашёл plankBands/plankLayout в calculators.js');
const { plankBands, plankLayout } = new Function(SRC.slice(from, to) + '    return res;\n  }\n  return { plankBands, plankLayout };')();

const W = 760;
const wrap = (inner, height, caption, label) => `<figure class="fig">
<div class="fig-scroll"><svg viewBox="0 0 ${W} ${height}" class="fig-svg" role="img" aria-label="${label}">${inner}</svg></div>
<figcaption>${caption}<span class="fig-hint"> Схему можно прокрутить вбок.</span></figcaption>
</figure>`;
const txt = (x, y, s, cls = 'fig-t', anchor = 'middle') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${s}</text>`;
const rect = (x, y, w, h, cls) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="${cls}"/>`;

// Прямоугольная комната len×wid м, планки вдоль длинной стороны — как режим «Пол: прямоугольная комната»
function room({ len, wid, P = 122, w = 18.3, pattern = 'free', gap = 5, shift = 30, minPiece = 20 }) {
  const L = len * 100, H = wid * 100, g = gap / 10;
  const bi = plankBands(H - 2 * g, w);
  const rows = bi.bands.map(([b0, b1]) => ({ y0: g + b0, y1: g + b1, segs: [[g, L - g]] }));
  const lay = plankLayout(rows, P, { pattern, shift, minPiece });
  const waste = (lay.fresh * P * w / 1e4 - len * wid) / (len * wid) * 100;
  return { L, H, rows, lay, waste, plus10: Math.ceil(len * wid * 1.1 / (P * w / 1e4) - 1e-9) };
}

// Комната в рамке x, y шириной px; возвращает SVG и высоту
function roomSvg(r, x, y, px) {
  const k = px / r.L;
  const planks = r.lay.pieces.map((p) => {
    const row = r.rows[p.row];
    return rect(x + p.x0 * k, y + row.y0 * k, (p.x1 - p.x0) * k, (row.y1 - row.y0) * k, 'viz-plank viz-plank--' + p.kind);
  }).join('');
  return { svg: planks + rect(x, y, r.L * k, r.H * k, 'fig-room'), h: r.H * k };
}

const LEGEND = (y) => {
  const items = [['viz-plank viz-plank--full', 'целая'], ['viz-plank viz-plank--cut', 'отпиленная'], ['viz-plank viz-plank--reuse', 'из обрезка']];
  const x0 = W / 2 - 190;
  return items.map(([cls, s], i) => rect(x0 + i * 140, y - 11, 22, 14, cls) + txt(x0 + i * 140 + 30, y, s, 'fig-s', 'start')).join('');
};

/* ---------- Комната 5×4 вразбежку: так выглядит раскладка ряд за рядом ---------- */
function planksRoom() {
  const r = room({ len: 5, wid: 4 });
  const s = roomSvg(r, 170, 46, 420);
  return wrap(txt(W / 2, 30, `Комната 5×4 м, кварцвинил 122×18,3 см: ${r.lay.fresh} планок, отход ${r.waste.toFixed(1).replace('.', ',')}%`, 'fig-t fig-b')
    + s.svg + LEGEND(46 + s.h + 30), 46 + s.h + 46,
    `Ряд начинается обрезком из прошлого ряда, если стыки отходят от соседних хотя бы на 30 см, иначе — новой планкой. Обрезков ушло в дело ${r.lay.reused}, а площадь с запасом 10% дала бы ${r.plus10} планок.`,
    'Раскладка планок кварцвинила в комнате 5 на 4 метра, ряд за рядом');
}

/* ---------- Санузел 2,5×1,6: смещение на половину против вразбежку ---------- */
function planksBath() {
  const a = room({ len: 2.5, wid: 1.6, pattern: 'half' }), b = room({ len: 2.5, wid: 1.6 });
  const px = 320, top = 70;
  const sa = roomSvg(a, 40, top, px), sb = roomSvg(b, 400, top, px);
  const pct = (x) => Math.round(x) + '%';
  return wrap(txt(200, 30, 'Со смещением на половину', 'fig-t fig-b') + txt(200, 52, `${a.lay.fresh} планок · отход ${pct(a.waste)}`, 'fig-s')
    + txt(560, 30, 'Вразбежку', 'fig-t fig-b') + txt(560, 52, `${b.lay.fresh} планок · отход ${pct(b.waste)}`, 'fig-s')
    + sa.svg + sb.svg + LEGEND(top + sa.h + 32), top + sa.h + 48,
    `Санузел 2,5×1,6 м. Запас 10% — это ${a.plus10} планок: для раскладки вразбежку хватит, для смещения на половину — нет, не хватит трёх, то есть ещё одной упаковки.`,
    'Две раскладки одного санузла: со смещением на половину и вразбежку');
}

/* ---------- Замок: почему обрезков две кучки ---------- */
function planksLock() {
  // Планка с замком на обоих концах: гребень справа, паз слева — рисуем выступом и вырезом
  const plank = (x, y, w, left, right, cls) => {
    let s = rect(x, y, w, 26, cls);
    if (left) s += rect(x - 6, y + 9, 6, 8, 'fig-lock');
    if (right) s += rect(x + w, y + 9, 6, 8, 'fig-lock');
    return s;
  };
  const y1 = 64, y2 = 168;
  const inner = txt(W / 2, 30, 'Замок есть на обоих концах планки, а у отпиленной — только на одном', 'fig-t fig-b')
    + txt(30, y1 - 12, 'Ряд кончается у стены', 'fig-t fig-b', 'start')
    + plank(30, y1, 220, true, false, 'viz-plank viz-plank--cut') + `<line x1="252" y1="${y1 - 6}" x2="252" y2="${y1 + 32}" class="fig-wall"/>`
    + txt(140, y1 + 46, 'в ряду: левый кусок', 'fig-s')
    + plank(330, y1, 150, false, true, 'viz-plank viz-plank--reuse')
    + txt(405, y1 + 46, 'обрезок: замок справа', 'fig-s')
    + txt(510, y1 + 18, '→ годится только в начало ряда', 'fig-t', 'start')
    + txt(30, y2 - 12, 'Ряд начали отпиленной планкой', 'fig-t fig-b', 'start')
    + `<line x1="28" y1="${y2 - 6}" x2="28" y2="${y2 + 32}" class="fig-wall"/>` + plank(30, y2, 150, false, true, 'viz-plank viz-plank--cut')
    + txt(105, y2 + 46, 'в ряду: правый кусок', 'fig-s')
    + plank(330, y2, 150, true, false, 'viz-plank viz-plank--reuse')
    + txt(405, y2 + 46, 'обрезок: замок слева', 'fig-s')
    + txt(510, y2 + 18, '→ годится только в конец ряда', 'fig-t', 'start');
  return wrap(inner, 236,
    'Поэтому калькулятор держит две кучки обрезков: одной начинает ряды, другой заканчивает. Если от обрезка отпилить ещё кусок, у остатка замков не будет вовсе — он идёт в отход.',
    'Как замок планки определяет, куда годится обрезок');
}

export const PLANK_FIGURES = { planksRoom, planksBath, planksLock };
