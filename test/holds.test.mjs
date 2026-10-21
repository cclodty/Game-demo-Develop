// Holding things (人物動作 ②): how each thing picked up is held is data
// (characters.js HOLDS). A pan or an umbrella rides in the right hand, its
// grip in the hand, from its rest to its use (the swing, the umbrella open);
// an extinguisher is hugged before the chest with both hands on it, and F
// sprays it; a barrel goes overhead (thrown.js carryHands). Measured on the
// worn model and on the block rig (?models=off): the hands on the grips, and
// nothing held runs into the torso or the head. A throw brings the right arm
// over the top. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

const CASES = [
  ['pan', false],
  ['pan', true],
  ['umbrella', false],
  ['umbrella', true],
  ['extinguisher', false],
  ['barrel', false],
];

/** In a quiet run on the rooftop, the player picks up `kind` (and puts it to use); the rig posed for the frame. */
const holding = (page, kind, use) =>
  page.evaluate(
    async ([kind, use]) => {
      const { PAN } = await import('/src/config.js');
      const g = window.game;
      g.frame = () => {};
      g.view = 2;
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      p.x = 2;
      p.z = 4;
      p.vx = p.vz = 0;
      p.facing = 0.7;
      g.updateAim = () => {};
      g.aimPoint.set(p.x + 4 * Math.sin(0.7), 1.2, p.z + 4 * Math.cos(0.7));
      const prop = g.level.props.find((q) => q.kind === kind && q.alive && !q.carried);
      g.thrown.pickUp(prop);
      for (let i = 0; i < 3; i++) {
        p.hp = 100;
        g.aimFresh = true;
        g.updatePlay(1 / 60);
      }
      if (use && kind === 'pan') p.swingT = PAN.swing * 0.5; // the swing at its height
      if (use && kind === 'umbrella') p.shieldK = 1; // open
      p.facing = 0.7;
      p.rig.stepIdx = -1;
      p.syncRig();
      p.rig.root.updateMatrixWorld(true);
      window.held = prop;
    },
    [kind, use],
  );

/** Where the hands are against where they should be (m), and how many of the held thing's points are inside the torso or the head. */
const measure = (page, kind) =>
  page.evaluate(async (kind) => {
    const THREE = await import('three');
    const { BODY, HOLDS } = await import('/src/characters.js');
    const g = window.game;
    const prop = window.held;
    const rig = g.player.rig;
    const hold = HOLDS[kind];
    const worn = !!rig.skin;
    const at = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    const wrist = (k) => rig.skin.bones[`hand${k}`].getWorldPosition(new THREE.Vector3());
    const hands = [];
    if (hold && hold.hand === 'R') {
      const grip = at(prop.mesh, ...hold.grip);
      // the block hand on the grip; a worn palm (the wrist, skin.js PALM 6 cm back from it along the arm) there too
      hands.push(at(rig.armR, 0, 0, BODY.armLen).distanceTo(grip));
      if (worn) hands.push(wrist('R').distanceTo(at(rig.armR, 0, 0, BODY.armLen - 0.06)));
    } else if (hold) {
      hold.grips.forEach((gp, i) => {
        const grip = at(prop.mesh, ...gp);
        if (worn) hands.push(wrist(i ? 'R' : 'L').distanceTo(grip));
        else hands.push(at(i ? rig.armR : rig.armL, 0, 0, BODY.armLen).distanceTo(grip));
      });
    } else if (worn) {
      // overhead: a worn wrist on the base where carryHands says
      const c = rig.anim.carry;
      for (const s of [1, -1]) hands.push(wrist(s > 0 ? 'L' : 'R').distanceTo(at(rig.root, s * c.half, c.y, c.z)));
    } else {
      // overhead on block arms (they cannot bend): each hand against the barrel's side, within its height
      const base = prop.mesh.getWorldPosition(new THREE.Vector3());
      for (const arm of [rig.armL, rig.armR]) {
        const p = at(arm, 0, 0, BODY.armLen);
        const side = Math.abs(Math.hypot(p.x - base.x, p.z - base.z) - prop.r);
        hands.push(p.y > base.y && p.y < base.y + 1.2 ? side : 1);
      }
    }
    const inv = rig.inner.matrixWorld.clone().invert();
    const v = new THREE.Vector3();
    let torso = 0;
    let head = 0;
    prop.mesh.traverse((m) => {
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        if (Math.abs(v.x) < BODY.torsoW / 2 && Math.abs(v.y - BODY.torsoY) < BODY.torsoH / 2 && Math.abs(v.z) < BODY.torsoD / 2) torso++;
        if (Math.abs(v.x) < BODY.headW / 2 && Math.abs(v.y - BODY.headY) < BODY.headH / 2 && Math.abs(v.z) < BODY.headD / 2) head++;
      }
    });
    return { worn, hands: hands.map((d) => Math.round(d * 1000) / 10), torso, head };
  }, kind);

for (const [label, query] of [
  ['worn', '?seed=4'],
  ['block (?models=off)', '?seed=4&models=off'],
]) {
  test(`${label}: a pan and an umbrella in the hand, at rest and in use; an extinguisher in the arms; a barrel overhead: the hands within 2 cm of the grips, nothing in the torso or the head`, { timeout: 180000 }, async () => {
    const { page, logs } = await h.open(query);
    try {
      for (const [kind, use] of CASES) {
        await holding(page, kind, use);
        const r = await measure(page, kind);
        const name = `${kind}${use ? ' in use' : ''}`;
        assert.equal(r.worn, label === 'worn', `${name}: the right rig`);
        assert.ok(r.hands.length > 0 && r.hands.every((cm) => cm <= 2), `${name}: hands ${r.hands.join(', ')} cm from their grips`);
        assert.deepEqual([r.torso, r.head], [0, 0], `${name}: points in the torso, in the head`);
      }
      assert.deepEqual(problems(logs), []);
    } finally {
      await page.close();
    }
  });
}

test('F with the extinguisher in the arms sprays it where the aim is: its cloud 2 m ahead, the player at its edge, the thing spent; G throws one from the chest', async () => {
  const { page, logs } = await h.open('?seed=4');
  try {
    await holding(page, 'extinguisher', false);
    const r = await page.evaluate(async () => {
      const { ENV } = await import('/src/config.js');
      const { HOLDS } = await import('/src/characters.js');
      const g = window.game;
      const p = g.player;
      const prop = window.held;
      g.thrown.update(0);
      const prompt = g.thrown.prompt;
      const guns = p.rig.weaponParts.some((m) => m.visible);
      g.input.pressed.add('KeyF');
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.input.pressed.clear();
      const dir = Math.atan2(g.aimPoint.x - p.x, g.aimPoint.z - p.z);
      const spray = {
        carried: g.thrown.carry,
        smoke: prop.smokeT > 0,
        ahead: Math.round(Math.hypot(prop.x - p.x, prop.z - p.z) * 100) / 100,
        along: Math.round(Math.cos(Math.atan2(prop.x - p.x, prop.z - p.z) - dir) * 100) / 100,
        inCloud: prop.smokeAt(p.x, p.z),
        log: g.notes.events.some((e) => e.text === '滅火筒噴霧'),
        want: ENV.sprayAhead,
      };
      // another, thrown: it leaves from the chest, where it was held
      const other = g.level.props.find((q) => q.kind === 'extinguisher' && q.alive && !q.carried && q !== prop && q.smokeT <= 0);
      let thrownFrom = null;
      if (other) {
        p.x = other.x;
        p.z = other.z;
        g.thrown.pickUp(other);
        g.thrown.throwCarried();
        thrownFrom = Math.round(other.y * 100) / 100;
      }
      return { prompt, guns, spray, thrownFrom, chest: HOLDS.extinguisher.at[1] };
    });
    assert.match(r.prompt, /噴霧/, 'the hint names the spray');
    assert.equal(r.guns, false, 'both hands on it: the guns put away');
    assert.equal(r.spray.carried, null, 'sprayed, it is no longer held');
    assert.equal(r.spray.smoke, true, 'its cloud is out');
    assert.ok(Math.abs(r.spray.ahead - r.spray.want) < 0.05 && r.spray.along > 0.99, `the cloud ${r.spray.ahead} m out along the aim`);
    assert.equal(r.spray.inCloud, true, 'the player at the edge of it, inside');
    assert.equal(r.spray.log, true);
    if (r.thrownFrom !== null) assert.ok(Math.abs(r.thrownFrom - r.chest) < 0.05, `thrown from the chest (${r.thrownFrom} m)`);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('a throw brings the right arm over the top: up and back as it starts, ahead as it ends', async () => {
  const { page, logs } = await h.open('?seed=4&models=off');
  try {
    await holding(page, 'barrel', false);
    const r = await page.evaluate(async () => {
      const THREE = await import('three');
      const { HOLDS } = await import('/src/characters.js');
      const g = window.game;
      const p = g.player;
      g.thrown.throwCarried();
      const T = HOLDS.throw;
      const arm = (left) => {
        p.throwT = left;
        p.rig.stepIdx = -1;
        p.syncRig();
        p.rig.root.updateMatrixWorld(true);
        const d = new THREE.Vector3(0, 0, 1).applyQuaternion(p.rig.armR.getWorldQuaternion(new THREE.Quaternion()));
        const f = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
        return { up: Math.round(d.y * 100) / 100, ahead: Math.round(d.dot(f) * 100) / 100 };
      };
      return { set: T.time, start: arm(T.time - 0.01), end: arm(0.01) };
    });
    assert.ok(r.start.up > 0.5 && r.start.ahead < 0, `as it starts the arm is up and back (${JSON.stringify(r.start)})`);
    assert.ok(r.end.ahead > 0.9, `as it ends the arm is ahead (${JSON.stringify(r.end)})`);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('screenshots: each thing held and in use (the swing, open, the spray, a throw), worn and block', { timeout: 240000 }, async () => {
  for (const [tag, query] of [
    ['worn', '?seed=4'],
    ['block', '?seed=4&models=off'],
  ]) {
    const { page, logs } = await h.open(query);
    try {
      for (const c of ['pan', 'pan-use', 'umbrella', 'umbrella-use', 'extinguisher', 'extinguisher-use', 'barrel', 'barrel-use', 'gun-use']) {
        const kind = c.split('-')[0];
        const use = c.endsWith('-use');
        if (kind === 'gun') {
          await page.evaluate(() => {
            const g = window.game;
            g.startRun(0);
            g.waves.state = 'done';
            g.enemies.clear();
            const p = g.player;
            p.x = 2;
            p.z = 4;
            p.facing = 0.7;
            g.aimPoint.set(p.x + 4 * Math.sin(0.7), 1.2, p.z + 4 * Math.cos(0.7));
            p.giveWeapon('shotgun', 1);
            p.special.ammo = 0;
            p.special.empty = true;
            p.equip('pistols');
          });
        } else await holding(page, kind, use && kind !== 'extinguisher' && kind !== 'barrel');
        await page.evaluate(
          async ([kind, use]) => {
            const { HOLDS } = await import('/src/characters.js');
            const g = window.game;
            const p = g.player;
            if (use && kind === 'extinguisher') {
              g.thrown.spray();
              for (let i = 0; i < 20; i++) g.updatePlay(1 / 60);
            }
            if (use && (kind === 'barrel' || kind === 'gun')) {
              if (kind === 'barrel') g.thrown.throwCarried();
              else g.thrown.throwGun();
              g.updatePlay(1 / 120);
              p.throwT = HOLDS.throw.time * 0.45;
            }
            p.facing = 0.7;
            p.rig.stepIdx = -1;
            p.syncRig();
            g.updateCamera(1, true);
            g.camera.position.lerp(g.camTarget, 0.62);
            g.hud.update(1 / 60);
            g.render();
          },
          [kind, use],
        );
        await page.screenshot({ path: new URL(`hold-${tag}-${c}.png`, OUT).pathname });
      }
      assert.deepEqual(problems(logs), []);
    } finally {
      await page.close();
    }
  }
});
