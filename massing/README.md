# 量體研究 massing studies

每張地圖生成或重建之前，先做一次實地量體研究（開發者 2026-10-22 的決定，見 `docs/DECISIONS.md`）。範本是 `senado/`（議事亭前地量體研究 v1–v7）：先由 OSM 取得輪廓和高度，再用照片作證，量度表寫明來源和可信度，最後用衛星圖對位。這個資料夾放其餘六張圖的研究，以及議事亭的對照。

## 資料夾

```
massing/
  README.md                 這份：方法、來源、規矩
  <id>/                     一張地圖一個（id 同 src/maps.js）
    README.md               研究報告（繁體中文，十項，見下）
    site.json               地點、原點、旋轉、範圍（由人寫）
    checks.json             重建後要核對的量度（由人寫；地圖標了 `massing` 才核對）
    plan.svg                平面圖（scripts/massing/plan.mjs 產生）
    data/osm_raw.json       OSM 原始資料，只留用得着的標籤（fetch.mjs 產生）
    data/massing.json       本地米制的量體（build.mjs 產生）
    reference/photos/       Wikimedia Commons 照片（640 px）與 credits.json
```

## 跑法

```
npm run massing:fetch -- <id>   # OSM → data/osm_raw.json（要網絡）
npm run massing:build -- <id>   # → data/massing.json
npm run massing:plan  -- <id>   # → plan.svg，遊戲現在的地圖（assets/maps/<id>.json）疊在上面
```

測試（`test/massing.test.mjs`）不連網，只讀入了 git 的檔。

## 座標

- **研究平面**：以 `site.json` 的 `origin` 為原點的切平面（WGS84 橢球的東北天座標），x 向東、y 向北，單位是米。500 米內的誤差小過 1 厘米，測試有守。
- **遊戲**：把研究平面逆時針轉 `rotDeg` 度（同 `src/senado/transform.js` 轉議事亭的方向），北方翻成 −Z。`rotDeg` 為 0 時，遊戲的 +X 是東、+Z 是南（向着預設鏡頭）。原點就是遊戲的 (0, 0)。
- 研究未重建地圖之前，原點揀在令現有地圖對得上實景的位置（例如大三巴：牌坊立面線對牌坊），這樣 plan.svg 才看得出差多遠。

## 高度

每棟樓的 `heightSource` 寫明高度從哪裏來：

| 來源 | 意思 |
|---|---|
| `osm:height` | OSM 的 `height` 標籤 |
| `osm:levels` | `building:levels` × 3.2 米一層（`senado/` 的層高） |
| `override: …` | 研究量到或改正的高度（`site.json` 的 `heights`，寫明證據，例如照片編號） |
| `default:small` | 小過 15 平方米：3.5 米的小亭 |
| `estimate` | 同一面積級別已知高度的中位數（`senado/` 的做法）；沒有已知的就當三層 9.6 米 |

OSM 的 `height` 要核實：有些地區的高度可能是海拔（屋頂離海平面多高），不是樓高。在山坡上的地點（大三巴、東望洋），研究要用照片或公開資料對幾棟，寫進量度表。

## 研究報告的十項（每個 `<id>/README.md`）

1. **選址**：為甚麼是這裏——航拍三秒認得出的特徵（ROADMAP 附錄 A：靠地面圖案和輪廓，不是立面）、只有這裏才有的機制、敏感度；候選和落選的原因。
2. **範圍與座標**：原點（OSM 點編號與經緯度）、軸向（旋轉角與原因）、可玩範圍（闊 × 深）、周邊範圍（可玩範圍外 100–150 米，畫成背景的真實樓宇）。
3. **資料來源表**：OSM（抽取日期、bbox、ODbL）、照片（Commons）、公開尺寸（網址）、衛星圖（只作對位，偏移量記下）、開發者實地量度（如有）。
4. **量度表**：每項「名稱｜數值｜來源｜方法｜可信度（實測／OSM 標籤／照片估算／推算）」：街闊（牆到牆、路緣到路緣）、樓宇輪廓與高度、層數與層高、騎樓深度、地標尺寸、地面高度（每個平台、每段石階的級數與級高、斜路坡度）、地面圖案（碎石路的方向與尺寸、賽道線、路肩、護欄顏色）、街道傢俬的位置。照片量度用照片中的人（1.7 米）、門（約 2.1 米）或已知尺寸作比例，寫明用了哪一張。
5. **高低差與戰區**：地面剖面；每個戰區的範圍與高度；通道；為甚麼這樣分（同一水平的容差見 `src/config.js` 的 `LEVELS`）。
6. **遊戲化改動表**：每一處偏離實景（平面放大的倍數、移走的車、加闊的巷、合併的小樓、虛構的店名、為了頭目的路而移開的街燈）、原因、對玩法的作用。表上沒寫的偏離不准有。平面最多放大 1.25 倍（`senado/README.md`「比例」：實景的窄段對射擊遊戲偏窄），樓高照實；人物 1.78 米不變。
7. **遊戲用的東西**：出生點在現實對應甚麼（巷口、門口、樓梯口、碼頭邊）、掩體在現實是甚麼（花槽、欄杆、攤檔、輪胎牆、繫纜樁）、這張圖獨有的機制、頭目構思（最大戰區外接範圍的短邊有 20 米以上算大場地，用雙頭目；用到哪些地貌）。
8. **checks**：寫在 `checks.json`，重建後 `test/massing.test.mjs` 逐項核對，至少 8 項，涵蓋平面、高度、地標。
9. **待開發者到現場量或影的東西**（可選，不等）。
10. **對照圖**：plan.svg；重建後再加一張「參考照片｜同一角度的遊戲截圖」並排。

## checks.json

```json
[
  { "id": "street", "what": "福隆新街的街闊（牆到牆）", "real": 6.2, "tol": 0.3, "source": "量度表 #3", "game": { "type": "gap", "at": [0, 0], "axis": "z" } }
]
```

`game` 量的是地圖的匯出檔（`assets/maps/<id>.json`）：`gap`（一點兩邊牆到牆的距離）、`height`（一點上最高的掩體或樓）、`ground`（石階剖面的地面高度）、`span`（一種掩體在一條軸上的總長，例如牌坊立面的闊度）、`size`（可玩範圍的闊或深）、`value`（匯出檔裏的一個數，陣列就加總）。寫法見 `scripts/massing/checks.mjs`。

## 來源與授權

- **OpenStreetMap**：© OpenStreetMap contributors，ODbL 1.0。每個 `osm_raw.json`、`massing.json` 都帶署名；用了它的地圖，遊戲內和 README 也要署名（議事亭已有）。`fetch.mjs` 不保存編輯者的名字，也不保存商舖、食肆的名字（遊戲裏的店名一律虛構）。
- **照片**：只用 Wikimedia Commons 上可再用的照片，縮到長邊 640 px 才放進 `reference/photos/`，`credits.json` 寫檔名、作者、授權、網址。
- **衛星圖**：Esri World Imagery 等只作對位和量度參考，不入 git、不進遊戲（`senado/` 的做法）。
- **不用** Google 地圖、街景的圖（條款不准）。
- 量體可以有真實建築的形狀，招牌、商標、店名不放（同 `senado-v6`）。

## 網絡（2026-10-22 在雲端環境試過）

| 來源 | 結果 |
|---|---|
| api.openstreetmap.org `/api/0.6/map.json?bbox=` | 通。一次最多 0.25 平方度、5 萬個點；大三巴 440 × 440 米約 5,900 個點、1,400 條 way |
| overpass-api.de | 不通（連線被重設） |
| overpass.kumi.systems、maps.mail.ru/osm/tools/overpass | 通（`fetch.mjs` 在 OSM API 失敗時順序試） |
| nominatim.openstreetmap.org | 通（每秒最多一次，要帶 User-Agent） |
| Esri World Imagery 圖塊 | 通（只作參考） |
| AWS terrarium 高程圖塊、api.opentopodata.org（SRTM 30 米） | 通，但一格 30 米，量不到石階 |
| commons.wikimedia.org API | 429（帶 User-Agent 也一樣，這個環境的出口被限流） |
| upload.wikimedia.org 縮圖 | 標準闊度（如 500 px）的縮圖通：`/wikipedia/commons/thumb/a/ab/<檔名>/500px-<檔名>`，`a/ab` 是檔名（空格換成 `_`）的 md5 頭一、兩位；原圖和非標準闊度 400／429 |
| Commons 的分類頁、檔案頁（網頁，不是 API） | 用網頁抓取工具讀得到：揀檔名、抄作者和授權 |
| en.wikipedia.org、data.gov.mo | 通 |
| www.geoportal.gov.mo | 不通 |

抽不到 OSM 時**不准改成手建**：那張卡標「受阻」，先做不用網絡的卡（`docs/GOAL.md`）。

## 研究一覽

| id | 地點 | 狀態 |
|---|---|---|
| ruins | 大三巴牌坊、耶穌會紀念廣場 | 工具跑通（OSM、量體、平面圖）；研究未寫 |
