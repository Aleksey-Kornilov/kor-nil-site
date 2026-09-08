// Сборка CSS для 11ty: критичная часть уходит инлайном в <head>,
// остальное — одним минифицированным файлом с хешем в имени (кэш-бастинг).
//
// Почему так: раньше head.njk грузил 8–10 отдельных css-файлов, каждый —
// блокирующий запрос. Для сайта, который продаёт Core Web Vitals как услугу,
// это витрина: инлайн критичного = первая отрисовка без ожидания сети.

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import CleanCSS from 'clean-css';

const CSS_DIR = 'src/assets/css';

// Что нужно для первого экрана на любой странице: переменные, сетка,
// тёмная тема, стекло (шапка), меню, кнопки (hero-CTA).
const CRITICAL = [
  'base.css',
  'layout.css',
  'components/theme.css',
  'components/glass.css',
  'components/nav.css',
  'components/button.css',
];

// Всё остальное — карточки, футер, стили страниц, галерея.
const BUNDLE = [
  'components/card.css',
  'components/footer.css',
  'components/gallery.css',
  ...readdirSync(path.join(CSS_DIR, 'pages')).sort().map((f) => `pages/${f}`),
];

const minifier = new CleanCSS({ level: 1 });

function concatAndMinify(files) {
  const raw = files.map((f) => readFileSync(path.join(CSS_DIR, f), 'utf8')).join('\n');
  const out = minifier.minify(raw);
  if (out.errors.length) throw new Error('CSS minify: ' + out.errors.join('; '));
  return out.styles;
}

let cache = null;

/** Собирает CSS один раз за сборку. Возвращает { critical, bundle, bundleUrl }. */
export function buildCss() {
  if (cache) return cache;
  const critical = concatAndMinify(CRITICAL);
  const bundle = concatAndMinify(BUNDLE);
  const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 8);
  cache = { critical, bundle, bundleUrl: `/assets/css/site.${hash}.css` };
  return cache;
}

/** Пишет бандл в dist и сбрасывает кэш (для следующей сборки в --serve). */
export function writeBundle(outputDir) {
  const { bundle, bundleUrl } = buildCss();
  const target = path.join(outputDir, bundleUrl);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bundle);
}

export function resetCssCache() {
  cache = null;
}
