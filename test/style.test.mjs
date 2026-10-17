// The look: toon materials replace every lit material (neon stays), characters
// and props get an outline, the player's moves leave fading afterimages,
// character poses hold at 12 fps, worn models get comic proportions, the
// switches are remembered and ?style=off turns it all off. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

// start a run on the rooftop with the real loop stopped; window.step(n, keys, press) plays n displayed frames
const begin = async (page) => {
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    const inp = g.input;
    g.player.x = 0;
    g.player.z = 0;
    window.step = (n, keys = [], press = []) => {
      for (let i = 0; i < n; i++) {
        g.time += 1 / 60;
        inp.pressed.clear();
        inp.keys.clear();
        inp.mouse.leftPressed = inp.mouse.rightPressed = inp.mouse.rightReleased = false;
        inp.mouse.left = false;
        for (const k of keys) inp.keys.add(k);
        if (i === 0) for (const k of press) inp.pressed.add(k);
        g.player.hp = 100;
        g.enemies.clear();
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
  });
};

const survey = (page) =>
  page.evaluate(() => {
    const g = window.game;
    const mats = (o) => (Array.isArray(o.material) ? o.material : [o.material]);
    const world = { toon: 0, lit: 0, basic: 0, cutaway: 0, hulls: 0 };
    g.level.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.hull) {
        world.hulls++;
        return;
      }
      for (const m of mats(o)) {
        if (m.isMeshToonMaterial) {
          world.toon++;
          if (m.userData.cutaway) world.cutaway++;
        } else if (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) world.lit++;
        else if (m.isMeshBasicMaterial) world.basic++;
      }
    });
    const rig = g.player.rig;
    const player = { toon: 0, lit: 0, hulls: 0, hullsVisible: 0, skinned: 0 };
    rig.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.hull) {
        player.hulls++;
        if (o.visible) player.hullsVisible++;
        return;
      }
      if (o.isSkinnedMesh) player.skinned++;
      for (const m of mats(o)) {
        if (m.isMeshToonMaterial) player.toon++;
        else if (m.isMeshStandardMaterial) player.lit++;
      }
    });
    const propHulls = g.level.props.reduce((n, p) => {
      let k = 0;
      p.mesh.traverse((o) => {
        if (o.userData.hull) k++;
      });
      return n + k;
    }, 0);
    let head = null;
    if (rig.skin) rig.skin.model.traverse((o) => {
      if (o.isBone && /head$/i.test(o.name)) head = o.scale.x;
    });
    world.hulls -= propHulls; // the props stand in the level root but take the character line
    return { world, player, propHulls, head, skinY: rig.skin ? rig.skin.root.position.y : null, on: { ...g.style.on }, stored: localStorage.getItem('bullet-ballet.style') };
  });

test('toon materials everywhere lit, neon untouched, outlines on characters and props, proportions on', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  await begin(page);
  const s = await survey(page);
  assert.ok(s.world.toon > 50, `world toon materials: ${s.world.toon}`);
  assert.equal(s.world.lit, 0, 'no lit material is left as it was');
  assert.ok(s.world.basic > 0, 'basic (neon) materials stay');
  assert.ok(s.world.cutaway > 0, 'the cutaway hook moved to the toon twins');
  assert.equal(s.world.hulls, 0, 'the world has no outline by default');
  assert.ok(s.player.skinned > 0, 'the hero model is worn');
  assert.equal(s.player.lit, 0);
  assert.ok(s.player.toon > 0);
  assert.ok(s.player.hulls > 0 && s.player.hullsVisible === s.player.hulls, `player outline: ${s.player.hullsVisible}/${s.player.hulls}`);
  assert.ok(s.propHulls > 0, 'barrels and pans have outlines');
  assert.equal(s.head, 1.28, 'the head is scaled');
  assert.ok(s.skinY < 0, 'the model dropped to keep its feet on the ground');
  // the world outline switch adds lines live
  await page.evaluate(() => window.game.style.set('worldOutline', true));
  const w = await survey(page);
  assert.ok(w.world.hulls > 50, `world hulls after the switch: ${w.world.hulls}`);
  assert.deepEqual(problems(logs), []);
  await snap(page, 'style-rooftop.png');
  await page.close();
});

test('?style=off: nothing converted, no lines, no step, no afterimages, nothing remembered', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open('?style=off');
  await begin(page);
  const s = await survey(page);
  assert.equal(s.world.toon, 0);
  assert.ok(s.world.lit > 50);
  assert.equal(s.player.hulls, 0);
  assert.equal(s.propHulls, 0);
  assert.equal(s.head, 1);
  assert.equal(s.skinY, 0);
  assert.deepEqual(Object.values(s.on).filter(Boolean), []);
  await page.evaluate(() => window.game.style.set('outline', true));
  const t = await survey(page);
  assert.equal(t.stored, null, 'a choice made under ?style=off is not remembered');
  const r = await page.evaluate(() => {
    const g = window.game;
    g.player.spinCd = 0;
    window.step(1, [], ['Space']);
    window.step(8);
    return g.style.ghosts.live.length;
  });
  assert.equal(r, 0);
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('a spin leaves afterimages that fade in world time; the switch stops them', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  await begin(page);
  const r = await page.evaluate(() => {
    const g = window.game;
    g.player.spinCd = 0;
    window.step(1, [], ['Space']);
    window.step(9);
    const during = g.style.ghosts.live.length;
    const kinds = g.style.ghosts.live.map((x) => x.kind);
    window.step(40);
    const after = g.style.ghosts.live.length;
    g.style.set('ghosts', false);
    g.player.spinCd = 0;
    window.step(1, [], ['Space']);
    window.step(9);
    const off = g.style.ghosts.live.length;
    g.style.set('ghosts', true);
    return { during, kinds, after, off };
  });
  assert.ok(r.during >= 2, `afterimages during the spin: ${r.during}`);
  assert.ok(r.kinds.every((k) => k === 'skin'), r.kinds.join(','));
  assert.equal(r.after, 0, 'they are gone 0.6 s later');
  assert.equal(r.off, 0);
  await page.evaluate(() => {
    const g = window.game;
    g.player.spinCd = 0;
    window.step(1, [], ['Space']);
    window.step(7);
  });
  await snap(page, 'style-spin.png');
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('character poses hold at 12 fps while the body keeps moving', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  await begin(page);
  const r = await page.evaluate(() => {
    const g = window.game;
    const r = g.player.rig;
    const run = (stepped) => {
      g.style.set('stepped', stepped);
      g.player.spinCd = 0;
      g.player.spinT = 0;
      window.step(1, [], ['Space']);
      const yaw = [];
      const x = [];
      for (let i = 0; i < 12; i++) {
        window.step(1, ['KeyD']);
        yaw.push(r.inner.rotation.y);
        x.push(r.root.position.x);
      }
      let changes = 0;
      for (let i = 1; i < yaw.length; i++) if (yaw[i] !== yaw[i - 1]) changes++;
      let moves = 0;
      for (let i = 1; i < x.length; i++) if (x[i] !== x[i - 1]) moves++;
      return { changes, moves };
    };
    const stepped = run(true);
    const smooth = run(false);
    g.style.set('stepped', true);
    return { stepped, smooth };
  });
  assert.ok(r.stepped.changes >= 1 && r.stepped.changes <= 4, `stepped: the spin yaw changed ${r.stepped.changes} times in 12 frames`);
  assert.equal(r.stepped.moves, 11, 'the body still moves every frame');
  assert.ok(r.smooth.changes >= 10, `smooth: ${r.smooth.changes} changes`);
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('switches are remembered across a reload', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  await begin(page);
  await page.evaluate(() => {
    window.game.style.set('outline', false);
    window.game.style.set('proportion', false);
  });
  let s = await survey(page);
  assert.equal(s.player.hullsVisible, 0, 'outline off hides the lines');
  assert.equal(s.head, 1, 'proportion off restores the head');
  await page.reload();
  await page.waitForFunction(() => window.game && typeof window.game.startRun === 'function', null, { timeout: 120000 });
  await begin(page);
  s = await survey(page);
  assert.equal(s.on.outline, false);
  assert.equal(s.on.proportion, false);
  assert.equal(s.player.hullsVisible, 0);
  assert.equal(s.head, 1);
  assert.ok(s.world.toon > 50, 'toon is still on');
  assert.deepEqual(problems(logs), []);
  await page.close();
});
