# 茶樓精緻版：Godot 佈置試看（G⓪、G⓪b）

一個獨立嘅 Godot 4 工程，睇吓第二代嘅美術方向（`docs/REDESIGN.md` §2 美術聖經）喺 Godot 入面係乜樣。**唔係搬遷**（G① 先定新倉定 `godot/`、先搭真正嘅工程結構），亦都**冇玩法**：淨係一間茶樓、四個積木人做比例（人照舊 6.5 頭身，開發者 10-31 定；角色模型留畀 H①）。

- 房：遊戲第一間房（`src/rooms.js` `TEAHOUSE`），照遊戲嘅 1.2 倍：26.4 × 18 米，六張圓枱、兩架點心車、四道門、入口、兩個出口、四盞燈。數字喺 `room.json`，Godot 同 Blender 都讀佢
- **G⓪b（而家）**：環境同道具全部喺 Blender 用 Python 腳本生成（`blender/`），導出 `models/*.glb`，Godot 擺位（`scripts/teahouse.gd`，牆邊嘢照 `room.json` 嘅 `decor`）同換賽璐璐材質（`scripts/dress.gd`）
- **G⓪（第一次）**：全部係 Godot 自己嘅方塊同圓柱。喺 `scripts/teahouse.gd` 將 `models` 改做 `false` 就睇返（開發者睇過：「太似玩具」）
- 佈置：朱紅＋墨綠、金邊、米白枱布；賽璐璐兩段色階、陰影偏紫藍、邊光；深色描邊（地面唔描）；地面上空冇嘢掛住（鏡頭同子彈之間唔可以有嘢）；地上嘅金色一律用暗金（子彈係黃色）

## 開嚟睇

1. 裝 [Godot 4.5](https://godotengine.org/download)（標準版，唔使 .NET）
2. Godot 開 Project Manager → Import → 揀 `godot/lookdev/project.godot`（第一次開會 import 啲 .glb，等一陣）
3. F5 行：遊戲鏡頭（45° 俯視，跟住積木玩家，同遊戲入房一樣嘅距離）。想轉角度：喺 `scripts/teahouse.gd` 改 `_ready()` 最尾嘅 `set_view("game")` 做 `"iso"`（45° 側俯視，成間房）、`"close"`（近啲）或者 `"top"`（正上望落）

## 重出模型（Blender 4.5）

由倉嘅根目錄，一句：

```bash
blender -b --factory-startup -P godot/lookdev/blender/build.py
```

全部道具重出去 `models/`，三角形數同材質寫入 `models/stats.json`。淨係出某幾件：`... build.py -- table_set lantern`。每件道具係 `blender/` 入面一個函數（`build.py` 嘅 `PROPS` 列晒）：

| 檔 | 道具 |
|---|---|
| `kit.py` | 工具：遊戲座標、調色板（材質名就係色名，名有 `glow` 就發光）、倒角、旋轉體、圈、中文字（直寫橫寫）、`finish`（合併、硬邊、描邊法線、導出） |
| `shell.py` | 建築：高牆（踢腳、墨綠護牆凸板、金腰線、朱紅灰牆、金線、木檐口、紅柱金柱頭）、矮牆（兩面都有凸板，鏡頭睇到外面）、門框同紅漆雙門（金門釘、門環）、出口框同後面嘅暗走廊、入口柱 |
| `table_set.py` | 八人圓枱：圓地氈、摺邊枱布、玻璃轉盤、茶壺、竹蒸籠、燒賣蝦餃、八個位（碟、碗、杯、筷子）、八張圈椅 |
| `furniture.py` | 神枱、收銀櫃（算盤、電話、糖樽、月曆）、海鮮魚缸、熱水爐、富貴竹、四摺屏風、點心車 |
| `wall_decor.py` | 窗花、點心牌（蝦餃燒賣叉燒包⋯）、牌匾「如意茶樓」、燈籠、掛軸（一盅兩件、茶香四溢）、時鐘 |

## 出截圖

要有顯示（伺服器上用 Xvfb；Mesa 軟件 OpenGL 夠 Compatibility 渲染器用）。先 import 一次模型，再出圖：

```bash
godot --headless --path godot/lookdev --import
```

```bash
xvfb-run -s "-screen 0 1280x720x24" godot --path godot/lookdev --resolution 1280x720 -s tools/shot.gd -- ../../docs/shots/godot
```

```bash
xvfb-run -s "-screen 0 1920x1080x24" godot --path godot/lookdev --resolution 1920x1080 -s tools/lineup.gd -- ../../docs/shots/godot
```

第一句出四張 JPEG：`teahouse-game.jpg`（遊戲鏡頭）、`teahouse-iso.jpg`（側俯視成間房）、`teahouse-close.jpg`（近啲）、`teahouse-top.jpg`（正上望落），同時印出每個鏡頭一格嘅 draw call 同三角形。第二句出道具排排企：`lineup-wall.jpg`（掛牆嘅）、`lineup-floor.jpg`（落地嘅）。

## 數字（G① 定預算用）

每件道具（`models/stats.json`）：

| 道具 | 三角形 | 材質 | 用幾多件 |
|---|---:|---:|---:|
| shell 建築 | 38,872 | 8 | 1 |
| table_set 八人圓枱 | 15,148 | 17 | 6 |
| menu_boards 點心牌 | 10,168 | 5 | 1 |
| trolley 點心車 | 6,800 | 10 | 2 |
| counter 收銀櫃 | 3,605 | 12 | 1 |
| plant 富貴竹 | 2,736 | 4 | 2 |
| plaque 牌匾 | 2,518 | 4 | 1 |
| altar 神枱 | 2,356 | 6 | 1 |
| screen 屏風 | 2,044 | 7 | 1 |
| scroll_tea 掛軸 | 1,567 | 5 | 1 |
| fish_tank 魚缸 | 1,490 | 9 | 1 |
| tea_urn 熱水爐 | 1,204 | 4 | 1 |
| scroll_yumcha 掛軸 | 1,195 | 5 | 1 |
| window 窗花 | 808 | 4 | 3 |
| clock 時鐘 | 768 | 4 | 1 |
| lantern 燈籠 | 636 | 4 | 8 |

成間房一格（1280×720，`tools/shot.gd` 印出）：

| 鏡頭 | draw call | 三角形 | 陰影三角形 |
|---|---:|---:|---:|
| 遊戲（45° 俯視） | 2,000 | 297,306 | 977,576 |
| 側俯視 | 1,677 | 310,692 | 621,384 |
| 近啲 | 1,891 | 299,792 | 983,742 |
| 正上望落 | 1,728 | 313,408 | 727,774 |

**太重，G① 要減**：JS 版每張地圖嘅預算係三百個 draw call 以下。重嘅原因同減法：

1. **一種材質一個 draw call，描邊再一倍**：一張枱 17 種材質 × 2 = 34 個。改做每件道具一種材質（顏色寫入頂點色或者一張調色板貼圖），一件就得 2 個
2. **Compatibility 渲染器每盞會照到嘅燈再畫多次**：四盞燈照住大半間房。G① 減到一盞主光，燈池用貼圖或者 shader 假
3. **三角形**：建築嘅門釘同倒角、點心牌嘅中文字最多。門釘用一個 MultiMesh，字用貼圖
4. 陰影：方向光嘅陰影圖成間房畫幾次；G① 試吓淨係人同枱投影

## 學到嘅嘢（之後 G①、H② 用得著）

- **光要近白、亮面大約 1 倍光**：暖色光喺線性空間同牆色相乘，朱紅嘅綠藍會俾壓到冇；光再多過 1 倍就燒成橙、米白爆白。色交俾色板，暖意交俾燈籠同色板
- **Compatibility 渲染器嘅 glow 唔好用**：預設「柔光」混合加 bloom 會成個畫面加對比；試過改加法混合，背景角落又會變色。燈籠靠自己嘅 emission 已經夠
- **色調映射用 Linear**：Filmic 會郁色（同一面朱紅牆，紅通道 212 對 Linear 嘅 180），平塗色唔再係色板個色
- 地面紋理要靜：水磨石粒細、少、淡，銅條暗，子彈先睇得清
- **模型描邊要平滑法線**：硬邊嘅法線喺角位分開，沿法線推出嚟嘅外殼會爆開。Blender 將每點嘅平均法線（八面體編碼）寫入 UV，描邊 shader 沿佢推，推幾多用螢幕像素（1.6 px），茶杯同牆一樣粗
- **Blender 合併物件之後**，`mesh.materials.clear()` 會將每個面嘅材質編號清做 0，要先記低再寫返（`kit.finish`）
- 中文字用 WenQuanYi Zen Hei（GPL 加字體例外）出幾何，**只係試看**；正式版要開發者揀可以商用嘅字體（美術聖經 UI 一節）
