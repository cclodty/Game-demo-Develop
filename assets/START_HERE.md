# START HERE — brief for the 3D modelling assistant

（中文：這份是給 Dots／ChatGPT 看的說明，請先讓它讀這份，再按 PROMPTS.md 逐件製作。）

## The project

**Bullet Ballet** is a top-down action shooter built around bullet time, in the spirit of *My Friend Pedro*. It runs in the browser on Three.js today, and may later move to Unity, Unreal or Godot.

It is set in present-day Macau with a neon-noir mood, across four maps:

- a rainy neon rooftop;
- a nightclub;
- a container harbour;
- Largo do Senado, rebuilt at real-world scale.

Everything in the game is currently a placeholder made of blocks (see `screenshots/`). We need **high-quality 3D models** for 71 assets: characters, weapons, props, environment pieces, landmark buildings and tiling materials.

## What is in this folder

| File | What it is |
|---|---|
| `START_HERE.md` | This brief |
| `PROMPTS.md` | For every asset: a reference-image prompt and a 3D-model prompt, plus size, priority and file name. **Work from this.** |
| `asset-list.json` | The same assets as data: id, real size in metres, origin, helper sockets, triangle and texture budgets, animations, file paths |
| `asset-list.csv` | The same as a spreadsheet |
| `SPEC.md` | The full scale sheet and delivery spec (in Chinese); the essentials are repeated below |
| `maps/*.json` | The four map layouts in metres: where every prop stands, wall heights, lights; Largo do Senado also has every building footprint |
| `screenshots/` | The game today, from the real camera, so you can see the angle, lighting and scale |
| `source/` | Where finished models go, one folder per asset |

## Hard rules

These keep every model usable in this game and in any engine later.

1. **Real scale in metres, Y up, the front facing +Z** (glTF conventions, right-handed). Use the exact sizes in `asset-list.json` (`size.x` = width, `size.z` = depth, `size.y` = height).
2. **Origin (pivot):**
   - characters: on the ground between the feet;
   - props and environment: bottom centre;
   - weapons: at the main hand grip, with the barrel along +Z;
   - buildings: footprint centre at ground level, with the main facade facing +Z.
3. **Characters:**
   - 1.78 m tall, A-pose (arms about 45° down), empty hands.
   - One shared humanoid skeleton with Mixamo-style bone names (`Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, and the Right equivalents).
   - Animations in place (no root motion), one named clip each:
     - required: `idle`, `run`, `death`;
     - if possible: `walk`, `strafe_left`, `strafe_right`, `run_backward`, `kick`, `hit_react`, `dodge_roll`, `dive`, `climb_up`, `reload`, `melee_slash`.
4. **Weapons:** add empty helper nodes named `socket_muzzle`, `socket_support`, `socket_scope` and `socket_tip` at the positions given in PROMPTS.md.
5. **Materials:** PBR metal-roughness.
   - Base colour in sRGB with **no lighting, shadows or AO baked in**, because the game lights the same models by night and by day.
   - Normal maps in OpenGL format (green up).
   - ORM packed: red = AO, green = roughness, blue = metallic.
   - An emissive map for neon and lights.
6. **Modular pieces** (sections of walls, fences, barriers, bars, sofas): both ends must join seamlessly when repeated.
7. **Readability:**
   - The game camera looks down at 45° from 23–31 m away, so a character is about 100 px tall on a 1080p screen. Silhouettes and colour blocks must read at that size.
   - Keep each faction's main colour: hero teal/cyan; enemies red, orange, violet, magenta.
   - Explosive props (oil drums, gas tanks, LPG cylinders) must look dangerous at a glance.
8. **Style for every asset:** stylized semi-realistic, present-day Macau, neon-noir mood, clean readable shapes slightly exaggerated for a camera looking down at 45°, physically based materials with subtle wear.

## What to deliver for each asset

One folder per asset, named by its id:

```
source/<id>/
  <id>.glb        main file, textures embedded (characters: skeleton and all animations)
  <id>.fbx        also for characters, weapons and the pigeon
  textures/       the same textures as separate PNGs: <id>_basecolor.png, _normal.png, _orm.png, _emissive.png
  reference/      the reference images used to make it
  NOTES.md        the tool used, the date, and any licence or plan information
```

Triangle counts and texture sizes are in PROMPTS.md. These are high-quality masters; the game makes its own lighter versions from them automatically.

## Suggested order

1. Make **`hero`** first and stop. We check its scale, rig and animations in the game before making the other characters on the same skeleton.
2. Then the other **priority 1** items:
   - weapons: pistol, shotgun, rifle;
   - props: crate, oil drum, gas tank, frying pan, concrete barrier, shipping container, LPG cylinder, Portuguese street lamp, food stall;
   - Senado: the fountain and the calçada paving.
3. Then priority 2 and 3, one map at a time, so each map's set stays consistent.
