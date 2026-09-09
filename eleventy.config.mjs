// Конфигурация Eleventy v3 (ES modules).
// Собирает src/ → dist/, копирует assets как есть, использует Nunjucks для шаблонов.

import markdownIt from 'markdown-it';
import { FIGURES } from './lib/blog-figures.mjs';
import { buildCss, writeBundle, resetCssCache } from './lib/css-bundle.mjs';

export default async function (eleventyConfig) {
  // Копируем ассеты «как есть» — JS, картинки, иконки, видео без обработки.
  // CSS НЕ копируется: он собирается в lib/css-bundle.mjs (инлайн + один бандл).
  eleventyConfig.addPassthroughCopy('src/assets/js');
  eleventyConfig.addPassthroughCopy('src/assets/images');
  eleventyConfig.addPassthroughCopy('src/assets/icons');
  eleventyConfig.addPassthroughCopy('src/assets/video');
  eleventyConfig.addPassthroughCopy('src/assets/files'); // PDF-резюме
  eleventyConfig.addPassthroughCopy('src/robots.txt');
  eleventyConfig.addPassthroughCopy({ 'src/favicon.ico': 'favicon.ico' });
  // Файлы подтверждения прав (Яндекс.Вебмастер и т.п.) — как есть, в корень сайта, без шаблонизации.
  eleventyConfig.addPassthroughCopy({ 'src/verify': '.' });
  eleventyConfig.ignores.add('src/verify/**');

  // CSS: пересборка при правке любого css-файла в режиме --serve.
  eleventyConfig.addWatchTarget('src/assets/css/');
  eleventyConfig.on('eleventy.before', () => resetCssCache());
  eleventyConfig.on('eleventy.after', ({ dir }) => writeBundle(dir.output));
  // Глобальные данные для head.njk: criticalCss (инлайн) и cssBundleUrl (<link>).
  // Язык страницы: ru по умолчанию, en задаётся в src/en/en.11tydata.json. Тексты — _data/i18n.json.
  eleventyConfig.addGlobalData('lang', 'ru');
  eleventyConfig.addGlobalData('criticalCss', () => buildCss().critical);
  eleventyConfig.addGlobalData('cssBundleUrl', () => buildCss().bundleUrl);

  // Markdown для статей блога: html внутри разрешён, ссылки распознаются, типографика («ёлочки», тире).
  eleventyConfig.setLibrary('md', markdownIt({ html: true, linkify: true, typographer: true, quotes: '«»‚‘' }));

  // Схемы в статьях: {% figure "имя" %} → готовый SVG из lib/blog-figures.mjs.
  eleventyConfig.addShortcode('figure', (name) => {
    const f = FIGURES[name];
    if (!f) throw new Error('Нет такой схемы для блога: ' + name);
    return f();
  });

  // Статьи блога: src/blog/*.md, новые сверху.
  eleventyConfig.addCollection('posts', (api) =>
    api.getFilteredByTag('posts').sort((a, b) => (b.date - a.date) || ((b.data.order || 0) - (a.data.order || 0)))
  );

  // Время чтения по тексту без тегов (≈180 слов в минуту для русского).
  eleventyConfig.addFilter('readingTime', (html) => {
    const words = String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 180));
  });
  // Первые N элементов коллекции.
  eleventyConfig.addFilter('head', (arr, n) => (arr || []).slice(0, n));
  // Дата для RSS (RFC 822).
  eleventyConfig.addFilter('rfc822', (d) => new Date(d).toUTCString());

  // Глобальный фильтр: год для футера («© 2026 Aleksey Kornilov»).
  eleventyConfig.addFilter('year', () => new Date().getFullYear());

  // Фильтр для форматирования даты в человеческом виде.
  eleventyConfig.addFilter('date', (dateObj, format = 'ru') => {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
    return format === 'iso'
      ? d.toISOString()
      : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  });

  // Абсолютный URL — нужен для OpenGraph и sitemap. site.url задан в _data/site.json.
  eleventyConfig.addFilter('absoluteUrl', (path, base) => {
    if (path.startsWith('http')) return path;
    const b = (base || '').replace(/\/$/, '');
    return b + (path.startsWith('/') ? path : '/' + path);
  });

  return {
    dir: {
      input: 'src',
      output: 'dist',
      includes: '_includes',
      data: '_data',
    },
    // Nunjucks — основной шаблонизатор. Плюс HTML и Markdown.
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    templateFormats: ['njk', 'md', 'html'],
  };
}
