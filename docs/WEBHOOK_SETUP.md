# Telegram webhook для /start и /help

Наш `src/server.mjs` теперь содержит `POST /api/telegram/webhook` и проверяет заголовок `X-Telegram-Bot-Api-Secret-Token` перед обработкой. `src/telegram_bot.mjs` отвечает на команды `/start` и `/help` в личном чате и возвращает Telegram `web_app` кнопку. Обработка денежных операций отсутствует.

## Состояние

- Telegram-меню работает непосредственно через Bot API и GitHub Pages.
- Webhook handler написан и протестирован, **но пока не развёрнут на постоянно доступном HTTPS backend**.
- Пока нет backend, команды могут не получать ответы. Это не мешает открыть Mini App через кнопку меню.

## Запуск backend

Развернуть `npm start` (Node.js 22+) в сервисе с постоянно доступным HTTPS-доменом. Пример окружения:

```ini
PORT=8787
APP_ORIGIN=https://tradeain8n.github.io
TELEGRAM_BOT_TOKEN=... # секрет, только на сервере
TELEGRAM_WEBHOOK_SECRET=... # случайная строка >=16 символов
MTT_RPC_URL=https://evm-rpc.mtt.network/
```

На сервере хранить секреты в защищённом хранилище. Не передавать их клиентскому GitHub Pages.

Проверить `GET https://BACKEND/api/health` (mode: sandbox), затем убедиться, что посторонний POST в `/api/telegram/webhook` отклоняется.

## Настройка webhook после деплоя

Указать `BOT_WEBHOOK_URL=https://BACKEND/api/telegram/webhook` в GitHub Actions **Repository Variables**, `TELEGRAM_WEBHOOK_SECRET` в GitHub Actions **Repository Secrets**. Секрет должен совпадать с серверным. Токен бота уже хранится в `TELEGRAM_BOT_TOKEN`.

В GitHub Actions вручную запустить `Configure Telegram bot webhook (requires hosted backend)`. Script проверяет ожидаемый bot ID, устанавливает webhook и повторно запрашивает информацию о нём, не раскрывая секретов.

Тогда команды `/start` и `/help` начнут отвечать кнопкой Mini App. До размещения backend запускать этот workflow нельзя.

Реальные депозиты и выплаты требуют отдельной разработки и финансовой проверки.
