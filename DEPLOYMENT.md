# 部署檢查表

## 1. Vercel 專案設定

```text
Framework Preset：Vite
Build Command：npm run build
Output Directory：dist
```

## 2. Firebase 前端環境變數

在 Vercel Project Settings → Environment Variables 新增：

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## 3. Firebase 後端環境變數

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

## 4. LINE 環境變數

```env
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

## 5. LINE Webhook URL

部署完成後，在 LINE Developers 後台設定：

```text
https://你的-vercel-domain.vercel.app/api/line-webhook
```

## 6. Firestore Collection

目前使用：

```text
transactions
```

## 7. 注意

GitHub 只放模板代碼。不要把 `.env` 或任何真實金鑰提交到 GitHub。
