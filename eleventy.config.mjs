// Конфигурация Eleventy v3 (ES modules).
// Собирает src/ → dist/, копирует assets как есть, использует Nunjucks для шаблонов.

export default async function (eleventyConfig) {
  // Копируем ассеты «как есть» — CSS, JS, картинки, иконки без обработки.
  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/robots.txt');
  eleventyConfig.addPassthroughCopy({ 'src/favicon.ico': 'favicon.ico' });

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
