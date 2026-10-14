# 3D 模型資產

遊戲裡每個人物和道具都可以換成真正的 3D 模型。沒有模型的，繼續用現在的方塊版，所以可以一件一件慢慢換，不用一次做完。

## 流程

1. **生成**：用 Meshy、Tripo 或 Blender 做模型，匯出 **GLB**，貼圖要嵌入檔案內。
2. **放進 `assets/raw/`**：檔名用下面清單的 id，例如 `hero.glb`、`crate.glb`。
   - 在雲端對話中，可以用 GitHub 網頁的 *Add file → Upload files* 上載到 `assets/raw/`，再叫 Claude 處理。
3. **處理**：執行 `npm run assets`（第一次先 `npm install`）。腳本會：
   - 超過面數上限就自動減面；
   - 貼圖縮到 512 或 1024 並轉成 WebP；
   - 壓縮網格（meshopt）；
   - 輸出到 `assets/models/`，並更新 `src/models-index.js`。
   - 一般 1–3 MB 的原檔會變成幾十至幾百 KB。
4. **開遊戲**：有模型的會自動替換，沒有的保留方塊版。
5. **比較**：
   - 同一個 id 可以放幾個版本，用 `-` 分開，例如 `hero-meshy.glb`、`hero-tripo.glb`。
   - 網址加 `?use=hero-tripo` 就用那個版本，`?models=off` 可看回方塊版。

`npm run assets -- inspect 檔案.glb` 可以檢查一個模型：面數、尺寸、骨頭名稱、動作名稱。

## 規格

**所有模型**

- **格式**：GLB，1 單位 = 1 米，Y 軸向上。
- **尺寸**：不用準。人物會按身高 1.78 米自動縮放，道具會縮放到遊戲裡的碰撞盒。
- **面數**：見清單。超過會自動減面，但在 Meshy 或 Tripo 先用 remesh 輸出低面數版本，效果比自動減面好。
- **貼圖**：輸出時不用先縮，腳本會處理。

**人物**

- **姿勢**：A-pose（雙手向下約 45°），**手上不要拿武器**，遊戲會把自己的槍放到手上。
- **骨架**：要綁骨，用 Meshy 或 Tripo 的自動綁骨，或 Mixamo 都可以。
  - 常見的骨頭命名都認得：Mixamo、Blender 的 `.L`/`.R`、`_l`/`_r`。
  - 認不到時，console 會提示，可在 `src/asset-manifest.js` 的 `bones` 指定名稱。
- **方向**：面向 +Z；反了會自動轉。
- **動作**：至少要 **idle**（站立）和 **run**（跑），最好加 **death**（死亡）。
  - 沒有 death，就用現在的倒地效果。
  - 動作可以放在同一個 GLB 內。
  - 也可以另外存一個檔，例如 `hero@run.glb`：只取裡面的動作，並改名為 `run`，骨頭按名稱配對。
  - 跳舞、揮手等用不著的動作，會自動丟掉以減少檔案大小。
- **不用做的動作**：瞄準、開槍、側行、後退、踢、翻滾。這些由遊戲控制：
  - 跑步動畫按實際移動速度播放，子彈時間會自動變慢；
  - 下半身朝移動方向，上半身朝瞄準方向；
  - 雙手用 IK（反向運動學）自動握住遊戲裡的槍。

**道具**

- **擺放**：底部貼地。長邊的方向會自動對齊遊戲裡的盒。
- **會爆的東西**：油桶、氣罐、石油氣罐要一眼看得出是危險品，鮮紅或鮮橙色。
- **貨櫃**：做成淺灰色，遊戲會染成紅、藍、綠、橙四種。
- **平底鑊**：手柄向 +Z。

## 清單

優先 1 是數量多、每一局都看得到的東西，先做這些最划算。

| 檔名 id | 名稱 | 優先 | 用在 | 尺寸 / 適配 | 面數上限 | 提示詞 (英文) |
|---|---|---|---|---|---|---|
| `hero` | 主角 | 1 | 全部 | 身高 1.78 m（自動） | 10000 | young agent in a teal bomber jacket, dark navy slim trousers, white sneakers, short black hair, fingerless gloves |
| `grunt` | 打手 THUG | 2 | 全部 | 身高 1.78 m（自動） | 6000 | street thug in a charcoal hoodie, dark jeans, red bandana around the neck, short dyed dark-red hair |
| `shotgun` | 散彈手 SHOTGUNNER | 2 | 全部 | 身高 1.78 m（自動） | 6000 | stocky gangster in a worn brown leather jacket, dark brown trousers, orange cap, broad shoulders |
| `rifle` | 步槍手 RIFLEMAN | 2 | 全部 | 身高 1.78 m（自動） | 6000 | mercenary in a dark purple-grey tactical jacket, cargo trousers, violet armband, beret |
| `rusher` | 刀手 BLADE | 2 | 全部 | 身高 1.78 m（自動） | 6000 | lean agile assassin in fitted black clothes, magenta scarf covering the lower face, light shoes |
| `brute` | 大隻佬 BRUTE | 2 | 全部 | 身高 1.78 m（自動） | 8000 | huge heavy enforcer in a grey armoured vest over a black shirt, thick arms, buzz cut, red shoulder patches (modelled at normal 1.78 m height, the game scales it up) |
| `crate` | 木箱 | 1 | 天台 7、碼頭 5、議事亭 6（共 18） | 按地圖的盒，填滿盒 | 800 | weathered wooden shipping crate with dark metal corner brackets, cube |
| `barrel` | 紅色油桶（會爆） | 1 | 天台 7、夜店 3、碼頭 5、議事亭 2（共 17） | 0.9 × 0.9 × 1.23 m，填滿盒 | 800 | bright red 200 litre steel oil drum with a yellow hazard stripe and flammable symbol, must read as explosive |
| `gas` | 大氣罐（會爆） | 1 | 夜店 2、碼頭 4、議事亭 2（共 8） | 1.16 × 1.16 × 1.8 m，填滿盒 | 1000 | large white industrial compressed gas tank, wide cylinder with a red band and a valve on top |
| `pan` | 平底鑊（反彈子彈） | 1 | 天台 6、碼頭 5、議事亭 8（共 19） | 0.82 × 1.31 × 0.1 m，填滿盒 | 600 | black cast iron frying pan with a long straight handle lying flat, seen from above, handle pointing forward |
| `concrete` | 混凝土路障 | 1 | 天台 3、議事亭 2（共 5） | 按地圖的盒，填滿盒 | 500 | long grey concrete road barrier (jersey barrier) with chipped edges, 4 m long |
| `container` | 貨櫃（一個模型、四種顏色） | 1 | 碼頭 7（共 7） | 按地圖的盒，填滿盒 | 1200 | 20 foot steel shipping container, corrugated walls, doors at one end, plain light grey paint (the game tints it) |
| `lpg` | 石油氣罐（會爆） | 1 | 議事亭 5（共 5） | 0.6 × 0.6 × 1.2 m，填滿盒 | 600 | orange LPG gas cylinder like the ones beside Macau street food stalls, rounded body with a valve collar |
| `streetlamp` | 葡式路燈 | 1 | 議事亭 8（共 8） | 按地圖的盒，按高度 | 1200 | Portuguese colonial cast iron street lamp of Macau, black, slender fluted post, two lanterns on a curved arm, 4 m tall |
| `stall` | 熟食檔 | 1 | 議事亭 5（共 5） | 按地圖的盒，填滿底面 | 2500 | Macau street food stall cart: stainless steel counter with pots and skewers, striped canopy on four poles, 2.8 m wide |
| `unit` | 天台冷氣機 | 2 | 天台 4（共 4） | 按地圖的盒，填滿盒 | 1000 | rooftop air conditioning condenser unit, metal box with a large round fan grill on top |
| `tray` | 酒吧托盤（反彈子彈） | 2 | 夜店 6（共 6） | 0.82 × 0.82 × 0.1 m，填滿盒 | 300 | round polished stainless steel bar serving tray lying flat |
| `speaker` | 夜店喇叭 | 2 | 夜店 4（共 4） | 按地圖的盒，填滿盒 | 800 | tall black nightclub speaker cabinet with two large woofers and a tweeter |
| `planter` | 花槽 | 2 | 議事亭 3（共 3） | 按地圖的盒，填滿底面 | 1200 | square cream-coloured stone planter box with a small rounded shrub, Portuguese style |
| `car` | 的士 | 2 | 議事亭 2（共 2） | 按地圖的盒，填滿底面 | 3000 | compact black Macau taxi sedan with a roof sign, doors closed |
| `kiosk` | 報紙亭 | 2 | 議事亭 1（共 1） | 按地圖的盒，填滿底面 | 1500 | small dark green metal newspaper kiosk with magazines on display and an overhanging roof |
| `hut` | 天台樓梯屋／碼頭小屋 | 3 | 天台 2、碼頭 1（共 3） | 按地圖的盒，填滿盒 | 1200 | small rooftop stairwell hut, painted concrete walls, metal door, flat roof with an overhang |
| `bar` | 吧枱 | 3 | 夜店 3（共 3） | 按地圖的盒，填滿盒 | 1200 | straight nightclub bar counter section, dark wood with a metal top and a pink neon strip, 4 m long |
| `sofa` | 卡位沙發 | 3 | 夜店 3（共 3） | 按地圖的盒，填滿盒 | 1000 | long nightclub booth sofa, purple leather, low backrest, 4.5 m long |
| `table` | 酒枱 | 3 | 夜店 3（共 3） | 按地圖的盒，填滿盒 | 500 | small square nightclub cocktail table with bottles and glasses on top |
| `dj` | DJ 台 | 3 | 夜店 1（共 1） | 按地圖的盒，填滿盒 | 1500 | nightclub DJ booth with two turntables, a mixer and glowing cyan front panel |
| `forklift` | 叉車 | 3 | 碼頭 1（共 1） | 按地圖的盒，填滿底面 | 2500 | yellow warehouse forklift truck with the forks lowered |
| `utilitybox` | 電箱 | 3 | 議事亭 1（共 1） | 按地圖的盒，填滿盒 | 400 | grey metal street utility cabinet with two doors and warning sticker |

**共用的風格提示詞**：生成時接在每句提示詞後面，全套模型的風格才會統一。

- 道具：`stylized semi-realistic game asset, low poly, clean painted PBR textures, slightly exaggerated readable shapes, single object, centered, no ground plane, no text`
- 人物：`full body game character, A-pose with arms 45 degrees down, empty hands (no weapon), front view, 1.78 m adult, stylized semi-realistic, clean painted textures, plain background`

人物最好先用同一種畫風畫一張設定圖（正面全身 A-pose），再用 image-to-3D 生成，比直接用文字生成更容易統一。

**清單從哪裡來**：上表由 `src/asset-manifest.js` 生成，要加減物件或改尺寸，改那個檔案即可。

## 大小預算

- **目標**：全部模型合計 **6 MB 以內**。分享用的單檔版本上限 16 MB，模型會以 base64 嵌入，體積約大 1/3。
- **人物**：每個約 300–600 KB，主要是骨架動作和 1024 貼圖。
- **道具**：每件約 10–100 KB。

## 授權紀錄

每加一個模型，在這裡記一行。以後要公開或商用時，才知道每件東西的來源和授權。

| 檔案 | 工具 | 方案／授權 | 日期 | 備註 |
|---|---|---|---|---|
| | | | | |
