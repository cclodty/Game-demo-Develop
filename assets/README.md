# 3D 模型資產

遊戲裡的人物、武器、道具、環境和地標，都可以逐件換成高質量的 3D 模型。沒有模型的繼續用現在的方塊版，所以可以一件一件慢慢換。

## 文件

| 檔案 | 內容 |
|---|---|
| [START_HERE.md](START_HERE.md) | 給 AI 建模工具（Dots／ChatGPT）的英文說明：項目背景、硬性規定、交付格式、製作次序 |
| [SPEC.md](SPEC.md) | 比例尺寸與交付規格：人物、武器、地圖的尺寸，母版要求，轉引擎須知 |
| [PROMPTS.md](PROMPTS.md) | 71 件物件的提示詞（參考圖＋3D 模型），按類別和優先次序排列 |
| [asset-list.json](asset-list.json) / [.csv](asset-list.csv) | 同一份清單的機器可讀版（任何引擎都能讀）／試算表版 |
| [maps/](maps/) | 四張地圖的佈局（米），供本遊戲或其他引擎使用 |
| [FEEDBACK.md](FEEDBACK.md) | 模型回饋清單：測試量到的偏差（腳、手、槍口、道具大小），偏差超過 5 cm 的留一句英文給 Dots |
| [screenshots/](screenshots/) | 遊戲現況（方塊版）的截圖：四張地圖的實際鏡頭，以及一張側面比例參考 |

PROMPTS、asset-list 和 maps 都由 `npm run assets:docs` 從 `src/asset-manifest.js` 和 `src/maps.js` 生成。要加減物件或改尺寸，改那兩個檔案再重新生成。

## 流程

1. **生成**：按 [PROMPTS.md](PROMPTS.md) 先做參考圖，再做 3D 模型（人物連綁骨和動作）。
2. **交付**：每件放進 `assets/source/<id>/`，內容和格式見 [SPEC.md](SPEC.md) 第 7 節。
   - 在雲端對話中，可以用 GitHub 網頁的 *Add file → Upload files* 上載，再叫 Claude 處理。
3. **處理成網頁版**：執行 `npm run assets`（第一次先 `npm install`）。腳本會：
   - 超過網頁版面數就自動減面；
   - 貼圖縮到 512 或 1024 並轉成 WebP；
   - 壓縮網格（meshopt），並丟掉遊戲用不著的動作；
   - 輸出到 `assets/models/`，並更新 `src/models-index.js`。
   - 母版保持原封不動，日後換引擎就用它們。
4. **開遊戲**：有模型的會自動替換，沒有的保留方塊版。
5. **比較版本**：
   - 同一個 id 可以放幾個版本，用 `-` 分開，例如 `hero-a.glb`、`hero-b.glb`。
   - 網址加 `?use=hero-b` 就用那個版本，`?models=off` 可看回方塊版。

`npm run assets -- inspect 檔案.glb` 可以檢查一個模型：面數、尺寸、骨頭名稱、動作名稱。

## 遊戲已經會用的模型

- **人物**（`hero`、`grunt`、`shotgun`、`rifle`、`rusher`、`brute`）
  - idle、run 動作按實際移動速度播放，子彈時間會自動變慢。
  - 下半身朝移動方向，上半身朝瞄準方向。
  - 雙手用 IK 握住遊戲裡的槍。
  - 有 death 動作就用它代替倒地效果。
  - 骨頭名稱認得 Mixamo、Blender `.L`/`.R`、`_l`/`_r` 等常見格式；認不到時 console 會提示，可在清單的 `bones` 指定。
- **道具**：木箱、油桶、氣罐、石油氣罐、平底鑊、托盤、路障、霓虹柱、冷氣機、樓梯屋、看守亭、喇叭、吧枱、沙發、酒枱、DJ 台、貨櫃、叉車、熟食檔、路燈、花槽、的士、報紙亭、電箱。
  - **縮放**：按地圖裡的碰撞盒縮放擺放，長邊自動對齊。
  - **長物件**：吧枱、路障、沙發會按長度重複一節模型，貼圖不會被拉長。
  - **染色**：貨櫃用同一個模型染成四種顏色。
  - **朝向**：地圖可以指定模型面向哪一方，例如沙發背靠牆。
- **武器**（`weapon_pistol`、`weapon_smg`、`weapon_shotgun`、`weapon_rifle`、`weapon_sniper`、`weapon_launcher`、`weapon_minigun`、`weapon_blade`、`weapon_grenade`）
  - 原點（主握把）放在手上；長槍放在肩前，主角和敵人共用。
  - `socket_muzzle`／`socket_tip` 決定子彈從哪裡射出；`socket_support` 是另一隻手的 IK 位置，手伸不到時會沿槍身往後握。
  - 雙槍、雙衝鋒槍左手那把會鏡像。
  - 地上的武器和武器台也用同一個模型；`weapon_grenade` 是榴彈發射器射出的彈（放大 2.5 倍，方便看見）。
  - 拿長槍時上身會側轉，好讓兩隻手都握到槍。

**環境物、地標和材質**已經在清單裡，可以先做。做好後再接進遊戲：佈景改成資料格式擺放。

## 授權紀錄

每件物件的 `NOTES.md` 記下工具、日期、方案或授權。以後要公開或商用時，才知道每件東西的來源。
