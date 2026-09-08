#!/usr/bin/env bash
# Печатает resume/resume.html в PDF headless-Хромом → src/assets/files/ (файл коммитится).
# Запуск: npm run resume
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="src/assets/files/Aleksey-Kornilov-CV.pdf"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$PWD/resume/resume.html" 2>/dev/null
echo "→ $OUT ($(du -h "$OUT" | cut -f1))"
