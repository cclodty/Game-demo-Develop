# 人物生成：Tripo 流程與提示詞

2026-11-01 第二版。第一版（同日，`docs/ASSET-GEN.md`）寫的是全部資產，人物外形是 Claude 自己想的；開發者 11-01：「先給我生成人物的提示詞，參照本來文件以及過場時的人設圖片。我應該會用 Tripo 生成。」所以改為**只講人物、用 Tripo**，外形照 PR #38（`claude/hopeful-keller-h7g2q6`，未合併）的 [CHARACTERS.md](CHARACTERS.md)、`docs/STORY.md`、過場分鏡 `docs/storyboard/`，以及開發者在 ChatGPT 出好的三張設定圖：9527、六個頭目的陣容、晶晶。場景、道具、武器、人物配件照 PR #38 的 [PROPS.md](PROPS.md)（ChatGPT 設定圖加 Blender 腳本；有機的轉 image-to-3D），不在這份。

價錢是 2026-11-01 查的；Tripo 的月費頁擋了自動讀取，用的是搜尋摘要和第三方的比較頁（§8），買之前在官網核對。

## 1. 摘要

| 項目 | 結論 |
|---|---|
| 人物 | **18 個**：9527、敵人 10、部門頭目 5（刀姐、炮哥、門神、長鏡、選角陳）、金爺、晶晶。可選變體 2 個（後期 9527、脫了西裝的金爺）。候選 3 個（機槍手、DJ、司機）和空位 #11、#12 不做 |
| 提示詞 | [model-sheets.txt](model-sheets.txt)：交 ChatGPT 的純文字檔，用法同過場（一次一張；「next」「skip」「redo」）；一個人一張三視圖（正面、左側、背面） |
| 流程 | ChatGPT 三視圖 → 切開三張 → Tripo 多視角生成 → Tripo 綁骨（Mixamo 骨名）→ Mixamo 動作一套，Godot 重定向全部人共用 → 入 Godot |
| 試產 | 頭四個請求：9527、街頭打手（基準身形）、盾牌保安（配件掛手臂）、疊碼仔頭（長褸，自動綁骨最難的情況） |
| 錢 | Tripo Professional 一至兩個月，**約 US$20–40**；動作用 Mixamo，免費 |
| 授權 | 付費方案才是私有、可商用；免費版公開、不可商用。上 Steam 要披露「預先生成的 AI 內容」 |

## 2. 人物表

外形、主色、配件照 CHARACTERS.md §3、§4；頭目照陣容設定圖（`docs/storyboard/03-bosses.md`「頭目的樣」）；9527、晶晶照各自的設定圖（`docs/STORY.md` §12）。#11 精英傘手、#12 精英舞獅手隨慢彈刪了（試玩回饋 ⑦，2026-10-31），所以敵人十種。配件（槍、盾、背囊、炸彈背心、鋼板等）分開做，掛在骨架上（PROPS.md §7、§8）；人物一律空手。

| 請求 | id（暫） | 角色 | 外形（**粗體**是由上望下認得的位置） | 主色 | 分開做的配件 | 面數 |
|---|---|---|---|---|---|---|
| 1 | hero | 9527 | 白西裝大一個碼，**全場唯一白色**；亂髮翹起一撮 | 白 | 雙槍 | 8,000 |
| 2 | grunt | 街頭打手 | T 恤、牛仔褲、波鞋；**最普通的身形**，做基準 | 炭灰＋橙 | 手槍 | 5,000 |
| 3 | shield | 盾牌保安 | 保安制服、**圓頭盔**、左前臂護墊 | 鋼藍 | 防暴盾、手槍 | 5,000 |
| 4 | captain | 疊碼仔頭 | **長褸下擺**、墨鏡 | 酒紅 | 雙槍 | 5,000 |
| 5 | rifle | 步槍手 | 短夾克、**鴨舌帽頂** | 紫 | 步槍 | 5,000 |
| 6 | shotgun | 散彈手 | 廚房圍裙、**背後交叉的圍裙帶**、水靴 | 啡 | 散彈槍 | 5,000 |
| 7 | brute | 保安大隻佬 | **最闊的膊頭**、黑超 | 深藍黑 | 機槍（JS 現時） | 5,000；遊戲放大 1.25 倍 |
| 8 | bomber | 炸彈客 | 背心、短褲、瘦、露手臂 | 卡其 | 炸彈背心、引爆器 | 5,000 |
| 9 | grenadier | 擲彈兵 | 工作服、手套、**闊背**（背囊另做） | 軍綠 | 榴彈背囊、手榴彈 | 5,000 |
| 10 | tumbler | 飛仔 | 電單車皮褸、**頭巾**、瘦 | 黑＋綠條 | 刀 | 5,000 |
| 11 | sniper | 狙擊手 | 長雨褸、**闊邊漁夫帽** | 深灰 | 狙擊槍 | 5,000 |
| 12 | blade | 刀姐（刀后，動作指導） | 修身黑長褸銀邊、**高馬尾** | 黑＋銀 | 雙刀 | 10,000 |
| 13 | gunner | 炮哥（重炮手，爆破組） | **巨型身形**、工人褲、橙揹帶 | 鐵灰＋橙 | 轉輪機槍、胸前鋼板 | 10,000 |
| 14 | bulwark | 門神（鐵盾，場務） | 重甲、**全罩頭盔**、膊頭對講機、腰間空槍套 | 深綠 | 大鐵盾、左輪 | 10,000 |
| 15 | marksman | 長鏡（長槍手，攝影指導） | 高瘦、深藍長褸、**闊邊帽**、背着細攝影機 | 深藍 | 長狙擊槍（瞄準鏡像電影鏡頭） | 10,000 |
| 16 | buckshot | 選角陳（散彈手，選角） | 瘦、油頭、茶色眼鏡、啡皮褸、手套 | 啡＋橙 | 雙管散彈槍、試鏡相 | 10,000 |
| 17 | producer | 金爺（最終頭目，監製） | 黑色雙排扣西裝、**花白油頭**、暗金頸鏈、金戒指、金牙 | 黑＋暗金 | 雪茄 | 10,000 |
| 18 | jingjing | 晶晶（真結局的頭目，不打） | 深紫旗袍式晚裝（高開衩）、長黑髮 | 深紫 | 手袋、寶石手槍 | 8,000 |
| 19（可選） | hero-late | 後期 9527 | 領呔鬆、捲衫袖、西裝有焦痕 | 白 | 雙槍 | 8,000 |
| 20（可選） | producer-2 | 金爺第二階段 | 脫了西裝、黑恤捲袖、揹帶 | 黑＋暗金 | — | 10,000 |

## 3. 流程（Tripo）

### 第 0 步：開戶

- Tripo Professional（約 US$20／月，3,000 點；年繳較便宜）。付費才是私有、可商用；免費版的模型不能用到正式版。
- 檔案放自己的電腦，例如 `bullet-ballet-art/characters/<id>/`（同 PROPS.md 的做法），Godot 工程開了（G①）才入倉。JS 倉的 `assets/` 是第一代，不要放進去。

### 第 1 步：ChatGPT 出三視圖

- 用有過場設定圖的那個 ChatGPT 對話（沒有就開新對話，附上三張設定圖：9527、頭目陣容、晶晶），上載 `model-sheets.txt`，照「next」「skip」「redo」逐張出。頭四張是試產。
- 每張是 3:2 橫向、淺灰底，同一個人三個視角：左邊正面；中間左側面（他自己的左邊向着我們）；右邊背面。A-pose、空手、平色、**不畫黑色描邊**：描邊和陰影由 Godot 的賽璐璐 shader 出，畫進設定圖會變成貼在模型兩側的黑線。
- 揀的標準：和過場設定圖像不像同一個人；三個視角一樣高、腳底對齊；手腳分得開；縮到 100 像素高仍認得出（俯視鏡頭下人物就是這麼大）。

### 第 2 步：切開三張

- 每個視角一張圖，人物置中、四邊留白，不要切到頭頂和鞋底。
- 自己用任何修圖軟件裁，或者上載給 Claude 切（這部機有 ImageMagick，一張三視圖切三張只要幾秒）。

### 第 3 步：Tripo 多視角生成

在 Tripo Studio 選 Multiview to 3D（多視角生成 3D）：

| 設定 | 值 |
|---|---|
| Front／Left／Back | 正面／左側面／背面；Right 留空（Tripo 至少要正面加一個視角；三四個視角的幾何好得多） |
| 模型 | P2（最新；沒有就 P1） |
| Texture | Standard（2K） |
| PBR | 關（賽璐璐只用顏色圖） |
| Face limit | §2 的面數（是目標，不是硬上限） |
| Quad | 關（三角面，出 GLB；開了出 FBX） |
| Texture alignment | Original image（貼圖跟設定圖） |
| 其餘 | 預設 |

出 2–4 個（換 seed）揀一個。

### 第 4 步：揀

- 剪影像設定圖；手腳分得開（手指不要緊，遊戲握槍用 IK）；兩手空；腳板平；顏色平、沒有烘焙光影；沒有浮空碎片；正面向前。
- 不對就重生，不修（ROADMAP：照用不修）；重生兩次都不對，回 ChatGPT「redo」改設定圖。

### 第 5 步：綁骨

- Tripo 的 Rig：先 Rig check（免費），再 Rig（約 25 點）：類型 **Biped**，骨名 **Mixamo**。Mixamo 骨名就是 SPEC §3 那一套，Godot 的 BoneMap 對得上。
- 後備：沒綁骨的模型上載 Mixamo 自動綁（免費）。

### 第 6 步：動作

- **建議：Mixamo 的動作只下載一套**（揀 In Place，用 Mixamo 自己的公仔，不用上載我們的人物），Godot 用 SkeletonProfileHumanoid 重定向，全部人共用一個動作庫；每個角色只做綁骨。清單照 CHARACTERS.md §5（敵人約 12 段，頭目每人多四至六段）和 REDESIGN §7（9527 的 14 段）。
- Tripo 自己的動作（每段約 10 點）要用 Tripo 骨名才套得上，和 Mixamo 骨名二選一，所以不建議。
- 沒有現成的（牆跑、抱人、被處決、晶晶拿咪）：Godot 程式姿勢（JS 版 KEY_POSES 的做法），或之後再找。

### 第 7 步：匯出、記錄

- 匯出 GLB（連骨架），存進 `bullet-ballet-art/characters/<id>/`：`<id>.glb`、三張視圖、`NOTES.md`（工具、模型版本、日期、方案即授權、用了哪個請求、揀了第幾個）。
- Steam：Valve 2026 年 1 月改寫的規則，玩家接觸到的「預先生成」AI 內容要在 Steamworks 內容問卷寫明（例：「人物的 3D 模型由 Tripo 從我們自己的設定圖生成」）；記錄齊全就好寫。

### 第 8 步：入 Godot、驗收（Claude 做）

- GLB 直接匯入；模型正面 +Z、Godot 慣例 −Z，場景裏轉 180°；BoneMap 用 SkeletonProfileHumanoid；身高統一成 1.78 米，再照遊戲的放大倍數（大隻佬 1.25，頭目 1.1–1.35，`src/boss.js`）。
- 材質換成賽璐璐 shader（只讀顏色圖；陰影、邊光、描邊由 shader 出）；配件用 BoneAttachment3D 掛上骨架；9527 的外套換色由 shader 染白色的像素。
- 驗收（H①）：Godot 茶樓（PR #54 的 G⓪）用遊戲鏡頭俯視截圖，試產的四個人一眼分得出；身高、腳底、骨名、面數、沒有烘焙光影、跑踢滑鏟沒有撕裂。

## 4. 費用（Tripo，2026-11-01）

| 項目 | 價 |
|---|---|
| Professional | 約 US$20／月（年繳約 US$13／月），每月 3,000 點 |
| Max | 約 US$90／月，每月 25,000 點 |
| 多視角生成連貼圖 | H 系列 30 點；P1 50 點（一口價）；P2 未見公開價，以 Studio 顯示為準 |
| 綁骨 | 約 25 點（檢查免費） |
| 動作 | 每段約 10 點（不用：用 Mixamo） |

估算（照 CHARACTERS.md 的假設：敵人每個生成 4 次、頭目 6 次；用 P1 的價）：敵人 10 × 4 × 50 = 2,000；部門頭目、金爺、晶晶 7 × 6 × 50 = 2,100；9527 6 × 50 = 300；綁骨 18 × 25 = 450；合共約 4,850，加兩成約 **5,800 點 → Professional 兩個月，約 US$40**。只做試產四個約 1,000 點，一個月夠（約 US$20）。兩個可選變體多約 650 點。

後備 Meshy：Pro US$20／1,000 點、Premium US$40／3,000 點；網頁版綁骨和動作免費；圖生 3D 連貼圖約 35 點。

## 5. 生成的規矩

照 CHARACTERS.md §2，加上給生成工具的幾條：

1. 6–6.5 頭身；A-pose（雙手向下約 45°，腋下要看得見空位）；空手；配件分開做。
2. 由上望下認得：每種一個識別物和一隻主色，放在頭、帽、膊頭、背脊（CHARACTERS.md 已經揀好）。
3. 顏色：不用功能色做主色（敵人子彈黃白、玩家子彈青白、紅線純紅；慢彈的粉紅隨慢彈刪了）；只有 9527 是白；金牙幫的金偏暗、偏銅，只做點綴，請求沒寫就不加。
4. 平色、沒有烘焙光影；設定圖不畫黑色描邊。
5. 避免垂下來的長布（頸巾、披風、飄帶）；長褸背後開衩、旗袍高開衩，兩條腿分得開，自動綁骨才不會撕裂。
6. 沒有字、沒有 logo、沒有真實品牌；原創人物，不像任何真人或演員（9527 只借一個編號，`docs/STORY.md` §3）。
7. 提示詞不寫遊戲名、動畫名、畫師名。

## 6. 提示詞

- [model-sheets.txt](model-sheets.txt)（英文）：檔頭是用法，然後是共用規矩和 20 個請求（18 個加 2 個可選），每個寫明要附哪張設定圖。和過場的 `.txt` 一樣，整個檔上載給 ChatGPT。
- 頭目的請求叫 ChatGPT「照陣容設定圖畫，但不要手上的武器」；敵人沒有過場設定圖，所以只借 9527 和頭目陣容的畫風，外形照 CHARACTERS.md。
- 不建議用 Tripo 的純文字生成（Text to 3D）：出來的人和過場的設定圖對不上。

## 7. 要開發者決定

1. **試產四個：** 9527、街頭打手、盾牌保安、疊碼仔頭？CHARACTERS.md §8 原本揀街頭打手、盾牌保安、精英傘手；傘手刪了，所以換成疊碼仔頭（長褸），再加 9527。
2. **動作：** Mixamo 加 Godot 重定向（建議，免費），不用 Tripo 的動作？
3. **兩個可選變體**（後期 9527、金爺第二階段）現在做不做？
4. **預算：** Professional 一至兩個月（約 US$20–40）？
5. **保安大隻佬的武器：** 照 JS 拿機槍？（CHARACTERS.md 寫「F⑧ 定」，F⑧ 做完沒有改）

## 8. 來源（2026-11-01 查）

- Tripo API 點數（US$1 = 100 點；生成、綁骨、動作）：<https://developers.tripo3d.ai/en/pricing>、<https://docs.tripo3d.ai/get-started/pricing.html>
- Tripo 月費方案（官方頁擋自動讀取，數字來自搜尋摘要）：<https://www.tripo3d.ai/product-doc/getting-started/pricing-credits>
- Tripo 與 Meshy 月費比較（2026-10-11 更新）：<https://picoberry.ai/ai-3d-generator-pricing-comparison>
- Tripo 免費版不可商用：<https://www.tripo3d.ai/game-development/3d-assets-license-game-development>
- Tripo 多視角輸入（正面必須，另加一至三個視角）、P2 的選項：<https://docs.comfy.org/built-in-nodes/TripoPSeriesMultiviewToModelNode.md>、<https://wavespeed.ai/docs/docs-api/tripo3d/tripo3d-h3.1-multiview-to-3d>
- Tripo 綁骨的 Mixamo 骨名（`spec: mixamo`）：<https://developers.tripo3d.com/en/docs/animations-rig.md>
- Meshy 方案和網頁版點數：<https://www.meshy.ai/pricing>、<https://docs.meshy.ai/en/webapp/pricing>
- Mixamo 免費、可商用：<https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>
- Steam 2026 年 1 月的 AI 披露規則：<https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/>
- Godot 骨架重定向（BoneMap、SkeletonProfileHumanoid）：<https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/retargeting_3d_skeletons.html>
