# 喺自己部機用 Blender MCP 做細啲（G⓪c）

雲端機做到嘅係 G⓪b：一間由 Blender 腳本砌出嚟嘅茶樓，你睇過話「仲係有啲似玩具」。呢份係畀你喺自己部機，用 Claude Desktop（或者 Claude Code）加 **Blender MCP** 繼續做嘅說明。做出嚟嘅模型唔使改流程，照樣入 Godot 嘅茶樓，照樣係賽璐璐同描邊。

## 包入面有乜

路徑同倉一樣，喺包嘅根目錄（或者倉嘅根目錄）行指令就得：

| 位置 | 係乜 |
|---|---|
| `godot/lookdev/` | Godot 4.5 工程：茶樓場景、十六件模型（`models/*.glb`）、賽璐璐同描邊 shader、截圖工具 |
| `godot/lookdev/blender/` | 生成模型嘅 Blender 腳本：`build.py` 全部重出、`open.py` 開一件出嚟改、`kit.py` 工具（`finish` 導出） |
| `godot/lookdev/room.json` | 間房嘅數字同牆邊道具擺喺邊 |
| `godot/lookdev/README.md` | 點開、點出圖、每件道具嘅三角形同 draw call、學到嘅嘢 |
| `docs/REDESIGN.md` | 第二代設計：§2 美術聖經 |
| `docs/shots/godot/` | 截圖：而家嘅四個鏡頭、道具排排企、帶貼圖測試、比例對比（`proportions.png`） |

## 準備（一次）

1. **Blender 4.5 LTS**：[blender.org](https://www.blender.org/download/lts/)
2. **Godot 4.5**（標準版）：[godotengine.org](https://godotengine.org/download)
3. **Blender MCP**：開源嘅第三方插件（[github.com/ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp)）。步驟以佢嘅 README 為準，大概係：
   - 裝 `uv`（佢用 `uvx blender-mcp` 行 MCP server）
   - Blender：Edit → Preferences → Add-ons → Install，揀佢嘅 `addon.py`，剔起
   - Claude Desktop：Settings → Developer → Edit Config，喺 `mcpServers` 加：
     ```json
     { "mcpServers": { "blender": { "command": "uvx", "args": ["blender-mcp"] } } }
     ```
     用 Claude Code 嘅話：`claude mcp add blender uvx blender-mcp`
   - Blender 3D 畫面撳 N，側欄 **BlenderMCP** → Connect
4. **要知**：佢可以喺你部機嘅 Blender 入面行任何 Python，做嘢先連，做完熄。佢可以順手攞素材：Poly Haven（CC0，隨便用）、Sketchfab（每件授權唔同：淨係用 CC0 或者 CC-BY，記低作者同連結）、Hyper3D Rodin（AI 生成，要佢哋嘅 key，條款自己睇）。

## 做法

1. **開一件出嚟**（由包或者倉嘅根目錄）：
   ```bash
   blender --python godot/lookdev/blender/open.py -- table_set
   ```
   （Windows 嘅話 `blender` 換做 `blender.exe` 嘅完整路徑。）件道具會以零件形式出現（未合併），即係 `build.py` 嘅起點。道具名見 `blender/props.py`：`shell`、`table_set`、`trolley`、`altar`、`counter`、`fish_tank`、`tea_urn`、`plant`、`screen`、`window`、`menu_boards`、`plaque`、`lantern`、`scroll_yumcha`、`scroll_tea`、`clock`
2. **連 MCP**，同 Claude 講要點改（下面有開場白）
3. **導出**：叫 Claude 喺 Blender 行（或者你自己喺 Python Console 打）：
   ```python
   import kit; kit.finish("table_set", keep=True)
   ```
   畫面見到嘅嘢會合併、寫描邊法線，出去 `godot/lookdev/models/table_set.glb`，**場景原封不動**，可以繼續改再出
4. **存底稿**：File → Save As `godot/lookdev/blender/masters/table_set.blend`（之後改都由呢度開，唔使再 `open.py`）
5. **喺 Godot 睇**：開 `godot/lookdev/project.godot`，F5。或者出截圖（指令喺 README「出截圖」）
6. **帶返嚟**：git 開條分支 commit `models/`、`blender/masters/` 推上去，或者將檔案畀返我，我入倉同出截圖對比

## 規矩（同 Claude 講，或者直接畀佢睇呢段）

- **單位係米**。Blender 嘅 Z 向上，**-Y 係南**（遊戲鏡頭嗰邊）
- **原點**：
  - 圓枱、點心車：中心、落地
  - 牆邊嘢（窗、牌、燈籠、神枱、收銀櫃⋯）：喺牆面、落地，面向 -Y（向房入面）
  - 建築 `shell`：房中心
- **尺寸照 `room.json`**：房 26.4 × 18 米、高牆 3.2、矮牆 0.9、門 1.6 闊 2.5 高、枱半徑 0.85。佔地唔好大過原本：成套枱連椅半徑約 1.6 米，牆邊嘢出牆唔多過 0.5 米
- **地面上空冇嘢**：唔好有吊燈、橫樑跨過地面（鏡頭同子彈之間唔可以有嘢）
- **顏色**：
  - 用材質嘅 Base Color，可以係貼圖；一套 UV，叫 `UVMap`
  - 地上唔可以有黃、青、紅：敵人子彈係黃白、玩家子彈係青白、瞄準紅線係紅。地上嘅金要用暗金
  - 材質名有 `glow` 就會發光（燈籠、燈箱）
- **輕**：每件道具材質越少越好（目標四種以內，可以用一張貼圖集），三角形一件五千以內（建築兩萬以內）。最傷嘅係 draw call，唔係三角形
- **描邊唔使理**：`kit.finish` 會自己寫。佢淨係導出 mesh 同文字；曲線、metaball 之類要先 Object → Convert → Mesh
- **美術方向**：絕區零、女神異聞錄嘅日式動畫風，帶廣東味（絕區零廣東嗰章嘅感覺）。賽璐璐兩段色，陰影偏紫藍，有深色描邊。細節靠形狀（倒角、第二層形狀、比例誇張少少），唔靠貼圖雜點
- **全部虛構**：唔用真實店名、品牌、人物。中文字試看可以照用 WenQuanYi Zen Hei，正式版要揀可以商用嘅字體
- **人唔喺今次**：6.5 頭身嘅角色留畀 H①

## 開場白（複製畀本機嘅 Claude）

> 我哋做緊一個俯視角子彈時間射擊遊戲嘅美術試看：一間廣東茶樓，日式動畫風（參考絕區零、女神異聞錄），Godot 4.5 用賽璐璐 shader 同描邊顯示。Blender 已經開咗一件道具（`godot/lookdev/blender/open.py` 開嘅），佢而家太簡單、似玩具。請你用 Blender MCP 喺呢個基礎上做精細啲：加第二層形狀、倒角、合理嘅細節同比例，可以用 Poly Haven 嘅 CC0 素材或者 AI 生成，但係要守 `godot/lookdev/MCP.md`「規矩」嗰段（尺寸、原點、地上唔可以有黃青紅、材質少、地面上空冇嘢）。每改完一輪，影一張 Blender 截圖畀我睇；我話得先行 `import kit; kit.finish("<道具名>", keep=True)` 導出。

## 我建議點試

先揀**一件**試，例如成套圓枱（佔畫面最多）或者點心車，喺 Godot 同而家嘅版本並排比較，覺得方向啱先做其餘嘅。

另外，「似玩具」唔止係建模：

- 光平均、冇焦點
- 人仍然係方塊
- 地板大片得一種質感

模型做細咗之後如果仲覺得似玩具，下一步可以試打光（燈池、窗外霓虹）同角色。
