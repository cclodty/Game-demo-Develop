# 角色模型

把模型檔放在這個資料夾，重新建置後就會取代方塊暫用人形：

| 檔名 | 用途 |
| --- | --- |
| `player.glb` | 主角 |
| `zombie.glb` | 喪屍 |

- 也接受 `.gltf`（需為單一檔案、內嵌資料）與 `.fbx`。
- 模型需要有骨架與動作（至少待機、走或跑；最好有死亡與攻擊）。
- 載入時會自動縮放到 1.8 公尺、腳底貼地。動作依名稱自動辨識（idle、walk、run、death、attack、punch 等）。
- 自動辨識不準、模型面向不對或腳步打滑時，到 `src/entities/characterAssets.ts` 的 `MODEL_CONFIG` 調整。
- 只放授權允許的素材（例如 CC0），並在 `docs/m1/README.md` 的資源清冊記下來源。
