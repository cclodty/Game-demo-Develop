# 茶樓精緻版：Godot 佈置試看（G⓪）

一個獨立嘅 Godot 4 工程，睇吓第二代嘅美術方向（`docs/REDESIGN.md` §2 美術聖經）喺 Godot 入面係乜樣。**唔係搬遷**（G① 先定新倉定 `godot/`、先搭真正嘅工程結構），亦都**冇玩法**：淨係一間茶樓、四個積木人做比例。

- 房：遊戲第一間房（`src/rooms.js` `TEAHOUSE`），照遊戲嘅 1.2 倍：26.4 × 18 米，六張圓枱、兩架點心車、四道門、入口、兩個出口、四盞燈
- 佈置：朱紅＋墨綠、金邊、米白枱布；賽璐璐兩段色階、陰影偏紫藍、邊光；深色描邊（地面唔描）；牆上嘅金欄杆、紅燈籠、窗花、掛軸、屏風；地面水磨石。好似遊戲咁，地面上空冇嘢掛住（鏡頭同子彈之間唔可以有嘢）
- 全部係 Godot 自己嘅幾何同 shader（`shaders/`），冇模型檔；房係由 `scripts/teahouse.gd` 照房嘅數字砌出嚟

## 開嚟睇

1. 裝 [Godot 4.5](https://godotengine.org/download)（標準版，唔使 .NET）
2. Godot 開 Project Manager → Import → 揀 `godot/lookdev/project.godot`
3. F5 行：遊戲鏡頭（45° 俯視，跟住積木玩家，同遊戲入房一樣嘅距離）。想轉角度：喺 `scripts/teahouse.gd` 改 `_ready()` 最尾嘅 `set_view("game")` 做 `"iso"`（45° 側俯視，成間房）、`"close"`（近啲）或者 `"top"`（正上望落）

## 出截圖

要有顯示（伺服器上用 Xvfb；Mesa 軟件 OpenGL 夠 Compatibility 渲染器用）：

```bash
xvfb-run -s "-screen 0 1280x720x24" godot --path godot/lookdev --resolution 1280x720 -s tools/shot.gd -- ../../docs/shots/godot
```

出四張 JPEG：`teahouse-game.jpg`（遊戲鏡頭）、`teahouse-iso.jpg`（側俯視成間房）、`teahouse-close.jpg`（近啲）、`teahouse-top.jpg`（正上望落）。

## 學到嘅嘢（之後 G①、H② 用得著）

- **光要近白、亮面大約 1 倍光**：暖色光喺線性空間同牆色相乘，朱紅嘅綠藍會俾壓到冇；光再多過 1 倍就燒成橙、米白爆白。色交俾色板，暖意交俾燈籠同色板
- **Compatibility 渲染器嘅 glow 唔好用**：預設「柔光」混合加 bloom 會成個畫面加對比；試過改加法混合，背景角落又會變色。燈籠靠自己嘅 emission 已經夠
- **色調映射用 Linear**：Filmic 會郁色（同一面朱紅牆，紅通道 212 對 Linear 嘅 180），平塗色唔再係色板個色
- 地面紋理要靜：水磨石粒細、少、淡，子彈先睇得清
