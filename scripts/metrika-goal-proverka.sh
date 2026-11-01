#!/usr/bin/env bash
# Цели Метрики для /seo/proverka/ (30.10.2026). Запускает Алексей: ! bash scripts/metrika-goal-proverka.sh
# site_check — запустил проверку сайта; site_check_share — поделился отчётом.
# Повторный запуск безопасен: цель, которая уже есть, пропускается.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
A="Authorization: OAuth $YANDEX_OAUTH_TOKEN"
M="https://api-metrika.yandex.net/management/v1/counter/$METRIKA_COUNTER_ID"
J="Content-Type: application/json"

est=$(curl -s -H "$A" "$M/goals")
for pair in "site_check|Проверил сайт" "site_check_share|Поделился проверкой сайта"; do
  id=${pair%%|*}; name=${pair#*|}
  if echo "$est" | grep -q "\"url\":\"$id\""; then
    echo "   «${name}» уже есть"
    continue
  fi
  curl -s -X POST -H "$A" -H "$J" \
    -d "{\"goal\":{\"name\":\"${name}\",\"type\":\"action\",\"conditions\":[{\"type\":\"exact\",\"url\":\"$id\"}]}}" "$M/goals" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('   добавлена «${name}»' if 'goal' in d else '   ОШИБКА: ' + json.dumps(d, ensure_ascii=False)[:200])"
done
curl -s -H "$A" "$M/goals" | python3 -c "import json,sys; print('   целей:', len(json.load(sys.stdin)['goals']))"
