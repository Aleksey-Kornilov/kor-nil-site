#!/usr/bin/env bash
# Печатает resume/resume.html и resume-en.html в PDF headless-Хромом → src/assets/files/ (файл коммитится).
# Запуск: npm run resume
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for pair in "resume.html:Aleksey-Kornilov-CV.pdf" "resume-en.html:Aleksey-Kornilov-CV-en.pdf"; do
  SRC="${pair%%:*}"; OUT="src/assets/files/${pair##*:}"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="$OUT" "file://$PWD/resume/$SRC" 2>/dev/null
  echo "→ $OUT ($(du -h "$OUT" | cut -f1))"
done
