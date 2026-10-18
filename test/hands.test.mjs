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

test('carrying a pan and a barrel: hands on it, guns away, the throw from the same height as before', async () => {
  const { page, logs } = await h.open('?seed=4');
  try {
    const r = await page.evaluate(async () => {
      const THREE = await import('three');
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
        const row = { logicY: prop.y, shownY: prop.mesh.position.y, guns: p.rig.weaponParts.map((m) => m.visible) };
        if (p.rig.skin) {
          const b = p.rig.skin.bones;
          const c = p.rig.anim.carry;
          row.hands = [1, -1].map((s) => {
            const want = p.rig.root.localToWorld(new THREE.Vector3(s * c.half, c.y, 0.04));
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
    for (const kind of ['pan', 'barrel']) {
      const k = r[kind];
      assert.ok(Math.abs(k.logicY - 2.15) < 0.05, `${kind}: carried at 2.15 m for the game (${k.logicY.toFixed(2)})`);
      assert.ok(k.shownY < k.logicY - 0.1, `${kind}: shown lower, within reach (${k.shownY.toFixed(2)} m)`);
      assert.ok(k.guns.every((v) => v === false), `${kind}: the guns put away`);
      assert.ok(Math.abs(k.thrownY - 1.85) < 0.05, `${kind}: thrown from 1.85 m, as before (${k.thrownY.toFixed(2)})`);
      if (r.worn) for (const d of k.hands) assert.ok(d < 0.06, `${kind}: a wrist ${(d * 100).toFixed(1)} cm from its hold`);
    }
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
