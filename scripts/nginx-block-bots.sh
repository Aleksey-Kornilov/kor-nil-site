#!/usr/bin/env bash
# Закрывает kor-nil.ru от сборщиков форм для рекламных рассылок.
# 27.10.2026 пришла «заявка»-реклама: сначала FormDelivery/1.0 скачал /contact/, через секунды
# браузер с того же адреса заполнил форму. Без страницы с формой сборщик её не найдёт.
# Запуск с Мака (VPN выключен): bash scripts/nginx-block-bots.sh
# Что делает: бэкап конфига → вставка строки после server_name (HTTPS-блок) → nginx -t → reload.
# Повторный запуск безопасен: если строка уже есть, ничего не меняет.
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
if "FormDelivery" in s:
    print("блокировка уже есть — ничего не меняю")
    sys.exit(0)
anchor = "server {\n    server_name kor-nil.ru www.kor-nil.ru;\n"
assert s.count(anchor) == 1, "не нашёл первый server-блок"
block = anchor + """
    # Сборщики форм для рекламных рассылок — 403 (scripts/nginx-block-bots.sh в репо сайта)
    if ($http_user_agent ~* "FormDelivery") { return 403; }
"""
open(p, "w").write(s.replace(anchor, block))
print("строка добавлена")
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

echo "--- проверка ---"
ssh -o BatchMode=yes root@sntchat.ru '
  curl -s -o /dev/null -w "FormDelivery: %{http_code}\n" -A "FormDelivery/1.0" https://kor-nil.ru/contact/
  curl -s -o /dev/null -w "обычный браузер: %{http_code}\n" -A "Mozilla/5.0" https://kor-nil.ru/contact/'
