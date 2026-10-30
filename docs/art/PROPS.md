# 第二代場景、道具、武器清單（交給 ChatGPT）

2026-10-29 · TASKS H⓪ · 依據 `docs/REDESIGN.md` §2（美術聖經）、§4（武器）、§7（資產清單第二版）。尺寸取自遊戲現行的碰撞與畫法（`src/rooms.js`、`src/config.js`、`src/level.js`、`src/fixtures.js`），已計 2026-10-29 房間放大 1.2 倍（房內 26.4 × 18 米，迷宮 28.8 × 19.2 米；房放大，東西本身唔放大）。**碰撞同樣子分開**：模型只係裝飾，尺寸要跟表，唔好自己改大細，否則畫面同玩法對唔上。人物（主角以外）見 [CHARACTERS.md](CHARACTERS.md)。

## 0. 點樣用（給開發者）

1. 開一個新的 ChatGPT 對話，先貼 §1 整段（英文），再附三四張現況截圖做鏡頭參考：`docs/shots/hell/rooms-bigger-teahouse.jpg`、`docs/shots/hell/street.jpg`、`docs/shots/hell/roof.jpg`、`docs/shots/hell/quay.jpg`。
2. 先做 §2 的試做（三件模型、一張貼圖），照 §2 的標準判。合格先做其餘；唔合格就照 §2 尾轉路線。
3. 之後一間房一個對話（同一個對話入面風格先統一），每次開頭再貼 §1，再貼那間房那一節的表和 prompt。
4. 每件交付：`<id>_ref.png`（設定圖）、`<id>.py`（Blender 腳本）、`<id>.glb`；貼圖係 `<id>.png`。先存喺你部機（例如 `bullet-ballet-art/props/<房>/<id>/`），Godot 工程開咗（G①）先入倉。**唔好放入呢個 JS 倉的 `assets/`**：嗰度係第一代，JS 版唔再換模型（DECISIONS 2026-10-27）。
5. 優先：**P1** 每間房都見到、或者數量多；**P2** 一間房的身份、武器、敵人配件；**P3** 可選，或者要等設計定。

**做法**（每件標咗一個）：

| 標記 | 做法 | 適合 |
|---|---|---|
| **A** | ChatGPT 出設定圖 → 寫 Blender Python 腳本，你喺 Blender（免費）行一次就出 `.glb` | 由方塊、圓柱、板組成的硬物：枱、櫈、桶、門、閘、櫃、冷氣機、輪胎、槍 |
| **B** | ChatGPT 出設定圖 → 你丟去 Meshy／Tripo 的 image-to-3D | 有機或細節多：獅頭、白鴿、賽車、樹叢 |
| **T** | ChatGPT 直接出無縫貼圖 | 地板、牆、閘片、招牌面、遠處的窗 |
| **G** | Godot 內用 CSG／積木砌，只要貼圖（配 T） | 牆、石級、花槽、碼頭邊、賽道路面、海 |

ChatGPT 本身唔係 3D 生成器：佢強在出圖（設定圖、貼圖）同寫腳本。A 類靠腳本，做得出尺寸準、三角形少、乾淨的硬物，正好配賽璐璐；有機的東西用腳本會好硬，所以標 B。試做三件就知 A 行唔行得通。

## 1. 總說明（整段貼給 ChatGPT）

```text
You are helping me make the 3D props and textures for "Bullet Ballet", a top-down bullet-time action game (engine: Godot 4) set in a fictional night city with a Hong Kong / Macau flavour: tea houses, street food stalls, old shophouses, a harbour, rooftops, a racing circuit, a nightclub, an old factory floor. Every name, sign and brand in it is fictional.

ART DIRECTION
- Anime urban street style: bold flat colours, clean chunky shapes, slightly exaggerated proportions, a little hand-made wear. The game adds the cel shading (two tones and a rim light) and the outlines itself, so a model carries flat base colour only.
- Camera: fixed, looking down at about 60 degrees from 22 m away. A 1.78 m person is about 70 pixels tall on a 1080p screen. Top surfaces and silhouettes are what the player sees; detail smaller than 5 cm is invisible; the underside does not matter unless the item can be knocked over (noted per item).
- Reserved colours (they are gameplay): yellow-white = enemy fast bullets, pink/magenta = slow bullets, cyan-white = the player's bullets, pure red = aim lines. Never use saturated yellow, pink/magenta, cyan or pure red on large areas. A red that has to stay (a lantern, a kerb) goes darker and towards orange.
- Floors and anything low are dark and low in contrast, so bullets stand out. The player character is the only white figure on screen, so no large pure-white surfaces.
- Each room has its own palette of two or three colours (given with the room).
- No real brands, shop names, logos, people or places. Lettering, where asked for, is one or two fictional Chinese characters; otherwise none.

TECHNICAL RULES (every model)
1. Real size in metres, exactly as given: X = width, Z = depth, Y = height. Y up, the front faces +Z (glTF convention).
2. Pivot (origin): bottom centre on the ground, unless the item says otherwise (weapons: at the main grip, barrel along +Z; doors: at the hinge).
3. Within the triangle budget given. Low-poly and clean, no hidden interior faces.
4. One material. Colour as flat base colour only: vertex colours (a colour attribute used as Base Color by the one material, so the glTF exporter writes it), or one texture of 1024 px (2048 px only where stated). No baked lighting, shadows, ambient occlusion, highlights or outlines in the colours. An item with a light (a lamp, a sign) may have a second, emissive material named "glow".
5. Parts that move are separate objects with the names given, each with its pivot where it turns or slides. Points the game needs (a muzzle, a valve) are empties with the names given.
6. Real-world proportions inside the given box; shapes a little thicker than real so they read from far away.

HOW TO DELIVER (for each item I send you)
Step 1 - Reference sheet: one image with front, side and top views of the item, flat colours on a mid-grey background, its size in metres written beside it. Wait for my OK.
Step 2 - Items marked A: a Blender 4.x Python script that builds the model from scratch at the exact size (primitives and simple edits, no add-ons), sets the colours, names the objects as given, sets the pivot, applies transforms and exports "<id>.glb" (glTF binary, +Y up). At the end it prints the bounding box and the triangle count. If you can run it yourself and attach the .glb, do.
  Items marked B: stop after the reference sheet; I will turn it into a model with an image-to-3D tool. Make the sheet clean enough for that: one object, centred, nothing else in the picture, no text on the object.
  Textures (T): one seamless tileable square image, seen straight down (floors) or straight on (walls), flat even light, no perspective, no shadows; tell me how many metres one tile covers.
Step 3 - Tell me the bounding box (X x Z x Y m), the triangle count, and anything you changed and why.
```

## 2. 試做：三件模型、一張貼圖

| 次序 | id | 點解揀佢 |
|---|---|---|
| 1 | `table_cloth` 茶樓圓枱 | 數量最多（七間房），有「翻起」：試尺寸、原點、底面 |
| 2 | `trolley_dimsum` 點心車 | 部件多（車身、四個輪、蒸籠）：試中等複雜度 |
| 3 | `lpg_cylinder` 石油氣罐 | 曲面、有掛點（噴射由閥口出）：試圓的東西和空物件 |
| 4 | `floor_terrazzo` 茶樓水磨石地（貼圖） | 試無縫、暗、低對比 |

**合格標準**（開發者判，五項都過先算）：

1. `.glb` 開得到（Blender，或者網上的 glTF viewer），外框尺寸同表上差唔過 2 厘米，原點喺底部中間，正面向 +Z。
2. 三角形喺預算之內；一個材質；平色，冇燒入光影。
3. 用遊戲的距離睇（Blender 鏡頭：俯角 60°、離 22 米、視角 40°），一眼認得係乜。
4. 三件放埋一齊，風格一致（同一套色、同一種粗幼和圓角）。
5. 貼圖四塊並排睇唔到接縫，亮度低過人物。

**唔合格點算：** 只係 3D 唔得 → A 類全部改 B（ChatGPT 照出設定圖，模型交 Meshy／Tripo 的 image-to-3D，§10 有估算）；連設定圖都唔啱心水 → 道具同人物一齊用 Meshy／Tripo 由文字生成。貼圖 ChatGPT 通常做得到，唔使轉。

## 3. 共用件（多間房都有）

| id | 名稱 | 尺寸 X × Z × Y（米） | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `table_cloth` | 茶樓圓枱（枱布） | Ø1.7 × 0.8 | 1,500 | A | P1 | 七間房約 30 張 | 0.8 米高，子彈飛過；被踢會**打側翻起變成 1.6 米高的牆**，所以底面（枱腳、框）要見得人；射十槍會爛。遊戲按房縮放闊度（Ø1.5–2.2），所以用**中間一枝腳加底座**，縮放唔會扯歪 |
| `table_banquet` | 宴會大圓枱（連轉盤） | Ø2.8 × 0.8 | 2,000 | A | P2 | 廂房、後廳各 1 | 同上；轉盤 Ø1.2 |
| `stool_wood` | 茶樓木圓櫈 | Ø0.4 × 0.45 | 150 | A | P1 | 每張枱六張，約 180 | 純裝飾（子彈飛過），遊戲一次畫晒 |
| `table_folding` | 摺枱（圓） | Ø1.3 × 0.8 | 800 | A | P1 | 七間房約 20 張 | 灰綠膠面、四隻鐵腳；同樣翻得起、打得爛，底面要見得人 |
| `stool_plastic` | 膠櫈 | Ø0.38 × 0.42 | 150 | A | P1 | 約 20 | 兩個色版：暗紅、藍 |
| `barrel_oil` | 油桶 | Ø0.9 × 1.2 | 600 | A | P1 | 六間房約 10 個 | 射三槍爆；石階房的會**打側滾落樓梯**，側面要好睇；警告帶用黑白或黑橙，唔好用黃 |
| `lpg_cylinder` | 石油氣罐 | Ø0.6 × 1.1 | 600 | A | P1 | 四間房約 8 個 | 橙色（唔好黃、唔好純紅）；頂有閥口和護圈；空物件 `nozzle` 喺閥口：踢中佢，火由這裏噴，罐飛出去 |
| `entry_gate` | 入口閘 | 1.8 × 0.2 × 1.4 | 800 | A | P1 | 每間房 1 | 喺 0.9 米矮牆的缺口，玩家入咗就關：兩條柱、一塊閘板、柱頂兩盞「關咗」燈（`glow`，暫用橙） |
| `exit_door` | 出口雙門（連門框、門牌） | 2.3 × 0.3 × 3.0（門口 1.8 × 2.5） | 1,500 | A | P1 | 每間打鬥房 2（F③ 兩道門），頭目房 1 | 部件 `frame`、`leaf_l`、`leaf_r`（原點喺鉸）、`sign`（`glow`：鎖住時暗紅、開咗綠，由遊戲換色）；打完一間房先開 |
| `spawn_door` | 敵人入口門（連門頂警告燈） | 1.5 × 0.2 × 2.4（門 1.3 × 2.1） | 600 | A | P1 | 每間房 3–4 | 部件 `leaf`（原點喺鉸）、`lamp`（`glow`：有敵人快出嚟時亮）；每間房換色（vertex colour 版本） |

```text
table_cloth — A round tea-house dining table, 1.7 m across and 0.8 m high: a cloth over the top hanging about 20 cm down, one central pedestal leg on a round foot. Seen from above it is the cloth's top; when kicked over onto its side the underside (the frame under the top, the pedestal) faces the player, so model it neatly.
table_banquet — The same tea-house table as a 2.8 m banquet table, with a 1.2 m lazy Susan turntable on top.
stool_wood — A round wooden stool, 0.4 m across and 0.45 m high, three or four legs, dark lacquered wood.
table_folding — A round folding table of a street food stall, 1.3 m across and 0.8 m high: a grey-green laminate top with a metal edge, four steel tube legs with a cross brace. Its underside shows when it is kicked over.
stool_plastic — A stackable plastic stool, 0.38 m across the seat and 0.42 m high, with a hole in the middle of the seat; one version dark red, one blue.
barrel_oil — A steel oil drum, 0.9 m across and 1.2 m high, dark red, two rolling ribs, a black-and-white hazard band, a lid with two bungs. It may roll on its side, so the side reads well.
lpg_cylinder — A liquefied gas cylinder, 0.6 m across and 1.1 m high with rounded ends, orange, with a valve and a ring-shaped guard collar on top. An empty named "nozzle" at the valve outlet.
entry_gate — A low gate closing a 1.6 m gap in a 0.9 m wall: two square posts 1.3 m high with a small lamp box on top of each (glow material), a dark wooden leaf 0.9 m high between them with a gold rail along its top.
exit_door — A double door 1.8 m wide and 2.5 m high in a 0.3 m thick wall, with its frame and a lit sign box above it (glow material). Objects: "frame", "leaf_l" and "leaf_r" (each pivoting at its hinge), "sign".
spawn_door — A single door 1.3 m wide and 2.1 m high in a wall, with its frame and a warning light bar above it (glow material). Objects: "frame", "leaf" (pivot at the hinge), "lamp".
```

## 4. 房間的殼與貼圖

房間在 Godot 用 CSG／積木砌（G），所以殼只要貼圖。規格：房內 26.4 × 18 米（迷宮 28.8 × 19.2）；遠端兩面牆（北、東）高 3.2 米；近鏡頭兩面（南、西）係 0.9 米矮牆，鏡頭由上面望入嚟，所以矮牆頂見得到；牆厚 0.3 米。所有貼圖 1024 × 1024、無縫，**地面要暗、低對比**。

| id | 名稱 | 用在 | 一格覆蓋 | 優先 | 要點 |
|---|---|---|---|---|---|
| `floor_terrazzo` | 深色水磨石地 | 茶樓三間、頭目四間 | 2 × 2 米 | P1 | 深啡灰底、細碎石點 |
| `floor_asphalt` | 柏油地 | 大排檔、廣場、跑道彎場邊 | 4 × 4 | P1 | 近黑，少少裂紋、油漬 |
| `floor_concrete` | 石屎地 | 石階、直街、碼頭、迷宮 | 4 × 4 | P1 | 灰，有修補塊、伸縮縫 |
| `floor_concrete_wet` | 濕石屎地 | 天台（落雨） | 4 × 4 | P2 | 有積水位，仍然暗 |
| `floor_road` | 賽道路面 | 跑道彎 | 4 × 4 | P2 | 比場邊柏油深、順；白邊線由遊戲畫 |
| `decal_kerb` | 路肩（紅白相間） | 跑道彎 | 0.55 闊 × 2 長 | P2 | 紅要暗、偏橙 |
| `floor_grass` | 內場草地 | 跑道彎 | 4 × 4 | P2 | 暗綠短草 |
| `floor_club` | 夜店地 | 夜店 | 2 × 2 | P2 | 近黑磨面；舞池燈磚另做（§5.9） |
| `stone_step` | 石級面 | 石階 | 1 × 1 | P2 | 舊麻石，級邊一條淺色 |
| `floor_stone` | 廣場石板 | 廣場（可換柏油） | 3 × 3 | P3 | 可以有港澳式波浪紋，但對比壓到好低 |
| `wall_tea` | 茶樓牆身 | 茶樓三間、頭目四間 | 2 闊 × 3.2 高 | P1 | 上半深朱紅漆木板（偏橙偏暗）、下半墨綠 |
| `trim_gold` | 金色腰線、門框線 | 茶樓 | 1 × 0.1 | P1 | 1.1 米高一條 |
| `wall_concrete` | 石屎牆 | 大排檔、廣場、跑道彎、天台、迷宮 | 3 × 3.2 | P1 | 水漬、撕剩的舊海報痕（冇字） |
| `wall_brick` | 舊磚牆 | 石階、直街 | 2 × 3.2 | P2 | 啡紅磚、灰縫 |
| `wall_shopfront` | 舊舖外牆 | 直街 | 2 × 2.8 | P2 | 上半批盪、下半紙皮石 |
| `wall_warehouse` | 貨倉坑紋鐵皮 | 碼頭 | 3 × 3.2 | P2 | 鐵灰，虛構的倉號（數字） |
| `wall_club` | 夜店牆 | 夜店 | 2 × 3.2 | P2 | 深紫黑吸音板；霓虹燈條由遊戲加 |
| `parapet` | 天台矮牆 | 天台 | 2 × 1.0 | P2 | 批盪、裂紋 |
| `quay_stone` | 碼頭石邊 | 碼頭 | 2 × 1.9 | P2 | 0.45 米路肩加落海的石面（共 1.9 米高） |
| `planter_stone` | 花槽石 | 石階 | 2 × 1 | P2 | |
| `shutter_slats` | 鐵閘閘片 | 直街 | 1 × 1 | P2 | 橫坑，可上下重複 |
| `window_facade` | 遠處大廈外牆（夜） | 天台背景 | 6 × 9 | P2 | 黑外牆、少數窗亮暖光（遊戲用作發光貼圖） |

```text
floor_terrazzo — Seamless texture, 2 x 2 m: dark terrazzo floor of an old tea house, deep brown-grey with small chips of darker and lighter stone, very low contrast.
floor_asphalt — Seamless texture, 4 x 4 m: night-time asphalt of a back lane, almost black, a few fine cracks and faint oil stains, very low contrast.
floor_concrete — Seamless texture, 4 x 4 m: worn grey concrete floor with patched areas and expansion joints, dark and low in contrast.
floor_concrete_wet — Seamless texture, 4 x 4 m: the same concrete on a rooftop in the rain, darker, with shallow puddle patches.
floor_road — Seamless texture, 4 x 4 m: smooth race-track asphalt, darker and finer than street asphalt, no lines.
decal_kerb — Texture 0.55 x 2 m: a race-track kerb, alternating dark orange-red and off-white blocks, worn.
floor_grass — Seamless texture, 4 x 4 m: short dark-green grass of a circuit infield at night.
floor_club — Seamless texture, 2 x 2 m: polished near-black nightclub floor with faint scuffs.
stone_step — Seamless texture, 1 x 1 m: old granite step surface, grey, with a lighter worn line along the front edge.
floor_stone — Seamless texture, 3 x 3 m: grey stone paving with a faint black-and-white wave mosaic, contrast kept very low.
wall_tea — Seamless wall texture, 2 m wide x 3.2 m high: tea-house wall, the upper part dark vermilion lacquered wood panels (towards orange, not pure red), the lower part deep green, a little gold in the panel edges.
trim_gold — Texture 1 x 0.1 m: a gold-painted wooden trim strip, slightly worn.
wall_concrete — Seamless wall texture, 3 x 3.2 m: grey concrete wall with water stains and the torn traces of old posters (no readable text).
wall_brick — Seamless wall texture, 2 x 3.2 m: old brown-red brick with grey mortar.
wall_shopfront — Seamless wall texture, 2 x 2.8 m: old shophouse front, rendered plaster above, small square mosaic tiles below.
wall_warehouse — Seamless wall texture, 3 x 3.2 m: corrugated steel warehouse wall, iron grey, a stencilled fictional bay number.
wall_club — Seamless wall texture, 2 x 3.2 m: nightclub wall of dark purple-black acoustic panels.
parapet — Seamless texture, 2 x 1 m: rendered rooftop parapet wall with cracks and rain streaks.
quay_stone — Texture 2 x 1.9 m: a harbour quay edge, a 0.45 m concrete curb on top and the dark stone face below it down to the water line.
planter_stone — Seamless texture, 2 x 1 m: the stone sides of a raised planter, grey granite blocks.
shutter_slats — Seamless texture, 1 x 1 m: a roller shutter's horizontal steel slats, grey with dents and rust at the edges.
window_facade — Texture 6 x 9 m: a tower block facade at night, black wall, a grid of windows with only a few lit in warm colours.
```

## 5. 打鬥房（十二間：茶樓三間同一套）

每間房下面一句身份（同時係玩法），一行色盤，一個表，一段 prompt。「亦用」係 §3 的共用件。

### 5.1 茶樓、茶樓廂房、茶樓偏廳

圓枱擋子彈，翻起做牆，點心車踢出去撞人。**色盤：** 深朱紅（偏橙偏暗）、墨綠、金線。**地／牆：** `floor_terrazzo`、`wall_tea`、`trim_gold`。**亦用：** `table_cloth` 每間五至六張（廂房中間一張 `table_banquet`）、`stool_wood`。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `trolley_dimsum` | 點心車 | 1.1 × 0.7 × 1.05 | 2,000 | A | P1 | 每間 2 | 車身（不鏽鋼，車面 0.28 米高）、推手喺後面（−Z）1.03 米高、四個輪 `wheel_1`…`wheel_4`、車面兩疊各三個竹蒸籠 `steamers`（每個 Ø0.4 × 0.12）；踢中會滾出去撞倒人 |
| `lantern_wall` | 掛牆紅燈籠 | Ø0.64 × 0.8 | 300 | A | P2 | 每間約 8 | 掛喺高牆上 2.6 米（只掛牆，唔掛喺地面上空：鏡頭同子彈之間唔可以有嘢）；`glow`；紅偏橙 |
| `screen_panel` | 屏風 | 2.0 × 0.08 × 2.2 | 400 | A | P3 | 可選 | 只貼牆放，唔擋路 |
| `wall_scroll` | 字畫 | 0.8 × 0.03 × 1.6 | 50 | A + T | P3 | 可選 | 虛構的字，一兩個 |

```text
trolley_dimsum — A tea-house dim-sum trolley, 1.1 x 0.7 m and 1.05 m high: a stainless steel cart body with its flat deck at 0.28 m, a push handle at the back (-Z) at 1.03 m, four small caster wheels as separate objects "wheel_1".."wheel_4", and on its deck two stacks of three round bamboo steamers (each 0.4 m across, 0.12 m high) as one object "steamers".
lantern_wall — A round red paper lantern, 0.64 m across and 0.8 m high, with a gold cap and a short tassel, for hanging on a wall; the paper in a glow material, a red towards orange.
screen_panel — A folding wooden screen in four panels, 2.0 m wide, 2.2 m high, dark wood frames with a pale green pattern.
wall_scroll — A hanging calligraphy scroll, 0.8 x 1.6 m, one or two fictional Chinese characters in black ink on a cream paper with a dark wood rod.
```

### 5.2 大排檔

街邊熟食檔：摺枱擋子彈，石油氣罐踢出去會噴射。**色盤：** 鐵灰、灰綠、暖白燈（膠櫈紅藍做點綴）。**地／牆：** `floor_asphalt`、`wall_concrete`。**亦用：** `table_folding` 5、`stool_plastic` 20、`lpg_cylinder` 3。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `counter_2m` | 不鏽鋼爐枱（一節） | 2.0 × 1.2 × 1.0 | 1,000 | A | P2 | 4（砌成 8 米靠北牆） | 實心掩體；另一個版本 `counter_stove`：有爐頭、爐上一個鑊 |
| `stall_roof` | 鐵皮簷篷 | 8.6 × 1.7 × 2.6 | 600 | A | P2 | 1 | 坑紋鐵皮向房內斜 0.1 弧度，兩條鐵柱；**只蓋爐枱，唔蓋地面** |
| `bulb_string` | 燈泡串 | 8.0 × 0.2 × 0.3 | 300 | A | P2 | 1 | 每 1.1 米一個燈泡 Ø0.18（`glow`），掛喺簷篷邊 |
| `wok` | 鑊 | Ø0.64 × 0.2 | 300 | A | P2 | 2 | 放喺爐枱上 |
| `drinks_fridge` | 汽水雪櫃 | 0.7 × 0.7 × 1.8 | 400 | A | P3 | 可選 | 只貼牆 |
| `crate_bottles` | 膠樽箱（一疊） | 0.5 × 0.35 × 0.9 | 300 | A | P3 | 可選 | 只貼牆 |

```text
counter_2m — One 2 m section of a street food stall's cooking counter, 2.0 x 1.2 m and 1.0 m high, brushed stainless steel with a splash-back at the rear. A second version "counter_stove" with a round gas burner and a wok on it.
stall_roof — A corrugated iron awning 8.6 x 1.7 m, its front edge at 2.6 m, sloping down 6 degrees towards the front, on two thin steel posts at the front corners.
bulb_string — A string of bare light bulbs 8 m long, a bulb 0.18 m across every 1.1 m on a sagging black cable (bulbs in a glow material).
wok — A black carbon-steel wok, 0.64 m across and 0.2 m deep, with two small handles.
drinks_fridge — A drinks fridge with a glass door, 0.7 x 0.7 x 1.8 m, white-grey body (not pure white), no brand.
crate_bottles — A stack of three plastic bottle crates, 0.5 x 0.35 m, 0.9 m high, faded green.
```

### 5.3 廣場

噴水池的廣場：白鴿驚起擋住瞄準，把人踢落水。**色盤：** 石灰、夜藍、暖白燈。**地／牆：** `floor_asphalt`（或 `floor_stone`）、`wall_concrete`。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `fountain` | 噴水池 | Ø4.7 × 1.85 | 3,000 | A | P2 | 1 | 池邊 0.45 米高（掩體；人被踢過池邊就落水）；水面 `water`（Ø3.7、0.31 米高的平面，遊戲換水的 shader）；中間柱、0.95 米高一個 Ø1.85 的盆、1.55 米高一個燈球 `lamp`（`glow`） |
| `bench` | 長櫈 | 1.8 × 0.45 × 0.45 | 400 | A | P2 | 4 | 靠牆 |
| `street_lamp` | 街燈 | 0.4 × 0.4 × 4.5 | 500 | A | P2 | 4 | 四角；燈頭 `glow` |
| `pigeon` | 白鴿 | 0.12 × 0.3 × 0.22 | 200 | B | P2 | 18（兩群） | 灰鴿（唔好全白）；企定一個姿勢，飛一個姿勢（或者翼分開 `wing_l`、`wing_r`，遊戲拍翼） |

```text
fountain — A round plaza fountain: a stone rim 4.7 m across outside and 0.45 m high (object "rim"), inside it a flat water disc 3.7 m across at 0.31 m (object "water"), a stone column in the middle carrying a basin 1.85 m across at 0.95 m (object "basin"), and a lamp globe on top at 1.55 m (object "lamp", glow material). Grey stone.
bench — A park bench 1.8 m long, 0.45 m deep, seat at 0.45 m, dark wood slats on cast-iron legs, no back.
street_lamp — An old cast-iron street lamp 4.5 m tall with one lantern head (glow material), dark green-black.
pigeon — A city pigeon, 0.3 m long, grey with an iridescent neck, stylised and chunky. Two poses: standing, and flying with wings spread.
```

### 5.4 跑道彎

賽車定時掠過，紅燈一亮就要離開賽道；把人踢上賽道等車到。**色盤：** 瀝青黑、輪胎藍白、路肩暗紅白。**地：** `floor_road`、`floor_asphalt`、`floor_grass`、`decal_kerb`；**牆：** `wall_concrete`。**亦用：** `table_folding` 2、`barrel_oil` 1、`lpg_cylinder` 1。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `tyre` | 輪胎（一條） | Ø0.84 × 0.29 | 200 | A | P2 | 約 75（三條一疊，約 25 疊） | 藍、白兩個色版，遊戲一次畫晒 |
| `race_car` | 賽車 | 1.9 × 4.6 × 1.0 | 3,000 | B | P2 | 3（一次掠過三架） | 虛構車隊、冇贊助商，可以有號碼；四個輪分開；三個車身色避開黃、紅、青、粉紅（建議：黑白、橙、深藍。現時遊戲用紅藍黃，Godot 版跟新色） |
| `track_mouth` | 賽道出入口 | 5.0 × 0.3 × 3.0 | 500 | A | P2 | 2 | 牆上 4.8 × 2.6 的黑隧道口，口上一條光管（`glow`） |
| `race_lights` | 預警燈箱 | 1.6 × 0.3 × 0.5 | 300 | A | P2 | 2 | 五個圓燈（`glow`，熄／紅由遊戲換），掛喺出入口上面 |
| `marshal_post` | 打旗位 | 1.5 × 1.0 × 2.2 | 600 | A | P3 | 可選 | 只放牆邊 |

```text
tyre — A single car tyre lying flat, 0.84 m across and 0.29 m high, for stacking into a tyre wall; one version painted blue, one white.
race_car — A fictional modern single-seater racing car seen mostly from above, 4.6 m long, 1.9 m wide, 1.0 m high, front along +Z, no sponsors or real brands, a large race number on the nose and the engine cover; the four wheels separate objects. Three liveries: black-and-white, orange, dark blue.
track_mouth — The opening where a race track passes through a concrete wall: a frame 5.0 m wide and 3.0 m high around a dark tunnel mouth 4.8 x 2.6 m, a bright light strip along the top (glow material).
race_lights — A race warning light box, 1.6 x 0.3 x 0.5 m, black, with five round lamps in a row (glow material).
marshal_post — A small race marshal's post: a waist-high concrete box with a steel roof on two posts, 1.5 x 1.0 m, 2.2 m high.
```

### 5.5 石階

守住石階頂，衝上來的人排成一行，就射倒油桶滾落去。上層（南）比下層高 0.56 米，中間四級石級。**色盤：** 舊麻石灰、啡磚、暗綠植物。**地／牆：** `floor_concrete`、`stone_step`、`planter_stone`、`wall_brick`。**亦用：** `barrel_oil` 3（放喺最高一級：射倒或踢倒會滾落去）、`table_folding` 2。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| 石級、長花槽 | | 石級 10.8 闊、四級每級深 0.9 高 0.14；花槽 7.8 × 3.6、頂離上層 0.45 | — | G | P2 | | Godot 砌，用 `stone_step`、`planter_stone` |
| `hedge_block` | 樹籬（一塊） | 2.0 × 2.0 × 0.4 | 300 | B | P2 | 約 16 | 鋪喺長花槽頂 |
| `planter_tree` | 石花槽連矮樹 | 1.8 × 1.0 × 1.5 | 1,200 | B | P2 | 2 | 上層玩家的掩體：槽身 0.7 米、樹叢頂到 1.5 米 |
| `lamp_old` | 老街燈 | 0.44 × 0.44 × 2.8 | 300 | A | P2 | 4 | 喺石級兩邊花槽頭；燈球 Ø0.44 `glow` |

```text
hedge_block — A block of clipped hedge 2.0 x 2.0 m and 0.4 m high, dark green, slightly irregular top, to sit on a planter.
planter_tree — A granite planter box 1.8 x 1.0 m and 0.7 m high with a dense shrub growing out of it to 1.5 m in total height.
lamp_old — An old street lamp 2.8 m tall: a thin dark post with a single round glass globe 0.44 m across on top (glow material).
```

### 5.6 直街

一排三間舊舖：踢開舖門撞飛門後的人，穿屋繞到後面，射落鐵閘封住中間那間。舖面牆 0.3 厚、2.8 高，三間舖各 8.7 闊 × 5.4 深（G）。**色盤：** 舊磚啡、鐵閘灰、招牌三色（建議橙、綠、紫：現時的紅、青、琥珀撞功能色）。**地／牆：** `floor_concrete`、`wall_brick`、`wall_shopfront`、`shutter_slats`。**亦用：** `table_folding` 3。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `shop_door` | 舖門（木） | 2.0 × 0.08 × 2.3 | 500 | A | P2 | 4（街上 2、舖與舖之間 2） | `leaf` 原點喺鉸；被踢會甩開、撞飛門後的人，**兩面都要見得人** |
| `roller_shutter` | 鐵閘 | 3.4 × 0.4 × 2.8 | 1,000 | A | P2 | 1 | 部件：`box`（頂的捲閘箱 3.4 × 0.35 × 0.35）、`curtain`（閘片 3.2 × 2.6，原點喺頂，遊戲沿 Y 縮放令佢落）、`lock_post`（開口旁 0.15 × 0.15 × 1.0 的鎖柱：射中或踢中就落閘） |
| `shop_sign` | 舖頭招牌 | 3.4 × 0.08 × 0.42 | 200 | A + T | P2 | 3 | 發光燈箱（`glow`）；字一兩個、虛構，或者只係圖案 |
| `shop_shelf` | 貨架 | 2.0 × 0.4 × 2.0 | 400 | A | P3 | 可選 | 舖內（cut-away 見到），只貼牆 |
| `shop_counter` | 舖面櫃枱 | 1.6 × 0.6 × 1.0 | 400 | A | P3 | 可選 | 同上 |

```text
shop_door — A wooden shop door leaf 2.0 m wide, 2.3 m high and 8 cm thick, old green-painted wood with a small glass panel; both faces finished. Object "leaf" with its pivot at the hinge edge.
roller_shutter — A shop's steel roller shutter for an opening 3.2 m wide and 2.6 m high: a roller box 3.4 x 0.35 x 0.35 m at the top (object "box"), the slatted curtain 3.2 x 2.6 m hanging from it (object "curtain", pivot at its top edge, so it can be scaled down along Y), and a lock post 0.15 x 0.15 x 1.0 m beside the opening (object "lock_post"). Grey steel, a little rust.
shop_sign — A lit shop sign box 3.4 m wide and 0.42 m high, 8 cm deep, the face in a glow material; one or two fictional Chinese characters, or a simple pattern. Three colour versions: orange, green, purple.
shop_shelf — A tall metal shop shelf 2.0 m wide, 0.4 m deep, 2.0 m high, with boxes and tins on it (no labels).
shop_counter — A small shop's wooden counter 1.6 x 0.6 m, 1.0 m high, with a glass top.
```

### 5.7 碼頭

碼頭邊：開火位背住個海，一腳踢落海；手推車撞倒成排人。北邊係 0.45 米高的路肩，外面係海（G：`quay_stone`，海用 Godot 的水 shader）。**色盤：** 鐵灰、鈉燈橙、海的藍黑。**地／牆：** `floor_concrete`、`wall_warehouse`、`quay_stone`。**亦用：** `table_folding` 2、`barrel_oil` 1。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `crate_wood` | 木箱 | 1.2 × 1.2 × 1.2 | 500 | A | P2 | 3 | 射六槍會爛：另做 `crate_wood_broken`（五至八塊木板碎，共 500）。舊的木箱模型 7,760 個三角形，太多 |
| `steel_bin` | 鐵櫃 | 1.4 × 1.0 × 1.2 | 400 | A | P2 | 1 | |
| `hand_trolley` | 手推車 | 0.7 × 1.1 × 1.05 | 800 | A | P2 | 2 | 車面 0.28 米高、推手喺後面；四個輪分開；踢向海邊就滾出去撞倒成排人 |
| `bollard` | 繫纜樁 | Ø0.4 × 0.5 | 200 | A | P2 | 6 | 沿路肩每 4 米一個 |
| `warehouse_door` | 貨倉門 | 2.6 × 0.2 × 2.8 | 500 | A | P2 | 3 | 碼頭版的 `spawn_door`：趟門，部件 `leaf`、`lamp` |
| `container_far` | 遠處貨櫃 | 2.4 × 6.1 × 2.6 | 100 | A | P3 | 可選 | 海對面的背景，好遠，好簡單 |

```text
crate_wood — A wooden shipping crate, 1.2 m cube, planks with a darker frame and stencilled fictional numbers. A second model "crate_wood_broken": the same crate burst into five to eight separate planks and splinters, lying on the ground.
steel_bin — A steel storage bin 1.4 x 1.0 m, 1.2 m high, dark grey-blue, a lid with two handles.
hand_trolley — A flat-bed hand trolley: a steel deck 1.1 x 0.7 m at 0.28 m on four wheels (separate objects "wheel_1".."wheel_4"), a push handle at the back up to 1.05 m. Front along +Z.
bollard — A harbour mooring bollard, 0.4 m across and 0.5 m high, black cast iron with a mushroom top.
warehouse_door — A warehouse sliding door 2.6 m wide and 2.8 m high in its frame, corrugated steel, a warning light above (glow). Objects "frame", "leaf" (slides along X), "lamp".
container_far — A shipping container 6.1 x 2.4 x 2.6 m as a very simple distant shape, rust orange (100 triangles).
```

### 5.8 天台

唐樓天台、落雨：晾衫竹上的被單擋住視線，子彈照穿；踢石油氣罐射向開火位。南、西係 1.0 米矮牆（頂有霓虹燈條）；北牆係樓梯屋。**色盤：** 夜紫、濕灰、霓虹紫和橙（現時用粉紅和青，撞功能色）。**地／牆：** `floor_concrete_wet`、`wall_concrete`、`parapet`；背景大廈 `window_facade`（G）。**亦用：** `table_folding` 1、`lpg_cylinder` 3、`barrel_oil` 1。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `laundry_stand` | 晾衫鐵架 | Ø0.5 × 2.15 | 150 | A | P2 | 6 | 一條鐵柱、圓底座；竹擱喺 2.05 米 |
| `bamboo_pole` | 晾衫竹 | 1.0 × 0.07 × 0.07 | 100 | A | P2 | 3 | 一米一段，遊戲沿長度縮放到 6–8.4 米 |
| `laundry_sheet` | 被單 | 1.24 × 0.03 ×（1.0／1.25／1.4） | 200 | A 或 B | P2 | 約 12 | 三個長度、四隻色（米白、淺藍、鮭魚紅、淺綠：唔好黃）；原點喺頂邊（掛喺竹上，遊戲令佢郁）；**敵人睇唔穿，子彈射得穿** |
| `ac_unit` | 冷氣室外機 | 1.6 × 1.0 × 1.1 | 800 | A | P2 | 2 | 風扇格**向上**（由上面望落去見到）；舊模型 7,880 個三角形，太多 |
| `pipe_housing` | 石屎管道墩 | 1.4 × 1.2 × 1.2 | 300 | A | P2 | 1 | 玩家那邊的掩體 |
| `aerial` | 天線 | 1.2 × 0.1 × 3.2 | 150 | A | P2 | 2 | 喺樓梯屋頂 |
| `water_tank` | 水缸 | 2.0 × 1.5 × 1.5 | 400 | A | P3 | 可選 | 樓梯屋頂的背景 |

```text
laundry_stand — An iron stand for a laundry pole: a thin steel post 2.15 m high on a round concrete base 0.5 m across, a small fork at 2.05 m to rest a bamboo pole in.
bamboo_pole — A bamboo laundry pole, one 1 m section, 7 cm thick, pale yellow-brown bamboo with nodes; laid along X.
laundry_sheet — A bed sheet hanging from a pole, 1.24 m wide, soft folds, its pivot at the middle of its top edge. Three lengths: 1.0, 1.25, 1.4 m. Four colours: off-white, light blue, salmon, light green.
ac_unit — A rooftop air-conditioner condenser 1.6 x 1.0 m, 1.1 m high, grey metal, with a big round fan grille on its TOP face, pipes coming out of one side.
pipe_housing — A concrete housing over rooftop pipes, 1.4 x 1.2 m, 1.2 m high, rendered concrete, a few pipes entering it.
aerial — A rooftop TV aerial 3.2 m tall: a thin mast with two or three cross bars 1.2 m wide.
water_tank — A rooftop water tank, 2.0 x 1.5 x 1.5 m, on a low steel frame, faded blue.
```

### 5.9 夜店

燈跟住節拍，每兩小節最後一拍燈滅，嗰一拍冇人瞄得準你。**色盤：** 紫、橙。`docs/REDESIGN.md` §2 的例子寫「夜店 紫＋青」，但青同玩家子彈撞色，**建議改紫＋橙或紫＋綠，開發者定**。**地／牆：** `floor_club`、`wall_club`。**亦用：** `barrel_oil` 1。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `dj_booth` | DJ 台 | 3.6 × 1.2 × 1.3 | 2,000 | A | P2 | 1 | 實心掩體；頂面（由上面望到）有兩部唱盤、混音台；前面一條燈（`glow`） |
| `speaker` | 大喇叭 | 1.0 × 1.0 × 2.0 | 600 | A | P2 | 2 | DJ 台兩邊 |
| `mirror_ball` | 鏡球 | Ø0.9（連吊線 1.3 高） | 300 | A | P2 | 1 | 原點喺吊線頂，遊戲令佢轉；吊喺 3 米 |
| `dance_tile` | 舞池燈磚 | 1.0 × 1.0 × 0.02 | 20 | A | P2 | 84（12 × 7） | 一塊磚加幼框；顏色和光由遊戲按節拍換 |
| `cocktail_table` | 高腳枱 | Ø1.1 × 1.1 | 600 | A | P2 | 2 | 同其他枱一樣翻得起，底面要見得人；遊戲當佢係 0.8 米的矮掩體，畫高啲唔緊要（子彈喺 1.38 米飛） |
| `bar_counter` | 吧枱（一節） | 2.0 × 0.7 × 1.1 | 800 | A | P3 | 可選 | 只貼牆 |

```text
dj_booth — A nightclub DJ booth 3.6 x 1.2 m, 1.3 m high: a solid front panel with a strip of light (glow material), and on its top two turntables, a mixer and a laptop, readable from above.
speaker — A tall club speaker stack 1.0 x 1.0 m, 2.0 m high, black with two big woofers and a horn.
mirror_ball — A disco mirror ball 0.9 m across hanging from a 0.4 m wire; pivot at the top of the wire.
dance_tile — A light-up dance-floor tile 1.0 x 1.0 m, 2 cm thick: a frosted panel in a thin dark frame (the panel in a glow material, white; the game colours it).
cocktail_table — A tall round cocktail table 1.1 m across and 1.1 m high, a dark top on one pedestal; its underside shows when it is kicked over.
bar_counter — One 2 m section of a bar counter, 0.7 m deep, 1.1 m high, dark front with a lit edge.
```

### 5.10 迷宮（舊工廈）

一層分成一格格，間法每局不同；夾板牆射幾槍或者踢一腳就爛，石屎牆打唔爛。每格 4.8 米。**色盤：** 石屎灰、夾板淺啡、冷白光管。**地／牆：** `floor_concrete`、`wall_concrete`。**亦用：** `table_folding` 2、`barrel_oil` 2、`lpg_cylinder` 1。

| id | 名稱 | 尺寸 | 三角形 | 做法 | 優先 | 數量 | 要點 |
|---|---|---|---|---|---|---|---|
| `maze_wall` | 石屎間隔牆 | 4.8 × 0.3 × 2.6 | 200 | A 或 G | P2 | 每局約 6 | 打唔爛 |
| `maze_board` | 夾板牆 | 4.8 × 0.1 × 2.3 | 200 | A | P2 | 每局約 6 | 會爛：另做 `maze_board_broken`（六至十塊碎板，共 400） |
| `maze_post` | 石屎柱（頂有燈） | 0.5 × 0.5 × 2.6 | 150 | A | P2 | 約 35 | 格與格交角；柱頂一圈燈（`glow`） |
| `pallet_stack` | 卡板一疊 | 1.2 × 1.0 × 0.6 | 300 | A | P3 | 可選 | 只貼牆，唔做掩體 |

```text
maze_wall — A partition wall of an old factory floor, 4.8 m long, 0.3 m thick, 2.6 m high, grey concrete block with a painted lower band.
maze_board — A temporary plywood partition 4.8 m long, 0.1 m thick, 2.3 m high: plywood sheets on a timber frame, light brown. A second model "maze_board_broken": the same board smashed into six to ten separate pieces on the ground.
maze_post — A square concrete column 0.5 x 0.5 m and 2.6 m high, with a ring of light around its top (glow material).
pallet_stack — A stack of four wooden pallets 1.2 x 1.0 m, 0.6 m high.
```

## 6. 頭目房（四間）

**2026-10-30 改咗，下面待重寫：** 開發者定咗每個頭目一個片場（`docs/REDESIGN.md` §3）：刀姐 酒樓大廳、炮哥 貨櫃碼頭、門神 海底隧道口收費廣場、長鏡＋選角陳 攝影棚、金爺 戲棚。下面係原型茶樓四個房的清單，只有大廳（刀姐）照用；其餘按入場頁（`docs/storyboard/03-bosses.md`）重寫，見 TASKS「H⓪b」。

大廳（刀后）、後廳（重炮手）、庫房（鐵盾）、前廳（長槍手＋散彈手）現時全部用茶樓那套：`floor_terrazzo`、`wall_tea`、`table_cloth`（大廳四張 Ø1.6、後廳一張 `table_banquet` 加兩張 Ø1.6、庫房兩張 Ø2.2、前廳兩張 Ø1.8）。第二代每間房自己的身份要等頭目的幫派身份定（`docs/REDESIGN.md` §3 開發者填），所以下面全部 P3：

| id | 名稱 | 房 | 尺寸 | 三角形 | 做法 | 要點 |
|---|---|---|---|---|---|---|
| `perch_dais` | 角落高台 | 大廳 | 1.6 × 1.6 × 0.15 | 200 | A | 刀后喺四個角之間穿梭；**唔好高過 0.15 米**（玩家同敵人要喺同一水平） |
| `steam_cabinet` | 蒸櫃 | 後廳 | 1.2 × 0.7 × 1.8 | 600 | A | 只貼牆 |
| `vault_door` | 夾萬門 | 庫房 | 2.4 × 0.4 × 2.8 | 1,000 | A | 北牆裝飾，頭目由此入 |
| `cash_cage` | 鐵籠（錢箱） | 庫房 | 2.0 × 0.8 × 2.0 | 500 | A | 只貼牆 |
| `reception_desk` | 接待枱 | 前廳 | 3.0 × 0.8 × 1.1 | 800 | A | 只貼牆 |

## 7. 武器（玩家十二支：十一個模型）

照 `docs/REDESIGN.md` §4；雙手槍用兩把手槍。手感全靠程式，模型細，但地上撿槍時要一眼分得出係邊支。共同規格：原點喺主手握把、槍管沿 +Z；空物件 `muzzle`（槍口）、`grip_support`（副手位置，手槍不用）；一個材質，深色金屬加**每支一隻點綴色**（唔用功能色）；比真槍粗身約兩成。

| id | 名稱 | 尺寸 X × Z × Y | 三角形 | 優先 | 要點 |
|---|---|---|---|---|---|
| `gun_pistol` | 手槍（雙手槍用兩把） | 0.04 × 0.21 × 0.14 | 600 | P1 | 開局就有 |
| `gun_revolver` | 左輪 | 0.05 × 0.30 × 0.15 | 700 | P2 | 轉輪 `cylinder` 分開 |
| `gun_smg` | 衝鋒槍 | 0.06 × 0.45 × 0.22 | 800 | P2 | |
| `gun_shotgun` | 散彈槍（泵動） | 0.07 × 1.0 × 0.2 | 800 | P2 | 泵 `pump` 分開 |
| `gun_double` | 雙管散彈（短） | 0.07 × 0.7 × 0.15 | 700 | P2 | |
| `gun_rifle` | 步槍（三連發） | 0.07 × 0.85 × 0.25 | 1,000 | P2 | |
| `gun_autorifle` | 連發步槍 | 0.07 × 0.9 × 0.25 | 1,000 | P2 | 同步槍要一眼分得出（例如彈鼓） |
| `gun_minigun` | 機槍（起轉） | 0.2 × 1.1 × 0.3 | 1,000 | P2 | 槍管組 `barrels` 分開，沿 Z 轉；有提把 |
| `gun_launcher` | 榴彈發射器 | 0.12 × 0.75 × 0.25 | 1,000 | P2 | 轉輪式四發，`cylinder` 分開 |
| `gun_sniper` | 狙擊步槍 | 0.07 × 1.25 × 0.25 | 1,000 | P2 | 長、有瞄準鏡 |
| `gun_nailgun` | 鏍釘槍 | 0.08 × 0.35 × 0.3 | 600 | P2 | 工具樣（氣動釘槍、喉管頭），唔似真槍 |

```text
All weapons: fictional designs (no real manufacturer's model or markings), pivot at the main grip, barrel along +Z, empties "muzzle" at the muzzle and "grip_support" where the other hand holds it; dark gunmetal with one accent colour each (not yellow, pink, cyan or red); about 20% chunkier than a real gun so it reads from far away.
gun_pistol — A compact semi-automatic pistol, 0.21 m long.
gun_revolver — A heavy revolver, 0.30 m long, its cylinder a separate object "cylinder".
gun_smg — A compact submachine gun, 0.45 m long, folding stock, straight magazine.
gun_shotgun — A pump-action shotgun, 1.0 m long, the pump grip a separate object "pump".
gun_double — A sawn-off double-barrel shotgun, 0.7 m long, side-by-side barrels.
gun_rifle — A burst-fire assault rifle, 0.85 m long, curved magazine.
gun_autorifle — An automatic rifle 0.9 m long with a drum magazine, clearly different from the burst rifle.
gun_minigun — A hand-held rotary machine gun, 1.1 m long, a carry handle on top, the barrel cluster a separate object "barrels" that spins about Z.
gun_launcher — A revolver-type grenade launcher, 0.75 m long, a fat four-round cylinder as a separate object "cylinder".
gun_sniper — A long bolt-action sniper rifle, 1.25 m long, with a big scope.
gun_nailgun — A pneumatic construction nail gun used as a weapon, 0.35 m long, a stub of air hose at the back, a nail magazine under the nose; it should look like a tool, not a gun.
```

## 8. 人物配件（分開做，掛喺骨架上）

人物本身用 Meshy／Tripo 生成（[CHARACTERS.md](CHARACTERS.md)），但**會郁、會跌、或者玩法要用**的配件分開做，生成人物時叫佢**空手**。

| id | 名稱 | 誰用 | 尺寸 X × Z × Y | 三角形 | 做法 | 優先 | 要點 |
|---|---|---|---|---|---|---|---|
| `riot_shield` | 防暴盾 | 盾牌保安 | 0.6 × 0.08 × 1.0 | 400 | A | P2 | 有窺窗；正面擋子彈，被踢會放低 |
| `tower_shield` | 大鐵盾 | 頭目鐵盾 | 0.9 × 0.12 × 1.6 | 600 | A | P2 | 比防暴盾大、重、舊 |
| `bomb_vest` | 炸彈背心 | 炸彈客；「彈衣」詞綴 | 0.45 × 0.3 × 0.5 | 600 | A | P2 | 着喺身上；一排燈 `lights`（`glow`，遊戲閃） |
| `detonator` | 引爆器 | 炸彈客 | 0.04 × 0.04 × 0.14 | 100 | A | P2 | |
| `grenade` | 手榴彈 | 擲彈兵、榴彈發射器 | Ø0.07 × 0.1 | 100 | A | P2 | |
| `grenade_bag` | 榴彈背囊 | 擲彈兵 | 0.4 × 0.25 × 0.5 | 400 | A | P2 | 由上面望落去要大、要認得 |
| `helmet_iron` | 鐵頭盔 | 「鐵頭」詞綴 | 0.3 × 0.32 × 0.22 | 300 | A | P2 | 套落任何敵人頭上 |
| `knife` | 刀 | 飛仔 | 0.03 × 0.3 × 0.05 | 150 | A | P2 | |
| `elite_umbrella` | 大傘 | 精英傘手 | 開 Ø1.6 × 0.5；收 1.0 長 | 600 | A | P2 | 開、收兩個版本；傘面由上面望落去就係佢的剪影 |
| `lion_head` | 獅頭 | 精英舞獅手 | 0.8 × 0.9 × 0.7 | 2,000 | B | P2 | 綠獅（傳統色之一，避開紅黃）；下顎 `jaw` 分開 |
| `twin_blades` | 雙刀 | 頭目刀后 | 0.05 × 0.6 × 0.08（一把） | 300 | A | P2 | |
| `heavy_gun` | 重機槍 | 頭目重炮手 | 0.3 × 1.3 × 0.35 | 1,500 | A | P2 | 掃射用；比玩家的機槍大 |
| `armour_plate` | 胸前鋼板 | 頭目重炮手 | 0.6 × 0.15 × 0.8 | 300 | A | P2 | 放慢彈幕牆時會發光（`glow`）；背後冇：繞到背後打 |
| `long_rifle` | 長槍 | 頭目長槍手 | 0.07 × 1.4 × 0.25 | 1,000 | A | P2 | 同玩家的狙擊步槍分得出 |
| `drone` | 無人機 | 候選敵人 | 0.6 × 0.6 × 0.2 | 1,000 | A | P3 | 四軸，四個槳分開 `prop_1`…`prop_4`，機底一支槍 |

```text
riot_shield — A rectangular riot shield 0.6 m wide, 1.0 m high, 8 cm thick, dark grey with a small viewing window and a handle on the back.
tower_shield — A huge battered steel shield 0.9 m wide, 1.6 m high, 12 cm thick, riveted plates, a slit to look through.
bomb_vest — A vest of explosive charges worn over the chest, 0.45 x 0.3 x 0.5 m, olive canvas with charge blocks and wires, a row of small lights as a separate object "lights" (glow material).
detonator — A hand-held detonator 14 cm long with a thumb switch and a short antenna.
grenade — A hand grenade 7 cm across and 10 cm long.
grenade_bag — A big backpack stuffed with grenades, 0.4 x 0.25 x 0.5 m, a few grenades hooked on its straps; it must read clearly from above.
helmet_iron — A battered steel helmet that fits over a head, 0.3 x 0.32 m, 0.22 m high.
knife — A street fighter's knife, 0.3 m long.
elite_umbrella — A large umbrella: open, a canopy 1.6 m across and 0.5 m high on a 1.0 m shaft; closed, 1.0 m long. Indigo with a bold pattern seen from above.
lion_head — A lion-dance head, 0.8 m wide, 0.9 m long, 0.7 m high: a green lion with a large mirror on the forehead, fur trims, big eyes, its lower jaw a separate object "jaw". Stylised and chunky.
twin_blades — One of a pair of long curved knives, 0.6 m long, a dark grip.
heavy_gun — A heavy machine gun carried at the hip, 1.3 m long, a big ammunition box and belt, bigger than the player's minigun.
armour_plate — A steel chest plate 0.6 x 0.8 m, 15 cm thick, worn on the front only; its front face in a glow material.
long_rifle — A long marksman's rifle, 1.4 m long, a long scope, clearly different from a sniper rifle.
drone — A small quadcopter 0.6 x 0.6 m, 0.2 m high, dark grey with a gun under its body; the four propellers separate objects "prop_1".."prop_4".
```

## 9. 候選與之後會多的（暫時唔使做）

- **工具**（現時只喺舊地圖，第二代的房未放；回來就做，全部 A）：大鑊 `pan_wok`（Ø0.76，柄 0.55）、托盤 `tray`（Ø0.5）、雨傘 `umbrella_tool`（收 1.0 長，開 Ø1.2）、滅火筒 `extinguisher`（Ø0.24 × 0.7）、漁網 `fishing_net`（捆起 Ø0.64 × 0.35）、麻雀牌 `mahjong_tile` 和麻雀枱 `mahjong_table`（0.9 × 0.9 × 0.75）。
- **之後的卡會加：** F⑨ 牆跑用的內牆（柱、櫃枱、車）；H⑦ 基地（槍架、手冊和檔案的告示板、試槍場的靶、階梯牌）。到嗰張卡先寫。F②a 入口閘下面的挑戰牌、F③ 兩道門上寫住下一間房和獎勵的牌，都係 HUD 上的牌，屬 UI（H③），唔入呢份清單；第二度門用返 `exit_door`。

## 10. 總數與估算

| 類 | P1 | P2 | P3 | 合計 |
|---|---|---|---|---|
| 共用件（§3） | 9 | 1 | 0 | 10 |
| 房間的殼：貼圖（§4） | 6 | 15 | 1 | 22 |
| 打鬥房的道具（§5，十個表；茶樓三間同一套） | 1 | 38 | 11 | 50 |
| 頭目房（§6） | 0 | 0 | 5 | 5 |
| 武器（§7） | 1 | 10 | 0 | 11 |
| 人物配件（§8） | 0 | 14 | 1 | 15 |
| **模型合計**（貼圖以外） | **11** | **63** | **17** | **91** |

另有 §9 的七件工具（候選）。「打爛咗」的版本（`table_cloth`、`table_folding`、`crate_wood`、`maze_board`）各算埋喺原件。

**如果 A 類 ChatGPT 做唔掂、要轉 Meshy：** P1 加 P2 共 74 件，每件平均試兩次、每次 image-to-3D 連貼圖 30 點 → 約 4,500 點，即 Meshy Premium（每月 3,000 點，US$40）一個月加 Pro（1,000 點，US$20）兩個月，約 **US$80（約 HK$620）**。價錢的出處同人物一樣，見 [CHARACTERS.md](CHARACTERS.md) §7。ChatGPT 本身要有可以出圖的方案（Plus 或以上，以官網為準）。
