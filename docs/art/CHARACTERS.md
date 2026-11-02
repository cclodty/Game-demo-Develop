# 第二代人物清單與費用（主角除外）

2026-10-29 · TASKS H⓪ · 依據 `docs/REDESIGN.md` §2（剪影規則）、§5（敵人十二種、頭目）、§7（預算、prompt 模板、Mixamo 動作），DECISIONS 2026-10-27（Meshy 生成照用不修、先試三個）。人物用 Meshy 或 Tripo 生成；人物手上拎的、身上會郁的配件（盾、傘、獅頭、背心……）分開做，見 [PROPS.md](PROPS.md) §7、§8。

## 1. 數量

| 類 | 數 | 是誰 | 狀態 |
|---|---|---|---|
| 普通敵人 | **12** | 街頭打手、步槍手、散彈手、保安大隻佬、疊碼仔頭、盾牌保安、炸彈客、擲彈兵、飛仔、狙擊手、精英傘手、精英舞獅手 | `REDESIGN` §5 的表；F⑧（敵人重設計）做完先定實 |
| 頭目 | **5** | 刀后、重炮手、鐵盾、長槍手、散彈手（頭目） | 現時四場頭目戰（長槍手＋散彈手同場）；`ROADMAP` §6 |
| 最終頭目 | **1** | 第三層固定的那一個：金爺（戲棚） | 樣見 `docs/storyboard/03-bosses.md`（開發者 10-30 出咗六個頭目的設定圖） |
| 真結局的頭目 | **1** | 晶晶（戲棚貴賓位，已經通關兩次先出；開發者 10-31） | 樣見晶晶設定圖（`docs/storyboard/05-08-main-story.txt` 第 1 張）；唔識打，模型只要企、指、揸咪、驚、坐低 |
| **基本合計** | **19** | | 下面的費用照 18 個計；晶晶多約 US$5–10（Meshy）或 US$2–4（Tripo） |
| 候選 | 3 | 機槍手（第二層起的「壓制者」）、DJ、裝甲車司機改人 | 未決定上唔上場 |
| 唔使新模型 | — | 帶頭大佬的兩個護衛（用街頭打手）；詞綴「鐵頭」「彈衣」（配件 `helmet_iron`、`bomb_vest` 套落任何敵人）；新手熱身的三個敵人（照用普通敵人） | |
| 唔係人物 | — | 無人機（機械，PROPS §8 `drone`）、白鴿（PROPS §5.3 `pigeon`） | 入道具清單 |
| 只喺漫畫格出現 | — | Action 叔、場務姐、閻王、玉帝、孟婆、銀姐（`docs/STORY.md` §3；晶晶 10-31 改做頭目） | 2D 畫，唔使 3D 模型 |

**JS 原型現有十八種敵人點樣變成十二種**（F⑧ 會照這張表合併；外形跟題目走）：

| 第二代 | JS 現時 |
|---|---|
| 1 街頭打手 | 打手 `grunt` |
| 2 步槍手 | 步槍手 `rifle` |
| 3 散彈手 | 散彈手 `shotgun`、霰彈手 `blaster` |
| 4 保安大隻佬 | 大隻佬 `brute` |
| 5 疊碼仔頭 | 帶頭大佬 `captain`、排槍手 `volleyer`（整隊同一拍齊射） |
| 6 盾牌保安 | 盾牌手 `shield` |
| 7 炸彈客 | 炸彈客 `bomber` |
| 8 擲彈兵 | 擲彈兵 `grenadier` |
| 9 飛仔 | 飛仔 `tumbler`、刀手 `rusher` |
| 10 狙擊手 | 狙擊手 `sniper` |
| 11 精英傘手 | 環形手 `ringer` |
| 12 精英舞獅手 | 螺旋手 `spiraler`、扇形手 `fanner` |
| 候選 | 機槍手 `hoser`、無人機 `drone` |

## 2. 共同規格

- **比例：** 頭身 6–6.5（動畫比例）；身高 1.78 米（保安大隻佬 2.2 米：遊戲現時放大 1.25 倍）。原點喺兩腳中間的地面，面向 +Z。
- **姿勢：** T-pose（或 A-pose），**空手、冇武器**：槍和配件係分開的模型，遊戲掛喺手上。
- **預算：** 敵人 5,000 三角形、頭目 10,000；一至兩個材質；貼圖 2048（入遊戲縮到 1024）。
- **顏色：** 平色，冇燒入光影（遊戲加賽璐璐）。**唔用功能色做主色**：黃白（敵人快彈）、粉紅（慢彈幕）、青白（玩家子彈）、純紅（紅線）；**唔用白色做主色**（全場只有玩家係白）。
- **剪影（`REDESIGN` §2，玩法要求）：** 俯視只見頭頂、肩、手臂、腳步，所以每種敵人要有一個由上面望落去都認得的輪廓（帽、肩、背囊、盾、傘、獅頭）同一隻主色。H① 的驗收係「俯視截圖一眼分得出」。
- **骨架：** 用工具的自動 rig（人形），骨名要 Mixamo 式，動作先套得落。
- **授權：** 免費方案的模型係公開、CC BY 4.0（要署名、人人下載得到）；**正式用的人物用付費方案生成**（Meshy、Tripo 付費方案都係私人、商用）。

## 3. 敵人（十二種）

主色係第一版建議，要等幫派的顏色定（`REDESIGN` §3 開發者填）再調：主色同幫派色要分得開，或者幫派色只做點綴。

| # | 名稱 | 題目（佢出的彈幕） | 外形 | 主色 | 配件（PROPS） | 俯視認得佢的地方 |
|---|---|---|---|---|---|---|
| 1 | 街頭打手 | 單發快彈、直線、多人成排 | T 恤、牛仔褲、波鞋 | 炭灰＋橙 | `gun_pistol` | 最普通的身形，做其他人的基準 |
| 2 | 步槍手 | 三連發、見同伴被抓就繞側 | 短夾克、鴨舌帽 | 紫 | `gun_rifle` | 帽頂、長槍 |
| 3 | 散彈手 | 近距離扇形、逼近 | 廚房圍裙、水靴 | 啡 | `gun_shotgun` | 圍裙 |
| 4 | 保安大隻佬 | 衝撞、吸彈、擋在前面 | 闊肩黑西裝、黑超 | 深藍黑 | 武器 F⑧ 定（JS 拎機槍） | 最闊的肩 |
| 5 | 疊碼仔頭 | 整隊同一拍齊射；倒下手下亂 | 長褸、墨鏡 | 酒紅 | `gun_pistol` × 2 | 長褸下擺 |
| 6 | 盾牌保安 | 正面免疫、推進、盾後有人 | 保安制服、頭盔 | 鋼藍 | `riot_shield`、`gun_pistol` | 方盾 |
| 7 | 炸彈客 | 走近自爆 | 背心、短褲 | 卡其 | `bomb_vest`、`detonator` | 背心上的燈 |
| 8 | 擲彈兵 | 弧線落點、紅圈、封區 | 工作服、手套 | 軍綠 | `grenade_bag`、`grenade` | 大背囊 |
| 9 | 飛仔 | 近身、翻滾躲子彈、快 | 電單車皮褸、頭巾 | 黑＋綠條 | `knife` | 瘦、頭巾 |
| 10 | 狙擊手 | 長紅線、一槍重傷 | 長雨褸、漁夫帽 | 深灰 | `gun_sniper` | 闊邊帽、最長的槍 |
| 11 | 精英：傘手 | 慢大彈幕環 | 改良唐裝 | 靛藍 | `elite_umbrella` | 傘面（由上面望落去就係佢） |
| 12 | 精英：舞獅手 | 螺旋或扇形的慢牆 | 舞獅褲、腰帶 | 綠 | `lion_head` | 獅頭 |

## 4. 頭目

2026-10-29 劇本初稿（`docs/STORY.md` §3）：五個頭目係真人秀劇組的五個部門，外形可以跟部門再加料（刀姐的分鏡紙、炮哥的炸藥箱、門神的場務對講機、長鏡揹住攝影機、選角陳拎住一疊試鏡相）；最終頭目係老大金爺。

| 名稱 | JS `boss.js` | 招式（照 D 組） | 外形 | 主色 | 配件（PROPS） |
|---|---|---|---|---|---|
| 刀后（刀姐，動作指導） | `blade` | 角落之間衝刺、飛刀、刀氣環 | 修身長外套、高馬尾 | 黑＋銀 | `twin_blades` |
| 重炮手（炮哥，爆破組長） | `gunner` | 掃射、慢彈幕牆、迫擊砲；背後係弱點 | 巨型工裝 | 鐵灰＋橙 | `heavy_gun`、`armour_plate` |
| 鐵盾（門神，場務） | `bulwark` | 撞盾、盾震慢彈環、左輪 | 重甲、頭盔 | 深綠 | `tower_shield`、`gun_revolver` |
| 長槍手（長鏡，攝影指導） | `marksman` | 六個角落換位、一發快彈沿紅線 | 長褸、闊邊帽 | 深藍 | `long_rifle` |
| 散彈手（選角陳，選角導演） | `buckshot` | 追住你、慢彈扇 | 皮褸、手套 | 啡＋橙 | `gun_double` |
| 最終頭目（金爺，監製兼莊家） | — | 未設計 | 金牙、金鏈、西裝，第二階段除西裝 | 黑＋金（金只做點綴、偏暗偏啡：黃白係敵人快彈的顏色） | — |
| 候選：DJ | `dj`（已退役，改人） | — | — | — | — |
| 候選：司機 | `truck`（已退役，改人） | — | — | — | — |

## 5. 動作（Mixamo，免費）

`REDESIGN` §7 的 Mixamo 清單係主角的；敵人和頭目要的少啲。瞄準、開槍的上身照 JS 版由程式（IK）做。

| 誰 | 動作 | 數 |
|---|---|---|
| 所有敵人 | idle、walk、run、strafe 左、strafe 右、hit、death × 2、被踢倒、起身、暈、被抓做人盾（掙扎） | 12 |
| 加 | 保安大隻佬：衝撞跑；疊碼仔頭：指揮手勢；盾牌保安：舉盾行；擲彈兵：擲；飛仔：翻滾、飛踢；精英：開傘、舞獅步 | 每種 0–2 |
| 頭目 | 敵人那 12 個，加每人四至六個招式（衝刺、撞、掃射、跪射、擲刀、挑釁） | 約 16 |

## 6. Prompt

先用 ChatGPT 出一張設定圖（正面、側面、背面，平色、灰底），滿意先交 Meshy／Tripo 做 image-to-3D（比純文字生成穩定，每個人物同一個畫風）。模板照 `REDESIGN` §7，加咗「空手」「由上面望認得」：

```text
anime style, cel shaded, [ROLE] of a fictional street gang in a Hong Kong / Macau style night city, [COLOUR] [CLOTHES], [WHAT MAKES HIM READ FROM ABOVE], 6.5 heads tall, clean silhouette readable from above, flat colors, empty hands, no weapon, no text, no logo, T-pose, full body, game character
```

| # | [ROLE] | [COLOUR] [CLOTHES] | [WHAT MAKES HIM READ FROM ABOVE] |
|---|---|---|---|
| 1 | street thug | charcoal grey t-shirt with orange trim, jeans, sneakers | short spiky hair, ordinary build |
| 2 | rifleman | purple short jacket, dark trousers | baseball cap |
| 3 | shotgunner | brown kitchen apron over a vest, rubber boots | apron straps across the back |
| 4 | security brute | navy-black suit straining at the shoulders, sunglasses | very broad shoulders, huge build |
| 5 | gang lieutenant | wine-red long coat, dark shirt, sunglasses | long coat tails |
| 6 | shield guard | steel-blue security uniform | round helmet, a strap on the left arm for a shield |
| 7 | bomber | khaki vest, shorts | wiry, bare arms |
| 8 | grenadier | army-green work overalls, gloves | broad back for a large backpack |
| 9 | knife punk | black leather biker jacket with green stripes | headband, lean |
| 10 | sniper | dark grey long rain coat | wide-brimmed bucket hat |
| 11 | elite umbrella fighter | indigo modern Chinese jacket | neat hair, a hand ready to hold an umbrella overhead |
| 12 | elite lion dancer | green lion-dance trousers, a wide sash | bare shoulders, a lion-dance head is added separately |
| 刀后 | blade queen boss | black long fitted coat with silver trim | high ponytail |
| 重炮手 | heavy gunner boss | iron-grey work overalls with orange straps | giant build |
| 鐵盾 | bulwark boss | dark green heavy armour pieces over a jacket | full helmet |
| 長槍手 | marksman boss | dark blue long coat | wide-brimmed hat |
| 散彈手 | shotgun boss | brown leather jacket, gloves | slicked-back hair |

## 7. 費用

### 7.1 價錢（2026-10 查）

**Meshy**（[meshy.ai/pricing](https://www.meshy.ai/pricing)、[每項功能的點數](https://docs.meshy.ai/en/api/pricing)）：

| 方案 | 月費 | 每月點數 | 授權 |
|---|---|---|---|
| Free | 0 | 100 | CC BY 4.0、公開 |
| Pro | US$20 | 1,000 | 私人、自己擁有 |
| Premium | US$40 | 3,000 | 同上 |
| Ultra | US$100 | 8,000 | 同上 |

| 功能（meshy-6／7.1） | 點數 |
|---|---|
| Image to 3D 連貼圖（2K／4K） | 30 |
| Image to 3D 只要模型 | 20 |
| Text to 3D：預覽 20 ＋ 貼圖 10 | 30 |
| Remesh（減到預算） | 5 |
| Auto-rigging | 5 |
| 動作（Meshy 自己的動作庫） | 每個 3 |

**Tripo**（[pricingsaas 2026-10-26 抄的價目](https://pricingsaas.com/companies/tripo3d)、[CostBench](https://costbench.com/software/ai-3d-generation/tripo-ai/)；官網 tripo3d.ai 查嗰陣上唔到）：Free 每月 200 點（公開、CC BY 4.0）；Pro US$20／月（年繳價）每月 3,000 點，官方換算約 200 個模型，即**一個模型約 15 點**；Max US$90／月 25,000 點。rig 和動作另外收點，每項幾多點官網冇公開（要入 Tripo 的控制台睇）。

### 7.2 假設

- 設定圖用 ChatGPT 出（已經有訂閱就唔使另外俾錢）。
- 每個敵人生成 **4 次**揀一個，每個頭目 **6 次**；揀中的做一次 remesh、一次 rig。
- 動作兩條路：**Mixamo**（免費）或者 **Meshy 動作庫**（敵人 12 個、頭目 16 個，每個 3 點）。
- 再加 **20%** 做重做和意外。
- 美元兌港幣 7.8。

### 7.3 計數（基本 18 個：12 敵人、6 頭目）

**Meshy：**

| | 每個 | 18 個 | 加 20% |
|---|---|---|---|
| 敵人，動作用 Mixamo | 4 × 30 + 5 + 5 = 130 | 12 × 130 = 1,560 | |
| 頭目，動作用 Mixamo | 6 × 30 + 5 + 5 = 190 | 6 × 190 = 1,140 | |
| **小計（Mixamo）** | | 2,700 | **約 3,250 點** |
| 敵人，動作用 Meshy | 130 + 12 × 3 = 166 | 12 × 166 = 1,992 | |
| 頭目，動作用 Meshy | 190 + 16 × 3 = 238 | 6 × 238 = 1,428 | |
| **小計（Meshy 動作）** | | 3,420 | **約 4,100 點** |
| 候選三個（機槍手、DJ、司機） | 166 + 2 × 238 | 642 | 約 770 點 |

| 揀法 | 點數 | 費用 |
|---|---|---|
| Mixamo 動作：Premium 一個月 + Pro 一個月 | 4,000 | **US$60（約 HK$470）** |
| Meshy 動作：Premium 一個月 + Pro 兩個月（或 Premium 兩個月） | 5,000–6,000 | **US$80（約 HK$620）** |
| 一個月做晒，連候選和重做：Ultra 一個月 | 8,000 | **US$100（約 HK$780）** |

**Tripo：** 生成 12 × 4 + 6 × 6 = 84 次 × 15 點 ≈ 1,260 點；rig 和動作照每個人物約 100 點估（未查證）再加 1,800 點 → 連 20% 約 3,700 點，即 **Pro 兩個月，約 US$40（約 HK$310）**；動作用 Mixamo、Tripo 只做 rig 的話（rig 照每個約 25 點估，同樣未查證），約 2,100 點，一個月 3,000 點夠用（**US$20**）。高清貼圖、低多邊形等選項可能另外收點。

**結論：** 18 個人物用 Meshy 約 **US$60–100**，用 Tripo 約 **US$20–40**。兩邊都係幾十美元，錢唔係問題；揀邊個睇質素（二次元畫風、乾淨的剪影、rig 準唔準），所以先試產再決定。真正的成本係時間：每個人物出設定圖、揀、檢查 rig 約一至兩個鐘，18 個大約三至四個工作天。（參考：人手外判建模加 rig，一個人物通常以幾百至幾千美元計，係一至兩個數量級的分別；呢個係行情的大約，未查證。）

### 7.4 未計在內

- 主角（開發者另計；用同一個工具約多 240 點）。
- 道具和武器：如果 ChatGPT 做唔掂要轉 Meshy，約多 US$80（[PROPS.md](PROPS.md) §10）。
- 每月點數用唔晒會唔會留到下個月、年繳有冇折扣：以官網為準。

## 8. 建議次序

1. **先填幫派色**（`REDESIGN` §3）：敵人的主色要同佢配。
2. **H① 試產三個**：街頭打手（基準身形）、盾牌保安（試配件掛手）、精英傘手（試精英的剪影）。**同一張設定圖，Meshy 同 Tripo 各做一次**，各付一個月 Pro（共 US$40），俯視截圖比較，再揀邊個做晒。
3. **先做定咗的：** 街頭打手、步槍手、散彈手、盾牌保安、炸彈客、擲彈兵、狙擊手，同五個頭目。
4. **F⑧ 做完先做：** 保安大隻佬、疊碼仔頭、飛仔、傘手、舞獅手（行為可能改，外形跟題目走）。
5. 最終頭目和三個候選：設計定咗先做。
