# 排行榜後端：部署步驟（給開發者）

遊戲不靠後端也完整可玩：`src/config.js` 的 `BACKEND.url` 是空字串時，遊戲完全離線，只有本機榜和分享碼。要全世界一起比分，就照下面部署一次，約十五分鐘。所有步驟都在你自己的電腦、用你自己的 Cloudflare 帳號做；帳號資料不會、也不應該進 repo。

程式在 `backend/`：

| 檔案 | 用途 |
|---|---|
| `backend/worker.js` | Cloudflare Worker（純 JS，沒有框架、沒有 npm 依賴） |
| `backend/schema.sql` | D1 資料庫的表 |
| `backend/wrangler.toml` | 設定範本：你只要填 `database_id` |

## 你需要

- 一個 Cloudflare 帳號（免費方案已足夠：Workers 每天 10 萬次請求，D1 每天讀 500 萬行）。
- 這個 repo 的本機副本，和 Node 22（跑測試已經有）。
- `wrangler` 不用安裝：下面每一步都用 `npx wrangler`，第一次會自動下載。

## 步驟

### 1. 登入 Cloudflare

```
npx wrangler login
```

瀏覽器會開一頁讓你按「Allow」。

### 2. 建立資料庫

```
npx wrangler d1 create bullet-ballet
```

它會印出一段設定，其中一行是 `database_id = "xxxxxxxx-xxxx-…"`。把這個 id 抄下來。

### 3. 把 id 填進範本（只在你的電腦）

打開 `backend/wrangler.toml`，把 `REPLACE-WITH-YOUR-D1-DATABASE-ID` 換成剛才的 id。然後讓 git 不再理會這個檔案的本機改動，免得不小心提交：

```
git update-index --skip-worktree backend/wrangler.toml
```

（日後要改範本本身，先 `git update-index --no-skip-worktree backend/wrangler.toml`。）

### 4. 建表

```
npx wrangler d1 execute bullet-ballet --remote --file=backend/schema.sql
```

### 5. 部署

```
npx wrangler deploy -c backend/wrangler.toml
```

最後一行會印出網址，例如 `https://bullet-ballet.你的名字.workers.dev`。

### 6. 試一下

在瀏覽器打開 `https://bullet-ballet.你的名字.workers.dev/daily`，應該看到今天的每日挑戰，例如：

```
{"day":"2026-10-18","seed":…,"map":3,"difficulty":"normal","variants":[]}
```

### 7. 把網址填進遊戲

`src/config.js`：

```js
export const BACKEND = {
  url: 'https://bullet-ballet.你的名字.workers.dev', // 不要以 / 結尾
};
```

提交、推上 main，GitHub Pages 會自動部署新版。

### 8. 只讓你的網頁呼叫（建議）

`backend/wrangler.toml` 的 `ALLOWED_ORIGIN` 預設是 `"*"`（任何網頁都可以呼叫，方便測試）。上線後改成遊戲所在的網址，用逗號分隔，例如：

```
ALLOWED_ORIGIN = "https://cclodty.github.io, https://html-classic.itch.zone"
```

再跑一次第 5 步。

## 端點

| 方法 | 路徑 | 做甚麼 |
|---|---|---|
| GET | `/daily` | 今天（UTC）的每日挑戰：日期、種子、地圖、規則 |
| POST | `/scores` | 上傳一局：模式（`daily`／`arcade`）、日期、起點地圖、分數、評級、暱稱、匿名 id、輸入記錄（base64，最多 100 KB） |
| GET | `/board?mode=daily&day=YYYY-MM-DD&id=…` | 當天前 100 名，加上你的名次和上下三名 |
| GET | `/board?mode=arcade&map=0&id=…` | 某張起點地圖每人的最好成績 |
| GET | `/replay?id=…` | 榜上某一局的輸入記錄（`.bbr`） |
| GET | `/stats` | 最近 30 天每天的每日挑戰局數、街機局數和人數 |

## 防濫用（第一版）

- 每個匿名 id 每個模式每天一行：每日挑戰只收第一次；街機只留當天最好的一次。
- 日期只收今天和昨天（剛過午夜才打完的一局仍然算）。
- 暱稱：1 到 16 個字，只可以有文字、數字、空格和 `_ . -`，不可以是網址；全形字母會轉成半形。
- 分數必須是 0 到 99,999,999 的整數；評級只可以是 S／A／B／C／D；每日挑戰的地圖必須是當天的地圖。
- 請求內容最多 160 KB，輸入記錄最多 100 KB，而且開頭要是重播檔的標記。

伺服器暫時**不會重算**分數，所以有人可以偽造分數（第三階段會用上傳的輸入記錄在伺服器重播驗證）。有人搗亂的話，可以直接在 D1 刪行：

```
npx wrangler d1 execute bullet-ballet --remote --command "DELETE FROM scores WHERE name = '搗亂的暱稱'"
```

## 費用

免費方案的上限遠高於第二階段的目標（每天幾百局）。免費方案超出上限時請求會失敗，不會自動收費；要更多才需要自己升級方案。

## 測試

`npm test` 會跑 `test/backend.test.mjs`：它用 Node 內建的 SQLite 假扮 D1，把 `worker.js` 的每個端點和 SQL 都真的跑一次。這些測試不需要 Cloudflare 帳號。
