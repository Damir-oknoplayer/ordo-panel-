# Подключение Telegram-бота к панели (webhook)

Выполните этот шаг **после** того, как панель уже развёрнута на Vercel и у вас есть её адрес
(например `https://ordo-panel.vercel.app`).

Откройте в браузере вот такую ссылку, подставив свои значения:

```
https://api.telegram.org/bot<ВАШ_ТОКЕН_БОТА>/setWebhook?url=https://<ваш-сайт>.vercel.app/api/telegram/webhook&secret_token=<ВАША_СЕКРЕТНАЯ_СТРОКА>
```

Где:
- `<ВАШ_ТОКЕН_БОТА>` — токен, который дал @BotFather
- `<ваш-сайт>` — адрес вашего сайта на Vercel
- `<ВАША_СЕКРЕТНАЯ_СТРОКА>` — та же строка, что вы вписали в переменную `TELEGRAM_WEBHOOK_SECRET`

Если всё правильно, в браузере появится:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

Проверить, что вебхук подключён:
```
https://api.telegram.org/bot<ВАШ_ТОКЕН_БОТА>/getWebhookInfo
```
