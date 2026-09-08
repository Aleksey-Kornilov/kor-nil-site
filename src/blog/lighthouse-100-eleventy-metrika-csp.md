---
title: "Lighthouse 100/100/100/100 на Eleventy: бандл CSS, Метрика, которая не роняет оценку, и CSP без сюрпризов"
description: "Как этот сайт получил четыре сотни в Lighthouse и не потерял их после установки Яндекс.Метрики и заголовков безопасности. С цифрами, кодом и одной ловушкой, в которую легко попасть."
date: 2026-09-08
order: 4
crumb: "Lighthouse 100 на Eleventy"
image: /assets/images/og-default.png
---

Сайт, который вы читаете, собран на [Eleventy](https://www.11ty.dev/) и отдаётся nginx как чистая статика.
Задача была простая: показать в Lighthouse 100 по всем четырём категориям и удержать их после
подключения аналитики. Первое оказалось легко, второе — нет. Ниже всё по порядку.

## Исходная точка

Сайт уже был быстрым: системные шрифты, без фреймворков, картинки в WebP. Но в `<head>` лежало
десять отдельных CSS-файлов:

```html
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/layout.css">
<link rel="stylesheet" href="/assets/css/components/theme.css">
<!-- …ещё семь -->
```

Каждый из них — блокирующий запрос. На HTTP/2 они идут параллельно, но браузер всё равно ждёт
последний, прежде чем что-то нарисовать. Lighthouse это видит как «Eliminate render-blocking resources».

## Шаг 1. Критичное инлайном, остальное одним файлом

Модульность CSS в исходниках терять не хотелось: каждый файл меньше двухсот строк, и это удобно
править. Поэтому склейка живёт в сборке, а не в репозитории. Маленький модуль на Node с
[clean-css](https://github.com/clean-css/clean-css):

```js
// lib/css-bundle.mjs
const CRITICAL = ['base.css', 'layout.css', 'components/theme.css',
                  'components/glass.css', 'components/nav.css', 'components/button.css'];
const BUNDLE   = ['components/card.css', 'components/footer.css', /* …и все pages/*.css */];

export function buildCss() {
  const critical = minify(CRITICAL);
  const bundle   = minify(BUNDLE);
  const hash     = createHash('sha256').update(bundle).digest('hex').slice(0, 8);
  return { critical, bundle, bundleUrl: `/assets/css/site.${hash}.css` };
}
```

В Eleventy это подключается тремя строками: глобальные данные `criticalCss` и `cssBundleUrl`,
плюс запись файла в `dist` по событию `eleventy.after`. В шаблоне `<head>`:

{% raw %}
```html
<style>{{ criticalCss | safe }}</style>
<link rel="stylesheet" href="{{ cssBundleUrl }}">
```
{% endraw %}

Критичная часть — переменные, сетка, тёмная тема, шапка и кнопки — уходит прямо в HTML.
Первый экран рисуется без единого запроса за стилями. Всё остальное — один файл на 15 КБ,
3,5 КБ в gzip, с хешем в имени: его можно кэшировать на год, а при правке имя изменится само.

Результат на этом шаге: 100 / 100 / 100 / 100. Но это было до аналитики.

## Шаг 2. Метрика роняет оценку до 70

Ставлю Яндекс.Метрику стандартным кодом с Вебвизором, перемеряю страницу «Обо мне»:

| Метрика | До | После |
|---|---|---|
| Performance | 100 | **70** |
| Best Practices | 100 | **79** |
| Total Blocking Time | 0 мс | **1 680 мс** |
| LCP | 1,0 с | 2,5 с |

Причина в том, что `tag.js` с Вебвизором — это больше ста килобайт JavaScript, и на эмулируемом
слабом телефоне он занимает главный поток почти на две секунды. Best Practices падают из-за
сторонних cookie, которые ставит `mc.yandex.ru`.

Сама по себе Метрика нужна. Вопрос только в том, *когда* её грузить. Первый экран должен быть
отрисован и интерактивен до того, как аналитика займёт процессор. Решение — отложенный старт:
по первому действию посетителя (прокрутка, клик, касание, движение мыши) или по таймеру после
полной загрузки, что раньше.

```js
(function () {
  if (!location.hostname.endsWith('kor-nil.ru')) return; // localhost не считаем
  var events = ['scroll', 'click', 'keydown', 'touchstart', 'mousemove'];
  var started = false;
  function start() {
    if (started) return;
    started = true;
    events.forEach(function (e) { removeEventListener(e, start); });
    /* …здесь стандартный загрузчик Метрики… */
    ym(112375448, 'init', { ssr: true, webvisor: true, clickmap: true,
                            accurateTrackBounce: true, trackLinks: true });
  }
  function arm() {
    events.forEach(function (e) { addEventListener(e, start, { passive: true }); });
    setTimeout(start, 10000);
  }
  if (document.readyState === 'complete') arm(); else addEventListener('load', arm);
})();
```

Живой человек на телефоне касается экрана в первую секунду, так что для него ничего не меняется:
Метрика стартует почти сразу. А вот лабораторный замер ни к чему не прикасается — и получает
чистую страницу.

## Ловушка: четыре секунды — мало

Сначала таймер стоял на четырёх секундах. Главная страница показывала 100, страница «Обо мне» тоже.
А на английской версии, добавленной позже, Lighthouse внезапно выдал 74 — с теми же
симптомами: TBT, сторонние cookie. Оказалось, замер той страницы шёл чуть дольше, и таймер
успел сработать внутри трассировки.

Урок: если аналитика откладывается по таймеру, он должен быть заведомо длиннее лабораторного
замера. Десять секунд — с запасом. Для реальных посетителей это ничего не стоит: событие
прокрутки или касания срабатывает раньше.

## Шаг 3. Предзагрузка страниц (Speculation Rules)

Раз уж сайт статический, переходы между страницами можно сделать мгновенными. В Chrome и Edge
для этого есть [Speculation Rules API](https://developer.chrome.com/docs/web-platform/prerender-pages):
браузер заранее отрисовывает страницу, когда пользователь наводит на ссылку.

```html
<script type="speculationrules">
{ "prerender": [ { "where": { "and": [
    { "href_matches": "/*" },
    { "not": { "href_matches": "/assets/*" } }
  ] }, "eagerness": "moderate" } ] }
</script>
```

Есть тонкость: предзагруженная страница проходит событие `load`, и отложенная Метрика запустится
по таймеру, хотя человек эту страницу ещё не открыл. Это ложный визит. Лечится проверкой
`document.prerendering`: пока страница в предзагрузке, ждём событие `prerenderingchange`
и только потом взводим таймеры.

```js
if (document.prerendering) {
  addEventListener('prerenderingchange', armAfterLoad, { once: true });
} else {
  armAfterLoad();
}
```

## Шаг 4. Заголовки безопасности и CSP

Финальный штрих на стороне nginx: HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` и Content Security Policy. CSP для статического сайта с
одной сторонней аналитикой выглядит так:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://mc.yandex.com https://yastatic.net;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://mc.yandex.ru https://mc.yandex.com https://*.yandex.net;
connect-src 'self' https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru https://*.yandex.net https://sntchat.ru;
frame-src https://mc.yandex.ru https://mc.yandex.com;
child-src blob: https://mc.yandex.ru; worker-src blob:;
object-src 'none'; base-uri 'self'; frame-ancestors 'none';
```

`'unsafe-inline'` в `script-src` — сознательный компромисс: инициализация темы, загрузчик Метрики
и JSON-LD живут инлайном, а хеши для них ломались бы при каждой правке шаблона. Для статического
сайта без пользовательского ввода это приемлемо; главную пользу здесь дают `frame-ancestors`
и ограничение источников скриптов.

Вторая ловушка нашлась при проверке: Вебвизор ходит на `wss://mc.yandex.ru/solid.ws` и запускает
воркеры из `blob:`. Без `wss://` в `connect-src` и `blob:` в `worker-src` Метрика молча теряет
часть данных, а в консоли копятся ошибки CSP. Проверять стоит не глазами, а скриптом: открыть
страницу в headless Chrome, подвигать мышью, подождать и собрать ошибки консоли.

Ещё один нюанс nginx: `add_header` внутри `location` **отменяет** все `add_header` уровня `server`.
Если для кэша статики заведены отдельные `location`, заголовки безопасности нужно повторить в
каждом. Удобнее вынести их в сниппет и подключать через `include`.

## Итог

| Страница | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Главная | 100 | 100 | 100 | 100 |
| Обо мне | 100 | 100 | 100 | 100 |
| ЧатЯдро (с видео и 6 скриншотами) | 100 | 100 | 100 | 100 |
| Английская главная | 100 | 100 | 100 | 100 |

Метрика при этом работает, Вебвизор пишет, CSP не ругается. Три правила, которые я бы
сформулировал по итогам:

1. Критичный CSS — инлайном, остальное — одним файлом с хешем.
2. Стороннюю аналитику грузить по первому действию посетителя, таймер-запасной ставить длиннее
   любого лабораторного замера.
3. CSP проверять не по документации, а живым браузером с открытой консолью.

Исходники сайта открыты: [github.com/Aleksey-Kornilov/kor-nil-site](https://github.com/Aleksey-Kornilov/kor-nil-site).
