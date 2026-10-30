// Shared harness for the browser tests: a static server on a free port, a
// headless Chromium that renders through SwiftShader (no GPU needed, so it
// runs the same on a laptop and in CI), and a bot that drives the game loop
// by hand, frame by frame, without requestAnimationFrame.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from '../scripts/serve.mjs';
import { UNLOCKS } from '../src/unlocks.js';

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
    /**
     * Open the game; resolves once window.game exists. `logs` collects errors and warnings. `device` is more for
     * the page (a phone: `{ viewport, hasTouch: true, isMobile: true }`, test/touch.test.mjs).
     */
    async open(query = '', device = {}) {
      // reduced motion: the title's looping pulse would redraw the page at 60 Hz in SwiftShader (style.css)
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce', ...device });
      const logs = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
      // every test starts at wave 1 as if the warm-up had been seen, unless it asks about the warm-up (?tutorial=…)
      if (!query.includes('tutorial')) await page.addInitScript(() => localStorage.setItem('bullet-ballet.tutorial', 'done'));
      // the title opens on the game's own mode with the older four off it (彈幕 ② C③): a test written for the arcade
      // (and the maps, the daily, the night) starts as a player who picked it before, unless it names a mode (?mode=…)
      if (!/[?&]modes?=/.test(query)) await page.addInitScript(() => localStorage.getItem('bullet-ballet.mode') || localStorage.setItem('bullet-ballet.mode', 'arcade')); // (`?models=off` is not a mode) a pick made in the test (the night, kept across its reload) stands
      // the unlock table (F⑥b) all open, the cards, weapons and variants the tests were written with, unless the test is
      // about it (?unlocks); one opened or shut in the test (kept across its reload) stands
      if (!query.includes('unlocks')) await page.addInitScript((all) => localStorage.getItem('bullet-ballet.unlocks') || localStorage.setItem('bullet-ballet.unlocks', all), JSON.stringify({ opened: UNLOCKS.map((u) => `${u.what}:${u.id}`), wins: {} }));
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
 * For measuring (scripts/measure.mjs): with `god` the player is hurt as usual
 * but never goes down, so every wave is played; with `loot` the bot walks to
 * the nearest weapon lying about whenever slot 2 holds nothing of use.
 */
export async function installBot(page, { map = 0, view = 2, seed = null, mode = null, restart = true, god = false, loot = false } = {}) {
  await page.evaluate(
    ([map, view, seed, mode, restart, god, loot]) => {
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
        if (god) g.player.hp = Math.max(g.player.hp, d + 1);
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
      let chase = null; // a point on the way to a target the guns cannot reach from here, and when to look again
      let chaseT = 0;
      let lootT = 0;
      let lootTo = null; // with `loot`: the next corner on the way to a weapon on the floor
      // stuck: where it stood at the last look, how many of the steps since it pushed a way, and a sidestep under way
      let stuckX = 0;
      let stuckZ = 0;
      let pushes = 0;
      let unstickT = 0;
      let unstickX = 0;
      let unstickZ = 0;
      let i = 0;
      window.simStep = (n) => {
        const dt = 1 / 60;
        for (let k = 0; k < n; k++, i++) {
          g.time += dt;
          inp.pressed.clear();
          inp.keys.clear();
          inp.mouse.leftPressed = inp.mouse.rightPressed = inp.mouse.rightReleased = false;
          const p = g.player;
          if (god) p.hp = 100;
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
          // a boss with a weak point the banner tells the player about (boss.js): the armoured truck's back
          // door while it unloads. Shots into it count only from behind, so the bot walks round to there and fires.
          // The others it meets in an arcade run from the rooftop (a boss each stage): below.
          // two at once (boss.js duo): the one of the two nearest the player
          const near = (list) => list.filter((m) => m.active).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
          const boss = (g.boss.members && near(g.boss.members)) || g.boss;
          let door = null;
          let goal = null;
          let behind = false;
          let heli = null; // carrying a barrel to throw under the helicopter
          let fetch = false; // at a barrel: pick it up
          if (boss.active && boss.def && boss.def.kind === 'truck' && boss.state === 'unload') {
            const bx = -Math.sin(boss.heading);
            const bz = -Math.cos(boss.heading);
            const back = boss.cfg.size.l / 2;
            door = { x: boss.x + bx * (back + 0.1), z: boss.z + bz * (back + 0.1) };
            goal = { x: boss.x + bx * (back + 5), z: boss.z + bz * (back + 5) };
            behind = (p.x - boss.x) * bx + (p.z - boss.z) * bz > back + 0.5;
          } else if (boss.active && boss.def && (boss.def.kind === 'gunner' || boss.def.kind === 'bulwark') && boss.state !== 'enter') {
            // the heavy gunner's steel plate, the shield man's shield: shots count only on his back, so the bot runs
            // round behind him and fires (the shield man's also while his shield is down)
            const bx = -Math.sin(boss.facing);
            const bz = -Math.cos(boss.facing);
            door = { x: boss.x, z: boss.z };
            goal = { x: boss.x + bx * 4, z: boss.z + bz * 4 };
            behind = (p.x - boss.x) * bx + (p.z - boss.z) * bz > 1 || (boss.def.kind === 'bulwark' && !boss.shieldUp);
          } else if (boss.active && boss.def && (boss.def.kind === 'marksman' || boss.def.kind === 'buckshot') && boss.state !== 'enter') {
            // Senado's two: shots on either count wherever they hit, so the bot fires at the nearer
            door = { x: boss.x, z: boss.z };
            behind = g.level.hasLOS(p.x, p.z, boss.x, boss.z);
          } else if (boss.active && boss.def && boss.def.kind === 'blade') {
            // the blade queen: a shot counts only in her window (blades up after a dash), so the bot fires at her then
            door = { x: boss.x, z: boss.z };
            behind = boss.state === 'tell';
          } else if (boss.active && boss.def && boss.def.kind === 'heli' && boss.state !== 'down') {
            // the helicopter: only a blast under it counts, so the bot carries a barrel there and throws it
            const load = g.thrown.carry;
            if (load && load.kind === 'barrel') {
              heli = { x: boss.x, z: boss.z };
              if (Math.hypot(boss.x - p.x, boss.z - p.z) > 5) goal = heli;
            } else if (load) {
              if (i % 20 === 0) inp.pressed.add('KeyG'); // a pan in hand: away with it, the hands are wanted
            } else {
              let near = null;
              for (const q of g.level.barrels) {
                if (!q.alive || q.carried || q.thrown || q.fuse >= 0 || q.rocketT > 0 || (q.y || 0) > 0.6) continue;
                if (!near || Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(near.x - p.x, near.z - p.z)) near = q;
              }
              if (near) {
                goal = { x: near.x, z: near.z };
                fetch = g.thrown.nearProp() === near; // E takes whatever is nearest: only when that is the barrel
              }
            }
          }
          const aimAt = (x, z) => {
            const v = new g.aimPoint.constructor(x, 1.35, z).project(g.camera);
            inp.mouse.x = (v.x * 0.5 + 0.5) * innerWidth;
            inp.mouse.y = (-v.y * 0.5 + 0.5) * innerHeight;
          };
          if (heli) {
            aimAt(heli.x, heli.z);
            inp.mouse.left = false;
            if (!goal && i % 20 === 0) inp.pressed.add('KeyG');
          } else if (goal && !door) {
            // on the way to a barrel: no shooting (a stray shot would set it off)
            inp.mouse.left = false;
            if (fetch) inp.pressed.add('KeyE');
          } else if (door) {
            aimAt(door.x, door.z);
            inp.mouse.left = behind;
          } else if (target) {
            if (!target.jx || random() < 0.03) {
              target.jx = (random() - 0.5) * 2.4;
              target.jz = (random() - 0.5) * 2.4;
            }
            aimAt(target.x + target.jx, target.z + target.jz);
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
          // a target no shot reaches from here (a man up on a grandstand behind a tyre wall): walk his way on the nav grid
          chaseT -= dt;
          if (!target || goal || door || heli) chase = null;
          else if (chaseT <= 0) {
            chaseT = 0.25;
            chase = null;
            if (g.level.raycast(p.x, p.z, target.x, target.z, false, 0, false)) {
              const path = g.level.nav.findPath(p.x, p.z, target.x, target.z);
              // the path's next corner (its points are where it turns)
              if (path) chase = path.find((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.75) || null;
            }
          }
          // a riot shield turned on it (enemies.js shield): its shots glance off, so it walks up to him and kicks the
          // shield aside (down for a moment), as a player does, instead of firing into it
          const sd = target ? Math.hypot(target.x - p.x, target.z - p.z) : 0;
          if (target && !goal && !door && !heli && sd > 0.01 && target.blocks((target.x - p.x) / sd, (target.z - p.z) / sd)) {
            inp.mouse.left = false;
            if (sd < 2) {
              aimAt(target.x, target.z);
              if (i % 15 === 0) inp.pressed.add('KeyF');
            } else if (!chase) {
              const path = g.level.nav.findPath(p.x, p.z, target.x, target.z);
              chase = (path && path.find((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.75)) || { x: target.x, z: target.z };
            }
          }
          lootT -= dt;
          if (!loot || goal || door || heli || (p.special && !p.special.empty)) lootTo = null;
          else if (lootT <= 0) {
            lootT = 0.25;
            lootTo = null;
            let near = null;
            for (const q of g.pickups.list) if (!near || Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(near.x - p.x, near.z - p.z)) near = q;
            const path = near && g.level.nav.findPath(p.x, p.z, near.x, near.z);
            if (path && path.length) lootTo = path.find((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.5) || path[path.length - 1];
          }
          if (lootTo) chase = lootTo;
          // a floor's end offers the style cards (cards.js, 彈幕 ② C②): the bot takes one of them, by their number
          // (a door's prize card comes up before a room's first wave too: F③b)
          if (g.cards.pending && i % 20 === 0) inp.pressed.add(`Digit${1 + (i % 3)}`);
          // 彈幕試驗: a cleared room's exit is open: walk out of it, round the tables on the nav grid
          if (g.waves.state === 'exit' && g.level.exit) {
            const at = g.level.exit.at;
            const path = g.level.nav.findPath(p.x, p.z, at.x, at.z);
            chase = (path && path.find((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.5)) || at;
            // a shut door on its way out (a shop's on the street, 彈幕 ② E④): the nav grid runs through doors, as the
            // men push them open, but the player has to kick one; so the bot turns to it and kicks (only here, with
            // nobody left to shoot: doing it in a fight cost an arcade run six minutes)
            const shut = g.level.fixtures.find((f) => f.kind === 'door' && !f.open && Math.hypot(f.x - p.x, f.z - p.z) < 1.8 && (f.x - p.x) * (chase.x - p.x) + (f.z - p.z) * (chase.z - p.z) > 0);
            if (shut) {
              aimAt(shut.x, shut.z);
              inp.mouse.left = false;
              if (i % 15 === 0) inp.pressed.add('KeyF');
            }
          }
          let kx = wanderX;
          let kz = wanderZ;
          if (chase && !goal) {
            kx = chase.x - p.x;
            kz = chase.z - p.z;
            const yaw = g.camYaw;
            if (yaw) {
              const c = Math.cos(yaw);
              const s = Math.sin(yaw);
              [kx, kz] = [kx * c - kz * s, kx * s + kz * c];
            }
          }
          if (goal) {
            // to the spot behind the truck (or the gunner, a barrel, the helicopter): W is up the screen, so the world direction turns by the camera's yaw (player.js)
            kx = goal.x - p.x;
            kz = goal.z - p.z;
            if (Math.hypot(kx, kz) < 1.5) kx = kz = 0;
            const yaw = g.camYaw;
            if (yaw) {
              const c = Math.cos(yaw);
              const s = Math.sin(yaw);
              [kx, kz] = [kx * c - kz * s, kx * s + kz * c];
            }
          }
          // stuck: pushing a way for most of 1.5 s and not 0.4 m on (into a shut shop door with men out on the street, against
          // a flipped table between it and the exit): it kicks a shut door by it, and sidesteps a random way for 0.8 s
          if (Math.abs(kx) > 0.3 || Math.abs(kz) > 0.3) pushes++;
          if (i % 90 === 0) {
            if (pushes > 60 && Math.hypot(p.x - stuckX, p.z - stuckZ) < 0.4 && g.state === 'playing') {
              unstickT = 0.8;
              const a = random() * 6.28;
              unstickX = Math.sin(a);
              unstickZ = Math.cos(a);
            }
            stuckX = p.x;
            stuckZ = p.z;
            pushes = 0;
          }
          if (unstickT > 0) {
            unstickT -= dt;
            [kx, kz] = [unstickX, unstickZ];
            const shut = g.level.fixtures.find((f) => f.kind === 'door' && !f.open && Math.hypot(f.x - p.x, f.z - p.z) < 1.8);
            if (shut) {
              aimAt(shut.x, shut.z);
              inp.mouse.left = false;
              if (i % 15 === 0) inp.pressed.add('KeyF');
            }
          }
          if (kx > 0.3) inp.keys.add('KeyD');
          if (kx < -0.3) inp.keys.add('KeyA');
          if (kz > 0.3) inp.keys.add('KeyS');
          if (kz < -0.3) inp.keys.add('KeyW');
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
    [map, view, seed, mode, restart, god, loot],
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
