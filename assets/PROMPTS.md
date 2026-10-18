# 3D 模型提示詞清單

> 這個檔案由 `src/asset-manifest.js` 自動生成（`npm run assets:docs`）。要改內容請改那個檔案再重新生成，不要直接改這裡。
> 尺寸、比例和交付格式的完整說明見 [SPEC.md](SPEC.md)。

## 用法

1. 每件物件有兩段英文提示詞（生成工具對英文最準確，整段複製即可）：
   - **① 參考圖**：先生成設定圖，滿意了再做模型。
   - **② 3D 模型**：用設定圖生成模型。人物這一段還包括綁骨和動作。
2. 完成後把檔案放進「交付」那一格的位置，告訴 Claude 處理。
3. 先做優先 1，再做 2、3。同一類東西（例如全部敵人）最好在同一個對話裡連續做，風格才會統一。
4. 想調整外觀，可以在提示詞後面加自己的要求，但**尺寸、方向、原點、貼圖格式**這幾句不要刪，遊戲和日後轉引擎都靠它們。

## 總覽

| 類別 | 件數 | 優先 1 | 優先 2 | 優先 3 |
|---|---|---|---|---|
| [人物](#characters) | 6 | 1 | 5 | 0 |
| [武器](#weapons) | 10 | 3 | 6 | 1 |
| [共用道具（多張地圖都有）](#props) | 6 | 5 | 1 | 0 |
| [霓虹天台](#rooftop) | 7 | 0 | 4 | 3 |
| [脈衝夜店](#club) | 11 | 0 | 3 | 8 |
| [七號碼頭](#docks) | 8 | 1 | 0 | 7 |
| [議事亭前地](#senado) | 13 | 4 | 4 | 5 |
| [議事亭前地：地標建築](#landmarks) | 6 | 0 | 3 | 3 |
| [地面與牆身材質（無縫平鋪貼圖）](#materials) | 5 | 1 | 2 | 2 |
| **合計** | **72** | | | |

<a id="characters"></a>

## 人物

### `hero` 主角 · 優先 1

| | |
|---|---|
| 尺寸 | 身高 1.78 米，約 0.55 米寬（遊戲裡同樣大小） |
| 母版（高質量） | 約 50,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 腳本自動減到 10,000 面、1024 貼圖 |
| 交付 | `assets/source/hero/hero.glb` + `hero.fbx` + `textures/` + `reference/` |

> 外觀、性別可以自由決定，但要保留青綠色（teal / cyan）作主色：遊戲裡主角的光圈、子彈和瞄準線都是這個顏色。

**① 參考圖**

```text
Character turnaround sheet for a game: the player character, a young agent in a teal bomber jacket with cyan piping, dark navy slim trousers, white sneakers, fingerless gloves, short black hair, with a confident athletic build. Full body in an A-pose (arms about 45 degrees down), empty hands, front, side and back views side by side, plain light grey background, even neutral lighting, no text or labels. Height 1.78 m with realistic adult proportions (about 7.5 heads tall); the silhouette and colour blocks must stay readable when seen from above at a distance. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型＋綁骨＋動作**

```text
Build a high-quality rigged 3D game character from the turnaround sheet: the player character, a young agent in a teal bomber jacket with cyan piping, dark navy slim trousers, white sneakers, fingerless gloves, short black hair, with a confident athletic build. Units are metres, Y is up and the front faces +Z; put the origin on the ground between the feet. Real size: 0.55 m wide (X) by 0.35 m deep (Z) by 1.78 m tall (Y). Clean topology of about 50,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Rig it with a standard humanoid skeleton using Mixamo-style bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase and the Right equivalents, plus fingers); every character in this game uses the same skeleton. Good skin weights at the shoulders, elbows, hips and knees. Animations, in place with no root motion, each as its own named clip: idle, run, death (required); walk, strafe_left, strafe_right, run_backward, kick, hit_react, dodge_roll, dive, climb_up, reload, melee_slash (if possible). No weapon in the hands. Export one GLB with the textures embedded, the skeleton and all animations, and the same model as FBX; also save the textures as separate PNG files.
```

### `grunt` 打手 THUG · 優先 2

| | |
|---|---|
| 尺寸 | 身高 1.78 米，約 0.55 米寬（遊戲裡同樣大小） |
| 母版（高質量） | 約 40,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 腳本自動減到 6,000 面、1024 貼圖 |
| 交付 | `assets/source/grunt/grunt.glb` + `grunt.fbx` + `textures/` + `reference/` |

> 敵人的主色是紅色系；最常見的敵人，要一眼認得出。

**① 參考圖**

```text
Character turnaround sheet for a game: street gang thug in a charcoal hoodie, dark jeans, worn trainers, red bandana around the neck, short dyed dark-red hair. Full body in an A-pose (arms about 45 degrees down), empty hands, front, side and back views side by side, plain light grey background, even neutral lighting, no text or labels. Height 1.78 m with realistic adult proportions (about 7.5 heads tall); the silhouette and colour blocks must stay readable when seen from above at a distance. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型＋綁骨＋動作**

```text
Build a high-quality rigged 3D game character from the turnaround sheet: street gang thug in a charcoal hoodie, dark jeans, worn trainers, red bandana around the neck, short dyed dark-red hair. Units are metres, Y is up and the front faces +Z; put the origin on the ground between the feet. Real size: 0.55 m wide (X) by 0.35 m deep (Z) by 1.78 m tall (Y). Clean topology of about 40,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Rig it with a standard humanoid skeleton using Mixamo-style bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase and the Right equivalents, plus fingers); every character in this game uses the same skeleton. Good skin weights at the shoulders, elbows, hips and knees. Animations, in place with no root motion, each as its own named clip: idle, run, death (required); walk, strafe_left, strafe_right, run_backward, kick, hit_react, dodge_roll, dive, climb_up, reload, melee_slash (if possible). No weapon in the hands. Export one GLB with the textures embedded, the skeleton and all animations, and the same model as FBX; also save the textures as separate PNG files.
```

### `shotgun` 散彈手 SHOTGUNNER · 優先 2

| | |
|---|---|
| 尺寸 | 身高 1.78 米，約 0.62 米寬（遊戲裡同樣大小） |
| 母版（高質量） | 約 40,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 腳本自動減到 6,000 面、1024 貼圖 |
| 交付 | `assets/source/shotgun/shotgun.glb` + `shotgun.fbx` + `textures/` + `reference/` |

> 主色橙色；體型比打手壯。

**① 參考圖**

```text
Character turnaround sheet for a game: stocky gang enforcer in a worn brown leather jacket over a vest, dark brown trousers, boots, orange cap, broad shoulders. Full body in an A-pose (arms about 45 degrees down), empty hands, front, side and back views side by side, plain light grey background, even neutral lighting, no text or labels. Height 1.78 m with realistic adult proportions (about 7.5 heads tall); the silhouette and colour blocks must stay readable when seen from above at a distance. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型＋綁骨＋動作**

```text
Build a high-quality rigged 3D game character from the turnaround sheet: stocky gang enforcer in a worn brown leather jacket over a vest, dark brown trousers, boots, orange cap, broad shoulders. Units are metres, Y is up and the front faces +Z; put the origin on the ground between the feet. Real size: 0.62 m wide (X) by 0.4 m deep (Z) by 1.78 m tall (Y). Clean topology of about 40,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Rig it with a standard humanoid skeleton using Mixamo-style bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase and the Right equivalents, plus fingers); every character in this game uses the same skeleton. Good skin weights at the shoulders, elbows, hips and knees. Animations, in place with no root motion, each as its own named clip: idle, run, death (required); walk, strafe_left, strafe_right, run_backward, kick, hit_react, dodge_roll, dive, climb_up, reload, melee_slash (if possible). No weapon in the hands. Export one GLB with the textures embedded, the skeleton and all animations, and the same model as FBX; also save the textures as separate PNG files.
```

### `rifle` 步槍手 RIFLEMAN · 優先 2

| | |
|---|---|
| 尺寸 | 身高 1.78 米，約 0.55 米寬（遊戲裡同樣大小） |
| 母版（高質量） | 約 40,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 腳本自動減到 6,000 面、1024 貼圖 |
| 交付 | `assets/source/rifle/rifle.glb` + `rifle.fbx` + `textures/` + `reference/` |

> 主色紫色；遠距離射手，裝備感較重。

**① 參考圖**

```text
Character turnaround sheet for a game: mercenary in a dark purple-grey tactical jacket with pouches, cargo trousers, combat boots, violet armband, beret. Full body in an A-pose (arms about 45 degrees down), empty hands, front, side and back views side by side, plain light grey background, even neutral lighting, no text or labels. Height 1.78 m with realistic adult proportions (about 7.5 heads tall); the silhouette and colour blocks must stay readable when seen from above at a distance. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型＋綁骨＋動作**

```text
Build a high-quality rigged 3D game character from the turnaround sheet: mercenary in a dark purple-grey tactical jacket with pouches, cargo trousers, combat boots, violet armband, beret. Units are metres, Y is up and the front faces +Z; put the origin on the ground between the feet. Real size: 0.55 m wide (X) by 0.35 m deep (Z) by 1.78 m tall (Y). Clean topology of about 40,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Rig it with a standard humanoid skeleton using Mixamo-style bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase and the Right equivalents, plus fingers); every character in this game uses the same skeleton. Good skin weights at the shoulders, elbows, hips and knees. Animations, in place with no root motion, each as its own named clip: idle, run, death (required); walk, strafe_left, strafe_right, run_backward, kick, hit_react, dodge_roll, dive, climb_up, reload, melee_slash (if possible). No weapon in the hands. Export one GLB with the textures embedded, the skeleton and all animations, and the same model as FBX; also save the textures as separate PNG files.
```

### `rusher` 刀手 BLADE · 優先 2

| | |
|---|---|
| 尺寸 | 身高 1.78 米，約 0.5 米寬（遊戲裡同樣大小） |
| 母版（高質量） | 約 40,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 腳本自動減到 6,000 面、1024 貼圖 |
| 交付 | `assets/source/rusher/rusher.glb` + `rusher.fbx` + `textures/` + `reference/` |

> 主色洋紅；身形最瘦、最快，衝過來近身斬。

**① 參考圖**

```text
Character turnaround sheet for a game: lean agile assassin in fitted black clothes, magenta scarf covering the lower face, light shoes, wrapped forearms. Full body in an A-pose (arms about 45 degrees down), empty hands, front, side and back views side by side, plain light grey background, even neutral lighting, no text or labels. Height 1.78 m with realistic adult proportions (about 7.5 heads tall); the silhouette and colour blocks must stay readable when seen from above at a distance. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型＋綁骨＋動作**

```text
Build a high-quality rigged 3D game character from the turnaround sheet: lean agile assassin in fitted black clothes, magenta scarf covering the lower face, light shoes, wrapped forearms. Units are metres, Y is up and the front faces +Z; put the origin on the ground between the feet. Real size: 0.5 m wide (X) by 0.3 m deep (Z) by 1.78 m tall (Y). Clean topology of about 40,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Rig it with a standard humanoid skeleton using Mixamo-style bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase and the Right equivalents, plus fingers); every character in this game uses the same skeleton. Good skin weights at the shoulders, elbows, hips and knees. Animations, in place with no root motion, each as its own named clip: idle, run, death (required); walk, strafe_left, strafe_right, run_backward, kick, hit_react, dodge_roll, dive, climb_up, reload, melee_slash (if possible). No weapon in the hands. Export one GLB with the textures embedded, the skeleton and all animations, and the same model as FBX; also save the textures as separate PNG files.
```

### `brute` 大隻佬 BRUTE · 優先 2

| | |
|---|---|
| 尺寸 | 身高 1.78 米，約 0.75 米寬（遊戲裡放大到約 2.2 米） |
| 母版（高質量） | 約 40,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 腳本自動減到 8,000 面、1024 貼圖 |
| 交付 | `assets/source/brute/brute.glb` + `brute.fbx` + `textures/` + `reference/` |

> 照樣做 1.78 米高，遊戲會放大 1.25 倍成約 2.2 米。手持機槍（武器另做）。

**① 參考圖**

```text
Character turnaround sheet for a game: huge heavy enforcer in a grey armoured vest over a black shirt, thick arms, heavy boots, buzz cut, red shoulder patches. Full body in an A-pose (arms about 45 degrees down), empty hands, front, side and back views side by side, plain light grey background, even neutral lighting, no text or labels. Height 1.78 m with realistic adult proportions (about 7.5 heads tall); the silhouette and colour blocks must stay readable when seen from above at a distance. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型＋綁骨＋動作**

```text
Build a high-quality rigged 3D game character from the turnaround sheet: huge heavy enforcer in a grey armoured vest over a black shirt, thick arms, heavy boots, buzz cut, red shoulder patches. Units are metres, Y is up and the front faces +Z; put the origin on the ground between the feet. Real size: 0.75 m wide (X) by 0.45 m deep (Z) by 1.78 m tall (Y). Clean topology of about 40,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Rig it with a standard humanoid skeleton using Mixamo-style bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase and the Right equivalents, plus fingers); every character in this game uses the same skeleton. Good skin weights at the shoulders, elbows, hips and knees. Animations, in place with no root motion, each as its own named clip: idle, run, death (required); walk, strafe_left, strafe_right, run_backward, kick, hit_react, dodge_roll, dive, climb_up, reload, melee_slash (if possible). No weapon in the hands. Export one GLB with the textures embedded, the skeleton and all animations, and the same model as FBX; also save the textures as separate PNG files.
```

<a id="weapons"></a>

## 武器

### `weapon_pistol` 手槍（主角雙槍、打手） · 優先 1

| | |
|---|---|
| 尺寸 | 長 0.3 × 寬 0.07 × 高 0.16 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 1,200 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_pistol/weapon_pistol.glb` + `weapon_pistol.fbx` + `textures/` + `reference/` |

> 主角左右手各拿一把，同一個模型鏡像使用。

**① 參考圖**

```text
Game weapon concept sheet: compact modern semi-automatic pistol, matte black slide with a thin cyan accent line. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 0.3 m, height 0.16 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: compact modern semi-automatic pistol, matte black slide with a thin cyan accent line. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.07 m wide (X) by 0.3 m deep (Z) by 0.16 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_muzzle at (0, 0.05, 0.3). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_shotgun` 散彈槍 · 優先 1

| | |
|---|---|
| 尺寸 | 長 1.3 × 寬 0.12 × 高 0.22 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 2,000 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_shotgun/weapon_shotgun.glb` + `weapon_shotgun.fbx` + `textures/` + `reference/` |

> 原點在握把（扳機位置），槍托向後伸約 0.38 米。

**① 參考圖**

```text
Game weapon concept sheet: pump-action shotgun with a wooden pump and stock, dark steel barrel and magazine tube. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 1.3 m, height 0.22 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: pump-action shotgun with a wooden pump and stock, dark steel barrel and magazine tube. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.12 m wide (X) by 1.3 m deep (Z) by 0.22 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_muzzle at (0, 0.12, 0.94), socket_support at (0, 0.01, 0.44). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_rifle` 突擊步槍 · 優先 1

| | |
|---|---|
| 尺寸 | 長 1.15 × 寬 0.11 × 高 0.3 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 2,000 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_rifle/weapon_rifle.glb` + `weapon_rifle.fbx` + `textures/` + `reference/` |

**① 參考圖**

```text
Game weapon concept sheet: modern assault rifle with a short scope rail, curved magazine and adjustable stock, black with a violet accent. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 1.15 m, height 0.3 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: modern assault rifle with a short scope rail, curved magazine and adjustable stock, black with a violet accent. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.11 m wide (X) by 1.15 m deep (Z) by 0.3 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_muzzle at (0, 0.15, 0.78), socket_support at (0, 0.08, 0.32). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_smg` 衝鋒槍（雙持） · 優先 2

| | |
|---|---|
| 尺寸 | 長 0.42 × 寬 0.09 × 高 0.3 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 1,500 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_smg/weapon_smg.glb` + `weapon_smg.fbx` + `textures/` + `reference/` |

**① 參考圖**

```text
Game weapon concept sheet: compact submachine gun with a straight magazine and folded stock, dark gunmetal with a small cyan accent. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 0.42 m, height 0.3 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: compact submachine gun with a straight magazine and folded stock, dark gunmetal with a small cyan accent. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.09 m wide (X) by 0.42 m deep (Z) by 0.3 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_muzzle at (0, 0.05, 0.42). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_sniper` 狙擊槍 · 優先 2

| | |
|---|---|
| 尺寸 | 長 1.6 × 寬 0.1 × 高 0.25 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 2,500 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_sniper/weapon_sniper.glb` + `weapon_sniper.fbx` + `textures/` + `reference/` |

**① 參考圖**

```text
Game weapon concept sheet: long bolt-action sniper rifle with a large scope and a long fluted barrel, dark green-grey. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 1.6 m, height 0.25 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: long bolt-action sniper rifle with a large scope and a long fluted barrel, dark green-grey. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.1 m wide (X) by 1.6 m deep (Z) by 0.25 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_muzzle at (0, 0.06, 1.31), socket_support at (0, 0.02, 0.4), socket_scope at (0, 0.13, 0.15). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_launcher` 榴彈發射器 · 優先 2

| | |
|---|---|
| 尺寸 | 長 0.9 × 寬 0.28 × 高 0.3 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 2,000 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_launcher/weapon_launcher.glb` + `weapon_launcher.fbx` + `textures/` + `reference/` |

**① 參考圖**

```text
Game weapon concept sheet: single-shot grenade launcher with a wide barrel, pistol grip and folding stock, olive drab with an orange muzzle ring. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 0.9 m, height 0.3 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: single-shot grenade launcher with a wide barrel, pistol grip and folding stock, olive drab with an orange muzzle ring. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.28 m wide (X) by 0.9 m deep (Z) by 0.3 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_muzzle at (0, 0.03, 0.78), socket_support at (0, -0.02, 0.4). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_minigun` 機槍（大隻佬） · 優先 2

| | |
|---|---|
| 尺寸 | 長 1.2 × 寬 0.34 × 高 0.34 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 3,000 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_minigun/weapon_minigun.glb` + `weapon_minigun.fbx` + `textures/` + `reference/` |

> 原點在後握把；在胸前雙手持。

**① 參考圖**

```text
Game weapon concept sheet: heavy six-barrel rotary minigun with a rear handle and a top carry handle, gunmetal with a red ring at the muzzle. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 1.2 m, height 0.34 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: heavy six-barrel rotary minigun with a rear handle and a top carry handle, gunmetal with a red ring at the muzzle. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.34 m wide (X) by 1.2 m deep (Z) by 0.34 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_muzzle at (0.16, 0.1, 1), socket_support at (0.32, 0.1, 0.3). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_blade` 刀（刀手） · 優先 2

| | |
|---|---|
| 尺寸 | 長 0.8 × 寬 0.05 × 高 0.08 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 800 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_blade/weapon_blade.glb` + `weapon_blade.fbx` + `textures/` + `reference/` |

**① 參考圖**

```text
Game weapon concept sheet: short straight machete-like blade with a wrapped handle, the edge catching a magenta glint. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 0.8 m, height 0.08 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: short straight machete-like blade with a wrapped handle, the edge catching a magenta glint. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.05 m wide (X) by 0.8 m deep (Z) by 0.08 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Add empty helper nodes, positions in metres from the origin as (X, Y, Z): socket_tip at (0, 0, 0.62). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_shield` 防暴盾（盾牌手） · 優先 2

| | |
|---|---|
| 尺寸 | 長 0.06 × 寬 0.62 × 高 1.05 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 600 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_shield/weapon_shield.glb` + `weapon_shield.fbx` + `textures/` + `reference/` |

> 盾牌手左手持在身前；遊戲現在用一塊方塊盾，模型做好就換上。

**① 參考圖**

```text
Game weapon concept sheet: clear dark polycarbonate riot shield with a yellow reflective rim, a horizontal yellow band and a grip on the back. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 0.06 m, height 1.05 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: clear dark polycarbonate riot shield with a yellow reflective rim, a horizontal yellow band and a grip on the back. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.62 m wide (X) by 0.06 m deep (Z) by 1.05 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `weapon_grenade` 榴彈（發射器的彈） · 優先 3

| | |
|---|---|
| 尺寸 | 長 0.12 × 寬 0.08 × 高 0.08 米（原點在主握把） |
| 母版（高質量） | 約 12,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 300 面、256 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/weapon_grenade/weapon_grenade.glb` + `weapon_grenade.fbx` + `textures/` + `reference/` |

**① 參考圖**

```text
Game weapon concept sheet: 40 mm grenade round with an orange tip band. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length 0.12 m, height 0.08 m. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D game weapon from the concept sheet: 40 mm grenade round with an orange tip band. Units are metres, Y is up and the front faces +Z; put the origin at the main hand grip, with the barrel or blade pointing along +Z. Real size: 0.08 m wide (X) by 0.12 m deep (Z) by 0.08 m tall (Y). Clean topology of about 12,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

<a id="props"></a>

## 共用道具（多張地圖都有）

### `crate` 木箱（掩體，可被打出木屑） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 1.4 × 深 1.4 × 高 1.3 米 |
| 用量 | 天台 7、碼頭 5、議事亭 6（共 18） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 800 面、512 貼圖 |
| 交付 | `assets/source/crate/crate.glb` + `textures/` + `reference/` |

> 遊戲會把它伸縮到 1.0–2.0 米不同大小，所以花紋不要太依賴比例。

**① 參考圖**

```text
Game asset concept sheet: weathered wooden shipping crate made of planks with dark metal corner brackets and stencilled markings. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.4 m wide, 1.4 m deep, 1.3 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: weathered wooden shipping crate made of planks with dark metal corner brackets and stencilled markings. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.4 m wide (X) by 1.4 m deep (Z) by 1.3 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `barrel` 紅色油桶（一槍爆炸） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 0.9 × 深 0.9 × 高 1.23 米 |
| 用量 | 天台 7、夜店 3、碼頭 5、議事亭 2（共 17） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 800 面、512 貼圖 |
| 交付 | `assets/source/barrel/barrel.glb` + `textures/` + `reference/` |

> 一定要一眼看出「會爆」：鮮紅、危險標誌。

**① 參考圖**

```text
Game asset concept sheet: bright red 200 litre steel oil drum with ribbed bands, a yellow-black hazard stripe and a flammable warning label. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.9 m wide, 0.9 m deep, 1.23 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: bright red 200 litre steel oil drum with ribbed bands, a yellow-black hazard stripe and a flammable warning label. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.9 m wide (X) by 0.9 m deep (Z) by 1.23 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `gas` 大氣罐（大爆炸） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 1.16 × 深 1.16 × 高 1.8 米 |
| 用量 | 夜店 2、碼頭 4、議事亭 2（共 8） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,000 面、512 貼圖 |
| 交付 | `assets/source/gas/gas.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: large white industrial compressed gas tank, a wide vertical cylinder with a red band, a valve and pressure gauge on top and hazard labels. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.16 m wide, 1.16 m deep, 1.8 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: large white industrial compressed gas tank, a wide vertical cylinder with a red band, a valve and pressure gauge on top and hazard labels. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.16 m wide (X) by 1.16 m deep (Z) by 1.8 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `pan` 平底鑊（子彈打中會反彈） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 0.82 × 深 1.31 × 高 0.1 米 |
| 用量 | 天台 6、碼頭 5、議事亭 8（共 19） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 600 面、512 貼圖 |
| 交付 | `assets/source/pan/pan.glb` + `textures/` + `reference/` |

> 平放，手柄指向 +Z。遊戲會在邊緣加金色光圈提示可反彈。

**① 參考圖**

```text
Game asset concept sheet: black cast iron frying pan with a long straight handle, lying flat, polished steel rim. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.82 m wide, 1.31 m deep, 0.1 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: black cast iron frying pan with a long straight handle, lying flat, polished steel rim. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.82 m wide (X) by 1.31 m deep (Z) by 0.1 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `concrete` 混凝土路障（一節） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 2 × 深 0.6 × 高 1.1 米（一節；遊戲按長度重複） |
| 用量 | 天台 3、議事亭 2（共 5） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 500 面、512 貼圖 |
| 交付 | `assets/source/concrete/concrete.glb` + `textures/` + `reference/` |

> 做一節 2 米；遊戲會按長度重複排列（3–7 米）。兩端要能接駁。

**① 參考圖**

```text
Game asset concept sheet: one 2 m section of a grey concrete jersey road barrier with chipped edges, lifting slots and faded reflective strips. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 2 m wide, 0.6 m deep, 1.1 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 2 m section of a grey concrete jersey road barrier with chipped edges, lifting slots and faded reflective strips. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 2 m wide (X) by 0.6 m deep (Z) by 1.1 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `pillar` 霓虹柱 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 1 × 深 1 × 高 3.4 米 |
| 用量 | 天台 2、夜店 4（共 6） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 800 面、512 貼圖 |
| 交付 | `assets/source/pillar/pillar.glb` + `textures/` + `reference/` |

> 頂部霓虹環要用 emissive（自發光）貼圖。

**① 參考圖**

```text
Game asset concept sheet: square concrete column with steel corner guards and a glowing neon cap ring at the top. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1 m wide, 1 m deep, 3.4 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: square concrete column with steel corner guards and a glowing neon cap ring at the top. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1 m wide (X) by 1 m deep (Z) by 3.4 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

<a id="rooftop"></a>

## 霓虹天台

### `unit` 天台冷氣機 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 2.8 × 深 1.8 × 高 1.5 米 |
| 用量 | 天台 4（共 4） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,000 面、512 貼圖 |
| 交付 | `assets/source/unit/unit.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: rooftop air conditioning condenser unit, a galvanised metal box with louvred sides, a large round fan grill on top and pipes running out of one side. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 2.8 m wide, 1.8 m deep, 1.5 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: rooftop air conditioning condenser unit, a galvanised metal box with louvred sides, a large round fan grill on top and pipes running out of one side. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 2.8 m wide (X) by 1.8 m deep (Z) by 1.5 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `hut` 天台樓梯屋（敵人從門出） · 優先 2

| | |
|---|---|
| 尺寸 | 寬 4 × 深 3 × 高 2.9 米 |
| 用量 | 天台 2（共 2） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,500 面、1024 貼圖 |
| 交付 | `assets/source/hut/hut.glb` + `textures/` + `reference/` |

> 門在 +Z（正面）；門 1.3 × 2.1 米。

**① 參考圖**

```text
Game asset concept sheet: small rooftop stairwell hut, painted concrete walls with grime streaks, a steel door on the front face, a flat roof with a small overhang and a caged lamp above the door. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4 m wide, 3 m deep, 2.9 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: small rooftop stairwell hut, painted concrete walls with grime streaks, a steel door on the front face, a flat roof with a small overhang and a caged lamp above the door. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4 m wide (X) by 3 m deep (Z) by 2.9 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `rooftop_parapet` 天台矮牆（一節） · 優先 2

| | |
|---|---|
| 尺寸 | 寬 4 × 深 0.4 × 高 1 米 |
| 用量 | 天台 37（共 37） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 400 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/rooftop_parapet/rooftop_parapet.glb` + `textures/` + `reference/` |

> 天台四周一圈，約 37 節；兩端要能無縫接駁；霓虹條用自發光。

**① 參考圖**

```text
Game asset concept sheet: one 4 m section of a rooftop parapet wall, rough concrete with a metal coping on top and a thin neon strip along the inner face. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4 m wide, 0.4 m deep, 1 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 4 m section of a rooftop parapet wall, rough concrete with a metal coping on top and a thin neon strip along the inner face. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4 m wide (X) by 0.4 m deep (Z) by 1 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `door_single` 鐵門（天台、夜店的敵人出生門） · 優先 2

| | |
|---|---|
| 尺寸 | 寬 1.3 × 深 0.2 × 高 2.1 米 |
| 用量 | 天台 2、夜店 4（共 6） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 500 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/door_single/door_single.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: single steel service door in a frame, scuffed paint, push bar, small wired-glass window and a red exit lamp above. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.3 m wide, 0.2 m deep, 2.1 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: single steel service door in a frame, scuffed paint, push bar, small wired-glass window and a red exit lamp above. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.3 m wide (X) by 0.2 m deep (Z) by 2.1 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `rooftop_billboard` 天台霓虹廣告牌架 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 13.4 × 深 0.6 × 高 5 米 |
| 用量 | 天台 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 3,000 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/rooftop_billboard/rooftop_billboard.glb` + `textures/` + `reference/` |

> 只做支架和空白面板；「子彈芭蕾」霓虹字由遊戲畫上去。

**① 參考圖**

```text
Game asset concept sheet: large rooftop billboard frame: a steel truss structure on two legs holding a 13 m by 3.5 m sign panel, with service catwalk and lamps. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 13.4 m wide, 0.6 m deep, 5 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: large rooftop billboard frame: a steel truss structure on two legs holding a 13 m by 3.5 m sign panel, with service catwalk and lamps. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 13.4 m wide (X) by 0.6 m deep (Z) by 5 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `rooftop_lightmast` 天台角落燈柱 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 0.6 × 深 0.3 × 高 4.3 米 |
| 用量 | 天台 4（共 4） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 500 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/rooftop_lightmast/rooftop_lightmast.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: slim steel light mast with a horizontal cyan neon light bar on top. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.6 m wide, 0.3 m deep, 4.3 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: slim steel light mast with a horizontal cyan neon light bar on top. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.6 m wide (X) by 0.3 m deep (Z) by 4.3 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `city_tower` 背景高樓（三款） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 10 × 深 10 × 高 60 米 |
| 用量 | 天台 80（共 80） |
| 母版（高質量） | 約 10,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 2,000 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/city_tower/city_tower.glb` + `textures/` + `reference/` |

> 遠景，在天台下方大量重複；細節可以少，但窗燈要好看。

**① 參考圖**

```text
Game asset concept sheet: set of three simple background skyscraper blocks of different styles (glass curtain wall, concrete with balconies, tiled residential), with night window lights as an emissive texture. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 10 m wide, 10 m deep, 60 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: set of three simple background skyscraper blocks of different styles (glass curtain wall, concrete with balconies, tiled residential), with night window lights as an emissive texture. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 10 m wide (X) by 10 m deep (Z) by 60 m tall (Y). Clean topology of about 10,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

<a id="club"></a>

## 脈衝夜店

### `tray` 酒吧托盤（子彈打中會反彈） · 優先 2

| | |
|---|---|
| 尺寸 | 寬 0.82 × 深 0.82 × 高 0.1 米 |
| 用量 | 夜店 6（共 6） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 300 面、512 貼圖 |
| 交付 | `assets/source/tray/tray.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: round polished stainless steel bar serving tray lying flat. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.82 m wide, 0.82 m deep, 0.1 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: round polished stainless steel bar serving tray lying flat. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.82 m wide (X) by 0.82 m deep (Z) by 0.1 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `speaker` 夜店喇叭 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 1.2 × 深 1.2 × 高 2.2 米 |
| 用量 | 夜店 4（共 4） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 800 面、512 貼圖 |
| 交付 | `assets/source/speaker/speaker.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: tall black nightclub speaker stack with two large woofers, a horn tweeter, metal grilles and corner protectors. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.2 m wide, 1.2 m deep, 2.2 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: tall black nightclub speaker stack with two large woofers, a horn tweeter, metal grilles and corner protectors. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.2 m wide (X) by 1.2 m deep (Z) by 2.2 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `bar` 吧枱（一節） · 優先 2

| | |
|---|---|
| 尺寸 | 寬 2.5 × 深 1.2 × 高 1.2 米（一節；遊戲按長度重複） |
| 用量 | 夜店 3（共 3） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,000 面、1024 貼圖 |
| 交付 | `assets/source/bar/bar.glb` + `textures/` + `reference/` |

> 做一節，遊戲排成 3–10 米長的吧枱；正面（+Z）向客人。

**① 參考圖**

```text
Game asset concept sheet: one 2.5 m section of a nightclub bar counter: dark wood front with a pink neon strip near the top, polished metal top, a footrail. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 2.5 m wide, 1.2 m deep, 1.2 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 2.5 m section of a nightclub bar counter: dark wood front with a pink neon strip near the top, polished metal top, a footrail. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 2.5 m wide (X) by 1.2 m deep (Z) by 1.2 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `sofa` 卡位沙發（一節） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 2.4 × 深 1.4 × 高 0.9 米（一節；遊戲按長度重複） |
| 用量 | 夜店 3（共 3） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,000 面、1024 貼圖 |
| 交付 | `assets/source/sofa/sofa.glb` + `textures/` + `reference/` |

> 靠背在 -Z，坐的一面向 +Z。

**① 參考圖**

```text
Game asset concept sheet: one 2.4 m section of a nightclub booth sofa, tufted purple leather seat and low backrest, chrome base. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 2.4 m wide, 1.4 m deep, 0.9 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 2.4 m section of a nightclub booth sofa, tufted purple leather seat and low backrest, chrome base. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 2.4 m wide (X) by 1.4 m deep (Z) by 0.9 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `table` 酒枱 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 1 × 深 1.2 × 高 0.8 米 |
| 用量 | 夜店 3（共 3） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 800 面、512 貼圖 |
| 交付 | `assets/source/table/table.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: small square nightclub cocktail table with a dark top, a few bottles, glasses and an ice bucket. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1 m wide, 1.2 m deep, 0.8 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: small square nightclub cocktail table with a dark top, a few bottles, glasses and an ice bucket. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1 m wide (X) by 1.2 m deep (Z) by 0.8 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `dj` DJ 台 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 4 × 深 1.6 × 高 1.3 米 |
| 用量 | 夜店 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 2,000 面、1024 貼圖 |
| 交付 | `assets/source/dj/dj.glb` + `textures/` + `reference/` |

> 發光前板向 +Z（觀眾）。

**① 參考圖**

```text
Game asset concept sheet: nightclub DJ booth: a wide desk with two turntables, a mixer, laptop, and a glowing cyan LED front panel facing the crowd. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4 m wide, 1.6 m deep, 1.3 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: nightclub DJ booth: a wide desk with two turntables, a mixer, laptop, and a glowing cyan LED front panel facing the crowd. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4 m wide (X) by 1.6 m deep (Z) by 1.3 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `mirror_ball` 鏡面球（連吊桿） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 1.5 × 深 1.5 × 高 1.5 米 |
| 用量 | 夜店 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 1,500 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/mirror_ball/mirror_ball.glb` + `textures/` + `reference/` |

> 遊戲會旋轉它，並在地上投光點。

**① 參考圖**

```text
Game asset concept sheet: disco mirror ball made of small square mirror tiles, hanging from a short chain. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.5 m wide, 1.5 m deep, 1.5 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: disco mirror ball made of small square mirror tiles, hanging from a short chain. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.5 m wide (X) by 1.5 m deep (Z) by 1.5 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `led_floor_tile` 舞池 LED 地磚 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 1 × 深 1 × 高 0.05 米 |
| 用量 | 夜店 96（共 96） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 100 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/led_floor_tile/led_floor_tile.glb` + `textures/` + `reference/` |

> 96 塊同時用，要極輕；顏色由遊戲隨節拍控制，所以貼圖保持白色或灰色。

**① 參考圖**

```text
Game asset concept sheet: one 1 m square LED dance floor tile: a frosted glass diffuser in a thin metal frame. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1 m wide, 1 m deep, 0.05 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 1 m square LED dance floor tile: a frosted glass diffuser in a thin metal frame. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1 m wide (X) by 1 m deep (Z) by 0.05 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `back_bar_shelf` 酒架（一節） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 3 × 深 0.35 × 高 2 米 |
| 用量 | 夜店 3（共 3） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 800 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/back_bar_shelf/back_bar_shelf.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: one 3 m section of a back-bar shelf with three glass shelves, under-shelf strip lights and a mirrored back. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 3 m wide, 0.35 m deep, 2 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 3 m section of a back-bar shelf with three glass shelves, under-shelf strip lights and a mirrored back. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 3 m wide (X) by 0.35 m deep (Z) by 2 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `bottle_set` 酒瓶（四款） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 0.1 × 深 0.1 × 高 0.34 米 |
| 用量 | 夜店 100（共 100） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 200 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/bottle_set/bottle_set.glb` + `textures/` + `reference/` |

> 酒架玻璃被打碎時，瓶子會一起飛散，子彈時間下很好看。

**① 參考圖**

```text
Game asset concept sheet: set of four different liquor bottles (green, amber, clear, pink glass) with labels. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.1 m wide, 0.1 m deep, 0.34 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: set of four different liquor bottles (green, amber, clear, pink glass) with labels. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.1 m wide (X) by 0.1 m deep (Z) by 0.34 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `club_wall` 夜店牆身（一節） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 4 × 深 0.3 × 高 3.2 米 |
| 用量 | 夜店 34（共 34） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 400 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/club_wall/club_wall.glb` + `textures/` + `reference/` |

> 兩端要無縫接駁。

**① 參考圖**

```text
Game asset concept sheet: one 4 m section of a nightclub wall: dark acoustic foam panels with a violet neon strip at waist height. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4 m wide, 0.3 m deep, 3.2 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 4 m section of a nightclub wall: dark acoustic foam panels with a violet neon strip at waist height. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4 m wide (X) by 0.3 m deep (Z) by 3.2 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

<a id="docks"></a>

## 七號碼頭

### `container` 貨櫃（一個模型，遊戲染四種顏色） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 6 × 深 2.4 × 高 2.6 米 |
| 用量 | 碼頭 7（共 7） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,200 面、1024 貼圖 |
| 交付 | `assets/source/container/container.glb` + `textures/` + `reference/` |

> 做淺灰色，遊戲會染成紅、藍、綠、橙。

**① 參考圖**

```text
Game asset concept sheet: 20 foot steel shipping container with corrugated walls, cargo doors with locking bars at one end, corner castings, light grey paint with rust streaks. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 6 m wide, 2.4 m deep, 2.6 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: 20 foot steel shipping container with corrugated walls, cargo doors with locking bars at one end, corner castings, light grey paint with rust streaks. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 6 m wide (X) by 2.4 m deep (Z) by 2.6 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `forklift` 叉車 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 1.6 × 深 2.6 × 高 2.2 米 |
| 用量 | 碼頭 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 2,500 面、1024 貼圖 |
| 交付 | `assets/source/forklift/forklift.glb` + `textures/` + `reference/` |

> 貨叉向 -Z。

**① 參考圖**

```text
Game asset concept sheet: yellow warehouse forklift truck with the forks lowered, overhead guard, black tyres. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.6 m wide, 2.6 m deep, 2.2 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: yellow warehouse forklift truck with the forks lowered, overhead guard, black tyres. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.6 m wide (X) by 2.6 m deep (Z) by 2.2 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `guardhut` 碼頭看守亭 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 2.4 × 深 2.4 × 高 2.4 米 |
| 用量 | 碼頭 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,200 面、1024 貼圖 |
| 交付 | `assets/source/guardhut/guardhut.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: small prefab harbour guard hut with windows on all sides, a door, a flat roof with a warning beacon. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 2.4 m wide, 2.4 m deep, 2.4 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: small prefab harbour guard hut with windows on all sides, a door, a flat roof with a warning beacon. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 2.4 m wide (X) by 2.4 m deep (Z) by 2.4 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `warehouse_wall` 倉庫外牆（一節，含捲閘版本） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 6 × 深 1 × 高 9 米 |
| 用量 | 碼頭 8（共 8） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 1,500 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/warehouse_wall/warehouse_wall.glb` + `textures/` + `reference/` |

> 共 48 米長；兩款：普通牆、有捲閘（敵人從捲閘出來）。

**① 參考圖**

```text
Game asset concept sheet: one 6 m section of a harbour warehouse facade: corrugated steel cladding on a concrete plinth, a gutter at the top; plus a second version with a 2.4 by 2.6 m roller shutter door. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 6 m wide, 1 m deep, 9 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 6 m section of a harbour warehouse facade: corrugated steel cladding on a concrete plinth, a gutter at the top; plus a second version with a 2.4 by 2.6 m roller shutter door. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 6 m wide (X) by 1 m deep (Z) by 9 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `fence_panel` 鐵絲網圍欄（一節） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 4 × 深 0.1 × 高 2.2 米 |
| 用量 | 碼頭 15（共 15） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 300 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/fence_panel/fence_panel.glb` + `textures/` + `reference/` |

> 鐵絲網用透明貼圖（alpha），不要做成實心幾何。

**① 參考圖**

```text
Game asset concept sheet: one 4 m section of a chain-link security fence with steel posts and a barbed wire top. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4 m wide, 0.1 m deep, 2.2 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 4 m section of a chain-link security fence with steel posts and a barbed wire top. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4 m wide (X) by 0.1 m deep (Z) by 2.2 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `quay_edge` 碼頭岸邊（一節）連繫船柱 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 4 × 深 0.6 × 高 1.7 米 |
| 用量 | 碼頭 12（共 12） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 600 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/quay_edge/quay_edge.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: one 4 m section of a concrete harbour quay edge with a black rubber fender, a yellow painted edge line, and a cast iron mooring bollard. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4 m wide, 0.6 m deep, 1.7 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 4 m section of a concrete harbour quay edge with a black rubber fender, a yellow painted edge line, and a cast iron mooring bollard. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4 m wide (X) by 0.6 m deep (Z) by 1.7 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `gantry_crane` 龍門吊（背景） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 8 × 深 10 × 高 26 米 |
| 用量 | 碼頭 2（共 2） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 6,000 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/gantry_crane/gantry_crane.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: harbour container gantry crane, red painted steel lattice legs and boom, operator cabin, a blinking red aircraft warning light on top. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 8 m wide, 10 m deep, 26 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: harbour container gantry crane, red painted steel lattice legs and boom, operator cabin, a blinking red aircraft warning light on top. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 8 m wide (X) by 10 m deep (Z) by 26 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `sodium_lamp` 鈉燈燈柱 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 1.2 × 深 0.5 × 高 8 米 |
| 用量 | 碼頭 4（共 4） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 500 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/sodium_lamp/sodium_lamp.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: tall steel yard lamp mast with an orange sodium floodlight head. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.2 m wide, 0.5 m deep, 8 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: tall steel yard lamp mast with an orange sodium floodlight head. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.2 m wide (X) by 0.5 m deep (Z) by 8 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

<a id="senado"></a>

## 議事亭前地

### `lpg` 石油氣罐（會爆） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 0.6 × 深 0.6 × 高 1.2 米 |
| 用量 | 議事亭 5（共 5） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 600 面、512 貼圖 |
| 交付 | `assets/source/lpg/lpg.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: orange LPG gas cylinder like the ones beside Macau street food stalls, rounded body, a protective valve collar and a regulator hose. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.6 m wide, 0.6 m deep, 1.2 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: orange LPG gas cylinder like the ones beside Macau street food stalls, rounded body, a protective valve collar and a regulator hose. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.6 m wide (X) by 0.6 m deep (Z) by 1.2 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `streetlamp` 葡式路燈 · 優先 1

| | |
|---|---|
| 尺寸 | 寬 0.9 × 深 0.4 × 高 4 米 |
| 用量 | 議事亭 8（共 8） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,500 面、512 貼圖 |
| 交付 | `assets/source/streetlamp/streetlamp.glb` + `textures/` + `reference/` |

> 碰撞只有燈柱 0.3 米；燈籠可以伸出。

**① 參考圖**

```text
Game asset concept sheet: Portuguese colonial cast iron street lamp of Macau, black, a fluted post on a decorated base, two lanterns hanging from a curved scrolled arm. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.9 m wide, 0.4 m deep, 4 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: Portuguese colonial cast iron street lamp of Macau, black, a fluted post on a decorated base, two lanterns hanging from a curved scrolled arm. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.9 m wide (X) by 0.4 m deep (Z) by 4 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic), plus an emissive map for the glowing parts. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `stall` 熟食檔 · 優先 1

| | |
|---|---|
| 尺寸 | 寬 2.8 × 深 1.6 × 高 2.4 米 |
| 用量 | 議事亭 5（共 5） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 3,000 面、1024 貼圖 |
| 交付 | `assets/source/stall/stall.glb` + `textures/` + `reference/` |

> 櫃枱高 1.1 米（碰撞高度），帳篷在上面約 2.4 米；食物在爆炸時可以飛散。

**① 參考圖**

```text
Game asset concept sheet: Macau street food stall cart: stainless steel counter (1.1 m high) with pots, skewers and a menu board, a red-and-white striped canopy on four poles. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 2.8 m wide, 1.6 m deep, 2.4 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: Macau street food stall cart: stainless steel counter (1.1 m high) with pots, skewers and a menu board, a red-and-white striped canopy on four poles. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 2.8 m wide (X) by 1.6 m deep (Z) by 2.4 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `fountain` 噴水池與渾天儀（地標） · 優先 1

| | |
|---|---|
| 尺寸 | 寬 14.2 × 深 14.2 × 高 2.8 米 |
| 用量 | 議事亭 1（共 1） |
| 母版（高質量） | 約 40,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 8,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/fountain/fountain.glb` + `textures/` + `reference/` |

> 尺寸要準：遊戲的碰撞和下沉台階都按這些數字。

**① 參考圖**

```text
Game asset concept sheet: the Largo do Senado fountain in Macau: a sunken round plaza 14.2 m across with three steps down (0.16 m each), a circular stone pool 9 m across and 0.42 m high, a raised inner basin 5.8 m across, and a bronze armillary sphere 1.7 m across on a pedestal at the centre. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 14.2 m wide, 14.2 m deep, 2.8 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: the Largo do Senado fountain in Macau: a sunken round plaza 14.2 m across with three steps down (0.16 m each), a circular stone pool 9 m across and 0.42 m high, a raised inner basin 5.8 m across, and a bronze armillary sphere 1.7 m across on a pedestal at the centre. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 14.2 m wide (X) by 14.2 m deep (Z) by 2.8 m tall (Y). Clean topology of about 40,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `planter` 花槽 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 1.4 × 深 1.4 × 高 1.5 米 |
| 用量 | 議事亭 3（共 3） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 1,500 面、512 貼圖 |
| 交付 | `assets/source/planter/planter.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: square cream-coloured stone planter box (0.9 m high) with a rounded clipped shrub, Portuguese style mouldings. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.4 m wide, 1.4 m deep, 1.5 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: square cream-coloured stone planter box (0.9 m high) with a rounded clipped shrub, Portuguese style mouldings. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.4 m wide (X) by 1.4 m deep (Z) by 1.5 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `car` 的士 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 4.2 × 深 1.8 × 高 1.5 米 |
| 用量 | 議事亭 2（共 2） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 3,000 面、1024 貼圖 |
| 交付 | `assets/source/car/car.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: compact black Macau taxi sedan with a roof sign, doors closed, chrome details. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4.2 m wide, 1.8 m deep, 1.5 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: compact black Macau taxi sedan with a roof sign, doors closed, chrome details. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4.2 m wide (X) by 1.8 m deep (Z) by 1.5 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `kiosk` 報紙亭 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 1.8 × 深 1.4 × 高 2.3 米 |
| 用量 | 議事亭 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 2,000 面、1024 貼圖 |
| 交付 | `assets/source/kiosk/kiosk.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: small dark green metal newspaper kiosk with magazines and newspapers on display, a little overhanging roof. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.8 m wide, 1.4 m deep, 2.3 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: small dark green metal newspaper kiosk with magazines and newspapers on display, a little overhanging roof. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.8 m wide (X) by 1.4 m deep (Z) by 2.3 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `facade_kit` 騎樓立面組件（一套） · 優先 2

| | |
|---|---|
| 尺寸 | 寬 4 × 深 1.2 × 高 4.5 米 |
| 用量 | 議事亭 60（共 60） |
| 母版（高質量） | 約 20,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 3,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/facade_kit/facade_kit.glb` + `textures/` + `reference/` |

> 用組件拼出廣場兩邊的樓宇；牆身顏色會按每棟樓的實際顏色調整，所以灰泥部分做淺色。

**① 參考圖**

```text
Game asset concept sheet: modular facade kit for the arcaded shophouses around Largo do Senado: a ground-floor arcade bay with a round arch and shopfront, an upper-floor bay with tall windows, green wooden shutters and a small wrought iron balcony, a cornice and parapet piece; pastel plaster walls with white mouldings; each bay 4 m wide and 4.5 m tall. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 4 m wide, 1.2 m deep, 4.5 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: modular facade kit for the arcaded shophouses around Largo do Senado: a ground-floor arcade bay with a round arch and shopfront, an upper-floor bay with tall windows, green wooden shutters and a small wrought iron balcony, a cornice and parapet piece; pastel plaster walls with white mouldings; each bay 4 m wide and 4.5 m tall. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 4 m wide (X) by 1.2 m deep (Z) by 4.5 m tall (Y). Clean topology of about 20,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `pigeon` 白鴿（會飛的環境生物） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 0.2 × 深 0.32 × 高 0.25 米 |
| 用量 | 議事亭 28（共 28） |
| 母版（高質量） | 約 3,000 三角面，1024 貼圖 |
| 網頁遊戲版 | 約 400 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/pigeon/pigeon.glb` + `pigeon.fbx` + `textures/` + `reference/` |

> 遊戲同時有約 28 隻，所以要很輕；動作：啄食、走、起飛、飛、滑翔、降落。

**① 參考圖**

```text
Game asset concept sheet: city rock pigeon, grey-blue with an iridescent green and purple neck, standing. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 0.2 m wide, 0.32 m deep, 0.25 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: city rock pigeon, grey-blue with an iridescent green and purple neck, standing. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 0.2 m wide (X) by 0.32 m deep (Z) by 0.25 m tall (Y). Clean topology of about 3,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 1024 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Rig it with simple bones for the body, neck, head, both wings and both legs. Animations, in place, each as its own named clip: idle_peck, walk, takeoff, fly, glide, land. Export one GLB with the textures embedded, and the same model as FBX; also save the textures as separate PNG files.
```

### `utilitybox` 電箱 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 1.2 × 深 0.8 × 高 1.3 米 |
| 用量 | 議事亭 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 腳本自動減到 400 面、512 貼圖 |
| 交付 | `assets/source/utilitybox/utilitybox.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: grey metal street utility cabinet with two doors, vents and a warning sticker. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 1.2 m wide, 0.8 m deep, 1.3 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: grey metal street utility cabinet with two doors, vents and a warning sticker. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 1.2 m wide (X) by 0.8 m deep (Z) by 1.3 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `senado_tree` 廣場樹 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 6 × 深 6 × 高 8 米 |
| 用量 | 議事亭 2（共 2） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 4,000 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/senado_tree/senado_tree.glb` + `textures/` + `reference/` |

> 樹幹碰撞 0.4 米；樹冠會被鏡頭挖空，不影響視線。

**① 參考圖**

```text
Game asset concept sheet: subtropical street tree with a thick trunk and a broad leafy crown, planted in a square stone tree pit. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 6 m wide, 6 m deep, 8 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: subtropical street tree with a thick trunk and a broad leafy crown, planted in a square stone tree pit. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 6 m wide (X) by 6 m deep (Z) by 8 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `bus_shelter` 巴士站 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 3.8 × 深 1.6 × 高 2.3 米 |
| 用量 | 議事亭 1（共 1） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 1,500 面、1024 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/bus_shelter/bus_shelter.glb` + `textures/` + `reference/` |

> 後面的玻璃是遊戲裡可打碎的玻璃，模型只做框和頂。

**① 參考圖**

```text
Game asset concept sheet: modern Macau bus shelter: a slim metal frame with a flat roof, a glass back panel and a route map board. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 3.8 m wide, 1.6 m deep, 2.3 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: modern Macau bus shelter: a slim metal frame with a flat roof, a glass back panel and a route map board. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 3.8 m wide (X) by 1.6 m deep (Z) by 2.3 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `police_barrier` 路邊鐵馬（一節） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 2 × 深 0.5 × 高 1 米 |
| 用量 | 議事亭 20（共 20） |
| 母版（高質量） | 約 8,000 三角面，2048 貼圖 |
| 網頁遊戲版 | 約 400 面、512 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/police_barrier/police_barrier.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Game asset concept sheet: one 2 m section of a white portable crowd-control barrier with red stripes and flat feet. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: 2 m wide, 0.5 m deep, 1 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality game-ready 3D model from the concept sheet: one 2 m section of a white portable crowd-control barrier with red stripes and flat feet. Units are metres, Y is up and the front faces +Z; put the origin at the bottom centre. Real size: 2 m wide (X) by 0.5 m deep (Z) by 1 m tall (Y). Clean topology of about 8,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 2048 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). This is one modular section: both ends must join seamlessly when it is repeated in a row. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

<a id="landmarks"></a>

## 議事亭前地：地標建築

### `leal_senado` 市政署大樓 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 57.7 × 深 46.4 × 高 16.8 米 |
| 母版（高質量） | 約 150,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 20,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/leal_senado/leal_senado.glb` + `textures/` + `reference/` |

> 用實景相片做參考最準；佔地約 57.7 × 46.4 米，高 16.8 米。

**① 參考圖**

```text
Architectural reference sheet of the Leal Senado Building in Macau: a neoclassical two-storey civic building with a white and grey facade, rows of tall arched windows, a central entrance portico and a balustraded parapet. A straight-on elevation of the main facade, a side elevation and an aerial three-quarter view, in daylight, no people or cars, no text. Footprint about 57.7 by 46.4 m, 16.8 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D model of the building exterior from the reference: the Leal Senado Building in Macau: a neoclassical two-storey civic building with a white and grey facade, rows of tall arched windows, a central entrance portico and a balustraded parapet. Units are metres, Y is up and the front faces +Z; put the origin at the centre of the footprint, at ground level. Real size: 57.7 m wide (X) by 46.4 m deep (Z) by 16.8 m tall (Y). Clean topology of about 150,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Turn the model so the main facade faces +Z. Model the exterior only, true to photographs of the real building; use trim sheets and tiling materials so large walls stay sharp. Also provide a lighter LOD1 version of about 37,500 triangles. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `sao_domingos` 玫瑰堂 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 53.5 × 深 30.9 × 高 17.9 米 |
| 母版（高質量） | 約 150,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 20,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/sao_domingos/sao_domingos.glb` + `textures/` + `reference/` |

> 廣場北端的視覺焦點；正立面最重要。

**① 參考圖**

```text
Architectural reference sheet of St. Dominic's Church in Macau: a baroque church facade in yellow with white stucco ornament and green shuttered windows, a triangular pediment, three levels of columns. A straight-on elevation of the main facade, a side elevation and an aerial three-quarter view, in daylight, no people or cars, no text. Footprint about 53.5 by 30.9 m, 17.9 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D model of the building exterior from the reference: St. Dominic's Church in Macau: a baroque church facade in yellow with white stucco ornament and green shuttered windows, a triangular pediment, three levels of columns. Units are metres, Y is up and the front faces +Z; put the origin at the centre of the footprint, at ground level. Real size: 53.5 m wide (X) by 30.9 m deep (Z) by 17.9 m tall (Y). Clean topology of about 150,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Turn the model so the main facade faces +Z. Model the exterior only, true to photographs of the real building; use trim sheets and tiling materials so large walls stay sharp. Also provide a lighter LOD1 version of about 37,500 triangles. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `santa_casa` 仁慈堂大樓 · 優先 2

| | |
|---|---|
| 尺寸 | 寬 22.5 × 深 18.4 × 高 16.5 米 |
| 母版（高質量） | 約 150,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 15,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/santa_casa/santa_casa.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Architectural reference sheet of the Holy House of Mercy in Macau: a white neoclassical building with arched ground-floor loggia, upper-floor colonnade and balustrades. A straight-on elevation of the main facade, a side elevation and an aerial three-quarter view, in daylight, no people or cars, no text. Footprint about 22.5 by 18.4 m, 16.5 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D model of the building exterior from the reference: the Holy House of Mercy in Macau: a white neoclassical building with arched ground-floor loggia, upper-floor colonnade and balustrades. Units are metres, Y is up and the front faces +Z; put the origin at the centre of the footprint, at ground level. Real size: 22.5 m wide (X) by 18.4 m deep (Z) by 16.5 m tall (Y). Clean topology of about 150,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Turn the model so the main facade faces +Z. Model the exterior only, true to photographs of the real building; use trim sheets and tiling materials so large walls stay sharp. Also provide a lighter LOD1 version of about 37,500 triangles. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `correios` 郵政局大樓 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 44.1 × 深 34.4 × 高 25.4 米 |
| 母版（高質量） | 約 150,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 15,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/correios/correios.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Architectural reference sheet of the General Post Office building in Macau: a beige early-20th-century building with a corner clock tower, pilasters and tall windows. A straight-on elevation of the main facade, a side elevation and an aerial three-quarter view, in daylight, no people or cars, no text. Footprint about 44.1 by 34.4 m, 25.4 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D model of the building exterior from the reference: the General Post Office building in Macau: a beige early-20th-century building with a corner clock tower, pilasters and tall windows. Units are metres, Y is up and the front faces +Z; put the origin at the centre of the footprint, at ground level. Real size: 44.1 m wide (X) by 34.4 m deep (Z) by 25.4 m tall (Y). Clean topology of about 150,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Turn the model so the main facade faces +Z. Model the exterior only, true to photographs of the real building; use trim sheets and tiling materials so large walls stay sharp. Also provide a lighter LOD1 version of about 37,500 triangles. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `mgto` 澳門商務旅遊中心（議事亭前地 9 號） · 優先 3

| | |
|---|---|
| 尺寸 | 寬 30.8 × 深 18.6 × 高 18.7 米 |
| 母版（高質量） | 約 150,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 12,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/mgto/mgto.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Architectural reference sheet of a cream-coloured colonial building on Largo do Senado with an arcaded ground floor, tall shuttered windows and a decorative cornice. A straight-on elevation of the main facade, a side elevation and an aerial three-quarter view, in daylight, no people or cars, no text. Footprint about 30.8 by 18.6 m, 18.7 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D model of the building exterior from the reference: a cream-coloured colonial building on Largo do Senado with an arcaded ground floor, tall shuttered windows and a decorative cornice. Units are metres, Y is up and the front faces +Z; put the origin at the centre of the footprint, at ground level. Real size: 30.8 m wide (X) by 18.6 m deep (Z) by 18.7 m tall (Y). Clean topology of about 150,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Turn the model so the main facade faces +Z. Model the exterior only, true to photographs of the real building; use trim sheets and tiling materials so large walls stay sharp. Also provide a lighter LOD1 version of about 37,500 triangles. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

### `shun_tak` 信德堡 · 優先 3

| | |
|---|---|
| 尺寸 | 寬 32.6 × 深 20.8 × 高 17.7 米 |
| 母版（高質量） | 約 150,000 三角面，4096 貼圖 |
| 網頁遊戲版 | 約 12,000 面、2048 貼圖（遊戲接上後自動處理） |
| 交付 | `assets/source/shun_tak/shun_tak.glb` + `textures/` + `reference/` |

**① 參考圖**

```text
Architectural reference sheet of a pale yellow colonial building on Largo do Senado with an arcaded ground floor, balconies with iron railings and a parapet. A straight-on elevation of the main facade, a side elevation and an aerial three-quarter view, in daylight, no people or cars, no text. Footprint about 32.6 by 20.8 m, 17.7 m tall. Art direction: stylized semi-realistic action game set in present-day Macau with a neon-noir mood; clean, readable shapes slightly exaggerated for a camera looking down at 45 degrees; physically based materials with subtle wear; no lighting, shadows or ambient occlusion baked into the base colour (the game lights it, by night and by day).
```

**② 3D 模型**

```text
Build a high-quality 3D model of the building exterior from the reference: a pale yellow colonial building on Largo do Senado with an arcaded ground floor, balconies with iron railings and a parapet. Units are metres, Y is up and the front faces +Z; put the origin at the centre of the footprint, at ground level. Real size: 32.6 m wide (X) by 20.8 m deep (Z) by 17.7 m tall (Y). Clean topology of about 150,000 triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation). PBR metal-roughness materials with 4096 px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic). Turn the model so the main facade faces +Z. Model the exterior only, true to photographs of the real building; use trim sheets and tiling materials so large walls stay sharp. Also provide a lighter LOD1 version of about 37,500 triangles. Export one GLB with the textures embedded; also save the textures as separate PNG files.
```

<a id="materials"></a>

## 地面與牆身材質（無縫平鋪貼圖）

### `mat_calcada` 葡式碎石路（波浪紋） · 優先 1

| | |
|---|---|
| 一塊貼圖覆蓋 | 4 × 4 米 |
| 母版 | 2048 × 2048 貼圖（顏色、法線、粗糙度、AO、高度） |
| 交付 | `assets/source/mat_calcada/` 內各張 PNG |

> 波浪紋要能無縫平鋪；遊戲已把黑白對比調柔，人物站上去才看得清。

**① 參考圖**

```text
Seamless tileable texture swatch: Portuguese calcada pavement of Largo do Senado: small black and cream limestone cobbles forming the famous wave pattern. Seen straight from above, flat even lighting, no perspective and no shadows; it must tile seamlessly on all four edges. One tile covers 4 by 4 m.
```

**② 材質貼圖**

```text
Make this a seamless tileable PBR material at 2048 by 2048 px covering 4 by 4 m: base colour (sRGB, no lighting or shadows baked in), normal map (OpenGL, green up), roughness, ambient occlusion and height maps. Save each map as a separate PNG named mat_calcada_basecolor.png, mat_calcada_normal.png, mat_calcada_roughness.png, mat_calcada_ao.png and mat_calcada_height.png.
```

### `mat_rooftop_concrete` 天台濕混凝土地面 · 優先 2

| | |
|---|---|
| 一塊貼圖覆蓋 | 4 × 4 米 |
| 母版 | 2048 × 2048 貼圖（顏色、法線、粗糙度、AO、高度） |
| 交付 | `assets/source/mat_rooftop_concrete/` 內各張 PNG |

**① 參考圖**

```text
Seamless tileable texture swatch: wet rooftop concrete slab with expansion joints, stains and small puddles. Seen straight from above, flat even lighting, no perspective and no shadows; it must tile seamlessly on all four edges. One tile covers 4 by 4 m.
```

**② 材質貼圖**

```text
Make this a seamless tileable PBR material at 2048 by 2048 px covering 4 by 4 m: base colour (sRGB, no lighting or shadows baked in), normal map (OpenGL, green up), roughness, ambient occlusion and height maps. Save each map as a separate PNG named mat_rooftop_concrete_basecolor.png, mat_rooftop_concrete_normal.png, mat_rooftop_concrete_roughness.png, mat_rooftop_concrete_ao.png and mat_rooftop_concrete_height.png.
```

### `mat_plaster` 葡式灰泥牆 · 優先 2

| | |
|---|---|
| 一塊貼圖覆蓋 | 3 × 3 米 |
| 母版 | 2048 × 2048 貼圖（顏色、法線、粗糙度、AO、高度） |
| 交付 | `assets/source/mat_plaster/` 內各張 PNG |

**① 參考圖**

```text
Seamless tileable texture swatch: weathered pastel lime plaster wall with subtle cracks and rain streaks, neutral light colour so it can be tinted. Seen straight from above, flat even lighting, no perspective and no shadows; it must tile seamlessly on all four edges. One tile covers 3 by 3 m.
```

**② 材質貼圖**

```text
Make this a seamless tileable PBR material at 2048 by 2048 px covering 3 by 3 m: base colour (sRGB, no lighting or shadows baked in), normal map (OpenGL, green up), roughness, ambient occlusion and height maps. Save each map as a separate PNG named mat_plaster_basecolor.png, mat_plaster_normal.png, mat_plaster_roughness.png, mat_plaster_ao.png and mat_plaster_height.png.
```

### `mat_club_floor` 夜店地板 · 優先 3

| | |
|---|---|
| 一塊貼圖覆蓋 | 4 × 4 米 |
| 母版 | 2048 × 2048 貼圖（顏色、法線、粗糙度、AO、高度） |
| 交付 | `assets/source/mat_club_floor/` 內各張 PNG |

**① 參考圖**

```text
Seamless tileable texture swatch: dark polished nightclub floor tiles with subtle scuffs. Seen straight from above, flat even lighting, no perspective and no shadows; it must tile seamlessly on all four edges. One tile covers 4 by 4 m.
```

**② 材質貼圖**

```text
Make this a seamless tileable PBR material at 2048 by 2048 px covering 4 by 4 m: base colour (sRGB, no lighting or shadows baked in), normal map (OpenGL, green up), roughness, ambient occlusion and height maps. Save each map as a separate PNG named mat_club_floor_basecolor.png, mat_club_floor_normal.png, mat_club_floor_roughness.png, mat_club_floor_ao.png and mat_club_floor_height.png.
```

### `mat_asphalt` 碼頭濕瀝青 · 優先 3

| | |
|---|---|
| 一塊貼圖覆蓋 | 6 × 6 米 |
| 母版 | 2048 × 2048 貼圖（顏色、法線、粗糙度、AO、高度） |
| 交付 | `assets/source/mat_asphalt/` 內各張 PNG |

**① 參考圖**

```text
Seamless tileable texture swatch: wet harbour asphalt with cracks, oil stains and patched areas. Seen straight from above, flat even lighting, no perspective and no shadows; it must tile seamlessly on all four edges. One tile covers 6 by 6 m.
```

**② 材質貼圖**

```text
Make this a seamless tileable PBR material at 2048 by 2048 px covering 6 by 6 m: base colour (sRGB, no lighting or shadows baked in), normal map (OpenGL, green up), roughness, ambient occlusion and height maps. Save each map as a separate PNG named mat_asphalt_basecolor.png, mat_asphalt_normal.png, mat_asphalt_roughness.png, mat_asphalt_ao.png and mat_asphalt_height.png.
```
