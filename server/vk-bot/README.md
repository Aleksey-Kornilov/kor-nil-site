# Бот ВК — калькуляторы в сообщениях сообщества

Сообщество «Ремонт и стройка: калькуляторы и проекты» — vk.ru/club242848914. Человек жмёт «Начать»,
выбирает калькулятор, отвечает на вопросы кнопками или числом, получает расчёт и ссылку на тот же
расчёт на сайте (`#c=…`, как кнопка «Поделиться», с `utm_source=vk&utm_medium=bot`).

**Считает не бот, а сайт:** `calcs.js` запускает выложенные `calculators.js` и `calc-room.js` в песочнице `vm`
и достаёт объект `CALCS`. Формулы не копируются; после выкладки сайта бот сам перечитывает файл.
⚠️ Бот держится за строку `const CALCS = {` в `calculators.js` — если её переименовать, бот не запустится.

| Файл | Что делает |
|---|---|
| `main.js` | запуск, `.env`, перечитывание формул, учёт `stat.jsonl` (дата, калькулятор, ок — без людей) |
| `vk.js` | API ВК от имени сообщества, Bots Long Poll |
| `bot.js` | диалог: меню → вопросы → расчёт; на свободный текст вне расчёта отвечает один раз в 10 минут |
| `flows.js` | вопросы по каждому калькулятору и куда подставить ответы |
| `raschet.js` | ответы → формула сайта → текст и ссылка |
| `calcs.js` | загрузка формул сайта без браузера |

Настройки сообщества (02.11.2026): сообщения включены, возможности ботов + кнопка «Начать»,
Long Poll API 5.199 с событиями `message_new` и `message_event`.

## На сервере

- Код `/root/kor-nil-vk-bot/`, ключ — `/root/kor-nil-vk-bot/.env` (chmod 600): `VK_GROUP_TOKEN`, `VK_GROUP_ID`.
- Служба: `systemctl status kor-nil-vk-bot`, логи `journalctl -u kor-nil-vk-bot`.

Обновить:

```bash
rsync -rlqz --no-perms --exclude node_modules --exclude .env --exclude stat.jsonl server/vk-bot/ root@sntchat.ru:/root/kor-nil-vk-bot/
ssh root@sntchat.ru 'systemctl restart kor-nil-vk-bot'
```
