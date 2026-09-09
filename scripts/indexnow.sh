#!/usr/bin/env bash
# IndexNow: сообщаем Яндексу (и другим поисковикам через общий протокол) о новых
# и изменённых страницах сразу после выката. Обычная индексация занимает недели,
# IndexNow — часы. Ключ лежит в src/verify/<ключ>.txt и попадает в корень сайта.
#
# Запуск: bash scripts/indexnow.sh            # все страницы из sitemap
#         bash scripts/indexnow.sh /tools/ /blog/   # только указанные адреса
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="82d7956a2f83b9d7eb3a62c165b31a37"
HOST="kor-nil.ru"
ENDPOINT="https://yandex.com/indexnow"

if [ "$#" -gt 0 ]; then
  URLS=$(printf 'https://%s%s\n' "$HOST" "$@")
else
  URLS=$(grep -o '<loc>[^<]*</loc>' dist/sitemap.xml | sed 's/<[^>]*>//g')
fi

COUNT=$(printf '%s\n' "$URLS" | grep -c . || true)
[ "$COUNT" -gt 0 ] || { echo "Нечего отправлять"; exit 0; }

TMP_URLS="$(mktemp)"; trap 'rm -f "$TMP_URLS"' EXIT
printf '%s\n' "$URLS" > "$TMP_URLS"
BODY=$(python3 -c '
import json, sys
key, host, path = sys.argv[1], sys.argv[2], sys.argv[3]
urls = [u.strip() for u in open(path, encoding="utf-8") if u.strip()]
print(json.dumps({"host": host, "key": key, "keyLocation": "https://%s/%s.txt" % (host, key), "urlList": urls}, ensure_ascii=False))
' "$KEY" "$HOST" "$TMP_URLS")

echo "Отправляю $COUNT адрес(ов) в IndexNow…"
CODE=$(curl -sS -o /tmp/indexnow.out -w '%{http_code}' -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json; charset=utf-8' --data "$BODY")
echo "Ответ: $CODE"
case "$CODE" in
  200|202) echo "✅ Принято. 200 — принято, 202 — принято, ключ проверяется." ;;
  400) echo "🔴 Неверный формат запроса"; cat /tmp/indexnow.out ;;
  403) echo "🔴 Ключ не подтверждён: проверьте https://$HOST/$KEY.txt" ;;
  422) echo "🔴 Адреса не с этого домена или ключ не совпадает"; cat /tmp/indexnow.out ;;
  429) echo "🔴 Слишком часто — попробуйте позже" ;;
  *) cat /tmp/indexnow.out ;;
esac
