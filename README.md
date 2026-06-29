# 個人記帳系統 Prototype

這是個人記帳系統的前端介面 Prototype。

目前功能：
- 本月收入 / 本月支出 / 目前結餘
- 新增收支彈窗
- 今日明細
- 收支統計查詢
- 月份查詢
- 日期區間篩選
- 類型篩選
- 分類篩選
- 明細修改 / 刪除

## 本地預覽

```bash
npm install
npm run dev
```

打開終端機顯示的本地網址即可預覽。

## Build

```bash
npm run build
```

產生的靜態檔案會在 `dist/`。

## 部署方式

### Vercel

1. 將此專案上傳到 GitHub
2. 到 Vercel 新增 Project
3. 選擇這個 GitHub Repo
4. Framework Preset 選 `Vite`
5. Build Command 使用：

```bash
npm run build
```

6. Output Directory 使用：

```bash
dist
```

### GitHub Pages

如果要用 GitHub Pages，可先執行：

```bash
npm run build
```

再將 `dist/` 內容部署到 GitHub Pages。

## 注意

目前這版是前端 Prototype，資料存在瀏覽器執行時的 JavaScript 記憶體中，重新整理頁面後會回到初始測試資料。

下一階段若要正式化，需要串接：
- Firebase Firestore
- LINE Messaging API
- Vercel API Routes
