# MTT Exchange — Telegram Mini App MVP

**Demo/sandbox:** публичный HTTPS-интерфейс с беззаявочной логикой USDT (BSC) → MTT Network, расчетом по историческому снимку пула, анимированным сценарием и локальной историей. Реальные средства не принимаются; выплаты, депозитный адрес и hot wallet пока не подключены.

## Публичный Mini App

**https://tradeain8n.github.io/mtt-exchange-miniapp/**

Код в `docs/` разворачивается через GitHub Pages. Тестовый интерфейс можно открыть как обычный сайт; после подключения Telegram-бота он открывается через кнопку меню Web App.

## Локальный запуск

```bash
npm test
npm start
# Открыть http://localhost:8787
```

Backend API на Node.js (без внешних пакетов):

- `GET /api/health` — режим sandbox.
- `GET /api/quote?amount=1.1` — расчёт по RPC MTT Chain; при недоступности RPC — **помеченный** исторический снимок.
- `POST /api/session` — проверка HMAC `Telegram.WebApp.initData` (только при заданном `TELEGRAM_BOT_TOKEN`).
- `/api/execute` **не существует**; реальные транзакции не запускаются.

При размещении backend укажите `APP_ORIGIN=https://tradeain8n.github.io`, `TELEGRAM_BOT_TOKEN` (новый токен после ротации) и при необходимости `MTT_RPC_URL`.

**Важно:** статический сайт GitHub Pages работает и без backend, но в этом случае показывает демо-расчёт по фиксированным резервам на 10.11.2026. Telegram initData не может считаться проверенным на стороне сервера, пока backend не развёрнут.

## Подключение к боту

Токен, ранее опубликованный в переписке, считайте скомпрометированным. **Сначала перевыпустите его через @BotFather**, не пересылая новый токен в чат. Затем сохраните новый токен в GitHub Actions Secrets публичного репозитория:

```bash
gh secret set TELEGRAM_BOT_TOKEN -R tradeain8n/mtt-exchange-miniapp
```

Команда безопасно запросит секрет через stdin (не вводите его как аргумент `-b`). Откройте GitHub Actions → `Configure Telegram Mini App menu` → `Run workflow`. Script `scripts/configure_bot.mjs` проверит `getMe.id===8456005459` и установит кнопку `MTT Exchange` с HTTPS Web App URL, а также команды `/start` и `/help`. Не раскрывает токен в логах.

Серверный обработчик `/start` и `/help` реализован в `src/telegram_bot.mjs` и `POST /api/telegram/webhook`. Он проверяет секрет Telegram webhook и показывает кнопку Mini App. **Для получения ответов на команды** необходимо развернуть Node.js backend с HTTPS и подключить webhook по [инструкции](docs/WEBHOOK_SETUP.md); GitHub Pages сам по себе не обрабатывает сообщения бота.

## Архитектура MVP

```
Telegram Mini App / Web UI (docs)
  ├── Quote Engine (historical reserve demo)
  ├── Synthetic deposit → confirmation → quote → payout simulation
  └── Local demo history
         ↓ optional backend
Node HTTP API (src/server.mjs)
  ├── /api/health, /api/quote (read-only RPC)
  ├── /api/session (Telegram initData HMAC)
  └── no real transfer endpoint
```

## Развитие

1. **Watcher:** отдельный депозитный адрес, BSC USDT Transfer logs, подтверждения, защита от reorg и дубликатов.
2. **Ledger + rate engine:** фиксирование цены по блоку, резервов, проскальзывания и комиссии.
3. **External signer + payout:** лимиты, HSM/внешнее подписание, nonce, reconciliation по исходному хешу; сначала тестовая сеть и mocks.

Перед реальным запуском: отдельные адреса и резервы, юридическая проверка криптообменной деятельности, лимиты, anti-fraud, аудит безопасности. Никакие реальные переводы не должны отправляться на адреса из демонстрации.

Исследование конкурента и доказательства находятся отдельно в приватном репозитории `tradeain8n/mttswap-wallet-audit`. Закрытый код и секреты конкурента не копируются.

## Тест через Telegram-бота @babymttbot

**URL:** https://t.me/babymttbot → кнопка меню **«Тест 1 USDT»**.
Mini App показывает реальные данные пилотного перевода, но не хранит ключи и не исполняет сделки самостоятельно: исполнение осуществляет приватный `tradeain8n/mtt-exchange-engine`.

- Разрешённый кошелёк клиента: `0x136e104e88916152a9C7bdDA9d5FaBaaEf63088a` (BSC — делегированный EIP-7702 EOA; MTT — обычный EOA).
- Получатель ровно 1 USDT BEP-20: `0x976802182265f48ff30A2Bd64f489166f5D3D5aE`.
- Токен: `0x55d398326f99059fF775485246999027B3197955`.
- Внутри Telegram, если кошелёк предоставляет `window.ethereum`, можно отправить прямую `USDT.transfer` после явного согласия и подтверждения в кошельке.
- Если провайдера нет, скопируйте центральный адрес, отправьте 1 USDT непосредственно из указанного кошелька в сети BSC, затем вернитесь в Mini App и проверьте TX-хеш или воспользуйтесь поиском последних подтверждённых транзакций.
- Mini App проверяет реальный хеш/receipt, 6 BSC подтверждений, точную сумму, контракт, отправителя и calldata.
- Фактическая выплата определяется по MTT Network Explorer и отображается только при подтверждённом переводе **от центрального адреса клиенту, совершённом после депозита**.
- Этапы Bridge и Router нельзя безопасно прочитать из приватного GitHub Issues без backend. Поэтому в открытом Mini App они отражены как ожидаемые, не как подтверждённые.
- **Никаких переводов 1,5 USDT, с бирж или relayer.** Такой перевод не запускает пилот и не возвращается автоматически.

Проверка изменённого frontend: `node --test tests/pilot-status.test.mjs`.
