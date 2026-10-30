# Проверка сайта — служба для kor-nil.ru/seo/proverka/

Посетитель вводит адрес, служба обходит до 20 страниц (2 запроса в секунду), проверяет ещё до 30 ссылок
и вес главной, собирает отчёт. Страница — `src/seo-proverka.njk` + `src/assets/js/proverka.js`.

| Файл | Что делает |
|---|---|
| `server.js` | HTTP на 127.0.0.1:8791, очередь (2 обхода одновременно), 5 проверок в час с IP, отчёты файлами на 30 дней |
| `crawl.js` | обход: главная, robots.txt, sitemap, страницы, ссылки, вес, зеркала http/www |
| `report.js` | факты → пункты отчёта «в порядке / замечание / проблема» с текстом «почему важно» |
| `robots.js` | разбор robots.txt (правила Яндекса или `*`) и sitemap.xml |
| `net.js` | безопасные запросы: только 80/443, внутренние адреса запрещены на каждом шаге и редиректе |

## На сервере

- Код: `/root/kor-nil-proverka/`, отчёты: `/root/kor-nil-proverka-data/<код>.json`.
- Служба: `systemctl status kor-nil-proverka`, логи `journalctl -u kor-nil-proverka`.
- nginx (`/etc/nginx/sites-available/kor-nil`, в блоке 443):
  ```nginx
  location /api/proverka/ {
      proxy_pass http://127.0.0.1:8791;
      proxy_set_header X-Real-IP $remote_addr;
      client_max_body_size 4k;
      include /etc/nginx/snippets/kor-nil-security.conf;
  }
  ```

Обновить:

```bash
rsync -rlqz --no-perms --exclude node_modules server/proverka/ root@sntchat.ru:/root/kor-nil-proverka/
ssh root@sntchat.ru 'cd /root/kor-nil-proverka && npm install --omit=dev --silent && systemctl restart kor-nil-proverka'
```
