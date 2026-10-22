// 新模型校正: the worn models stand on the floor, hold their weapons and point
// them along the laser, and the prop models fill their collision boxes. The
// posed meshes are measured vertex by vertex (Box3 precise), so a model, a
// clip or a fitting change that moves a foot, a hand or a box past the
// tolerances below fails here before anyone sees it in the game. Every
// measurement also goes to test/.out/calibration.json. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gameHarness, OUT, problems } from './helpers.mjs';

const CM = 0.01;
const FEET = 2 * CM; // idle soles from the floor
const RUN_SINK = 3 * CM; // how far a sole may dip into the floor at a running step (bigger comic feet); scaled with the character
const HAND = 3 * CM; // wrist from where it should close on a grip
const MUZZLE = 2 * CM; // a gun's muzzle from where the laser starts, along the floor
const AIM_DEG = 3; // a barrel's direction from the laser's
const TWIST_DEG = 5; // the shoulders from square to the aim, one-handed guns
const BOX = 1 * CM; // a fitted prop from its collision box
const ROUND = 5 * CM; // a round prop's model from its block version

let h;
const report = {};
before(async () => {
  h = await gameHarness();
});
after(async () => {
  fs.writeFileSync(new URL('calibration.json', OUT), JSON.stringify(report, null, 1));
  await h.close();
});

/** Measure every character rig in the page: idle feet, a run cycle, a kick, hands on grips, muzzles against the laser. */
const measureCharacters = (page) =>
  page.evaluate(async () => {
    const THREE = await import('three');
    const C = await import('/src/characters.js');
    const { TYPES } = await import('/src/enemies.js');
    const { PLAYER_WEAPONS } = await import('/src/weapons.js');
    const { GUN_Y } = await import('/src/config.js');
    const { characterTemplate, weaponTemplate } = await import('/src/models.js');
    const g = window.game;
    const PALM = 0.06; // skin.js: the wrist sits this far behind a grip
    const GRIP = C.BODY.armLen;
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    const sole = (rig) => {
      rig.root.updateMatrixWorld(true);
      return box.setFromObject(rig.skin.model, true).min.y;
    };
    const cases = [...new Set(Object.values(PLAYER_WEAPONS).map((w) => w.model))].map((weapon) => ({ id: 'hero', opts: { model: 'hero', weapon } }));
    for (const [id, t] of Object.entries(TYPES)) cases.push({ id, opts: { ...t.look, model: id } });
    const out = [];
    for (const { id, opts } of cases) {
      if (!characterTemplate(id)) continue;
      const rig = C.buildCharacter(opts);
      g.scene.add(rig.root);
      const s = rig.scale;
      const row = { id, weapon: rig.model, scale: s };
      const bones = rig.skin.bones;
      const feet = [];
      rig.skin.model.traverse((o) => {
        if (o.isBone && /(foot|toebase)$/i.test(o.name)) feet.push(o);
      });

      // a run cycle: the lowest sole at each of 24 steps, and the highest any foot bone gets
      const run = [];
      let footTop = 0;
      for (let i = 0; i < 24; i++) {
        C.animateRig(rig, (i / 24) * Math.PI * 2, 1, 0);
        C.finishRig(rig, 0);
        run.push(sole(rig));
        for (const f of feet) footTop = Math.max(footTop, f.getWorldPosition(v).y);
      }
      row.run = { low: Math.min(...run), high: Math.max(...run), footTop };

      // a kick, as player.js poses it at its height: the right leg out in front
      C.animateRig(rig, 0, 0);
      rig.legR.rotation.x = -1.7;
      C.finishRig(rig, 0);
      rig.root.updateMatrixWorld(true);
      const kickFoot = feet.find((f) => /right/i.test(f.name) && /foot$/i.test(f.name));
      row.kick = kickFoot ? kickFoot.getWorldPosition(v).toArray() : null;

      // idle, facing +z: feet, hands, muzzles
      C.animateRig(rig, 0, 0);
      C.finishRig(rig, 0);
      row.idle = sole(rig);
      const wrist = (k) => bones[`hand${k}`].getWorldPosition(new THREE.Vector3());
      const at = (holder, x, y, z) => holder.localToWorld(new THREE.Vector3(x, y, z));
      const hands = [];
      if (rig.hold === 'dual' || rig.hold === 'right') {
        hands.push(['R', wrist('R').distanceTo(at(rig.armR, 0, 0, GRIP - PALM))]);
        if (rig.hold === 'dual') hands.push(['L', wrist('L').distanceTo(at(rig.armL, 0, 0, GRIP - PALM))]);
      } else {
        const holder = rig.hold === 'center' ? rig.center : rig.anchor;
        const [g0, g1] = rig.grips;
        hands.push(['R', wrist('R').distanceTo(at(holder, g0[0], g0[1], g0[2] - PALM))]);
        // the support hand may slide back along the gun (skin.js arm()): measure from that stretch
        const slide = g1[2] - g0[2] - 0.1;
        const seg = new THREE.Line3(at(holder, g1[0], g1[1], g1[2] - PALM - slide), at(holder, g1[0], g1[1], g1[2] - PALM));
        hands.push(['L', wrist('L').distanceTo(seg.closestPointToPoint(wrist('L'), true, new THREE.Vector3()))]);
      }
      row.hands = hands;
      // one-handed holds keep the chest square to the aim (the shoulder line across the facing); long guns turn it side-on on purpose
      if (rig.hold === 'dual' || rig.hold === 'right') {
        const l = bones.upperArmL.getWorldPosition(new THREE.Vector3());
        const r = bones.upperArmR.getWorldPosition(new THREE.Vector3());
        row.twist = (Math.abs(Math.atan2(r.z - l.z, l.x - r.x)) * 180) / Math.PI;
      }

      // muzzles: the model's muzzle socket against where the game starts the laser (player.js / enemies.js muzzle())
      const tpl = weaponTemplate(C.MODELS[rig.model].asset);
      const tip = tpl && (tpl.sockets.muzzle || tpl.sockets.tip);
      row.muzzles = [];
      if (tpl && tpl.sockets.muzzle) {
        const len = rig.muzzles[0][1];
        const starts =
          rig.hold === 'dual'
            ? [
                // weaponParts: the left gun first, then the right; each shoulder's laser turns with its arm
                [C.SHOULDER_X * s + Math.sin(rig.armL.rotation.y) * len, Math.cos(rig.armL.rotation.y) * len],
                [-C.SHOULDER_X * s + Math.sin(rig.armR.rotation.y) * len, Math.cos(rig.armR.rotation.y) * len],
              ]
            : [rig.muzzles[0]];
        rig.weaponParts.forEach((gun, i) => {
          const m = gun.localToWorld(tip.clone());
          const axis = new THREE.Vector3(0, 0, 1).transformDirection(gun.matrixWorld);
          const [lx, lz] = starts[i];
          // the player's laser runs from the muzzle to the aim point (here 8 m straight ahead); an enemy's along its facing
          const [dx, dz] = id === 'hero' ? [0 - lx, 8 - lz] : [0, 1];
          const deg = (Math.abs(Math.atan2(axis.x, axis.z) - Math.atan2(dx, dz)) * 180) / Math.PI;
          row.muzzles.push({ off: Math.hypot(m.x - lx, m.z - lz), deg, y: m.y, laserY: GUN_Y });
        });
      }
      out.push(row);
      g.scene.remove(rig.root);
      C.disposeRig(rig);
    }
    return out;
  });

/** Load every map and measure each made prop model against its collision box or its block version. */
const measureProps = (page) =>
  page.evaluate(async () => {
    const THREE = await import('three');
    const { ALIASES, ASSETS, MAP_ALIASES } = await import('/src/asset-manifest.js');
    const g = window.game;
    const box = new THREE.Box3();
    const size = (b) => [b.max.x - b.min.x, b.max.z - b.min.z, b.max.y - b.min.y];
    const out = [];
    for (const map of g.maps) {
      g.level.load(map);
      const level = g.level;
      for (const s of level.solids) {
        if (!s.model) continue;
        const alias = MAP_ALIASES[map.id]?.[s.modelKey] ?? s.modelKey;
        const spec = ASSETS[(ALIASES[alias] ?? [alias])[0]];
        s.model.updateMatrixWorld(true);
        box.setFromObject(s.model, true);
        const [x, z] = [(s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2];
        const ground = level.groundY(x, z); // raised ground (大三巴's landings): the box's height and the model's feet count from there
        out.push({ map: map.id, kind: s.modelKey, fit: spec.fit || 'box', box: [s.maxX - s.minX, s.maxZ - s.minZ, s.h - ground], model: size(box), off: [(box.min.x + box.max.x) / 2 - x, (box.min.z + box.max.z) / 2 - z], base: box.min.y - ground });
      }
      for (const q of level.props) {
        if (q.fixed) continue; // a fixture (lamp, sign, door…): built from blocks, no model to measure
        // lay it at rest where the map puts it, facing +z, and measure the made model
        const m = q.kind === 'barrel' ? q.body : q.kind === 'pan' ? q.tilt : null;
        if (!m || !m.children.length || m.children[0].isMesh) continue; // the block version (or a tool): nothing made to measure
        q.mesh.position.set(q.x, q.kind === 'pan' ? 0.05 : 0, q.z);
        q.mesh.rotation.set(0, 0, 0);
        m.rotation.set(0, 0, 0);
        q.mesh.updateMatrixWorld(true);
        box.setFromObject(m, true);
        out.push({ map: map.id, kind: q.variant, round: true, model: size(box), min: [box.min.x - q.x, box.min.z - q.z], max: [box.max.x - q.x, box.max.z - q.z], base: box.min.y });
      }
    }
    return out;
  });

const fmt = (v) => `${(v * 100).toFixed(1)} cm`;

for (const style of ['on', 'off']) {
  test(`worn models stand on the floor, hold their guns and point them along the laser (style ${style})`, { timeout: 240000 }, async () => {
    const { page, logs } = await h.open(style === 'off' ? '?style=off' : '');
    let rows;
    try {
      rows = await measureCharacters(page);
    } finally {
      await page.close(); // a page left running slows every later test
    }
    report[`characters-style-${style}`] = rows;
    if (!rows.length) return; // ?models=off or no character models: nothing to calibrate
    assert.deepEqual([...new Set(rows.map((r) => r.id))].sort(), ['brute', 'grunt', 'hero', 'rifle', 'rusher', 'shotgun'], 'all six characters are worn');
    for (const r of rows) {
      const who = `${r.id} with ${r.weapon}`;
      assert.ok(Math.abs(r.idle) <= FEET, `${who}: idle soles ${fmt(r.idle)} from the floor`);
      assert.ok(r.run.low >= -RUN_SINK * r.scale, `${who}: a running step sinks ${fmt(-r.run.low)} into the floor`);
      assert.ok(r.run.low <= FEET, `${who}: the feet never touch down in the run (lowest ${fmt(r.run.low)})`);
      assert.ok(r.run.footTop <= 0.7 * r.scale, `${who}: a foot flies to ${fmt(r.run.footTop)} while running`);
      assert.ok(r.kick && r.kick[1] > 0.45 * r.scale && r.kick[2] > 0.3 * r.scale, `${who}: the kick puts the right foot up in front (${r.kick})`);
      for (const [hand, d] of r.hands) assert.ok(d <= HAND, `${who}: ${hand} hand ${fmt(d)} from its grip`);
      if (r.twist !== undefined) assert.ok(r.twist <= TWIST_DEG, `${who}: the chest is turned ${r.twist.toFixed(1)}° off the aim`);
      for (const m of r.muzzles) {
        assert.ok(m.off <= MUZZLE, `${who}: muzzle ${fmt(m.off)} from the laser's start`);
        assert.ok(m.deg <= AIM_DEG, `${who}: barrel ${m.deg.toFixed(1)}° off the laser`);
        if (r.scale === 1) assert.ok(Math.abs(m.y - m.laserY) <= 0.08, `${who}: muzzle at ${m.y.toFixed(2)} m, laser at ${m.laserY} m`);
      }
    }
    // every gun but the blade has a muzzle to check
    assert.ok(rows.filter((r) => r.weapon !== 'blade').every((r) => r.muzzles.length > 0));
    assert.deepEqual(problems(logs), []);
  });
}

test('prop models fill their collision boxes and stand on the floor on every map', { timeout: 240000 }, async () => {
  const { page, logs } = await h.open();
  const rows = await measureProps(page).finally(() => page.close());
  report.props = rows;
  if (!rows.length) return;
  const BLOCK = { barrel: 0.9, gas: 1.16, lpg: 0.6, pan: 0.82, tray: 0.82 }; // the block versions' widths (level.js geo)
  for (const r of rows) {
    const what = `${r.map} ${r.kind}`;
    assert.ok(Math.abs(r.base) <= BOX, `${what}: stands ${fmt(r.base)} off the floor`);
    if (r.round) {
      const [w, d] = r.model;
      assert.ok(Math.abs(w - BLOCK[r.kind]) <= ROUND, `${what}: ${fmt(w)} wide, the block one ${fmt(BLOCK[r.kind])}`);
      // centred on its collision circle: the far side of the disk is as far out as the near side (a pan's handle sticks out at +z)
      const back = -r.min[1];
      assert.ok(Math.abs(-r.min[0] - r.max[0]) <= BOX, `${what}: off centre across`);
      assert.ok(Math.abs(back - w / 2) <= BOX, `${what}: off centre along (back edge ${fmt(back)} from the centre)`);
      if (r.kind !== 'pan') assert.ok(Math.abs(d - w) <= BOX, `${what}: not round (${fmt(w)} by ${fmt(d)})`);
      continue;
    }
    const [w, d, hgt] = r.model;
    const [bw, bd, bh] = r.box;
    assert.ok(Math.hypot(...r.off) <= BOX, `${what}: centre ${fmt(Math.hypot(...r.off))} off its box`);
    if (r.fit !== 'height') {
      assert.ok(Math.abs(w - bw) <= BOX && Math.abs(d - bd) <= BOX, `${what}: footprint ${w.toFixed(2)}×${d.toFixed(2)} for a ${bw}×${bd} box`);
    }
    if (r.fit === 'footprint') assert.ok(hgt >= bh - 5 * CM, `${what}: ${hgt.toFixed(2)} m tall for a ${bh} m box`);
    else assert.ok(Math.abs(hgt - bh) <= BOX, `${what}: ${hgt.toFixed(2)} m tall for a ${bh} m box`);
  }
  for (const id of ['rooftop', 'club', 'docks', 'senado']) assert.ok(rows.some((r) => r.map === id), `${id} has prop models`);
  assert.deepEqual(problems(logs), []);
});

/** Stand the six characters in a row in front of the player's start (idle, one more hero mid-stride) and hold the camera on them; `close` moves the camera in. */
const lineup = (page, view, close) =>
  page.evaluate(
    async ([view, close]) => {
      const C = await import('/src/characters.js');
      const { TYPES } = await import('/src/enemies.js');
      const g = window.game;
      g.frame = () => {};
      for (const rig of window.lineupRigs || []) g.scene.remove(rig.root);
      g.view = view;
      g.startRun(3); // Senado: pale paving in daylight shows where the feet meet the floor
      g.enemies.clear();
      const p = g.player;
      p.rig.root.visible = false;
      p.aimLaser.hide();
      g.aimPoint.set(p.x, 0, p.z);
      const looks = [{ model: 'hero', weapon: 'dualPistol', accent: 0x2ee8ff }, ...Object.entries(TYPES).map(([id, t]) => ({ ...t.look, model: id })), { model: 'hero', weapon: 'dualPistol', accent: 0x2ee8ff, run: true }];
      window.lineupRigs = looks.map((look, i) => {
        const rig = C.buildCharacter(look);
        rig.root.position.set(p.x + (i - (looks.length - 1) / 2) * 1.5, 0, p.z);
        g.scene.add(rig.root);
        C.animateRig(rig, look.run ? 1.2 : 0, look.run ? 1 : 0, 0);
        C.finishRig(rig, 0.4);
        return rig;
      });
      g.updateCamera(1, true);
      if (close) g.camera.position.lerp(g.camTarget, 0.62);
      g.hud.update(1 / 60);
      g.render();
    },
    [view, close],
  );

/** The docks around the start in the 45° side view, no enemies. */
const docks = (page) =>
  page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    for (const rig of window.lineupRigs || []) g.scene.remove(rig.root);
    g.view = 2;
    g.startRun(2);
    g.enemies.clear();
    g.player.rig.root.visible = true;
    g.aimPoint.set(g.player.x, 0, g.player.z);
    g.updateCamera(1, true);
    g.render();
  });

test('screenshots: the characters in the three views and close up, the props with and without models', { timeout: 240000 }, async () => {
  const shot = (page, file) => page.screenshot({ path: new URL(file, OUT).pathname });
  const { page, logs } = await h.open();
  try {
    for (const [file, view, close] of [
      ['calib-top.png', 0],
      ['calib-tilt.png', 1],
      ['calib-iso.png', 2],
      ['calib-close.png', 2, true],
    ]) {
      await lineup(page, view, close);
      await shot(page, file);
    }
    await docks(page);
    await shot(page, 'calib-props-models.png');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
  // the same view with the block versions, which are the collision boxes
  const off = await h.open('?models=off');
  try {
    await docks(off.page);
    await shot(off.page, 'calib-props-blocks.png');
    assert.deepEqual(problems(off.logs), []);
  } finally {
    await off.page.close();
  }
});
