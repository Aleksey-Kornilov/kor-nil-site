// build-og.mjs — картинки для соцсетей: по одной на каждую статью блога.
//
// Зачем: одна общая картинка на весь блог означает, что во «ВКонтакте», Телеграме и
// поиске по картинкам все статьи выглядят одинаково. Своя карточка с главной цифрой
// материала — это и клик, и узнаваемость.
//
// Как: страница рисуется обычным HTML и снимается headless-браузером в 1200×630.
// Запуск: node scripts/build-og.mjs   (нужен установленный Chrome)

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'src/assets/images/blog';

// stat — то, что видно с расстояния и заставляет открыть; title — о чём статья.
const CARDS = [
  { slug: 'lighthouse-100-eleventy-metrika-csp', stat: '100 · 100 · 100 · 100',
    statSize: 84, title: 'Lighthouse 100 на Eleventy', sub: 'Бандл CSS, отложенная Метрика и CSP без сюрпризов' },
  { slug: 'szhatie-foto-i-video-flutter-ffmpeg', stat: '630 → 204 МБ',
    statSize: 104, title: 'Сжатие фото и видео', sub: 'Медиа-пайплайн: браузер, ffmpeg и кэш подписанных ссылок' },
  { slug: 'ranzhirovanie-lenty-bez-mashinnogo-obucheniya', stat: 'Окно 7 дней',
    statSize: 104, title: 'Лента без машинного обучения', sub: 'Непросмотренное вперёд и не больше двух постов подряд' },
  { slug: 'proverka-orfografii-v-pwa-flutter-hunspell', stat: '5000 слов за 3 мс',
    statSize: 92, title: 'Орфография в PWA на Flutter', sub: 'Hunspell на сервере, своя таблица опечаток, разбор в два шага' },
  { slug: 'rustore-publikaciya-otkaz-i-vskrytie-apk', stat: '9 дней до релиза',
    statSize: 96, title: 'Публикация в RuStore', sub: 'Пять шагов формы, отказ по юридическому основанию, вскрытие APK' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const html = (c) => `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden;
    font: 400 16px/1.4 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #f2f6fb; background: #0d1420; }
  .card { position: relative; width: 1200px; height: 630px; padding: 68px 76px;
    display: flex; flex-direction: column; justify-content: space-between; }
  .card::before { content: ''; position: absolute; inset: 0;
    background:
      radial-gradient(52% 62% at 88% 4%, rgba(107, 165, 234, 0.36), transparent 62%),
      radial-gradient(46% 58% at 4% 96%, rgba(126, 92, 214, 0.30), transparent 64%); }
  .card > * { position: relative; }
  .kicker { font-size: 25px; letter-spacing: 0.16em; text-transform: uppercase; color: #8fb6e6; font-weight: 600; }
  .stat { font-size: ${c.statSize}px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.08;
    background: linear-gradient(96deg, #ffffff 26%, #8fc0ff); -webkit-background-clip: text; color: transparent; }
  .title { font-size: 46px; font-weight: 700; line-height: 1.2; margin-top: 22px; }
  .sub { font-size: 26px; color: #b6c7dd; margin-top: 16px; max-width: 900px; line-height: 1.35; }
  .foot { display: flex; align-items: center; gap: 16px; font-size: 25px; color: #cfe0f3; }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: #6ba5ea; }
  .rule { flex: 1; height: 1px; background: rgba(255,255,255,0.16); }
</style>
<div class="card">
  <div class="kicker">Блог · kor-nil.ru</div>
  <div>
    <div class="stat">${esc(c.stat)}</div>
    <div class="title">${esc(c.title)}</div>
    <div class="sub">${esc(c.sub)}</div>
  </div>
  <div class="foot"><span class="dot"></span><span>Алексей Корнилов</span><span class="rule"></span><span>Full-stack Flutter · Node</span></div>
</div>`;

mkdirSync(OUT, { recursive: true });
const tmp = path.join(tmpdir(), 'kor-nil-og-' + process.pid);
mkdirSync(tmp, { recursive: true });

for (const c of CARDS) {
  const src = path.join(tmp, c.slug + '.html');
  writeFileSync(src, html(c));
  const shot = path.join(tmp, c.slug + '.png');
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1200,630', '--screenshot=' + shot, 'file://' + src], { stdio: 'ignore' });

  // OG остаётся PNG: не все соцсети и мессенджеры читают WebP в og:image.
  const og = path.join(OUT, 'og-' + c.slug + '.png');
  await sharp(shot).png({ compressionLevel: 9, palette: true }).toFile(og);

  // Превью для списка статей — WebP: вдвое легче JPEG при том же виде.
  const thumb = path.join(OUT, 'thumb-' + c.slug + '.webp');
  await sharp(shot).resize(640).webp({ quality: 82 }).toFile(thumb);

  console.log('✓ ' + og + '  +  ' + thumb);
}
rmSync(tmp, { recursive: true, force: true });
