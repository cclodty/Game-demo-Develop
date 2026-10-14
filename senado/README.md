# 議事亭前地 Largo do Senado：量體研究 v2

子彈時間射擊遊戲地圖：按實景比例建立的議事亭前地模型。

- **v1**：OSM 輪廓和高度的量體。
- **v2**：按實景照片加入騎樓、樓層腰線、壁柱、簷口和女兒牆。外牆顏色留待 v3。

- **單位**：1 單位 = 1 米。glTF 為 Y 軸向上。
- **原點**：噴水池中心（OSM node 5692359322，22.1936819°N, 113.5398859°E）。
- **軸向**：X = 東，Z = 南（北為 −Z）。資料檔內的 `x, y` 分別是東和北。
- **範圍**：東西約 710 米、南北約 680 米，以噴水池為中心。新葡京（211.5 米）在範圍外，保留作天際線參照。

## 檔案

| 路徑 | 內容 |
| --- | --- |
| `index.html` + `viewer/` | 瀏覽器檢視器，包括鏡頭預設、步行模式、比例人、環境比例滑桿和照片疊圖 |
| `viewer/model.js` | 由資料建模的程式，檢視器和 GLB 匯出共用，所以看到的就是匯出的 |
| `export/senado_massing.glb` | 遊戲用模型，4.8 MB，約 7.4 萬個三角面，已通過 glTF Validator（0 錯誤） |
| `data/osm_raw.json` | Overpass 原始擷取（© OpenStreetMap contributors，ODbL） |
| `data/landmarks.json` | 人手整理：地標名稱、已知外牆顏色、高度修正、立面樣式（`facadeStyles`）、每棟樓的立面規格與照片證據（`facades`）、過街樓（`bridges`） |
| `data/senado_massing.json` | 處理後的本地米制資料 |
| `viewer/assets/calcada_waves.png` | 可平鋪的葡式碎石波浪貼圖，每格 6.0 × 2.25 米 |
| `reference/*.jpg` | Esri 衛星參考圖，已對位。不入 git，只作對位參考 |
| `reference/photos/` | 29 張 Wikimedia Commons 照片（640 px），用作立面證據；作者與授權見 `credits.json` |
| `tests/` | `npm test`：外牆法線向外、輪廓逆時針、騎樓內縮面積、立面幾何無 NaN |

## GLB 結構

```
LargoDoSenado
├─ Ground, Streets (Streets_Vehicle / Streets_Pedestrian), Grass
├─ Calcada_Squares         議事亭前地 + 板樟堂前地，材質 Calcada 帶波浪貼圖
├─ Buildings
│  ├─ Buildings_landmark   每棟一個節點：B_<osm id>_<key>，例如 B_w192573688_sao_domingos
│  │                       有立面規格的樓宇是一個群組：_body（牆身＋屋頂）、_arcade（拱廊）、_trim（白色線腳）
│  ├─ Buildings_frontage   廣場臨街
│  ├─ Buildings_avenue     新馬路臨街
│  ├─ Buildings_core       噴水池 170 米內
│  ├─ Buildings_part
│  └─ Buildings_context    外圍天際線，合併成一個網格
├─ Fountain                池徑取自 OSM；中央渾天儀只是示意
└─ Trees
```

騎樓的地面層向內縮入（店面牆），拱廊在原本的立面線上，樓上部分有天花底面，可以直接走進去。`x_bridge_rua_sul` 是按照片補建的過街樓，不是 OSM 輪廓。

每個建築節點的 `extras` 都有 `name`、`height`、`heightSource`（`osm:height` / `osm:levels` / `default` / `default:small` / `override`）、`tier` 和 `distToSquare`，可以直接用作碰撞體，或篩選出哪些樓宇要先做細節。

牆身的 UV 以米為單位（u = 沿牆周長，v = 高度），之後在引擎內可以直接套用按米平鋪的材質。

## 比例

人物看起來巨大，通常是以下其中一個原因：

1. **鏡頭太近或 FOV 太窄。** 檢視器的「第三人稱」鏡頭設在人物後 3.4 米、高 1.9 米，FOV 58°，可作為起點。
2. **地圖本身太細。** 實景的窄段牆面之間只有約 10 米（地磚範圍約 7 米），對射擊遊戲偏窄。

匯出時可以放大：

```bash
node senado/scripts/export_glb.mjs --scale 1.25   # 整體放大，樓高一齊變
node senado/scripts/export_glb.mjs --plan 1.25    # 只拉闊平面，樓高不變
```

建議先在檢視器拖動「環境比例」，配合步行模式（Shift 跑速 6 米／秒）測試手感，選定倍數後再匯出。

## 重建

```bash
npm install
bash senado/scripts/fetch_osm.sh            # 重新擷取 OSM（可略過，repo 已附）
python3 senado/scripts/build_data.py        # osm_raw.json → senado_massing.json
python3 senado/scripts/make_calcada.py      # 地磚貼圖
python3 senado/scripts/fetch_imagery.py     # 衛星參考圖（不入 git）
node senado/scripts/export_glb.mjs          # → export/senado_massing.glb
npm run senado:serve                        # 檢視器：http://localhost:8000
```

## 資料可信度

- 1,124 棟建築有 OSM 實測高度。另有 4 棟由樓層數推算。
- 862 棟沒有高度：825 棟按「同面積級別已知樓宇的高度中位數」估算，±12% 錯開；36 棟小於 15 平方米，當作 3.5 米小亭；1 棟按衛星圖人手修正。
- 衛星圖與 OSM 有約 7.6 米的偏移，已用噴水池對位（Esri 影像向西 4.8 米、向北 5.9 米平移）。
- 地磚方向和尺寸由衛星圖量度：波浪帶與新馬路平行，方向約 128° 至 131°；黑白一組約 2.25 米，波長約 6 米。
- 外牆顏色只有玫瑰堂（黃）、市政署（白）、仁慈堂（白）是已知的，其餘暫用中性色。
- 利斯大廈在 OSM 中位於西面臨街樓宇後約 30 米，並不面向廣場，所以沒有列作地標。

### 立面（v2）

- 判斷依據是 Wikimedia Commons「Category:Largo do Senado」等分類中的照片。先看全部 197 張縮圖，再選出可辨認立面的照片，逐棟對照 OSM 輪廓。每項規格都附照片編號，見 `landmarks.json` 及 `reference/photos/credits.json`。
- **有騎樓**：205784527、商務旅遊中心、信德堡（西面黃色一排，騎樓高 5.3 米、深 3 米、拱距約 3.9 米）；梁族大廈及窄段西面一排（高 4.8 米）；中華商業大廈（東面，高 6.2 米的大拱）。
- **淺拱店面**：粉紅角樓（新馬路轉角），店門就在拱內，深 0.8 米。
- **無騎樓**：仁慈堂、市政署、郵政局、便民藥房。
- **層高是量出來的**：照片 #87 的相機位置用 7 個對應點反推，與照片 GPS 相差約 1 米。在商務旅遊中心與信德堡交界處的同一條垂直線上量得騎樓 5.3 米、二樓 6.5 米、三樓 5.8 米、女兒牆 1.1 米，合共 18.7 米，等於 OSM 高度。其他樣式的層高是按照片中的人和門目測。
- **便民藥房**只有兩層（照片 #132），高度由估算的 21.6 米改為 11.8 米。
- **過街樓**：OSM 在 205784527 與商務旅遊中心之間有一條約 9 米的橫巷，照片中立面卻連續，所以補建了跨巷的樓上部分。進深 8 米為估計。
- **v1 錯誤已修正**：v1 的輪廓繞向判斷相反，GLB 外牆法線向內，在遊戲引擎中會內外反轉。v2 已修正，並加入測試。

## 下一步（逐部細化）

1. **外牆顏色（v3）**：照片已下載，按照片取色。點選建築後再點證據照片，鏡頭會移到拍攝位置並疊上照片。
2. **噴水池外圍的下沉台階**：照片和衛星圖都看到直徑約 13.6 米的台階圈，OSM 只有水池。
3. **細部**：窗戶、欄杆式女兒牆、屋頂形狀，以及玫瑰堂和市政署的立面。
4. **新馬路的騎樓**：未有足夠照片證據。
5. **遊戲用途**：碰撞簡化，以及界定可進入的範圍。
