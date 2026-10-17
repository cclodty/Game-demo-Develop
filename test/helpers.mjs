// Shared harness for the browser tests: a static server on a free port, a
// headless Chromium that renders through SwiftShader (no GPU needed, so it
// runs the same on a laptop and in CI), and a bot that drives the game loop
// by hand, frame by frame, without requestAnimationFrame.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from '../scripts/serve.mjs';

export const GPU_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];

/** Where tests put screenshots (git-ignored). */
export const OUT = new URL('./.out/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

export async function gameHarness() {
  const server = await startServer();
  const browser = await chromium.launch({ args: GPU_ARGS });
  return {
    server,
    browser,
    /** Open the game; resolves once window.game exists. `logs` collects errors and warnings. */
    async open(query = '') {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const logs = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
      await page.goto(`${server.url}/index.html${query}`);
      // index.html has <div id="game">, so window.game is that element until main.js
      // assigns the real Game (after the optional models load) — wait for the object.
      await page.waitForFunction(() => window.game && typeof window.game.startRun === 'function', null, { timeout: 120000 });
      await page.waitForTimeout(500);
      return { page, logs };
    },
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/** Log lines that count as failures (SwiftShader's own warnings don't). */
export const problems = (logs) => logs.filter((l) => !/GPU stall|SwiftShader|swiftshader|Automatic fallback|THREE\.WebGLRenderer: Context Lost/i.test(l));

/**
 * Install the bot: stops the real frame loop, starts a run on `map` in `view`,
 * and defines window.simStep(n) which plays n frames at 60 Hz — aiming at the
 * nearest enemy, wandering, using bullet time, dodging and kicking — and
 * window.stats with what happened. simStep returns false after an exception.
 * With `seed` the bot's own choices (aim jitter, wandering) repeat exactly;
 * without one they are random, so each test run explores a little differently.
 * `mode` picks arcade or endless first. When the run ends the bot starts
 * another, unless `restart` is false: then simStep stops on the end screen.
 */
export async function installBot(page, { map = 0, view = 2, seed = null, mode = null, restart = true } = {}) {
  await page.evaluate(
    ([map, view, seed, mode, restart]) => {
      const g = window.game;
      g.frame = () => {};
      g.view = view; // before startRun, so the camera starts in this view instead of easing into it
      if (mode) g.setMode(mode);
      g.startRun(map);
      let random = Math.random;
      if (seed !== null) {
        const r = new g.rng.constructor(seed);
        random = () => r.next();
      }
      const inp = g.input;
      inp.mouse.x = innerWidth / 2;
      inp.mouse.y = innerHeight / 2;
      inp.mouse.left = inp.mouse.right = false;
      const stats = (window.stats = { kills: 0, deaths: 0, styles: {}, errors: [], enemyShots: 0, hits: 0, dmg: 0, frames: 0 });
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (tags) => {
        for (const t of tags) stats.styles[t.label] = (stats.styles[t.label] || 0) + 1;
        return kill0(tags);
      };
      const style0 = g.score.style.bind(g.score);
      g.score.style = (l, p, r) => {
        stats.styles[l] = (stats.styles[l] || 0) + 1;
        return style0(l, p, r);
      };
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      g.bullets.spawn = (o) => {
        if (o.owner === 'enemy') stats.enemyShots++;
        return spawn0(o);
      };
      const hurt0 = g.player.hurt.bind(g.player);
      g.player.hurt = (d, x, z, e) => {
        const r = hurt0(d, x, z, e);
        if (r) {
          stats.hits++;
          stats.dmg += d;
        }
        return r;
      };
      let wanderX = 0;
      let wanderZ = 0;
      let wanderT = 0;
      let i = 0;
      window.simStep = (n) => {
        const dt = 1 / 60;
        for (let k = 0; k < n; k++, i++) {
          g.time += dt;
          inp.pressed.clear();
          inp.keys.clear();
          inp.mouse.leftPressed = inp.mouse.rightPressed = inp.mouse.rightReleased = false;
          const p = g.player;
          let target = null;
          let best = 1e9;
          for (const e of g.enemies.list) {
            if (!e.alive || e.state === 'enter') continue;
            const d = Math.hypot(e.x - p.x, e.z - p.z);
            if (d < best) {
              best = d;
              target = e;
            }
          }
          if (target) {
            if (!target.jx || random() < 0.03) {
              target.jx = (random() - 0.5) * 2.4;
              target.jz = (random() - 0.5) * 2.4;
            }
            const v = new g.aimPoint.constructor(target.x + target.jx, 1.35, target.z + target.jz).project(g.camera);
            inp.mouse.x = (v.x * 0.5 + 0.5) * innerWidth;
            inp.mouse.y = (-v.y * 0.5 + 0.5) * innerHeight;
            inp.mouse.left = i % 30 < 12;
          } else inp.mouse.left = false;
          wanderT -= dt;
          if (wanderT <= 0) {
            wanderT = 0.8;
            const a = random() * 6.28;
            wanderX = Math.sin(a);
            wanderZ = Math.cos(a);
            if (Math.hypot(p.x - g.level.start.x, p.z - g.level.start.z) > 9) {
              wanderX = g.level.start.x - p.x;
              wanderZ = g.level.start.z - p.z;
            }
            if (random() < 0.3) wanderX = wanderZ = 0;
          }
          if (wanderX > 0.3) inp.keys.add('KeyD');
          if (wanderX < -0.3) inp.keys.add('KeyA');
          if (wanderZ > 0.3) inp.keys.add('KeyS');
          if (wanderZ < -0.3) inp.keys.add('KeyW');
          const aimers = g.enemies.list.filter((e) => e.aiming).length;
          if (aimers >= 2 && !g.focusActive && g.focusMeter > 0.4) inp.pressed.add('ShiftLeft');
          if (aimers === 0 && g.focusActive && random() < 0.02) inp.pressed.add('ShiftLeft');
          if (i % 300 === 150) inp.pressed.add('Space');
          if (i % 420 === 200) inp.pressed.add('KeyF');
          if (i % 500 === 250) {
            inp.mouse.right = true;
            inp.mouse.rightPressed = true;
          }
          if (i % 500 === 400) {
            inp.mouse.right = false;
            inp.mouse.rightReleased = true;
          }
          try {
            g.updateAim();
            if (g.state === 'playing' || g.state === 'dying') g.updatePlay(dt);
            else g.updateIdle(dt);
          } catch (err) {
            stats.errors.push(String((err && err.stack) || err));
            return false;
          }
          if (g.state === 'over') {
            if (!restart) break;
            stats.deaths++;
            g.startRun();
          }
        }
        stats.frames = i;
        stats.kills = g.score.kills;
        return true;
      };
    },
    [map, view, seed, mode, restart],
  );
}

/** Current bot statistics plus the wave and score. */
export const botStats = (page) => page.evaluate(() => ({ ...window.stats, wave: window.game.waves.wave, score: window.game.score.score, map: window.game.level.map.id }));

/** Render one frame and save a screenshot (the bot skips rendering while it plays). */
export async function snap(page, name) {
  await page.evaluate(() => {
    window.game.hud.update(1 / 60);
    window.game.render();
  });
  await page.screenshot({ path: new URL(name, OUT).pathname });
}
