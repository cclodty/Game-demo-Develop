# Bullet Ballet 子彈芭蕾 — notes for Claude

A top-down bullet-time shooter in the spirit of *My Friend Pedro*, set in a
stylised present-day Macau. Plain JavaScript + three.js (vendored, no
bundler, no framework). One developer plus Claude; the developer plays and
judges feel, Claude builds.

Read before starting any task: this file, `docs/ROADMAP.md` (the plan and the
four design pillars), `docs/TASKS.md` (the current checklist), and
`docs/DECISIONS.md` (why things are the way they are). Add to the last two as
you go.

## Talking to the developer

- Reply in **Traditional Chinese** (繁體中文, Hong Kong / Macau usage). Code,
  comments and commit messages are in English.
- Player-facing text in the game is Traditional Chinese with English display
  labels (`雙槍 DUAL PISTOLS`); keep that pairing.
- Show, don't tell: a gameplay or visual change comes with a screenshot (the
  tests save PNGs in `test/.out/`), a numbers change comes with before/after.
- The developer cannot see your tool output. Summarise results; never claim a
  test passed or a push happened without having seen it.
- **Feel feedback arrives as a Markdown export** from the game (N records a
  moment; the pause menu exports). Each note carries the map, wave, HP, focus
  state and the last ten events, plus any feel numbers the developer tuned
  live in the stats panel (` key). Treat those numbers as ground truth and
  turn a tuned value into a `config.js` change plus a `docs/DECISIONS.md`
  line; the live tuning itself is only for trying things out.

## Run, test, lint

```
npm install                       # once (sets up playwright, eslint, esbuild, gltf-transform)
npm run serve                     # http://127.0.0.1:8123/  (ES modules: never open index.html from disk)
npm run lint                      # eslint on src/, scripts/, test/
npm test                          # senado unit tests + smoke + map validator + asset pipeline + a short bot run (~2 min)
npm run test:game                 # slow: every weapon fires, E-swap, a long looting run (~10 min)
npm run build                     # single-file dist/bullet-ballet.html for sharing (must stay < 16 MB)
npm run assets                    # masters in assets/source/<id>/ → web models in assets/models/
npm run assets:docs               # regenerate assets/PROMPTS.md, asset-list.*, maps/*.json
```

**Before every push:** `npm run lint && npm test`. If you changed weapons,
pickups or stage transitions, also `npm run test:game`. Fix what fails; never
delete, skip or loosen a test to get green. New gameplay = a new or extended
test in `test/`.

The browser tests render through SwiftShader, so they catch exceptions and
layout problems but say nothing about frame rate or feel. Real-GPU
performance and "does it feel good" are the developer's calls; ask for them.

## Repo map

```
index.html, style.css        HUD / menu DOM and styles; importmap → vendor/three
src/main.js                  Game: fixed 120 Hz logic steps + per-frame present, time scale (bullet time, hit-stop, kill-cam), camera views, screens
src/input.js  replay.js      live keyboard/mouse → one StepInput per logic step; the run's input record (changes only)
src/config.js                every feel number: speeds, FOCUS, BULLET, CAMERA, VIEWS
src/player.js  enemies.js    player verbs; enemy TYPES, WEAPONS and the AI state machine
src/weapons.js bullets.js    player weapon stats, drops, grenades; projectile stepping and ricochet
src/waves.js  pickups.js     MODES (arcade: 12 waves, then RUN CLEAR; endless), wave composition and spawn pacing; floor weapons and pads
src/level.js  maps.js        map loading (solids, glass, barrels, pans, pads, spawns, lights); the 4 maps as data
src/nav.js                   grid A* on 0.5 m cells
src/rng.js                   seeded RNG: game.rng for logic (?seed=), vfxRng behind utils.js rand/pick for effects
src/characters.js  skin.js   block rigs + weapon models; optional skinned models worn over the rig (IK hands)
src/models.js                loads assets/models/*.glb, fits props to map boxes; src/models-index.js is generated
src/asset-manifest.js        catalogue of every asset we want as a real model (sizes, budgets, prompts)
src/cutaway.js  postfx.js    camera→player cut-away shader; bloom + bullet-time grading
src/fx.js  hud.js  audio.js  particles/decals/lasers; DOM HUD; WebAudio synth SFX and music
src/ambient.js               pigeons: Flock (logic: where a flock rests, when it bursts up) and the birds that follow it
src/tutorial.js              the 60-second warm-up on a first run (three enemies: bullet time, a pan, a barrel)
src/clip.js                  the best-kill clip: overlapping MediaRecorder recordings of a small copy of the screen, played on the end screen
src/telemetry.js             local play records: one row per run (start, waves, end and cause, time, played again), carried by the feedback export
src/rules.js                 run rules: difficulties and variants as data (one switch or number each), read by their systems as game.ruleset
src/notes.js                 playtest notes: event log, stats/tuning panel (`), N notes, Markdown export
src/style.js                 the look: toon twins of every lit material, outlines, afterimages, 12 fps pose step, proportions
src/senado/                  Largo do Senado data and model code extracted from the senado/ sub-project
scripts/                     assets.mjs, asset-docs.mjs, build-single.mjs, serve.mjs, senado-extract.mjs
test/                        node:test + playwright; helpers.mjs has the bot; fixtures/ holds a short recorded clip
assets/                      SPEC.md, PROMPTS.md, START_HERE.md, asset-list.*, maps/*.json, source/ (masters), models/ (web)
docs/                        ROADMAP.md, TASKS.md, DECISIONS.md; shots/ holds the screenshots PR descriptions show
senado/                      the Largo do Senado city-model sub-project (own README, tests, scripts); don't edit from game tasks
vendor/three/                three.js r186 + the addons we use; never modify
```

Conventions that matter:

- **Units:** metres, Y up, +Z faces the camera (south). Humans are 1.78 m.
  Cover is `[x, z, w, d, h, material, facing?]`.
- **Collision is separate from looks.** Solids are boxes/polygons in
  `level.js`; models only decorate them. Changing a prop's model never changes
  gameplay.
- **Exactly four map point lights** always exist (dummy ones on Senado), so
  switching maps never recompiles shaders. Keep it that way.
- **Models are optional.** With no files in `assets/models/`, the block
  versions render; `?models=off` forces them. Never make the game depend on an
  asset existing.
- **Time:** the game logic runs in fixed steps of 1/120 s (`LOGIC_HZ`):
  `updatePlay(realDt)` runs the steps that fit the frame, then `present(realDt)`
  does what is only shown (effects, ambient life, camera, HUD). Inside a step,
  `h` is the step's real time and `dt` is world time (scaled by bullet time);
  everything in the world uses `dt`. `realDt` belongs to `present` and the UI.
- **Input in logic** comes only from the step's `game.cmd` (a `StepInput`:
  controls held and pressed, the aim on the floor, the camera yaw), never from
  `game.input`, `game.aimPoint` or the camera; that is what gets recorded. A new
  control the logic reads goes at the end of `BUTTONS` in `input.js`.
- Every material gets the cut-away shader hook (`addCutaway`) when a map
  loads; new materials created later must opt in themselves if they can hide
  the player.
- Feel numbers live in `config.js`; don't scatter magic numbers. When you
  change one, note the old and new value in `docs/DECISIONS.md`. Read them
  where they are used, never copy them into module-level constants: the
  stats panel changes `FOCUS`/`PLAYER`/`CAMERA` properties live.
- Gameplay events worth a tester's attention go through `notes.log()` (hits
  taken with their source, kills with tags, focus on/off, waves, pickups) so
  they show up in the feedback export. Keep the lines short and in Chinese.
- **The look is a rendering layer** (`style.js`, decided 2026-10-17: flat toon
  shading, outlines, afterimages, 12 fps pose step, comic proportions). Lit
  materials are swapped for toon twins when a level loads or a rig is built;
  anything you add to the scene later goes through `game.style.dress(root)`
  (pickups, thrown guns and grenades do). Character pose code runs only when
  `style.poseDue(rig, worldTime)` says so; root position and facing update
  every frame. Never make play depend on the style; `?style=off` must play
  identically.

## Working rules

1. **One task, one PR, one day.** A task comes from `docs/TASKS.md` with
   acceptance criteria and a "這次不做" list. Do that, not the thing next to
   it. Found something else worth doing? Add it to TASKS.md and say so; don't
   build it. When the developer asks for something that has no card (a
   playtest idea, say), write the card first, in two minutes, agree the
   acceptance criteria in the reply, then build. A card that does not fit a
   day is two cards. The PR body follows `.github/pull_request_template.md`
   and ticks the card's criteria one by one.
2. **Check the pillars** (ROADMAP.md): style over body count; bullet time is a
   tool, not a crutch; real Macau is the selling point; a run is ten minutes
   and always leaves something behind. A feature that fits none is a no.
3. **Keep it data-driven.** Maps, enemies, weapons and waves are data; new
   content goes in the data, new behaviour goes in the systems. Anything that
   another engine would need must be exportable (see `assets/SPEC.md` §8).
4. **No new dependencies at runtime.** The game ships as static files (and as
   one HTML file). Dev dependencies are fine; discuss first if one is large.
5. **Determinism first.** Game logic draws from `game.rng` (reseeded every
   run; with `?seed=123` the same input plays the same run) and never reads `Math.random`
   (eslint rejects it in `src/`) or wall-clock time. Effects use `rand` /
   `randInt` / `pick` from `utils.js`, which draw from the separate effects
   RNG, so they can change freely. Anything a run leaves behind must be reset
   in `resetWorld` / `resetProps`, or a restart plays differently
   (`test/seed.test.mjs` catches both mistakes).
6. **Don't touch `senado/`** from game tasks; it is the developer's city-model
   project with its own tests (`npm test` runs them).
7. **Git:** work on the branch you were given, small commits with clear
   messages, push with `git push -u origin <branch>`. Never force-push, never
   rebase shared history, never create a PR unless asked. No model names in
   commit messages or code.
8. **Sensitive content:** real Macau places, fictional everything else — no
   real shop names, brands, people or events. Enemies are a fictional gang.

## Asset pipeline (short)

Masters go to `assets/source/<id>/<id>.glb` (+ `.fbx`, `textures/`,
`reference/`, `NOTES.md`). `npm run assets` simplifies to the budget in the
manifest, resizes textures to WebP, meshopt-compresses, drops unused clips,
merges `<id>@clip.glb` animations, writes `assets/models/` and
`src/models-index.js`. Characters need Mixamo-style bone names and in-place
`idle`/`run`(/`death`) clips; props are fitted to their map box by `fit`
(`box` / `footprint` / `height` / `tile`). Full spec: `assets/SPEC.md`.

## Known gotchas

- Opening `index.html` from disk fails (ES modules); use `npm run serve`.
- The single-file build inlines models as base64 (~⅓ larger); watch 16 MB.
- `prettier` is not configured; don't reformat whole files.
- Playwright needs Chromium: locally it is pre-installed in some sandboxes
  (`PLAYWRIGHT_BROWSERS_PATH`), otherwise `npx playwright install chromium`.
- Tests use `window.game` and call `updatePlay(1/60)` directly (one 60 Hz
  frame: two logic steps); keep those entry points stable or update
  `test/helpers.mjs` with them. `game.feed` hands steps recorded input instead
  of the keyboard (`test/fixedstep.test.mjs`).
- The first run in a fresh browser opens with the warm-up (`tutorial.js`). The
  test harness marks it as seen before every page load unless the query
  mentions `tutorial` (`?tutorial=1` forces it, `?tutorial=0` is a first visit).
- `index.html` has `<div id="game">`, so `window.game` is that element until
  `main.js` assigns the real `Game` (after the optional models load). Check
  for `window.game.startRun` before using it.
- With the 39 web models the single-file build is ~11 MB; the 16 MB cap is
  about 3.5 MB more of GLB away.
- Each map carries a render `budget` (triangles and draw calls per frame, all
  passes) in `maps.js`; `test/maps.test.mjs` fails when a frame exceeds it.
  Draw calls, not triangles, are the weak-GPU problem (rooftop, docks and
  Senado are all over 1,300). Real-GPU numbers reach you only through the
  developer's notes export (`perfLine`); `?quality=low` turns bloom and
  shadows off for comparison.
- GitHub Pages deploys `main` (`.github/workflows/pages.yml`); CI
  (`ci.yml`) runs lint + tests on every push.
