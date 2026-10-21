// Hands (試玩回饋 ①): carrying a pan or a barrel overhead, both hands are on
// it and the guns are put away (it is shown low enough to reach; a throw still
// starts from the carry height), and the minigun is held by its rear grip and
// its top carry handle with the body a little side-on. Measured on the worn
// model, wrist by wrist. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

test('carrying a barrel: hands on it, guns away, the throw from the same height as before; a pan rides in the right hand (工具 ①)', async () => {
  const { page, logs } = await h.open('?seed=4');
  try {
    const r = await page.evaluate(async () => {
      const THREE = await import('three');
      const { PAN } = await import('/src/config.js');
      const g = window.game;
      g.frame = () => {};
      g.startRun(1);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      const out = { worn: !!p.rig.skin };
      for (const kind of ['pan', 'barrel']) {
        g.thrown.carry = null;
        p.x = 0;
        p.z = 3;
        p.facing = 0.4;
        const prop = g.level.props.find((q) => q.kind === kind && q.alive && !q.carried);
        g.thrown.pickUp(prop);
        g.updateAim = () => {};
        g.aimPoint.set(4, 1.2, 9);
        for (let i = 0; i < 4; i++) {
          p.hp = 100;
          g.aimFresh = true;
          g.updatePlay(1 / 60);
        }
        p.rig.stepIdx = -1;
        p.syncRig();
        p.rig.root.updateMatrixWorld(true);
        const row = { logicY: prop.y, shownY: prop.mesh.position.y, guns: p.rig.weaponParts.map((m) => m.visible), inHand: g.thrown.inHand, handY: PAN.handY };
        if (kind === 'pan') {
          // in the right hand (thrown.js inHand): the pan is the arm's child, the right pistol away, the left one out
          row.onArm = prop.mesh.parent === p.rig.armR;
          row.rightGuns = p.rig.weaponParts.filter((m) => m.parent === p.rig.armR).map((m) => m.visible);
          row.leftGuns = p.rig.weaponParts.filter((m) => m.parent === p.rig.armL).map((m) => m.visible);
          if (p.rig.skin) {
            // held by the end of its handle (characters.js HOLDS: test/holds.test.mjs measures it to the cm)
            const { HOLDS } = await import('/src/characters.js');
            const gripAt = prop.mesh.localToWorld(new THREE.Vector3(...HOLDS.pan.grip));
            row.wrist = p.rig.skin.bones.handR.getWorldPosition(new THREE.Vector3()).distanceTo(gripAt);
          }
        } else if (p.rig.skin) {
          const b = p.rig.skin.bones;
          const c = p.rig.anim.carry;
          row.hands = [1, -1].map((s) => {
            const want = p.rig.root.localToWorld(new THREE.Vector3(s * c.half, c.y, c.z));
            return b[s > 0 ? 'handL' : 'handR'].getWorldPosition(new THREE.Vector3()).distanceTo(want);
          });
          row.y = c.y;
        }
        out[kind] = row;
        // thrown: from the carry height, as before
        g.thrown.throwCarried();
        out[kind].thrownY = prop.y;
      }
      return out;
    });
    const k = r.barrel;
    assert.equal(k.inHand, false, 'a barrel goes overhead');
    assert.ok(Math.abs(k.logicY - 2.15) < 0.05, `barrel: carried at 2.15 m for the game (${k.logicY.toFixed(2)})`);
    assert.ok(k.shownY < k.logicY - 0.1, `barrel: shown lower, within reach (${k.shownY.toFixed(2)} m)`);
    assert.ok(k.guns.every((v) => v === false), 'barrel: the guns put away');
    assert.ok(Math.abs(k.thrownY - 1.85) < 0.05, `barrel: thrown from 1.85 m, as before (${k.thrownY.toFixed(2)})`);
    if (r.worn) for (const d of k.hands) assert.ok(d < 0.06, `barrel: a wrist ${(d * 100).toFixed(1)} cm from its hold`);
    const q = r.pan;
    assert.equal(q.inHand, true, 'a pan goes into the right hand');
    assert.ok(Math.abs(q.logicY - q.handY) < 0.05, `pan: carried at hand height for the game (${q.logicY.toFixed(2)})`);
    assert.equal(q.onArm, true, 'pan: the mesh rides on the right arm');
    assert.ok(q.rightGuns.length > 0 && q.rightGuns.every((v) => v === false), 'pan: the right pistol put away');
    assert.ok(q.leftGuns.length > 0 && q.leftGuns.every((v) => v === true), 'pan: the left pistol out');
    assert.ok(Math.abs(q.thrownY - q.handY) < 0.05, `pan: thrown from the hand (${q.thrownY.toFixed(2)})`);
    if (r.worn) assert.ok(q.wrist < 0.1, `pan: the right wrist ${(q.wrist * 100).toFixed(1)} cm from the end of its handle`);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('the minigun: the left hand on the top carry handle, the body a little side-on; the muzzle where it was', async () => {
  const { page, logs } = await h.open('?seed=4');
  try {
    const r = await page.evaluate(async () => {
      const THREE = await import('three');
      const C = await import('/src/characters.js');
      const rig = C.buildCharacter({ model: 'hero', weapon: 'minigun' });
      window.game.scene.add(rig.root);
      C.animateRig(rig, 0, 0, 0);
      C.finishRig(rig, 0);
      rig.root.updateMatrixWorld(true);
      const holder = rig.center;
      const at = (gp) => holder.localToWorld(new THREE.Vector3(...gp));
      const [g0, g1] = rig.grips;
      const out = { muzzle: rig.muzzles[0], support: at(g1).toArray(), rear: at(g0).toArray() };
      if (rig.skin) {
        const b = rig.skin.bones;
        const l = b.upperArmL.getWorldPosition(new THREE.Vector3());
        const rr = b.upperArmR.getWorldPosition(new THREE.Vector3());
        out.chestTurn = (Math.atan2(rr.z - l.z, l.x - rr.x) * 180) / Math.PI; // 0: square to the aim
      }
      return out;
    });
    assert.deepEqual(r.muzzle.map((v) => Math.round(v * 1000) / 1000 + 0), [0, 1.45], 'the muzzle (where shots start) is where it was');
    assert.ok(r.support[1] > r.rear[1] + 0.25, `the left hand's hold is on top, above the rear grip (${r.support[1].toFixed(2)} m against ${r.rear[1].toFixed(2)} m)`);
    if (r.chestTurn !== undefined) assert.ok(Math.abs(r.chestTurn) > 8, `the chest a little side-on (${r.chestTurn.toFixed(1)}°)`);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
