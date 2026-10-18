// Key poses (風格第二批): the slide, the spin, the kick and a carry overhead are held
// shapes (characters.js KEY_POSES), on the block rig and on a worn model alike,
// in place of a body tilted by code. The worn models are measured bone by bone;
// the player's own rig is checked through syncRig, where the style's 12 fps step
// lets it pose; and the three views are saved, block and worn side by side.
// Run: npm test
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

/** In the page as window.poseRig: build a rig (worn or block), hold a key pose and pose it, facing +z at the origin. */
const POSE_RIG = async (name, worn, opts = {}) => {
  const C = await import('/src/characters.js');
  const rig = C.buildCharacter({ weapon: 'dualPistol', accent: 0x2ee8ff, model: worn ? 'hero' : null });
  window.game.scene.add(rig.root);
  C.animateRig(rig, opts.phase || 0, opts.moveAmt || 0, 0);
  if (name === 'spin') rig.inner.rotation.y = 0;
  C.keyPose(rig, name, opts.w ?? 1);
  // the arms as player.js syncRig sets them: overhead with a carry, level with the aim however the body leans
  const level = -rig.inner.rotation.x;
  rig.armL.rotation.x = rig.armR.rotation.x = (name === 'carry' ? -2.7 : 0) + level;
  C.finishRig(rig, 0.4);
  rig.root.updateMatrixWorld(true);
  return rig;
};
const install = (page) => page.evaluate(`window.poseRig = ${POSE_RIG.toString()}`);

test('the three key poses, measured: block legs and body as the data says; worn feet, knees and hips where the shape needs them', { timeout: 240000 }, async () => {
  const { page, logs } = await h.open();
  try {
    await install(page);
    const r = await page.evaluate(async () => {
      const THREE = await import('three');
      const C = await import('/src/characters.js');
      const poseRig = window.poseRig;
      const v = new THREE.Vector3();
      const box = new THREE.Box3();
      const out = { worn: !!(await import('/src/models.js')).characterTemplate('hero') };
      const feet = (rig) => {
        const f = {};
        rig.skin.model.traverse((o) => {
          if (o.isBone && /foot$/i.test(o.name)) f[/left/i.test(o.name) ? 'L' : 'R'] = o.getWorldPosition(new THREE.Vector3()).toArray();
        });
        return f;
      };
      for (const name of ['slide', 'spin', 'kick', 'carry']) {
        const k = C.KEY_POSES[name];
        const b = await poseRig(name, false);
        const kb = { ...k, ...k.block };
        out[name] = {
          block: {
            lift: b.inner.position.y,
            lean: b.inner.rotation.x,
            legL: [b.legL.rotation.x, b.legL.rotation.z],
            legR: [b.legR.rotation.x, b.legR.rotation.z],
            ahead: b.inner.position.z,
            // each block leg points from its hip at its foot's place
            aim: [b.legL, b.legR].map((leg, i) => {
              const [dx, dy, dz] = i ? kb.footR : kb.footL;
              const d = new THREE.Vector3(dx, dy - C.BODY.hip, dz).normalize();
              return new THREE.Vector3(0, -1, 0).applyEuler(leg.rotation).dot(d);
            }),
            want: { lift: k.lift, lean: k.lean, ahead: k.ahead },
          },
        };
        if (!out.worn) continue;
        const idle = await poseRig(null, true);
        const w = await poseRig(name, true);
        const bones = w.skin.bones;
        out[name].worn = {
          feet: feet(w),
          idleFeet: feet(idle),
          hips: bones.hips.getWorldPosition(v).toArray(),
          head: bones.head.getWorldPosition(v).toArray(),
          kneeL: bones.lowLegL.getWorldPosition(v).toArray(),
          kneeR: bones.lowLegR.getWorldPosition(v).toArray(),
          sole: box.setFromObject(w.skin.model, true).min.y,
          knees: [bones.lowLegL.name, bones.lowLegR.name, bones.footL.name, bones.footR.name],
        };
        // walking with something overhead: the gait keeps the legs, the arms and back still hold it
        if (name === 'carry') {
          const walk = await poseRig('carry', false, { phase: 1.2, moveAmt: 1 });
          out.carryWalk = { legL: walk.legL.rotation.x, legZ: walk.legL.rotation.z, lean: walk.inner.rotation.x, swing: walk.anim.swing };
        }
      }
      // half a pose, as the first and last step of a move hold it
      const half = await poseRig('slide', false, { w: 0.5 });
      out.half = { lift: half.inner.position.y, want: C.KEY_POSES.slide.lift / 2 };
      // a kick while carrying still reaches the worn model's right thigh
      if (out.worn) {
        const c = await poseRig('carry', true);
        const before = feet(c).R;
        C.animateRig(c, 0, 0, 0);
        C.keyPose(c, 'carry');
        c.legR.rotation.x = -1.7;
        C.finishRig(c, 0.4);
        c.root.updateMatrixWorld(true);
        out.carryKick = { before, after: feet(c).R };
      }
      return out;
    });

    const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} (want ${b})`);
    for (const name of ['slide', 'spin', 'kick', 'carry']) {
      const b = r[name].block;
      near(b.lift, b.want.lift, `${name}: block body height`);
      near(b.lean, b.want.lean, `${name}: block body lean`);
      near(b.ahead, b.want.ahead, `${name}: block body ahead`);
      for (const [i, dot] of b.aim.entries()) near(dot, 1, `${name}: block leg ${i ? 'R' : 'L'} points at its foot`);
    }
    near(r.half.lift, r.half.want, 'half a pose is half way');
    assert.ok(Math.abs(r.carryWalk.legL - r.carryWalk.swing) < 1e-6 && r.carryWalk.legZ === 0, 'walking with a carry: the legs keep the gait');
    assert.ok(r.carryWalk.lean < 0, 'walking with a carry: the back still arches');
    if (!r.worn) return; // ?models=off or no hero model: the block rig is all there is
    const { slide, spin, kick, carry } = r;
    const at = (p) => p.map((x) => x.toFixed(2)).join(', ');
    assert.ok(/leg$/i.test(slide.worn.knees[0]) && /foot$/i.test(slide.worn.knees[2]), `the knee and foot bones are found (${slide.worn.knees})`);
    // slide: the right leg straight out in front along the floor, the left knee up (folded), the hips near the floor
    assert.ok(slide.worn.feet.R[2] > 0.5 && slide.worn.feet.R[1] < 0.35, `slide: right foot out in front (${at(slide.worn.feet.R)})`);
    assert.ok(slide.worn.kneeL[1] > slide.worn.kneeR[1] + 0.15, `slide: left knee up, folded (${at(slide.worn.kneeL)}; right ${at(slide.worn.kneeR)})`);
    assert.ok(slide.worn.hips[1] < 0.4, `slide: hips low (${slide.worn.hips[1].toFixed(2)} m)`);
    assert.ok(Math.abs(slide.worn.sole) < 0.035, `slide: on the floor (${slide.worn.sole.toFixed(3)} m)`);
    // spin: the right foot drawn up to the left knee, the left leg standing
    const toKnee = Math.hypot(...spin.worn.feet.R.map((x, i) => x - spin.worn.kneeL[i]));
    assert.ok(spin.worn.feet.R[1] > 0.3, `spin: right foot raised (${spin.worn.feet.R[1].toFixed(2)} m)`);
    assert.ok(toKnee < 0.2, `spin: right foot at the left knee (${toKnee.toFixed(2)} m from it)`);
    assert.ok(spin.worn.feet.L[1] < spin.worn.feet.R[1] - 0.25, 'spin: standing on the left foot');
    // kick: the right foot driven out at chest height, well ahead of the hips, the head back behind them, the left foot down
    assert.ok(kick.worn.feet.R[1] > 0.85, `kick: right foot up at ${kick.worn.feet.R[1].toFixed(2)} m`);
    assert.ok(kick.worn.feet.R[2] - kick.worn.hips[2] > 0.55, `kick: right foot ${(kick.worn.feet.R[2] - kick.worn.hips[2]).toFixed(2)} m ahead of the hips`);
    assert.ok(kick.worn.head[2] < kick.worn.hips[2], 'kick: leaning back, the head behind the hips');
    assert.ok(Math.abs(kick.worn.sole) < 0.035, `kick: the standing foot on the floor (${kick.worn.sole.toFixed(3)} m)`);
    // carry: both feet down, further apart than standing
    const apart = (f) => Math.abs(f.L[0] - f.R[0]);
    assert.ok(Math.abs(carry.worn.sole) < 0.035, `carry: soles on the floor (${carry.worn.sole.toFixed(3)} m)`);
    assert.ok(apart(carry.worn.feet) > apart(carry.worn.idleFeet) + 0.08, `carry: feet apart (${apart(carry.worn.feet).toFixed(2)} m, standing ${apart(carry.worn.idleFeet).toFixed(2)} m)`);
    assert.ok(r.carryKick.after[1] > r.carryKick.before[1] + 0.3, 'a kick while carrying lifts the right foot');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('the player: slide, spin and carry hold their key poses when the style steps the pose; standing straight after', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open('?seed=5');
  try {
    const r = await page.evaluate(async () => {
      const { KEY_POSES } = await import('/src/characters.js');
      const { PLAYER } = await import('/src/config.js');
      const g = window.game;
      g.frame = () => {};
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      const rig = p.rig;
      const look = () => {
        rig.stepIdx = -1; // the style's step: due now
        p.syncRig();
        const k = rig.anim.key;
        return { key: Object.keys(KEY_POSES).find((n) => KEY_POSES[n] === k) || null, w: rig.anim.keyW, y: rig.inner.position.y, lean: rig.inner.rotation.x };
      };
      const out = {};
      p.slideT = PLAYER.slideDuration * 0.5;
      out.slide = look();
      out.slideArm = rig.armR.rotation.x + rig.inner.rotation.x; // the arm's pitch in the world: level
      p.slideT = PLAYER.slideDuration * 0.95;
      out.slideIn = look();
      p.slideT = 0;
      p.spinT = PLAYER.spinDuration * 0.5;
      out.spin = look();
      out.spinYaw = rig.inner.rotation.y;
      p.spinT = 0;
      p.kickT = 0.14;
      out.kick = look();
      p.kickT = 0;
      const pan = g.level.props.find((q) => q.kind === 'pan' || q.kind === 'barrel');
      g.thrown.carry = pan;
      out.carry = look();
      out.arms = rig.armL.rotation.x;
      g.thrown.carry = null;
      out.none = look();
      // shot down mid-slide: the body falls from standing, not from the slide's lean and reach
      p.slideT = PLAYER.slideDuration * 0.5;
      look();
      p.die(0, 1);
      out.dead = { y: rig.inner.position.y, z: rig.inner.position.z, lean: rig.inner.rotation.x, legZ: rig.legL.rotation.z };
      return out;
    });
    assert.deepEqual([r.slide.key, r.slide.w], ['slide', 1], 'mid-slide: the slide, held');
    assert.ok(Math.abs(r.slideArm) < 1e-6, `lying back, the guns stay level (${r.slideArm})`);
    assert.deepEqual([r.slideIn.key, r.slideIn.w], ['slide', 0.5], 'its first step: half way in');
    assert.deepEqual([r.spin.key, r.spin.w], ['spin', 1]);
    assert.deepEqual([r.kick.key, r.kick.w], ['kick', 1], 'mid-kick: the Spartan kick, held');
    assert.ok(Math.abs(r.spinYaw) > 1, 'the spin still turns the body');
    assert.equal(r.carry.key, 'carry');
    assert.ok(r.arms < -2.5, 'arms overhead');
    assert.deepEqual(r.none, { key: null, w: r.none.w, y: 0, lean: 0 }, 'standing straight after');
    assert.deepEqual(r.dead, { y: 0, z: 0, lean: 0, legZ: 0 }, 'shot down mid-slide: the fall starts from standing');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

/** Block and worn side by side for each pose, in a view (0 top, 1 tilt, 2 side); `close` moves the camera in. */
const lineup = (page, view, close) =>
  page.evaluate(
    async ([view, close]) => {
      const poseRig = window.poseRig;
      const g = window.game;
      g.frame = () => {};
      for (const rig of window.lineupRigs || []) g.scene.remove(rig.root);
      g.view = view;
      g.startRun(3); // Senado: pale paving in daylight
      g.enemies.clear();
      const p = g.player;
      p.rig.root.visible = false;
      p.aimLaser.hide();
      g.aimPoint.set(p.x, 0, p.z);
      const cells = [];
      for (const name of ['slide', 'spin', 'kick', 'carry']) for (const worn of [false, true]) cells.push([name, worn]);
      window.lineupRigs = [];
      for (const [i, [name, worn]] of cells.entries()) {
        const rig = await poseRig(name, worn);
        rig.root.position.set(p.x + (i - (cells.length - 1) / 2) * 1.6, 0, p.z);
        rig.root.rotation.y = 0.7; // a three-quarter turn, so a side view and a front view both read
        window.lineupRigs.push(rig);
      }
      g.updateCamera(1, true);
      if (close) g.camera.position.lerp(g.camTarget, 0.5);
      g.hud.update(1 / 60);
      g.render();
    },
    [view, close],
  );

test('screenshots: the key poses in the three views and close up, block and worn side by side', { timeout: 240000 }, async () => {
  const { page, logs } = await h.open();
  try {
    await install(page);
    for (const [file, view, close] of [
      ['keypose-top.png', 0],
      ['keypose-tilt.png', 1],
      ['keypose-iso.png', 2],
      ['keypose-close.png', 2, true],
    ]) {
      await lineup(page, view, close);
      await page.screenshot({ path: new URL(file, OUT).pathname });
    }
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
