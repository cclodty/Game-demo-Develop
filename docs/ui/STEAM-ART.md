# Steam 商店同遊戲庫的圖

2026-11-03 · TASKS「I⓪」· 尺寸同規矩照 Steamworks 文件（[商店圖](https://partner.steamgames.com/doc/store/assets/standard)、[遊戲庫圖](https://partner.steamgames.com/doc/store/assets/libraryassets)；2024 年 8 月之後嘅尺寸，舊尺寸 Steam 唔再收）。上架前再對一次。

**風格（開發者 11-03 改）：** 第一版（詳細插畫：9527 開雙槍、望到塊面）「有點趕客」：塊面呆滯表情縮細之後似醉酒，細節又多。改做簡單嘅平面海報：黑底、一個大紅圓（射燈加紅色濾片／紅月）、9527 淨係一個白色剪影（認得出呆毛、大一個碼嘅西裝、甩咗嘅領呔、雙槍）、一圈定格子彈留一個缺口。四隻色：黑藍、戲棚紅、白、少少金；縮到好細都認得。

**做法：** 交 ChatGPT 出四張冇字嘅圖（`docs/ui/steam-store-art.txt`），之後由 Claude 用遊戲字體（昭源宋體、Bebas Neue，`docs/ui/TITLE.md` §3）加標誌、裁切、放大。AI 唔畫字：中文字會錯，而 Steam 規定圖入面除咗遊戲名之外唔可以有其他字。

| 圖 | 尺寸（px） | 必要 | 標誌 | 由邊張圖嚟 |
|---|---|---|---|---|
| 商店：Header Capsule | 920 × 430 | 要 | 要，清楚 | 提示詞 1（裁做 2.14:1） |
| 商店：Small Capsule | 462 × 174 | 要 | 要，差唔多填滿成張 | 提示詞 1（大部份係標誌，圖做底） |
| 商店：Main Capsule | 1232 × 706 | 要 | 要 | 提示詞 1 |
| 商店：Vertical Capsule | 748 × 896 | 要 | 要 | 提示詞 3（裁做 5:6） |
| 商店：Page Background | 1438 × 810 | 可選 | 唔使 | 標題主視覺，壓暗 |
| 商店：Screenshots | 1920 × 1080 或以上，16:9，最少 5 張 | 要 | 唔准有字 | 遊戲畫面（只可以係玩緊嘅畫面，唔可以係過場或者宣傳圖） |
| 遊戲庫：Library Capsule | 600 × 900 | 要 | 要 | 提示詞 3 |
| 遊戲庫：Library Header | 920 × 430 | 要（冇就用 Header Capsule） | 要 | 同 Header Capsule |
| 遊戲庫：Library Hero | 3840 × 1240 | 要 | **唔准有任何字**；中間 860 × 380（以 1920 × 620 計）係安全區，主角塊面要喺入面 | 提示詞 2（裁做 3.1:1，放大） |
| 遊戲庫：Library Logo | 1280 闊及／或 720 高，透明 PNG | 要 | 淨係遊戲名嘅字款（加一個標記都得），擺喺 Hero 上面 | Claude 用字體整 |
| 社群圖示 | 184 × 184（上架前再對） | 要 | 唔使 | 提示詞 4 |

- **遊戲名：** 中文「子彈芭蕾」、英文「DIE IN STYLE」（`docs/ui/TITLE.md` §3）。商店圖用中英兩行；Small Capsule 細，可能淨係英文或淨係中文，出圖之後試。
- **解像度：** ChatGPT 出嘅圖大約 1672 × 941；Library Hero 要 3840 闊，要用 AI 放大（動畫圖用 Real-ESRGAN anime 之類效果好）或者叫 ChatGPT 出最大尺寸。
- **截圖**要 Godot 版有得玩先影（G 組之後），唔喺呢張卡。
