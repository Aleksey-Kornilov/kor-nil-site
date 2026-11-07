#!/bin/bash
# Панель kor-nil.ru/admin/: вход по сессии вместо пароля nginx (auth_request к бэкенду ЧатЯдра).
# Запускать, когда новый вход проверен в браузере. При любом сбое конфиг возвращается из бэкапа.
set -euo pipefail

ssh -o BatchMode=yes root@sntchat.ru 'bash -s' <<'REMOTE'
set -euo pipefail
CONF=/etc/nginx/sites-available/kor-nil
LIMIT=/etc/nginx/conf.d/kor-nil-admin-limit.conf
PROXY=/etc/nginx/snippets/kor-nil-admin-proxy.conf
# Копия вне sites-enabled: иначе nginx прочитал бы её как второй сайт.
BAK=/root/kor-nil-nginx.bak-$(date +%F-%H%M)
cp "$CONF" "$BAK"
cp "$LIMIT" "$BAK.limit"
echo "бэкап: $BAK"

vernut() {
  cp "$BAK" "$CONF"; cp "$BAK.limit" "$LIMIT"; rm -f "$PROXY"
  nginx -t && systemctl reload nginx
  echo "конфиг возвращён из бэкапа" >&2
  exit 1
}

grep -q 'kor_nil_admin_vhod' "$LIMIT" || cat >> "$LIMIT" <<'NGX'
limit_req_zone $binary_remote_addr zone=kor_nil_admin_vhod:1m rate=5r/m;
NGX

cat > "$PROXY" <<'NGX'
proxy_set_header Host $host;
proxy_set_header Authorization "";
# Перезапись, а не добавление: иначе адрес клиента можно подделать.
proxy_set_header X-Forwarded-For $remote_addr;
include /etc/nginx/kor-nil-admin-secret.conf;
include /etc/nginx/snippets/kor-nil-admin-headers.conf;
NGX

python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
nachalo = "    # --- Панель заявок (scripts/nginx-admin.sh в репо сайта) ---"
konec = "    # Статика из нескольких страниц: путь не найден → честный 404."
assert nachalo in s and konec in s, "не нашёл блок панели в конфиге"
a, b = s.index(nachalo), s.index(konec)
block = r'''    # --- Панель (scripts/nginx-admin-sessiya.sh в репо сайта) ---
    # ^~ обязательно: иначе /admin/admin.js уйдёт в location ~* \.js$ мимо проверки.
    location ^~ /admin/ {
        auth_request /_kor_nil_admin_proverka;
        error_page 401 = @kor_nil_admin_vhod;
        limit_req zone=kor_nil_admin burst=30 nodelay;
        include /etc/nginx/snippets/kor-nil-admin-headers.conf;

        # Единственное, что открыто без сессии: экран входа. Данных в нём нет.
        location ^~ /admin/vhod/ {
            auth_request off;
            include /etc/nginx/snippets/kor-nil-admin-headers.conf;
        }

        location /admin/api/ {
            error_page 401 = @kor_nil_admin_net_sessii;
            # Счётчики для терминалов — только на 127.0.0.1:3010 со своим ключом, панели они не нужны.
            location ^~ /admin/api/stat { return 404; }
            if ($request_uri ~ "(%|/\.|//)") { return 400; }
            client_max_body_size 8k;

            location = /admin/api/vhod {
                auth_request off;
                limit_req zone=kor_nil_admin_vhod burst=5 nodelay;
                limit_req_status 429;
                proxy_pass http://127.0.0.1:3010/api/kor-nil-admin/vhod;
                include /etc/nginx/snippets/kor-nil-admin-proxy.conf;
            }
            location = /admin/api/foto {
                client_max_body_size 6m;
                proxy_pass http://127.0.0.1:3010/api/kor-nil-admin/foto;
                include /etc/nginx/snippets/kor-nil-admin-proxy.conf;
            }
            proxy_pass http://127.0.0.1:3010/api/kor-nil-admin/;
            include /etc/nginx/snippets/kor-nil-admin-proxy.conf;
        }
    }
    location = /_kor_nil_admin_proverka {
        internal;
        proxy_pass http://127.0.0.1:3010/api/kor-nil-admin/proverka;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        include /etc/nginx/snippets/kor-nil-admin-proxy.conf;
    }
    location @kor_nil_admin_vhod {
        include /etc/nginx/snippets/kor-nil-admin-headers.conf;
        return 302 https://kor-nil.ru/admin/vhod/;
    }
    location @kor_nil_admin_net_sessii {
        include /etc/nginx/snippets/kor-nil-admin-headers.conf;
        default_type application/json;
        return 401 '{"error":"no_session"}';
    }

'''
open(p, "w").write(s[:a] + block + s[b:])
print("блок панели заменён")
PY

nginx -t 2>&1 | tail -2 || true
nginx -t >/dev/null 2>&1 || vernut
systemctl reload nginx
sleep 1

# Проверка без cookie. Вход проверяется запросом не в JSON: бэкенд отвечает 415 без bcrypt и без записи неудачи.
ozhidanie='/admin/ 302
/admin/admin.js 302
/admin/vhod/ 200
/admin/vhod/panel.css 200
/admin/api/ya 401
/admin/api/zayavki 401
/admin/api/proverka 401
/admin/api/stat 404
/ 200
/contact/ 200'
sboj=0
while read -r u nuzhen; do
  est=$(curl -s -o /dev/null -w '%{http_code}' "https://kor-nil.ru$u")
  echo "$u: $est (нужно $nuzhen)"
  [ "$est" = "$nuzhen" ] || sboj=1
done <<< "$ozhidanie"
est=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: text/plain' -H 'Origin: https://kor-nil.ru' -d x https://kor-nil.ru/admin/api/vhod)
echo "POST /admin/api/vhod не JSON: $est (нужно 415)"
[ "$est" = "415" ] || sboj=1
[ "$sboj" = 0 ] || vernut
echo "готово"
REMOTE
