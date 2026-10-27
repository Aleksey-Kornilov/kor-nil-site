// Сводки по kor-nil.ru — Алексею в ЧатЯдро, от бота «kor-nil.ru».
//
// Каждое утро одна сводка, простыми словами: коротко → разбор → заключение (растёт / держится / затухает).
//   обычный день   — за вчера (daily.js);
//   понедельник    — за прошлую неделю, 1-е число — за прошлый месяц,
//   1 янв/апр/июл/окт — за прошлый квартал (period.js). Совпали — шлём самую крупную.
//
// Где живёт: на сервере в /root/kor-nil-report/ (код ЧатЯдра не трогаем, его не перезапускаем).
// Отправка — через уже работающего бота «kor-nil.ru» (services/kor_nil_bot.js бэкенда ЧатЯдра):
// пуш уходит пустым, «Новое сообщение», цифры не попадают к Google и Apple.
// Запуск — системный cron в 08:00 МСК = 09:00 по Самаре (см. README.md рядом).
//
//   node report.js                      собрать и отправить то, что положено сегодня
//   node report.js --dry                только напечатать (ничего не шлёт)
//   node report.js --kind=week --dry    посмотреть конкретную: day | week | month | quarter
//   node report.js --force              отправить, даже если сегодня уже отправляли
//
// Настройки — .env рядом: YANDEX_OAUTH_TOKEN, METRIKA_COUNTER_ID, WM_USER_ID, WM_HOST_ID.
'use strict';
const { fs, path, HERE, today, Y, human } = require('./common');
const { daily } = require('./daily');
const { periodReport, kindForToday } = require('./period');

const BACKEND = process.env.KOR_NIL_BACKEND || '/root/sntchat-app/backend';
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const KIND = (process.argv.find((a) => a.startsWith('--kind=')) || '').slice(7) || kindForToday();
const NAMES = { day: 'за ' + human(Y), week: 'за неделю', month: 'за месяц', quarter: 'за квартал' };

async function main() {
  const stateFile = path.join(HERE, 'last-sent.txt');
  if (!DRY && !FORCE && fs.existsSync(stateFile) && fs.readFileSync(stateFile, 'utf8').trim() === today) { console.log(today, 'уже отправлено'); return; }
  let text;
  try {
    text = KIND === 'day' ? await daily() : await periodReport(KIND);
  } catch (e) {
    console.error(new Date().toISOString(), KIND, 'сбор не удался:', e.message);
    text = `📊 kor-nil.ru — сводку ${NAMES[KIND] || ''} собрать не удалось: Метрика не ответила (${String(e.message).slice(0, 80)}). Завтра попробую снова.`;
  }
  if (DRY) { console.log(text); return; }
  require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
  const { sendKorNilMessage } = require(path.join(BACKEND, 'services/kor_nil_bot'));
  const r = await sendKorNilMessage(null, text);
  console.log(new Date().toISOString(), KIND, 'отправка:', JSON.stringify(r));
  if (r && r.ok) fs.writeFileSync(stateFile, today);
  // Пуш уходит в фоне — даём ему время, потом выходим (таймеры бэкенда держат процесс)
  await new Promise((res) => setTimeout(res, 8000));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
