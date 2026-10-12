# Bullet Ballet 子彈芭蕾

俯瞰式（top-down）子彈時間射擊遊戲原型，用 Three.js 製作。靈感來自 *My Friend Pedro*：
慢鏡、雙槍分離瞄準、旋轉閃避、反彈子彈、踢擊，以及鼓勵「打得好看」的 Style 計分。

場景是一個下雨的霓虹天台。敵人從樓梯間和天台邊緣一波一波湧上來，每一波比上一波更多、更兇。

## 執行

遊戲是純靜態網頁，沒有建置步驟；Three.js 已放在 `vendor/` 內，不需要網路。
因為使用 ES modules，必須經由 HTTP 開啟（直接雙擊 `index.html` 不行）：

```bash
python3 -m http.server 8000
# 或
npx http-server -p 8000
```

然後打開 <http://localhost:8000>。需要滑鼠 + 鍵盤（暫不支援手機觸控）。

推送到 `main` 時，`.github/workflows/pages.yml` 會把整個 repo 部署到 GitHub Pages
（repo 的 Pages 設定需選擇 *GitHub Actions* 作為來源）。

## 操作

| 按鍵 | 動作 |
| --- | --- |
| WASD / 方向鍵 | 移動 |
| 滑鼠 | 瞄準 |
| 左鍵（可長按） | 雙槍射擊（左右手交替） |
| Shift 或 Q | 子彈時間（切換），會消耗 Focus 量表 |
| Space | 旋轉閃避：旋轉期間子彈穿身而過 |
| 右鍵（按住） | 分離瞄準：左手槍鎖定游標附近的敵人，右手槍繼續跟游標 |
| F / E | 踢：踢飛敵人、油桶、平底鍋 |
| R | 換彈 |
| M | 音樂開關 |
| Esc / P | 暫停 |

## 玩法重點

- **子彈時間**：世界減速到 20%，玩家只減速到 55%，所以你相對變快。慢鏡時畫面去飽和、
  只有發光的子彈和激光保留顏色；音效降調、音樂像錄音帶一樣變慢。
- **敵人會預告**：開槍前會用激光瞄準，激光越亮代表越快開槍。敵人會預判你的走位，
  直線逃跑不安全，要在子彈飛來時改變方向。
- **每顆子彈都是實體**：看得見、躲得開，也可以用自己的子彈把它射下來（DEFLECT）。
- **平底鍋**：射中後子彈會自動反彈到最近、看得見的敵人（RICOCHET）。踢它會飛起來。
- **紅色油桶**：會爆炸、可連鎖引爆；也可以踢過去當保齡球。
- **玻璃牆**：一槍就碎，敵人看得穿玻璃。
- **Style 分數**：基本擊殺分 × 連擊倍率（最高 x16）。慢鏡擊殺、旋轉擊殺、分離瞄準擊殺、
  反彈、爆炸、踢殺、保齡球（STRIKE!）、多殺、遠距、近距、子彈擦身（CLOSE CALL）
  都有額外分。被擊中會斷連擊。每清一波回滿血並補 Focus。

### 敵人

| 類型 | 特性 |
| --- | --- |
| THUG | 手槍，最常見 |
| SHOTGUNNER | 散彈，喜歡貼近 |
| RIFLEMAN | 三連發，遠距離、預判較準 |
| BLADE | 沒有槍，衝過來砍你 —— 用旋轉閃避或踢回去 |
| BRUTE | 第 4 波起出現，又大又硬，機槍會追著你掃射 |

## 程式結構

```
index.html        HUD / 選單 DOM，importmap 指向 vendor/three
style.css         介面樣式
src/
  main.js         Game：主迴圈、時間縮放（子彈時間、hit-stop、kill-cam）、攝影機、事件
  config.js       所有手感參數（速度、子彈時間倍率、射速、鏡頭）
  player.js       玩家：移動、雙槍、旋轉、踢、分離瞄準、受傷/死亡
  enemies.js      敵人種類、武器與 AI 狀態機（移動 → 瞄準 → 射擊 → 恢復）
  bullets.js      子彈：逐段碰撞、反彈、擦身判定、互相抵消
  level.js        天台場景、掩體、玻璃、油桶、平底鍋、出生點、城市背景、雨
  nav.js          網格 A* 尋路
  fx.js           粒子（InstancedMesh）、地面血跡、閃光燈、衝擊波、激光
  postfx.js       Bloom + 子彈時間調色 shader（去飽和、色差、暗角、漣漪）
  audio.js        WebAudio 合成音效與背景音樂，會隨時間縮放降調
  hud.js          HUD、Style 分數欄、橫幅、準星、畫面外敵人箭頭
  waves.js        波次編排與出生預告
  score.js        分數、連擊、最高分（localStorage）
  characters.js   方塊風人物模型與動畫
  textures.js     程序生成的貼圖（地板、木箱、窗戶、霓虹招牌）
vendor/three/     Three.js r186（MIT）及所需的 postprocessing addons
```

想調手感，先看 `src/config.js`；敵人數值在 `src/enemies.js` 的 `TYPES` / `WEAPONS`；
波次節奏在 `src/waves.js`。

## 授權

Three.js 以 MIT 授權隨附於 `vendor/three/`（見 `vendor/three/LICENSE`）。
所有音效、音樂、貼圖都在執行時以程式生成，沒有外部素材。
