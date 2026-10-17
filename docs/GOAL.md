# /goal 提示詞：把第一階段「一局」做完

貼給 /goal 的全文在下面的框內。它假設執行者是一個全新的 Claude 對話，只有這個 repo，沒有本對話的記憶，所以所有規矩都指回 repo 裡的檔案。

```
目標：依 docs/TASKS.md 把《子彈芭蕾》第一階段「一局」的任務卡逐張做完，交出一個可以給五個人試玩的版本。

開始前先讀 CLAUDE.md、docs/ROADMAP.md、docs/TASKS.md、docs/DECISIONS.md。所有規矩以 CLAUDE.md 為準；這份提示詞只補充怎樣連續工作。回覆用繁體中文。

## 分支與 PR
1. 從 origin/main 開分支 goal/phase-1（已存在就接著用）。先檢查 origin/claude/youthful-galileo-s4cjqn 是否已合併進 main；還沒有的話，先把它 merge 進 goal/phase-1（那是風格系統「霓虹人偶」，第一階段要建立在它上面），跑 npm run lint && npm test 確認是綠的再開始。
2. 整個目標只開一個 PR，標題「第一階段：一局」，PR 描述照 .github/pull_request_template.md，每做完一張卡就累加一段。不要合併到 main，不要開第二個 PR，不要 force-push；合併由開發者決定。
3. 每張卡做完就 push，等 CI 綠才開始下一張。CI 紅就修到綠；不准刪、跳過或放寬測試來過關。

## 一張卡的流程
1. 從 docs/TASKS.md 拿下一張未打勾、不是標給「開發者」的卡，先在回覆裡複述它的驗收標準和「這次不做」。
2. 先寫測試（新行為必有測試，放 test/），再實作。
3. npm run lint && npm test；改了武器、拾取、轉場就加 npm run test:game。
4. 玩法或畫面有改就截圖到 test/.out/ 並附在 PR 描述；改了 config.js 的數字就在 docs/DECISIONS.md 記舊值→新值和原因。
5. 在 docs/TASKS.md 打勾（寫日期），需要的話把發現的事加到「待排」，不要動手做它們。
6. commit（英文、說清楚為什麼）、push、更新 PR 描述，然後下一張。

## 次序（照 TASKS.md 第一階段）
新模型校正 → 確定性①② （若 git log 顯示已由另一個對話完成並合併，直接打勾略過）→ 街機模式① 12 波 → 街機模式② 評級 → Style 即時評級 → 60 秒新手熱身 → 環境互動：木箱與白鴿 → 滑鏟（已完成，略過）→ 盾牌手 → 炸彈客 → 變體規則與難度 → 最佳片段錄影 → 本機事件記錄。
已完成不要重做：旋轉中換彈、滑鏟、擲物與擲槍、效能預算、風格系統第一批。

## 技術上要守的
- 遊戲邏輯只用 game.rng，不用 Math.random；特效用 vfxRng。邏輯以 120 Hz 固定步運行（src/main.js step/logic），新系統要放進 logic 而不是 present。
- 風格層 src/style.js 是渲染層：新加進場景的東西要過 game.style.dress()，新的人物姿勢程式要經 style.poseDue()。?style=off 必須玩起來完全一樣。
- 新內容放進資料（maps.js、enemies.js TYPES、weapons.js、waves.js、rules），新行為放進系統。
- 每張地圖有渲染預算（maps.js budget），超出就減東西，不要調高預算。
- 不加執行期依賴、不碰 senado/、不換引擎。

## 需要人判斷的事怎樣處理
- 手感與平衡的數字（評級公式權重、難度倍率、新敵人的血量與速度）：用卡上或 ROADMAP 的預設值做完，在 PR 描述的總表標「待試玩確認」，繼續下一張，不要停下來等。
- 標給「開發者」的項目（合併 PR、找人試玩、決定日 2026-10-31）：跳過，不要替開發者做。

## 停止條件（停下來，在 PR 描述頂部寫明原因，然後結束）
- 同一張卡連續兩次 CI 紅而找不到原因。
- 需要新的執行期依賴、要改 senado/、要付費、要開帳號、要放密鑰。
- 清單上給 Claude 的卡全部做完。

## 進度回報
PR 描述頂部維持一張總表，每張卡一行：卡名｜狀態（做完／進行中／跳過及原因）｜新增測試數｜截圖｜待開發者確認的事。開發者只會看這張表和截圖，寫給不在場的人看。
```

## 使用方法

1. 先確認 `claude/youthful-galileo-s4cjqn`（風格系統）已推送；合併與否都可以，提示詞會處理。
2. 把框內全文貼進 /goal。
3. 它會在 `goal/phase-1` 上一張一張做，PR 就是進度表；隨時手動停止。停了之後要續做，貼同一段提示詞即可，它會從 TASKS.md 未打勾的卡接著做。
