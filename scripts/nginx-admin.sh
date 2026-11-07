#!/usr/bin/env bash
# Панель заявок kor-nil.ru/admin/ в nginx: пароль и проброс /admin/api/ к бэкенду ЧатЯдра (127.0.0.1:3010).
# Запускать, когда бэкенд заявок выложен и в /root/sntchat-app/backend/.env есть KOR_NIL_ADMIN_SECRET.
# Запуск с Мака (VPN выключен): bash scripts/nginx-admin.sh
# Что делает: пароль создаёт на Маке и кладёт в файл на столе (в вывод не печатает) → бэкап конфига →
# вставка блока → nginx -t → reload, при ошибке возврат из бэкапа. Повторный запуск безопасен.
set -euo pipefail

PAPKA="$HOME/Desktop/kor-nil.ru/2. Панель заявок"
FAJL="$PAPKA/vhod-v-panel.txt"
LOGIN=aleksey

mkdir -p "$PAPKA"
if [ ! -f "$FAJL" ]; then
  ( umask 077; printf 'https://kor-nil.ru/admin/\nлогин: %s\nпароль: %s\n' "$LOGIN" "$(openssl rand -base64 24 | tr -d '/+=')" > "$FAJL" )
fi
PAROL=$(sed -n 's/^пароль: //p' "$FAJL")
HASH=$(printf '%s' "$PAROL" | openssl passwd -apr1 -stdin)

printf '%s:%s\n' "$LOGIN" "$HASH" | ssh -o BatchMode=yes root@sntchat.ru 'bash -c "
  set -euo pipefail
  cat > /etc/nginx/.htpasswd-kor-nil-admin
  chown --reference=/etc/nginx/.htpasswd-dom /etc/nginx/.htpasswd-kor-nil-admin
  chmod --reference=/etc/nginx/.htpasswd-dom /etc/nginx/.htpasswd-kor-nil-admin"'

ssh -o BatchMode=yes root@sntchat.ru 'bash -s' <<'REMOTE'
set -euo pipefail
CONF=/etc/nginx/sites-available/kor-nil
SECRET_FILE=/etc/nginx/kor-nil-admin-secret.conf

# Секрет — тот же, что у бэкенда. Берём из его .env, в вывод не попадает.
SECRET=$(sed -n 's/^KOR_NIL_ADMIN_SECRET=//p' /root/sntchat-app/backend/.env | tr -d '"' | tail -1)
if [ -z "$SECRET" ]; then
  echo "В .env бэкенда нет KOR_NIL_ADMIN_SECRET — сначала выкладка бэкенда заявок" >&2
  exit 1
fi
if ! printf '%s' "$SECRET" | grep -Eq '^[A-Za-z0-9_-]{16,}$'; then
  echo "KOR_NIL_ADMIN_SECRET с необычными символами: в nginx он сломается, нужен hex или base64url" >&2
  exit 1
fi
( umask 077; printf 'proxy_set_header X-Kor-Nil-Admin "%s";\n' "$SECRET" > "$SECRET_FILE" )

cat > /etc/nginx/conf.d/kor-nil-admin-limit.conf <<'NGX'
limit_req_zone $binary_remote_addr zone=kor_nil_admin:1m rate=5r/s;
NGX

# add_header внутри location перекрывает серверные заголовки, поэтому здесь полный набор.
cat > /etc/nginx/snippets/kor-nil-admin-headers.conf <<'NGX'
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
add_header X-Robots-Tag "noindex, nofollow" always;
add_header Cache-Control "no-store" always;
NGX

BAK=/root/kor-nil-nginx.bak-$(date +%F-%H%M)
cp "$CONF" "$BAK"
echo "бэкап: $BAK"

python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
if "location ^~ /admin/" in s:
    print("блок панели уже есть — конфиг не меняю")
    sys.exit(0)
anchor = "    # Статика из нескольких страниц: путь не найден → честный 404."
assert anchor in s, "не нашёл место для вставки в конфиге"
block = r'''    # --- Панель заявок (scripts/nginx-admin.sh в репо сайта) ---
    # ^~ обязательно: иначе /admin/admin.js уйдёт в location ~* \.js$ мимо пароля.
    location ^~ /admin/ {
        auth_basic "Заявки";
        auth_basic_user_file /etc/nginx/.htpasswd-kor-nil-admin;
        limit_req zone=kor_nil_admin burst=30 nodelay;
        include /etc/nginx/snippets/kor-nil-admin-headers.conf;

        location /admin/api/ {
            # Счётчики для терминалов — только на 127.0.0.1:3010 со своим ключом, панели они не нужны.
            location ^~ /admin/api/stat { return 404; }
            if ($request_uri ~ "(%|/\.|//)") { return 400; }
            client_max_body_size 8k;
            proxy_pass http://127.0.0.1:3010/api/kor-nil-admin/;
            proxy_set_header Host $host;
            proxy_set_header Authorization "";
            include /etc/nginx/kor-nil-admin-secret.conf;
            include /etc/nginx/snippets/kor-nil-admin-headers.conf;
        }
    }

'''
open(p, "w").write(s.replace(anchor, block + anchor, 1))
print("блок панели вставлен")
PY

if nginx -t; then
  systemctl reload nginx
  echo "nginx перезагружен"
else
  cp "$BAK" "$CONF"
  echo "nginx -t не прошёл — конфиг возвращён из бэкапа" >&2
  exit 1
fi
REMOTE

echo "--- проверка: без пароля везде должно быть 401 ---"
ssh -o BatchMode=yes root@sntchat.ru 'for u in /admin/ /admin/admin.js /admin/admin.css /admin/api/zayavki; do
  curl -s -o /dev/null -w "$u: %{http_code}\n" "https://kor-nil.ru$u"; done'
echo "--- с паролем: страница 200, данные 200 (сами данные в вывод не попадают) ---"
printf 'user = "%s:%s"\n' "$LOGIN" "$PAROL" | ssh -o BatchMode=yes root@sntchat.ru \
  'K=$(cat); for u in /admin/ "/admin/api/zayavki?limit=1"; do
     printf "%s\n" "$K" | curl -s -K - -o /dev/null -w "$u: %{http_code}\n" "https://kor-nil.ru$u"; done'
echo "--- проверка: секрет снаружи не работает, сайт жив ---"
ssh -o BatchMode=yes root@sntchat.ru '
  curl -s -o /dev/null -w "sntchat.ru без доступа: %{http_code}\n" https://sntchat.ru/api/kor-nil-admin/zayavki
  curl -s -o /dev/null -w "главная: %{http_code}\n" https://kor-nil.ru/'
echo "Вход записан в файл: $FAJL"
