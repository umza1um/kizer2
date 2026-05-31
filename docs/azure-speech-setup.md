# Azure Speech TTS (бесплатный F0)

## Быстрый старт (без Azure-аккаунта)

Если `AZURE_SPEECH_KEY` пустой или не задан, приложение автоматически использует **Edge TTS** — те же голоса (`ru-RU-SvetlanaNeural` и др.), без ключа и без регистрации.

1. В `.env.local` оставьте `AZURE_SPEECH_KEY` пустым
2. `npm run dev`
3. **Настройки** → провайдер **Azure Speech** → **Прослушать пример**

## 1. Создать ресурс в Azure (опционально, для официального API)

1. [Azure Portal](https://portal.azure.com/) → поиск **Speech**
2. **Создать** → **Speech**
3. **Pricing tier: Free F0** (не Standard S0)
4. Выбрать регион (например `westeurope`)
5. Дождаться **Deployment succeeded**

## 2. Ключи

Ресурс → **Keys and Endpoint**:

- `KEY 1` → `AZURE_SPEECH_KEY`
- `Location/Region` → `AZURE_SPEECH_REGION` (короткое имя, например `westeurope`)

## 3. Локально

```bash
cp .env.example .env.local
# вставить ключ и регион в .env.local
npm run dev
```

В приложении: **Настройки** → провайдер **Azure Speech** → голос → **Прослушать пример**.

## 4. Vercel

Project **kizer2** → **Settings** → **Environment Variables**:

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

Сохранить → **Redeploy**.

## Голоса в приложении

- `ru-RU-SvetlanaNeural`
- `ru-RU-DmitryNeural`
- `ru-RU-DariyaNeural`

Галерея: [Speech Studio Voice Gallery](https://speech.microsoft.com/portal/voicegallery)
