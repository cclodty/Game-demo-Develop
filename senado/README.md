# 議事亭前地 Largo do Senado：量體研究 v1

這是子彈時間射擊遊戲地圖的第一步：按實景比例建立的議事亭前地量體模型，未加入任何細節。

- **單位**：1 單位 = 1 米。glTF 為 Y 軸向上。
- **原點**：噴水池中心（OSM node 5692359322，22.1936819°N, 113.5398859°E）。
- **軸向**：X = 東，Z = 南（北為 −Z）。資料檔內的 `x, y` 分別是東和北。
- **範圍**：東西約 710 米、南北約 680 米，以噴水池為中心。新葡京（211.5 米）在範圍外，保留作天際線參照。

## 檔案

| 路徑 | 內容 |
| --- | --- |
| `index.html` + `viewer/` | 瀏覽器檢視器，包括鏡頭預設、步行模式、比例人、環境比例滑桿和照片疊圖 |
| `viewer/model.js` | 由資料建模的程式，檢視器和 GLB 匯出共用，所以看到的就是匯出的 |
| `export/senado_massing.glb` | 遊戲用模型，3.7 MB，約 6.3 萬個三角面，已通過 glTF Validator（0 錯誤） |
| `data/osm_raw.json` | Overpass 原始擷取（© OpenStreetMap contributors，ODbL） |
| `data/landmarks.json` | 人手整理：地標名稱、已知外牆顏色、高度修正及其理由 |
| `data/senado_massing.json` | 處理後的本地米制資料 |
| `viewer/assets/calcada_waves.png` | 可平鋪的葡式碎石波浪貼圖，每格 6.0 × 2.25 米 |
| `reference/*.jpg` | Esri 衛星參考圖，已對位。不入 git，只作對位參考 |

## GLB 結構

```
LargoDoSenado
├─ Ground, Streets (Streets_Vehicle / Streets_Pedestrian), Grass
├─ Calcada_Squares         議事亭前地 + 板樟堂前地，材質 Calcada 帶波浪貼圖
├─ Buildings
│  ├─ Buildings_landmark   每棟一個節點：B_<osm id>_<key>，例如 B_w192573688_sao_domingos
│  ├─ Buildings_frontage   廣場臨街
│  ├─ Buildings_avenue     新馬路臨街
│  ├─ Buildings_core       噴水池 170 米內
│  ├─ Buildings_part
│  └─ Buildings_context    外圍天際線，合併成一個網格
├─ Fountain                池徑取自 OSM；中央渾天儀只是示意
└─ Trees
```

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

## 下一步（逐部細化）

1. 用實景照片核對臨街樓宇的外牆顏色。檢視器的「疊上實景照片」可直接把照片疊在模型上對位。
2. 地面層騎樓：西面一排和仁慈堂的拱廊。
3. 玫瑰堂立面、市政署立面、屋頂形狀。
4. 遊戲用的碰撞簡化，以及可進入的範圍。
