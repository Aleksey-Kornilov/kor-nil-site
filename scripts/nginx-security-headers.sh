#!/usr/bin/env bash
# Заголовки безопасности + кэш статики для kor-nil.ru в nginx на VPS.
# Запуск с Мака (VPN выключен): bash scripts/nginx-security-headers.sh
# Что делает: бэкап конфига → вставка блока → nginx -t → reload → показывает заголовки.
# Повторный запуск безопасен: если заголовки уже есть, ничего не меняет.
set -euo pipefail

ssh -o BatchMode=yes root@sntchat.ru 'bash -s' <<'REMOTE'
set -euo pipefail
CONF=/etc/nginx/sites-available/kor-nil
BAK=/root/kor-nil-nginx.bak-$(date +%F-%H%M)
cp "$CONF" "$BAK"
echo "бэкап: $BAK"

python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
if "Strict-Transport-Security" in s:
    print("заголовки уже есть — ничего не меняю")
    sys.exit(0)

anchor = "    # Статика из нескольких страниц: путь не найден → честный 404."
assert anchor in s, "не нашёл место для вставки в конфиге"

csp = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://mc.yandex.com https://yastatic.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://mc.yandex.ru https://mc.yandex.com https://*.yandex.net",
    # Вебвизор ходит по wss:// и в воркеры blob: — без этого CSP его режет (проверено 08.09.2026)
    "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru wss://mc.yandex.com https://*.yandex.net https://sntchat.ru",
    "frame-src https://mc.yandex.ru https://mc.yandex.com",
    "child-src blob: https://mc.yandex.ru",
    "worker-src blob:",
    "media-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://sntchat.ru",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
])

security = [
    'add_header Strict-Transport-Security "max-age=31536000" always;',
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header X-Frame-Options "DENY" always;',
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;',
    'add_header Content-Security-Policy "%s" always;' % csp,
]

# Сниппет: add_header внутри location перекрывает серверные, поэтому location-блоки
# подключают те же заголовки через include.
open("/etc/nginx/snippets/kor-nil-security.conf", "w").write("\n".join(security) + "\n")

block = """    # --- Заголовки безопасности (см. /etc/nginx/snippets/kor-nil-security.conf) ---
    # CSP: свои ресурсы + Яндекс.Метрика + бэкенд формы на sntchat.ru. Инлайн-скрипты
    # нужны (инициализация темы, загрузчик Метрики, JSON-LD) — поэтому unsafe-inline.
    include /etc/nginx/snippets/kor-nil-security.conf;

    # --- Кэш статики: css с хешем — год, картинки/видео/pdf — 30 дней, js — час ---
    location ~* ^/assets/css/site\\.[a-f0-9]+\\.css$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        include /etc/nginx/snippets/kor-nil-security.conf;
    }
    location ~* \\.(webp|png|jpg|jpeg|svg|ico|mp4|pdf|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
        include /etc/nginx/snippets/kor-nil-security.conf;
    }
    location ~* \\.js$ {
        expires 1h;
        add_header Cache-Control "public";
        include /etc/nginx/snippets/kor-nil-security.conf;
    }

"""
open(p, "w").write(s.replace(anchor, block + anchor, 1))
print("вставлено")
PY

nginx -t && systemctl reload nginx && echo "nginx перезагружен"

echo "--- проверка ---"
for u in / /assets/js/nav.js /assets/images/og-default.png; do
  echo "$u:"
  curl -sSI "https://kor-nil.ru$u" | grep -iE "^(strict-transport|x-content|x-frame|referrer|permissions|content-security|cache-control)" | sed "s/^/   /" || true
done
REMOTE
