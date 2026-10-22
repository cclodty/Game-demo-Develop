# itch.io 發佈包

這裏是上架 itch.io 要用的東西。程式和圖片由 Claude 準備；**開帳號、建頁面、上傳、按發佈是你的事**。

## 1. 做上傳檔

```
npm install
npm run itch          # → dist/bullet-ballet-itch.zip（單檔版改名 index.html，再壓成 zip）
```

要確認 zip 能玩：把它解壓到一個資料夾，用任何靜態伺服器開，例如 `python3 -m http.server 8124 --directory 資料夾`，再開 http://127.0.0.1:8124/。`test/itch.test.mjs` 每次 `npm test` 都會自動做一次：打包、解壓、開伺服器、開始一局。

圖片要重做（例如有了新截圖）：`npm run itch:cover`，會由 `docs/shots/` 的截圖重新生成 `cover.png` 和 `shots/1–6.jpg`。

## 2. 在 itch.io 填的欄位

在 itch.io 按 **Upload new project**，逐欄填：

| 欄位 | 填甚麼 |
|---|---|
| Title | `子彈芭蕾 Bullet Ballet` |
| Project URL | 你的帳號名下，例如 `bullet-ballet`（**你決定**） |
| Short description or tagline | 見下面「一句話」 |
| Classification | Games |
| Kind of project | **HTML**（遊戲在瀏覽器裏玩） |
| Release status | In development（第二階段）或 Prototype |
| Pricing | No payments / 或 Donate（**你決定**） |
| Uploads | 上傳 `dist/bullet-ballet-itch.zip`，勾 **This file will be played in the browser** |
| Embed options → Viewport dimensions | 1280 × 720 |
| Embed options → Frame options | 勾 **Fullscreen button**；勾 **Click to launch in fullscreen** 也可以（聲音要先點一下才會開） |
| Embed options → Mobile friendly | 不勾（現在要鍵盤滑鼠或手掣） |
| Details → Description | 見下面「中文說明」和「English」，兩段都貼 |
| Genre | Action |
| Tags | 見下面「標籤」 |
| AI generation disclosure | **你決定並如實填寫**（程式由 Claude 協助編寫；美術模型的來源見 `assets/SPEC.md`） |
| App store links、Custom noun | 留空 |
| Download & install instructions | 留空（在瀏覽器玩） |
| Community | Comments（**你決定**） |
| Visibility & access | 先選 **Draft** 自己試玩，確定後再改 Public |
| Cover image | `docs/itch/cover.png`（630 × 500） |
| Screenshots | `docs/itch/shots/1.jpg` 至 `6.jpg`，照次序 |
| Gameplay video or trailer | 留空，或用遊戲結束畫面「存下最佳片段」的 webm 剪一段（**你決定**） |

上架後要做的：在自己的電腦用 Chrome、Firefox、Safari 各開一次頁面玩一局，確認聲音、全螢幕和手掣都正常。

## 3. 一句話

- 中文：在澳門的霓虹夜裏，用子彈時間把一場槍戰跳成芭蕾。
- English: A top-down bullet-time shooter in neon-lit Macau: turn every gunfight into a dance.

## 4. 中文說明

**子彈芭蕾** 是俯瞰式的子彈時間射擊遊戲，舞台是今天的澳門：霓虹天台、夜店舞池、七號碼頭、按實景比例重建的議事亭前地、紅窗木門的福隆新街、格蘭披治的東望洋跑道，和大三巴的六十八級石階。

- **子彈時間是工具，不是拐杖**：放慢世界，看清每一顆子彈，旋轉讓子彈穿身而過，滑鏟從槍林下穿過。
- **風格比人數重要**：反彈平底鑊、射爆油桶、踢飛敵人再在半空射殺、旋轉中向四周掃射，Style 評級由 D 升到 SSS。
- **十分鐘一局**：12 波，每 4 波換一個場景；天台的最後一波是直升機頭目。
- **每日挑戰**：每天全世界同一局，每人一次機會，附分享碼。
- 重播、成就和解鎖、手掣支援。

操作：WASD 移動，滑鼠瞄準，左鍵射擊，Shift／Q 子彈時間，Space 旋轉，C 滑鏟，F 踢（踢倒的人再按 F 處決），G 拿起和擲出。也可以用手掣。

（地名是真實的澳門；人物、幫派、店舖全部虛構。）

## 5. English

**Bullet Ballet** is a top-down bullet-time shooter set in present-day Macau: a neon rooftop, a nightclub dance floor, the docks of Harbor 7, and Largo do Senado rebuilt to scale.

- **Bullet time is a tool, not a crutch**: slow the world, read every bullet, spin through them, slide under the fire.
- **Style over body count**: bounce shots off frying pans, blow barrels, kick a thug into the air and finish him before he lands, spray all around you mid-spin. Your Style rank climbs from D to SSS.
- **Ten minutes a run**: 12 waves, a new place every 4; on the rooftop the last wave is a helicopter.
- **Daily challenge**: one run for the whole world each day, one try each, with a share code.
- Replays, achievements and unlocks, gamepad support.

Controls: WASD to move, mouse to aim, left button to shoot, Shift / Q for bullet time, Space to spin, C to slide, F to kick (and F again by a downed thug to finish him), G to pick up and throw. Gamepads work too.

(The places are real Macau; the people, the gang and the shops are all made up.)

## 6. 標籤

itch.io 最多 10 個：`bullet-time`, `top-down-shooter`, `action`, `stylish`, `neon`, `macau`, `arcade`, `singleplayer`, `daily-challenge`, `controller-support`

分類建議：Genre 選 **Action**；也可加 **Shooter** 類的標籤。Made with 填 three.js。

## 7. 圖片

- `cover.png`：630 × 500，由 `docs/shots/phase-2/grenadier-lob.jpg` 加標題生成。
- `shots/1.jpg` 至 `6.jpg`：Style 評級 S、天台直升機頭目、議事亭前地的白鴿、炸彈客連鎖爆炸、夜店的無人機、每日挑戰。
