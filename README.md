# 末日生存遊戲：M1 操作測試場（Three.js 版）

三人逃難序章的第一個里程碑 **M1 操作樣板**，用 Three.js 在瀏覽器裡實作，用來和本機 Godot 版比較手感與畫面表現。

企劃與交接文件放在 [`docs/design/`](docs/design/00-START-HERE.md)。這個版本的交付紀錄、完成條件對照與資源清冊放在 [`docs/m1/`](docs/m1/README.md)。

## 試玩

```bash
npm install
npm run dev          # 開發伺服器，瀏覽器開啟顯示的網址
```

需要支援 WebGL 2 的瀏覽器（最新版 Chrome、Edge、Firefox 都可以），以及鍵盤和滑鼠。

| 操作 | 按鍵 |
| --- | --- |
| 移動（依畫面方向） | `W` `A` `S` `D` |
| 瞄準（360°，人物跟著連續轉身） | 滑鼠 |
| 射擊（按住連射） | 左鍵 |
| 換彈 | `R`（打空時自動換彈） |
| 子彈時間 | 按住 `Space`（選單可改成切換） |
| 暫停、調整鏡頭與畫面 | `Esc` |
| 像素風／標準畫面 | `P` |
| 鏡頭遠近 | 滑鼠滾輪 |
| 除錯資訊 | `F3` |
| 收合操作說明 | `H` |
| 靜音 | `M` |

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 開發模式（存檔後自動重新整理） |
| `npm run build` | 建置到 `dist/`，可放在任何靜態網站主機 |
| `npm run preview` | 在本機預覽建置結果 |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm test` | 單元測試（碰撞、尋路、子彈時間、瞄準計算、波次） |
| `npm run test:e2e` | 瀏覽器操作驗收（逐項對照 M1 完成條件） |
| `npm run build:artifact` | 打包成單一 HTML 檔（`artifact/index.html`） |

## 程式結構

```text
src/
  config.ts            所有暫定數值與預設設定（調手感從這裡改）
  game.ts              主迴圈：輸入、移動、射擊、敵人、鏡頭、介面串接
  render/pipeline.ts   像素風渲染：低解析度、像素描邊、鏡頭對齊像素格、子彈時間色調
  entities/characterAssets.ts 外部角色模型的載入、縮放與動作辨識
  entities/animatedCharacter.ts 骨架動畫角色（上下半身分開轉向）
  assets/models/       放主角與喪屍模型的地方（player.glb、zombie.glb）
  render/textures.ts   程式繪製的像素材質（暫用素材）
  render/materials.ts  卡通光影材質、牆面網點淡出、穿牆剪影
  world/level.ts       MAP-01 測試場配置（碰撞與外觀共用同一份資料）
  world/collision.ts   平面碰撞、掃掠線段、子彈高度判定
  world/navGrid.ts     敵人尋路（格子 A*）
  entities/            主角、喪屍、試射假人
  combat/projectiles.ts 有速度的子彈（子彈時間內看得見）
  systems/             子彈時間能量槽、喪屍波次
  fx/                  粒子、彈孔與血跡
  ui/hud.ts            HTML 介面（與像素畫面分開，保持清晰）
  audio.ts             Web Audio 即時合成的暫用音效
tests/unit/            Vitest 單元測試
tests/e2e/             Playwright 瀏覽器驗收
```
