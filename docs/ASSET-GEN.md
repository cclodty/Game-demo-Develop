# 第二代資產生成計劃：流程、費用、數量、畫風、提示詞

2026-11-01 第一版（Claude 整理；**§8 的問題待開發者答**，答了才改 `docs/REDESIGN.md` 和 DECISIONS）。上游：`docs/ROADMAP.md` 第四版（資產：Meshy 生成照用不修，先試三個）、`docs/REDESIGN.md` §2 美術聖經、§5 敵人、§7 資產清單第二版。這份是 H①（角色設定圖、試產）之前的準備：買月費、出第一張設定圖之前先讀。

**價錢全部是 2026-11-01 在官網或官方文件查到的**（Tripo 的月費頁擋了自動讀取，用的是搜尋摘要和第三方 2026-10 的比較，見 §9）；買之前在官網再核對一次。

## 1. 一頁摘要

| 項目 | 結論（第一版） |
|---|---|
| 要生成的 | **人物 16 個**（玩家 1、敵人 10、頭目 5），候選再加 5；**武器與手持物 16 件**；**道具約 55 件**；動作約 30 段，其中 14 段全部人共用 |
| 工具 | 試產用**同一組設定圖，Meshy 和 Tripo 都試**，比較後揀一個量產；兩個的流程一樣：設定圖 → 圖生 3D → 減面 → 自動綁骨 → 動作 |
| 錢 | 試產約 **US$30**（兩個各一個月）；量產約 **US$90–120**；合共 **US$150（≈ HK$1,200）以內**。Meshy 網頁版的綁骨、動作、減面免費；Mixamo 免費 |
| 真正的成本 | 開發者揀圖的時間：每個人物約 45 分鐘、每件道具或武器約 10 分鐘，加風格錨和試產，合共約四至五日 |
| 三道閘 | ① **風格錨**：玩家設定圖，開發者說「畫風就是這樣」；② **試產**：四個人物入 Godot 茶樓，俯視截圖一眼分得出；③ **量產**：照 G 組要用的次序一批批出 |
| 授權 | **正式用的一律在付費方案下生成**：Meshy 免費版是 CC BY 4.0（公開、要署名），Tripo 免費版公開、不可商用；付費版兩個都是私有、可商用。上 Steam 要在內容問卷披露「預先生成的 AI 內容」 |

## 2. 工具與費用

### 2.1 方案

**Meshy**（官網 pricing 頁，2026-11-01）：

| 方案 | 月費（美元） | 每月點數 | 授權 | 其他 |
|---|---|---|---|---|
| Free | 0 | 100 | CC BY 4.0：公開，商用要署名 Meshy | 每月只可下載 10 個，而且只限 Meshy 6 Lite；同時 1 個任務 |
| Pro | 20（首月 10） | 1,000 | 私有，版權歸用戶 | 每個任務 4 次免費重試；同時 10 個 |
| Premium | 40（首月 20） | 3,000 | 同上 | 12 次免費重試；同時 30 個 |
| Ultra | 100（首月 50） | 8,000 | 同上 | 40 次免費重試；同時 100 個 |

Studio（每月 70，5,500 點全組共用）一個人用不著。FAQ 說年繳八折，但表上沒有列年繳價。

**Tripo**（官方文件的搜尋摘要、第三方 2026-10-11 的比較頁；**要在官網核對**）：

| 方案 | 月費（美元） | 每月點數 | 授權 |
|---|---|---|---|
| Free | 0 | 200（有資料寫 300） | 公開，不可商用（Tripo 自己的遊戲開發頁：只可做佔位、提案） |
| Professional | 約 20（年繳約 13／月） | 3,000（另有點數更多的檔） | 私有，可商用 |
| Max | 約 90（年繳約 45／月） | 25,000 | 私有，可商用 |

Tripo 的 API 另計：US$1 = 100 點，用多少買多少。兩家的月費點數通常不留到下個月（買之前看清楚）。

### 2.2 每一步多少點

| 步驟 | Meshy 網頁版 | Tripo |
|---|---|---|
| 圖生 3D（一張或多張圖） | 20；Ultra 2K 25（付費方案的預設）；要貼圖 +10，所以**約 35** | 有貼圖 30（H 系列）／50（P1，一口價） |
| 高清貼圖 | 8K 才另計 | +10 |
| 減面、重拓撲 | Remesh **免費**；Smart Topology 5（T2） | Smart low poly +10；重拓撲 10–40 |
| 重新上貼圖 | 10 | 10–20 |
| 自動綁骨 | **免費** | 25（綁骨前的檢查免費） |
| 動作 | **免費**（每段；部份動作要付費方案） | 每段 10（API 價；Studio 約 20） |
| 出設定圖（文生圖、圖生圖） | 3–9（nano-banana、GPT Image 等，API 價） | 5–15（seedream、banana、chat_image、midjourney 等）；一張圖出四個視角 10 |
| 失敗的任務 | 不收 | 按任務收 |

### 2.3 估算

假設：人物每個出設定圖 6–8 張、圖生 3D 兩次（Meshy 每次另有免費重試）；道具和武器每件設定圖 2 張、圖生 3D 一次半；Tripo 那邊的動作用 Mixamo，不在 Tripo 買。

| | Meshy | Tripo |
|---|---|---|
| 一個人物 | 設定圖 20–50 + 3D 70 + 綁骨 0 + 動作 0 ≈ **110 點** | 設定圖 30–80 + 3D 100（P1）+ 綁骨 25 ≈ **200 點** |
| 一件道具或武器 | 設定圖 12 + 3D 53 ≈ **65 點** | 設定圖 20 + 3D 75 ≈ **95 點** |
| 試產（4 個人物） | ≈ 450 → Pro 一個月（首月 US$10） | ≈ 800 → Professional 一個月（約 US$20） |
| 量產（16 人物 + 71 件） | ≈ 6,400，加三成重做 ≈ **8,300** → 試產月剩下的點 + Ultra 一個月（US$100），或 Premium 三個月（US$120） | ≈ 9,900，加三成 ≈ **12,900** → Max 一個月（約 US$90），或 Professional 再四個月（約 US$80） |
| 連試產合共 | **約 US$110–130** | **約 US$100–110** |

兩個都試再揀一個：多 US$10–20。價錢差不多，揀工具看質素和順手，不看錢。

**點數不過月：** 等一批設定圖準備好才開一個月，一次過出；兩批之間可以停訂。停訂後之前生成的模型怎樣算，買之前看條款（Meshy 付費方案寫明 private & customer owned）。

### 2.4 揀哪一個

- **Meshy 的長處：** 綁骨、動作、減面在網頁版免費；付費方案每個任務有免費重試，一次付費出幾個版本揀；生成時可以揀 A-pose／T-pose；官方說骨名跟 Mixamo；600 多段現成動作，缺的用 Text to Motion 補；ROADMAP 原本就揀了它。
- **Tripo 的長處：** 點數便宜（同樣約 US$20，3,000 點對 1,000 點）；綁骨可以直接揀 Mixamo 骨名（`spec: mixamo`）；有 smart low poly 和四邊面重拓撲；一張圖出四個視角。
- **質素：** Meshy 7.1 和 Tripo P1 都是新模型，網上的比較很快過時。**試產時同一組設定圖兩個都試**，照 §3 第 7 步的清單並排比較，揀一個量產，DECISIONS 記一行。兩個都不過關才看其他工具。

## 3. 流程

```
設定圖（2D）→ 圖生 3D → 減面 → 綁骨 → 動作（一套全部人共用）→ 入 Godot（賽璐璐、掛點）→ 俯視驗收
   ↑ 每張都夾附「風格錨」（玩家的設定圖）
```

畫風在第 1、2 步的 2D 設定圖定，不在 3D 工具定：3D 工具做的只是把設定圖立體化。所以「確認畫風」等於確認玩家那張設定圖。

### 第 0 步：準備（開發者，半日）

- 答 §8 的問題：工具、試產四個、顏色規矩、A-pose。
- 填 REDESIGN §3 的幫派色和符號，或照用 §4.1 的第一版主色表。
- 參考圖（REDESIGN §2，`docs/art/reference/`）只是給人看、對齊口味；**不要把其他遊戲或動畫的圖餵進生成工具**（版權問題；生成用的風格參考是我們自己的風格錨）。
- 開付費月費做試產（免費版的模型不能直接用到正式版，見 §1 授權）。
- 檔案放哪裏：設定圖和母版放雲端硬碟（超過 GitHub 50 MB 的警告線，SPEC §7，與第一代相同）；倉裏只放每件的 `NOTES.md`、512 像素縮圖、遊戲用的 GLB（放在 Godot 工程，位置跟 G⓪／G① 定）。上載可以用 GitHub 網頁的 *Add file → Upload files*，再叫 Claude 處理。

### 第 1 步：風格錨（第一道閘，開發者揀）

- 用 §6.1 的模板出玩家設定圖：正面、背面各一張，A-pose。出 8–16 張，揀一張。
- 揀的標準：(a) 縮到 100 像素高仍認得出（遊戲裏人物就是這麼大，SPEC §2）；(b) 白色外套佔膊頭和背脊；(c) 平色，沒有光影漸變；(d) 6–6.5 頭身。
- 定了之後，以後每一張設定圖都夾附這張做參考（圖生圖或參考圖），加一句「same art style as the reference」。十幾個人同一個畫風靠這一步。
- 開發者說「畫風就是這樣」才去第 2 步。

### 第 2 步：設定圖（每件）

- 人物：§6.1 的模板換方括號（§6.2 的表），出**正面**、**背面**兩張獨立的圖；背面不能靠估，背囊、長褸、帽由上望下是最大塊。要側面就出第三張。Tripo 可以一張圖出四個視角（10 點）；Meshy 用圖生圖寫「same character, back view」。
- 道具、武器：§6.4、§6.5 的模板，各一張（道具 3/4 俯角，武器正側面）。
- 自查：縮細瞇眼看，剪影和主色分不分得開？主色是不是在頭、膊頭、背脊？

### 第 3 步：圖生 3D

- **Meshy：** Image to 3D（有幾個視角就用 Multi-Image）；模型 Meshy 7.1；Pose 揀 **A-pose**；Texture 開、**PBR 關**（賽璐璐只用顏色圖）；貼圖 2K；texture prompt 用 §6.3 那一句。用免費重試出 3–5 個，揀一個。
- **Tripo：** Multiview（或 Image）to Model；P1（或 H3）；Texture standard；道具開 smart low poly。
- 揀的標準：剪影像設定圖；手腳分得開（手指不要緊，遊戲裏握槍用 IK）；兩手空；腳板平；顏色平、沒有烘焙光影；沒有浮空碎片。
- 不對就重生，不修（ROADMAP：照用不修）。重生兩次仍不對，回去改設定圖。

### 第 4 步：減面

- 預算（REDESIGN §7）：玩家 8k、敵人 5k、頭目 10k 三角形；武器 1k；道具 1–3k。
- Meshy：Remesh（免費）到預算，三角面。Tripo：smart low poly 或重拓撲。
- **先減面，後綁骨**：骨架的權重綁在遊戲用的網格上。未減面的原檔留做母版（第一代的做法，SPEC §6）。

### 第 5 步：綁骨與動作

- 綁骨：Meshy Rigging（免費；**身高填 1.78**，預設是 1.7；模型要面向 +Z）或 Tripo Rig（25 點；**spec 揀 mixamo**）。兩個都出 Mixamo 式骨名，即 SPEC §3 那一套，Godot 的 BoneMap 對得上。後備：Mixamo 自己的自動綁骨（免費）。
- 動作**只買一次**：§4.4 的 14 段在 Mixamo（免費、可商用，揀 In Place）或 Meshy 動作庫下載一套；Godot 用 SkeletonProfileHumanoid 重定向，全部人共用一個動作庫。每個角色只做綁骨，不用逐個下載動作。
- 沒有現成的（牆跑、抱人、被處決）：Meshy Text to Motion；或在 Godot 裏用程式姿勢（JS 版 KEY_POSES 的做法）。
- 試跑、踢、滑鏟三段：膊頭、膝頭、長褸有沒有撕裂。

### 第 6 步：入 Godot（Claude 做）

- GLB 直接匯入（SPEC §8）；模型正面 +Z、Godot 慣例 −Z，場景裏轉 180°。
- 匯入設定：BoneMap → SkeletonProfileHumanoid；動作庫獨立一個檔，全部人共用。
- 材質換成賽璐璐 shader（H②）：只讀顏色圖，陰影、邊光、描邊全部由 shader 出（美術聖經的規格）。
- 武器掛點：Godot 場景裏加 Marker3D（`socket_muzzle`、`socket_support` 等，名字照 SPEC §4），不用改 GLB。
- 玩家外套換色：shader 把接近白色的像素染色（玩家是全場唯一白色，不用人手畫遮罩）。
- 一個匯入腳本加一個測試：身高、腳底、骨名、面數、材質數（同第一代 `test/calibration.test.mjs` 的做法）。

### 第 7 步：驗收（第二道閘）

- Godot 茶樓（G⓪ 的 `godot/lookdev/`）用遊戲鏡頭俯視 45° 截圖：四個人一眼分得出（H① 的驗收）。G⓪ 未做的話，試產的模型先放着等它。
- 清單：身高 1.78 ± 2 cm；腳底貼地；面向 +Z；兩手空；骨名全部對到；面數在預算內；沒有烘焙光影；跑、踢、滑鏟沒有撕裂；`NOTES.md` 填好。
- 兩個工具都試的話，同一張截圖並排比較，揀一個，DECISIONS 記一行。

### 第 8 步：記錄、授權、上架

- 每件一個 `NOTES.md`：工具、模型版本、日期、方案（即授權）、設定圖的提示詞、3D 設定、揀了哪個版本（同第一代 `assets/README.md` 的授權紀錄）。
- Steam：Valve 2026 年 1 月改寫的 AI 披露規則，玩家會接觸到的「預先生成」AI 內容要在 Steamworks 內容問卷寫明（例：「人物和道具的 3D 模型與貼圖，由 Meshy 從我們自己的設定圖生成」）；開發用的效率工具（例如寫程式的 AI）不用披露。記錄齊全就好寫。

### 第 9 步：量產次序（第三道閘之後）

- 跟 Godot 搬遷要用的次序：G③ 打手、步槍手、散彈手 → G④ 人盾（十種全部）→ G⑥ 頭目五個 → H④ 道具，一間房一批；武器跟 G②（手槍先）。
- 賽璐璐 shader（H②）定了才大量出道具：shader 改了，貼圖要多平可能跟着變。

## 4. 數量

### 4.1 人物（16 個，候選 5 個）

敵人照 `src/enemies.js` 現在的 `role`：#1–#10 十種在房裏出；#11、#12 隨慢彈刪了，位留空（試玩回饋 ⑦）。主色是第一版，§8 問題 3 確認。

| # | id（暫） | 角色 | 識別物（由上望下看得見的） | 主色（第一版） | 面數 |
|---|---|---|---|---|---|
| — | player | 玩家：槍手特技演員 | 白色短褸佔膊頭、背脊 | 白（全場唯一；外套可換色） | 8k |
| 1 | grunt | 街頭打手 | 短袖 T 恤、短髮：最普通，做基準 | 洋紅 | 5k |
| 2 | rifle | 步槍手 | 連帽運動外套，帽兜堆在膊頭 | 紫 | 5k |
| 3 | shotgun | 散彈手 | 大排檔圍裙、頭巾 | 橙 | 5k |
| 4 | brute | 保安大隻佬 | 闊膊、光頭、墨鏡 | 黑西裝 | 5k；遊戲放大 1.25 倍（SPEC §3） |
| 5 | captain | 疊碼仔頭 | 長褸、闊邊帽 | 墨綠（JS 版的米白要改） | 5k；長褸，試產測自動綁骨 |
| 6 | shield | 盾牌保安 | 頭盔、厚膊墊（盾另做） | 鋼藍 | 5k |
| 7 | bomber | 炸彈客 | 胸前一排紅色罐和警告燈的背心、冷帽 | 啡 | 5k；燈是發光 |
| 8 | grenadier | 擲彈兵 | 比身體還闊的方背囊、帽 | 橄欖綠 | 5k |
| 9 | tumbler | 飛仔 | 電單車褸、細細粒、刺蝟頭 | 黑 + 螢光綠 | 5k |
| 10 | sniper | 狙擊手 | 長褸、兜帽戴起、紅色單眼瞄準鏡 | 石板藍 | 5k |
| B1 | queen | 刀后 | 長馬尾、高領開衩長外套 | 黑 + 霓虹粉紅 | 10k |
| B2 | gunner | 重炮手 | 巨型身形、背着大彈鼓 | 鐵鏽橙 | 10k |
| B3 | bulwark | 鐵盾 | 全身護甲、窄縫頭盔（大盾另做） | 槍鐵灰 + 古銅 | 10k |
| B4 | marksman | 長槍手 | 很高、長大褸、平頂帽 | 深海軍藍 + 銀 | 10k；雙頭目之一 |
| B5 | buckshot | 散彈手頭目 | 闊身皮褸、莫希干頭 | 深啡 + 銅 | 10k；雙頭目之二 |

**候選（未排）：** 機槍手（壓制者，`hoser`）、#11、#12（題目未定）、DJ、裝甲車司機改人。無人機是機械，不綁骨，當道具做（§4.3）。最終頭目固定是哪一個未定（REDESIGN §5）。

### 4.2 武器與手持物（16 件）

| 類 | 件 | 數 |
|---|---|---|
| 玩家（REDESIGN §4 十二支；雙手槍共用手槍） | 手槍、左輪、衝鋒槍、散彈槍、雙管散彈、步槍、連發步槍、機槍、榴彈發射器、狙擊步槍、鏍釘槍 | 11 |
| 敵人、頭目專用 | 刀（飛仔；刀后用同一把放大）、防暴盾（盾牌保安）、大盾（鐵盾）、手榴彈（擲彈兵）、重炮（重炮手，比機槍大） | 5 |

敵人的槍和玩家共用模型（打手手槍、步槍手步槍、散彈手散彈槍、狙擊手和長槍手狙擊步槍、散彈手頭目雙管），第一代也是這樣。

### 4.3 道具（約 55 件）

「Godot 裏做」的是平面、重複件、發光件，用 CSG、shader 或 MultiMesh 做，比生成省事，也不會撞畫風。

| 房 | 生成 | 數 | Godot 裏做（不生成） |
|---|---|---|---|
| 共用 | 油桶（會爆）、石油氣罐（踢出去噴射）、木箱（會散）、門、閘、燈柱 | 6 | 牆、地、出口燈 |
| 茶樓（三間） | 圓枱連枱布（翻枱）、圓凳、點心車連蒸籠、屏風、燈籠、收銀櫃台、魚缸 | 7 | 金欄杆、地磚、牆身裝飾 |
| 大排檔 | 摺枱、膠櫈（一個模型染紅藍）、煮食檔櫃台、鑊、啤酒箱 | 5 | 鐵皮頂、燈泡串 |
| 廣場 | 長椅、花槽、白鴿（不綁骨，程式拍翼）、噴水池中間的盆 | 4 | 池邊、水 |
| 跑道彎 | 賽車（一個模型，兩三款塗裝）、一疊輪胎（重複擺）、紅燈架、防撞欄 | 4 | 路面、紅白路肩、草地 |
| 石階 | 石花槽連樹籬、石欄杆 | 2 | 石級 |
| 直街 | 鐵閘、招牌（沒有字，字在 Godot 貼）、冷氣機、垃圾桶 | 4 | 舖面（殼） |
| 碼頭 | 繫纜樁、手推車、鐵貨箱、漁網堆、貨櫃 | 5 | 海、碼頭邊 |
| 天台 | 晾衫竹架、天線、水缸 | 3 | 床單（平面）、樓梯屋（殼）、霓虹燈條 |
| 夜店 | 喇叭、DJ 台、吧枱（一節，重複接）、梳化（一節）、高枱、鏡球 | 6 | 舞池燈磚 |
| 頭目房（四間） | 每間兩三件，H④ 時定（例：庫房的保險箱、錢箱） | 約 8 | 柱 |
| 機械 | 無人機（候選敵人；螺旋槳程式轉） | 1 | — |
| **合共** | | **約 55** | |

REDESIGN §7 估「約 10 件 × 9 房」= 90；共用件和 Godot 裏做的扣掉後約 55。基地（H⑦）的道具到時再數。

### 4.4 動作（約 30 段）

- **全部人共用（14 段，REDESIGN §7）：** idle、run、strafe、slide、spin（旋轉射擊的上身）、kick、carry（抱人）、shove、dive、wallrun、death ×2、hit、executed。
- **個別（第一版，約 15 段）：** 大隻佬衝撞、炸彈客衝前、擲彈兵拋彈、飛仔翻滾和揮刀、盾牌保安持盾行、疊碼仔頭指揮；每個頭目一兩段招式。
- 來源：Mixamo 或 Meshy 動作庫（免費）；沒有的用 Text to Motion 或 Godot 程式姿勢。

## 5. 畫風：生成用的規矩

美術聖經（REDESIGN §2）翻譯成生成工具聽得明的規矩：

1. **一句：** 架空港澳夜都市的街頭動畫：鮮色、霓虹、街頭時裝。
2. **比例：** 6–6.5 頭身（動畫比例，不是 Q 版）。
3. **俯視看得清（最重要）：** 鏡頭看到的是頭頂、膊頭、手臂、腳步，人物在 1080p 約 100 像素高（SPEC §2）。識別物和主色要放在**由上望下看得見的位置**：頭髮或帽、膊頭、背脊、手臂；褲和鞋不算。
4. **剪影：** 每種一件誇張的識別物（帽、兜帽、背囊、闊膊、盾、長褸），由上望下面積要大。
5. **顏色：**
   - 每種敵人一隻主色，佔上半身最大塊；底色用深色（黑、深灰、深藍）。
   - 玩家是全場唯一白色；敵人不用白、米白。
   - **功能色不撞：** 敵人子彈黃白、玩家子彈青白、紅線紅。美術聖經只規定房的主色避開這三色；建議角色主色也避開鮮黃、青、鮮紅（§8 問題 3）。會爆的道具照舊鮮紅、鮮橙加警告標（SPEC §2），它們是實物，不是線。
6. **貼圖：** 平色塊、少紋理、**沒有烘焙光影、沒有漸變**；陰影、邊光、描邊由賽璐璐 shader 出，不畫進貼圖。
7. **沒有字、沒有 logo、沒有真實品牌**（CLAUDE.md 第 8 條）；招牌的字在 Godot 貼。
8. **提示詞不寫遊戲名、動畫名、畫師名：** 用形容詞描述畫風（「都市潮流動畫」的口味由 §6 模板的字眼表達）；也不用其他作品的圖做生成參考。
9. **人物姿勢：** A-pose（雙手向下約 45°）、兩手空、不拿武器（SPEC §3；REDESIGN §7 的模板寫 T-pose，建議改，§8 問題 4）。
10. **自動綁骨的限制：** 避免垂下來的長布（頸巾、披風、長飄帶）：沒有布料物理，一跑就撕裂。長褸是美術聖經要的（疊碼仔頭、狙擊手、長槍手、刀后），試產先測一個。
11. **武器：** 比真槍大少少、粗壯、虛構設計（不照真槍型號），深色為主加一隻點綴色。
12. **道具：** 簡單厚實的形，稍為誇張；一件一個材質（REDESIGN §7）。

## 6. 提示詞

英文（工具聽英文最準）。方括號是每件要換的；其餘一字不改，畫風才一致。

### 6.1 人物設定圖（文生圖、圖生圖）

```
Character design of [ROLE], [BUILD], with [SIGNATURE], wearing [OUTFIT], a member of a fictional street gang in a neon-lit harbour city at night.
Stylish urban anime look: clean cel shading with two tones, bold flat colours, crisp graphic shapes, streetwear fashion, 6.5 heads tall, head-wear and shoulders slightly exaggerated so the character reads from above.
Full body, [VIEW], standing in A-pose with arms 45 degrees down, empty open hands, feet shoulder-width apart, neutral expression.
Plain light grey background, flat even lighting, no cast shadows, no text, no logos, no weapons, no props.
```

- `[VIEW]`：`front view`、`back view`（要側面加 `left side view`）。
- 玩家：把 `a member of a fictional street gang` 換成 `a lone outsider`。
- 有了風格錨之後，夾附玩家設定圖，最前面加一句：`Same art style, line quality, colour treatment and proportions as the reference image.`
- 工具有負面提示詞欄就填：`realistic, photo, 3D render, gritty, noisy texture, baked shadows, gradient shading, chibi, text, logo, watermark, holding weapon, extra limbs`
- 炸彈客的字眼避開 bomb、explosive：工具的內容審查可能拒絕。

### 6.2 人物的方括號

| id | [ROLE] | [BUILD] | [OUTFIT] | [SIGNATURE] |
|---|---|---|---|---|
| player | a young stunt performer turned gunslinger | lean athletic build | a white cropped jacket with a high collar and rolled sleeves, a dark fitted shirt, black slim trousers, dark sneakers | short tousled black hair and fingerless gloves |
| grunt | a street thug | average build | a magenta T-shirt, dark jeans, black sneakers | a short black undercut and bare forearms |
| rifle | a gang rifleman | lean build | a violet track jacket with the hood down, dark cargo trousers, combat boots | a bulky hood bunched on the shoulders and a dark face mask |
| shotgun | a street-food cook turned shotgunner | stocky build | an orange apron over a dark vest, rubber boots | an orange head scarf and broad apron straps across the back |
| brute | a huge security bouncer | massive build, shoulders far wider than the hips, thick neck | a tight black suit, black shirt, no tie | a shaved head and small dark sunglasses |
| captain | a gang captain who runs the card tables | tall slim build | a deep green long coat to the knees over a dark suit | a wide-brimmed black hat |
| shield | a riot security guard | solid build | a steel blue security uniform with big padded shoulders and knee pads | a round helmet with the visor up |
| bomber | a reckless demolition man | wiry build | a brown utility vest lined with red canisters and small warning lights, dark trousers | a black beanie and goggles on the forehead |
| grenadier | a gang grenadier | sturdy build | an olive field jacket, cargo trousers, boots | a huge square backpack wider than the torso, and a cap |
| tumbler | a motorbike delinquent and knife fighter | small wiry build | a black motorcycle jacket with neon green stripes, slim trousers | spiky hair tipped neon green |
| sniper | a gang sniper | tall thin build | a long slate blue coat with the hood up | a red monocle scope over one eye |
| queen | the blade queen, a lieutenant and knife dancer | tall slender build | a black long coat with a high mandarin collar, side slits and hot pink lining, fitted trousers | a very long high ponytail and hot pink boots |
| gunner | the heavy gunner, the dockside lieutenant | enormous build | rust orange work overalls with one strap down, a black tank top, heavy boots | a huge ammunition drum strapped on the back |
| bulwark | the iron wall, the armoured lieutenant | huge stocky build | gunmetal plate armour over a bronze padded coat | a heavy helmet with a narrow slit visor |
| marksman | the marksman, a calm assassin | very tall lean build | a long dark navy coat with silver buttons over a turtleneck | a flat cap and silver-rimmed glasses |
| buckshot | the marksman's loud partner | broad heavy build | a dark brown leather jacket with brass studs over a patterned shirt | a mohawk |

盾牌保安的盾、鐵盾的大盾另做（§4.2），所以他們的設定圖照樣兩手空。

**例：打手的正面，貼進去就用：**

```
Character design of a street thug, average build, with a short black undercut and bare forearms, wearing a magenta T-shirt, dark jeans, black sneakers, a member of a fictional street gang in a neon-lit harbour city at night.
Stylish urban anime look: clean cel shading with two tones, bold flat colours, crisp graphic shapes, streetwear fashion, 6.5 heads tall, head-wear and shoulders slightly exaggerated so the character reads from above.
Full body, front view, standing in A-pose with arms 45 degrees down, empty open hands, feet shoulder-width apart, neutral expression.
Plain light grey background, flat even lighting, no cast shadows, no text, no logos, no weapons, no props.
```

### 6.3 3D 生成的設定

| 設定 | 人物 | 道具、武器 |
|---|---|---|
| 工具的輸入 | 正面 + 背面（Meshy Multi-Image／Tripo Multiview） | 一張 |
| 模型 | Meshy 7.1／Tripo P1 | 同左（簡單的可試 Meshy 6 Lite，10 點） |
| Pose | A-pose | — |
| 貼圖 | 開，2K | 開，2K |
| PBR | 關 | 關 |
| 減面 | 生成後另做（第 4 步），先減後綁 | 生成時就減到預算（Meshy Remesh／Tripo smart low poly），三角面 |
| 綁骨 | Meshy：身高 1.78；Tripo：spec mixamo | — |

Meshy 的 texture prompt（重新上貼圖也用這句）：

```
flat cel-shaded anime colours, solid colour blocks, no lighting, no shading, no shadows, no gradients, no text, clean edges
```

### 6.4 道具設定圖

```
[OBJECT] made of [MATERIAL], [COLOURS], [DETAIL], a game prop for a stylish top-down action game set in a neon-lit harbour city at night.
Stylish urban anime look: clean cel shading, bold flat colours, simple chunky shapes with slightly exaggerated proportions, a clear silhouette from above.
Single object, centred, three-quarter view from slightly above, plain light grey background, flat even lighting, no cast shadows, no text, no logos, no brand names.
```

例（其餘的在 H④ 一間房一批寫）：

| 道具 | [OBJECT] | [MATERIAL] | [COLOURS] | [DETAIL] |
|---|---|---|---|---|
| 油桶 | an oil drum | steel | bright red with a white hazard band | a big flame warning symbol, no words |
| 石油氣罐 | a tall LPG gas cylinder | steel | bright orange | a brass valve on top and a foot ring |
| 圓枱 | a round banquet table | dark wood with a tablecloth | deep red cloth over dark wood | a lazy susan in the middle |
| 點心車 | a dim sum trolley | stainless steel | brushed steel with jade green trim | three stacks of bamboo steamers on its deck |
| 賽車 | a single-seat racing car | painted panels | deep blue and white | a big rear wing and chunky slick tyres, no sponsor logos |

### 6.5 武器設定圖

```
[WEAPON], a fictional design (not a real model), [COLOURS], chunky stylised proportions, slightly oversized, [DETAIL].
Stylish urban anime look: clean cel shading, bold flat colours.
Exact side view, muzzle pointing right, single object, plain light grey background, flat even lighting, no text, no logos.
```

例：

| 武器 | [WEAPON] | [COLOURS] | [DETAIL] |
|---|---|---|---|
| 手槍 | a compact semi-automatic pistol | gunmetal black with white grip panels | a squared slide |
| 左輪 | a heavy long-barrel revolver | gunmetal with a bone white grip | a big six-round cylinder |
| 鏍釘槍 | an industrial nail gun used as a weapon | safety orange body with a black grip | a long nail magazine under the nose |

## 7. 誰做甚麼

| | 開發者 | Claude |
|---|---|---|
| 第 0 步 | 答 §8、開月費 | — |
| 第 1–2 步 | 在工具裏出圖、揀圖 | 每件的提示詞（§6 的表）、按回饋改字眼 |
| 第 3–5 步 | 生成、揀版本、綁骨、下載動作 | 每步的設定、揀的清單 |
| 第 6–7 步 | 看截圖，說過不過關 | 匯入、shader 掛上、測試、截圖 |
| 量產道具 | 揀 | 可選：用 API 照表批量生成（§8 問題 8） |

## 8. 要開發者決定（附建議）

1. **工具：** 試產 Meshy、Tripo 都試（建議；多 US$10–20），還是照原決定只試 Meshy？
2. **試產四個：** 玩家、打手、散彈手（G③ 三種裏的兩種）、疊碼仔頭（長褸，測自動綁骨最難的情況）。H① 原卡寫「三種敵人、試產三個」；建議做四個，錢差不多。
3. **顏色：** 角色主色避開鮮黃、青、鮮紅、白（§5 第 5 點）？§4.1 的主色表照用？幫派色（REDESIGN §3）用哪一色，例如打手的洋紅做全幫派的臂章？
4. **A-pose** 取代 REDESIGN §7 模板的 T-pose？
5. **出設定圖用哪個工具：** Meshy／Tripo 內置的（用點數），還是你已有的 ChatGPT／Gemini 訂閱？
6. **預算上限：** 建議試產 US$40、量產 US$150；超過才問。
7. **量產時機：** 試產過關，加上 G⓪ 茶樓和 H② 賽璐璐看過，才量產？（建議是）
8. **道具批量：** 量產時道具交給 Claude 用 API 照 §6.4 的表批量出、你揀？要在雲端環境加 API key、開網絡白名單。

## 9. 來源（2026-11-01 查）

- Meshy 方案：<https://www.meshy.ai/pricing>
- Meshy 網頁版點數：<https://docs.meshy.ai/en/webapp/pricing>
- Meshy API 點數（文生圖、綁骨、動作的參考價）：<https://docs.meshy.ai/en/api/pricing>
- Meshy 圖生 3D 參數（`pose_mode`、`target_polycount`、`enable_pbr`、`texture_prompt`）：<https://docs.meshy.ai/en/api/image-to-3d>
- Meshy 綁骨（只限人形、面向 +Z、`height_meters` 預設 1.7）：<https://docs.meshy.ai/en/api/rigging-and-animation>
- Meshy 綁骨的骨名跟 Mixamo、600 多段動作：<https://www.meshy.ai/features/ai-auto-rigging>
- Tripo API 點數（US$1 = 100 點）：<https://developers.tripo3d.ai/en/pricing>、<https://docs.tripo3d.ai/get-started/pricing.html>
- Tripo 月費方案（官方頁擋自動讀取，數字來自搜尋摘要）：<https://www.tripo3d.ai/product-doc/getting-started/pricing-credits>
- Tripo 與 Meshy 月費比較（2026-10-11 更新）：<https://picoberry.ai/ai-3d-generator-pricing-comparison>
- Tripo 免費版不可商用：<https://www.tripo3d.ai/game-development/3d-assets-license-game-development>
- Tripo 綁骨的 `spec: mixamo`：<https://developers.tripo3d.com/en/docs/animations-rig.md>
- Mixamo 免費、可商用：<https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>
- Steam 2026 年 1 月的 AI 披露規則：<https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/>
- Godot 骨架重定向（BoneMap、SkeletonProfileHumanoid）：<https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/retargeting_3d_skeletons.html>
