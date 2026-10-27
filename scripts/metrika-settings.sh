#!/usr/bin/env bash
# Настройки счётчика Метрики kor-nil.ru (27.10.2026). Запускает Алексей: ! bash scripts/metrika-settings.sh
# 1) часовой пояс — Самара (сутки в сводке бота — самарские);
# 2) фильтр роботов — по строгим правилам и по поведению;
# 3) «Не учитывать мои визиты» — заходы Алексея (браузеры, где он вошёл в Яндекс) не считаются;
# 4) удалить мёртвую цель «Написал через форму» (contact_sent) — её больше никто не отправляет.
# Повторный запуск безопасен: что уже сделано, пропускается.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
A="Authorization: OAuth $YANDEX_OAUTH_TOKEN"
M="https://api-metrika.yandex.net/management/v1/counter/$METRIKA_COUNTER_ID"
J="Content-Type: application/json"

echo "1–2) Часовой пояс и роботы…"
curl -s -X PUT -H "$A" -H "$J" -d '{"counter":{"time_zone_name":"Europe/Samara","filter_robots":2}}' "$M" \
  | python3 -c "import json,sys; c=json.load(sys.stdin).get('counter') or {}; print('   часовой пояс:', c.get('time_zone_name'), '| роботы:', {1:'только строгие правила',2:'строгие правила и поведение'}.get(c.get('filter_robots'), c.get('filter_robots')))"

echo "3) Не учитывать мои визиты…"
if curl -s -H "$A" "$M/filters" | grep -q '"type":"me"'; then
  echo "   уже стоит"
else
  curl -s -X POST -H "$A" -H "$J" -d '{"filter":{"attr":"uniq_id","type":"me","value":"","action":"exclude","status":"active"}}' "$M/filters" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('   добавлено' if 'filter' in d else '   ОШИБКА: ' + json.dumps(d, ensure_ascii=False)[:200])"
fi

echo "4) Удалить цель «Написал через форму»…"
if curl -s -H "$A" "$M/goals" | grep -q '"id":611924478'; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$A" "$M/goal/611924478")
  [ "$code" = 200 ] && echo "   удалена" || echo "   ОШИБКА: код $code"
else
  echo "   уже удалена"
fi

echo "--- проверка ---"
curl -s -H "$A" "$M/goals" | python3 -c "import json,sys; print('   целей:', len(json.load(sys.stdin)['goals']))"
curl -s -H "$A" "$M/filters" | python3 -c "import json,sys; print('   фильтры:', ', '.join(f['type'] + ('(исключить)' if f['action']=='exclude' else '') for f in json.load(sys.stdin)['filters']))"
