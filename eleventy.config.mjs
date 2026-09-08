// Конфигурация Eleventy v3 (ES modules).
// Собирает src/ → dist/, копирует assets как есть, использует Nunjucks для шаблонов.

import { buildCss, writeBundle, resetCssCache } from './lib/css-bundle.mjs';

export default async function (eleventyConfig) {
  // Копируем ассеты «как есть» — JS, картинки, иконки, видео без обработки.
  // CSS НЕ копируется: он собирается в lib/css-bundle.mjs (инлайн + один бандл).
  eleventyConfig.addPassthroughCopy('src/assets/js');
  eleventyConfig.addPassthroughCopy('src/assets/images');
  eleventyConfig.addPassthroughCopy('src/assets/icons');
  eleventyConfig.addPassthroughCopy('src/assets/video');
  eleventyConfig.addPassthroughCopy('src/robots.txt');
  eleventyConfig.addPassthroughCopy({ 'src/favicon.ico': 'favicon.ico' });

  // CSS: пересборка при правке любого css-файла в режиме --serve.
  eleventyConfig.addWatchTarget('src/assets/css/');
  eleventyConfig.on('eleventy.before', () => resetCssCache());
  eleventyConfig.on('eleventy.after', ({ dir }) => writeBundle(dir.output));
  // Глобальные данные для head.njk: criticalCss (инлайн) и cssBundleUrl (<link>).
  eleventyConfig.addGlobalData('criticalCss', () => buildCss().critical);
  eleventyConfig.addGlobalData('cssBundleUrl', () => buildCss().bundleUrl);

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
