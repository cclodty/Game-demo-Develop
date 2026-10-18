// Skinned characters. A rigged glTF model is dressed over the block rig from
// characters.js: the block rig still decides everything that matters for play
// (facing, arm aim, split aim, weapon grips, recoil, kicks, spins), and this
// module makes the model follow it. The model's own clips move the legs and
// body (run time comes from the gait phase, so feet match ground speed and
// bullet time slows them for free), the hips turn towards the way the
// character is moving while the chest keeps facing the aim, and a two-bone IK
// puts the hands on the weapons, which stay the game's own models.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, TAU, wrapAngle } from './utils.js';

const HEIGHT = 1.78; // top of the head, the same as BODY in characters.js
const GRIP = 0.58; // hand distance along a block arm (where its hand cube sits)
const PALM = 0.06; // the hand bone is the wrist: aim it this far behind a grip so the palm closes on it

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _el = new THREE.Vector3();
const _h = new THREE.Vector3();
const _side = new THREE.Vector3();
const _footAt = new THREE.Vector3();
const _hipAt = new THREE.Vector3();
const _kneeAt = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------- bone names

const LIMB = /(arm|hand|leg|thigh|shoulder|foot|knee|elbow|calf|clavicle|palm\d*)$/;

/** +1 left, -1 right, 0 middle, from the common naming styles (Mixamo, Blender .L/.R, _l/_r, "L_", Bip01 L). */
function sideOf(name) {
  const o = name.toLowerCase();
  if (o.includes('left')) return 1;
  if (o.includes('right')) return -1;
  for (const [ch, s] of [
    ['l', 1],
    ['r', -1],
  ]) {
    if (new RegExp(`(^|[\\s_.:-])${ch}([\\s_.:-]|$)`).test(o)) return s;
    const flat = o.replace(/[^a-z0-9]/g, '');
    if (flat.endsWith(ch) && LIMB.test(flat.slice(0, -1))) return s;
  }
  return 0;
}

/** The body part a bone name describes, with side markers and rig prefixes removed. */
function partOf(name) {
  let n = name
    .toLowerCase()
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/left|right/g, '')
    .replace(/(^|[\s_.:-])[lr](?=[\s_.:-]|$)/g, '$1')
    .replace(/[^a-z0-9]/g, '');
  const m = n.match(/^(.*?)([lr])$/);
  if (m && LIMB.test(m[1])) n = m[1];
  return n;
}

const PARTS = {
  hips: ['hips', 'hip', 'pelvis'],
  spine: ['spine', 'spine0', 'spine01', 'spine1', 'abdomen', 'waist', 'chest', 'torso'],
  head: ['head'],
  upperArm: ['arm', 'upperarm', 'uparm'],
  foreArm: ['forearm', 'lowerarm', 'elbow'],
  hand: ['hand', 'wrist'],
  upLeg: ['upleg', 'upperleg', 'thigh'],
  lowLeg: ['leg', 'lowerleg', 'lowleg', 'calf', 'shin', 'knee'],
  foot: ['foot', 'ankle'],
};

const boneKids = (b) => b.children.filter((c) => c.isBone);
function mainChild(b) {
  let best = null;
  let most = -1;
  for (const c of boneKids(b)) {
    let n = 0;
    c.traverse(() => n++);
    if (n > most) {
      most = n;
      best = c;
    }
  }
  return best;
}

/** Find the bones the game drives; names are matched loosely, then filled in from the hierarchy. */
export function findBones(root, overrides = {}) {
  const bones = [];
  root.traverse((o) => {
    if (o.isBone) bones.push(o);
  });
  const found = {};
  const take = (key, b) => {
    if (!found[key]) found[key] = b;
  };
  for (const b of bones) {
    const part = partOf(b.name);
    const side = sideOf(b.name);
    for (const [key, names] of Object.entries(PARTS)) {
      if (!names.includes(part)) continue;
      if (key === 'hips' || key === 'spine' || key === 'head') take(key, b);
      else if (side) take(`${key}${side > 0 ? 'L' : 'R'}`, b);
    }
  }
  for (const [key, name] of Object.entries(overrides)) found[key] = root.getObjectByName(name) || found[key];
  for (const s of ['L', 'R']) {
    if (!found[`upperArm${s}`] && found[`hand${s}`]) found[`upperArm${s}`] = found[`hand${s}`].parent?.parent;
    if (!found[`foreArm${s}`] && found[`upperArm${s}`]) found[`foreArm${s}`] = mainChild(found[`upperArm${s}`]);
    if (!found[`hand${s}`] && found[`foreArm${s}`]) found[`hand${s}`] = mainChild(found[`foreArm${s}`]);
    if (!found[`lowLeg${s}`] && found[`upLeg${s}`]) found[`lowLeg${s}`] = mainChild(found[`upLeg${s}`]);
    if (!found[`foot${s}`] && found[`lowLeg${s}`]) found[`foot${s}`] = mainChild(found[`lowLeg${s}`]);
  }
  if (!found.spine && found.hips) found.spine = boneKids(found.hips).find((c) => sideOf(c.name) === 0) || null;
  return found;
}

// ------------------------------------------------------------- templates

const CLIPS = {
  idle: [/^idle$/i, /idle/i, /stand(?!ing ?up)/i, /breath/i],
  run: [/^run$/i, /run/i, /jog/i, /sprint/i, /walk/i],
  death: [/death|dying|die\b|dead/i],
};

/** Work out scale, facing, bones and clips once per model; instances reuse it. */
export function prepareCharacter(scene, animations, spec) {
  scene.updateMatrixWorld(true);
  const bones = findBones(scene, spec.bones);
  // skinned parts are measured in their rest pose; rigid parts hung on bones as they are
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.computeBoundingBox();
      box.union(part.copy(o.boundingBox).applyMatrix4(o.matrixWorld));
    } else if (o.isMesh) {
      box.union(part.setFromObject(o));
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  // stand the hips over the origin: a box centre drifts with A-pose arms and long feet
  if (bones.hips) {
    const hips = bones.hips.getWorldPosition(new THREE.Vector3());
    centre.x = hips.x;
    centre.z = hips.z;
  }

  // glTF characters should face +z; if the left arm sits on -x the model faces -z
  let turn = spec.turn ? (spec.turn * Math.PI) / 180 : 0;
  if (!spec.turn && bones.upperArmL && bones.upperArmR) {
    const l = bones.upperArmL.getWorldPosition(new THREE.Vector3());
    const r = bones.upperArmR.getWorldPosition(new THREE.Vector3());
    if (l.x < r.x) turn = Math.PI;
  }

  // keep animations in place: the game moves the character, not the clip
  const top = bones.hips || null;
  const clips = {};
  for (const [state, tests] of Object.entries(CLIPS)) {
    const wanted = spec.clips?.[state];
    const clip = wanted ? animations.find((c) => c.name === wanted) : tests.map((re) => animations.find((c) => re.test(c.name) && !/t-?pose/i.test(c.name))).find(Boolean);
    if (!clip) continue;
    const c = clip.clone();
    for (const track of c.tracks) {
      if (!top || track.name !== `${top.name}.position`) continue;
      const v = track.values;
      for (let i = 3; i < v.length; i += 3) {
        v[i] = v[0];
        v[i + 2] = v[2];
      }
    }
    clips[state] = c;
  }

  const boneNames = {};
  for (const [k, b] of Object.entries(bones)) if (b) boneNames[k] = b.name;
  const missing = ['upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR'].filter((k) => !boneNames[k]);
  if (Object.values(bones).some(Boolean) && missing.length) console.warn(`[models] ${spec.zh}: could not find ${missing.join(', ')}; arms won't follow the weapons (set "bones" in asset-manifest.js)`);
  return { scene, scale: HEIGHT / size.y, turn, offset: new THREE.Vector3(-centre.x, -box.min.y, -centre.z), boneNames, clips };
}

// ------------------------------------------------------------- instances

/** A posable copy of a prepared character. */
export function createSkin(tpl) {
  const model = cloneSkinned(tpl.scene);
  model.position.copy(tpl.offset);
  const root = new THREE.Group();
  root.add(model);
  root.scale.setScalar(tpl.scale);
  root.rotation.y = tpl.turn;
  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // skinned bounds don't follow the pose
    const own = (m) => {
      const c = m.clone();
      c.userData.e0 = c.emissive ? c.emissive.clone() : null;
      c.userData.ei0 = c.emissiveIntensity ?? 1;
      mats.push(c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  const bones = {};
  for (const [k, name] of Object.entries(tpl.boneNames)) bones[k] = model.getObjectByName(name) || null;
  // bones the game turns by hand go back to the clips' pose every frame before posing
  // (poseSkin keeps it: the mixer only writes a value that changed since its last write)
  const rest = Object.values(bones)
    .filter(Boolean)
    .map((bone) => [bone, bone.quaternion.clone()]);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [state, clip] of Object.entries(tpl.clips)) {
    const a = mixer.clipAction(clip);
    a.play();
    a.setEffectiveWeight(0);
    actions[state] = a;
  }
  return { tpl, root, model, mixer, actions, bones, mats, rest };
}

export function disposeSkin(skin) {
  for (const m of skin.mats) m.dispose();
  skin.mixer.stopAllAction();
}

export function flashSkin(skin, v) {
  for (const m of skin.mats) {
    if (!m.emissive) continue;
    m.emissive.copy(m.userData.e0).multiplyScalar(m.userData.ei0);
    m.emissive.r += v * 0.45;
    m.emissive.g += v * 0.45;
    m.emissive.b += v * 0.45;
    m.emissiveIntensity = 1;
  }
}

// ----------------------------------------------------------------- posing

/** Rotate a bone about a world-space axis, keeping its parent where it is. */
function turnBone(bone, axis, angle) {
  _q.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(_qw).premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
  bone.updateMatrixWorld(true);
}

/** Rotate a bone so that the world direction `from` points along `to`. */
function aimBone(bone, from, to) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(_a.copy(from).normalize(), _b.copy(to).normalize());
  bone.getWorldQuaternion(_qw).premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
  bone.updateMatrixWorld(true);
}

/** Two-bone IK: put `hand` on `target`, bending the elbow towards `pole`. */
function reach(upper, lower, hand, target, pole) {
  const s = upper.getWorldPosition(_s);
  const e = lower.getWorldPosition(_el);
  const h = hand.getWorldPosition(_h);
  const la = s.distanceTo(e);
  const lb = e.distanceTo(h);
  _d.subVectors(target, s);
  const dist = clamp(_d.length(), Math.abs(la - lb) + 1e-3, (la + lb) * 0.999);
  _d.normalize();
  const cosA = clamp((la * la + dist * dist - lb * lb) / (2 * la * dist), -1, 1);
  _p.subVectors(pole, s);
  _p.addScaledVector(_d, -_p.dot(_d)).normalize();
  _e.copy(s)
    .addScaledVector(_d, cosA * la)
    .addScaledVector(_p, Math.sqrt(1 - cosA * cosA) * la);
  aimBone(upper, _c.subVectors(e, s), _t.subVectors(_e, s));
  lower.getWorldPosition(e);
  hand.getWorldPosition(h);
  _t.copy(s).addScaledVector(_d, dist);
  aimBone(lower, _c.subVectors(h, e), _t.sub(e));
}

const _grip = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _back = new THREE.Vector3();
const _l = new THREE.Vector3();
const _r = new THREE.Vector3();
const BLADE = 0.5; // how far a long gun turns the chest side-on (radians), so the support hand reaches
const LEAN = 0.35; // the most the chest leans in (radians) to bring a hand to a grip it can't reach

/** Turn the chest so the shoulders square up to the rig's side axis, whatever twist the clip puts in them. */
function square(rig, side) {
  const b = rig.skin.bones;
  if (!b.spine || !b.upperArmL || !b.upperArmR) return;
  b.upperArmL.getWorldPosition(_l);
  b.upperArmR.getWorldPosition(_r);
  const twist = wrapAngle(Math.atan2(_r.z - _l.z, _l.x - _r.x) - Math.atan2(-side.z, side.x));
  turnBone(b.spine, UP, -twist);
}

/** World grip target of a hand (the wrist sits PALM behind the grip), as arm() aims it before any slide. */
function gripTarget(holder, g, out) {
  return holder.localToWorld(out.set(g[0], g[1], g[2] - PALM));
}

/** How far (metres) the arm on `side` falls short of `target`; 0 when it reaches. */
function shortfall(rig, side, target) {
  const b = rig.skin.bones;
  const k = side > 0 ? 'L' : 'R';
  const upper = b[`upperArm${k}`];
  const lower = b[`foreArm${k}`];
  const hand = b[`hand${k}`];
  if (!upper || !lower || !hand) return 0;
  const s = upper.getWorldPosition(_s);
  const len = s.distanceTo(lower.getWorldPosition(_el)) + _el.distanceTo(hand.getWorldPosition(_h));
  return Math.max(0, s.distanceTo(target) - len * 0.98);
}

/** Lean the chest forward until the main hands reach their grips (`reaches`: [side, target] pairs), at most LEAN. */
function leanIn(rig, side, reaches) {
  const b = rig.skin.bones;
  if (!b.spine || !b.upperArmR) return;
  const worst = () => Math.max(...reaches.map(([sd, t]) => shortfall(rig, sd, t)));
  const short = worst();
  if (short < 0.005) return;
  const height = b.upperArmR.getWorldPosition(_l).y - b.spine.getWorldPosition(_r).y;
  if (height <= 0.05) return;
  const angle = Math.min(LEAN, Math.asin(Math.min(1, short / height)));
  turnBone(b.spine, side, angle);
  if (worst() >= short) turnBone(b.spine, side, -angle); // the grip is not ahead (an arm raised overhead): leaning would not help
}

/** `slide`: how far (holder metres) the hand may move back along the gun when the grip is out of reach. */
function arm(rig, side, holder, gx, gy, gz, slide = 0) {
  const b = rig.skin.bones;
  const k = side > 0 ? 'L' : 'R';
  const upper = b[`upperArm${k}`];
  const lower = b[`foreArm${k}`];
  const hand = b[`hand${k}`];
  if (!upper || !lower || !hand) return;
  holder.localToWorld(_grip.set(gx, gy, gz - PALM));
  if (slide > 0) {
    // the nearest point back along the barrel that the arm can reach, so the hand stays on the gun
    const s = upper.getWorldPosition(_s);
    const len = (s.distanceTo(lower.getWorldPosition(_el)) + _el.distanceTo(hand.getWorldPosition(_h))) * 0.98;
    _back.set(0, 0, -1).transformDirection(holder.matrixWorld);
    _d.subVectors(_grip, s);
    const vd = _d.dot(_back);
    const disc = vd * vd - _d.lengthSq() + len * len;
    const along = _d.lengthSq() > len * len ? -vd - Math.sqrt(Math.max(0, disc)) : 0;
    _grip.addScaledVector(_back, clamp(along, 0, slide * holder.getWorldScale(_t).z));
  }
  // elbows out to the side and a little down and back
  rig.inner.localToWorld(_pole.set(side * 0.9, 0.9, -0.5));
  reach(upper, lower, hand, _grip, _pole);
}

/** Pose the model after the block rig has been posed for this frame. */
export function poseSkin(rig, time) {
  const skin = rig.skin;
  const an = rig.anim;
  const b = skin.bones;
  const A = skin.actions;
  const key = an.key;
  // a key pose's legs take over from the run clip (a carry's, standing only, leaves it be)
  const moving = clamp(an.moveAmt, 0, 1) * (key && !key.still ? 1 - an.keyW : 1);

  let rel = 0;
  let back = false;
  if (an.moveDir !== undefined && moving > 0.05) {
    rel = wrapAngle(an.moveDir - rig.root.rotation.y);
    back = Math.abs(rel) > 1.95;
  }
  for (const [bone, q] of skin.rest) bone.quaternion.copy(q);
  if (A.death) A.death.setEffectiveWeight(0);
  if (A.run) {
    let t = (((an.phase / TAU) % 1) + 1) % 1;
    if (back) t = 1 - t;
    A.run.time = t * A.run.getClip().duration;
    A.run.setEffectiveWeight(moving);
  }
  if (A.idle) {
    A.idle.time = time % A.idle.getClip().duration;
    A.idle.setEffectiveWeight(A.run ? 1 - moving : 1);
  }
  skin.mixer.update(0);
  for (const [bone, q] of skin.rest) q.copy(bone.quaternion);
  if (skin.afterMix) skin.afterMix(); // the style's proportions, which a clip's scale tracks would undo
  rig.root.updateMatrixWorld(true);
  rig.inner.getWorldQuaternion(_qi);
  const side = _side.set(1, 0, 0).applyQuaternion(_qi);

  // no run clip: swing the thighs like the block rig does
  if (!A.run && moving > 0.01) {
    if (b.upLegL) turnBone(b.upLegL, side, an.swing);
    if (b.upLegR) turnBone(b.upLegR, side, -an.swing);
  }
  // legs follow the movement, chest stays on the aim
  if (moving > 0.05 && b.hips && b.spine) {
    const yaw = clamp(back ? wrapAngle(rel - Math.PI) : rel, -1.3, 1.3) * Math.min(1, moving * 1.5);
    turnBone(b.hips, UP, yaw);
    turnBone(b.spine, UP, -yaw);
  }
  // a key pose (characters.js KEY_POSES): each foot placed from under its hip in the rig's space
  // (at the clip's ankle height), the knee bent towards its pole by a two-bone reach; the chest curled
  if (key && an.keyLegs > 0.01) {
    const legs = an.keyLegs;
    for (const k of ['L', 'R']) {
      const up = b[`upLeg${k}`];
      const low = b[`lowLeg${k}`];
      const foot = b[`foot${k}`];
      if (!up || !low || !foot) continue;
      const [dx, dy, dz] = key[`foot${k}`];
      const hip = rig.inner.worldToLocal(up.getWorldPosition(_hipAt));
      const at = rig.inner.worldToLocal(foot.getWorldPosition(_footAt));
      rig.inner.localToWorld(at.set(at.x + (hip.x + dx - at.x) * legs, at.y + dy * legs, at.z + (hip.z + dz - at.z) * legs));
      rig.inner.worldToLocal(low.getWorldPosition(_kneeAt)).add(_off.fromArray(key[`knee${k}`]));
      reach(up, low, foot, _footAt, rig.inner.localToWorld(_kneeAt));
    }
  }
  if (key && b.spine && key.chest) turnBone(b.spine, side, key.chest * an.keyW);
  // the block rig's kick, on the right thigh: how far its leg is past where the gait (and a key pose) put it
  const kick = rig.legR.rotation.x - an.legR;
  if (Math.abs(kick) > 0.02 && b.upLegR) turnBone(b.upLegR, side, kick);

  // hands on the weapons: the chest squares up to the aim (an idle clip's twist would
  // leave one hand short of its gun) and leans in when a grip is still out of reach
  const grips = rig.grips;
  square(rig, side);
  if (rig.hold === 'dual') {
    leanIn(rig, side, [
      [1, gripTarget(rig.armL, [0, 0, GRIP], _grip)],
      [-1, gripTarget(rig.armR, [0, 0, GRIP], _back)],
    ]);
    arm(rig, 1, rig.armL, 0, 0, GRIP);
    arm(rig, -1, rig.armR, 0, 0, GRIP);
  } else if (rig.hold === 'right') {
    leanIn(rig, side, [[-1, gripTarget(rig.armR, [0, 0, GRIP], _grip)]]);
    arm(rig, -1, rig.armR, 0, 0, GRIP);
  } else {
    // a gun at the shoulder turns the chest side-on, the head stays on the aim
    if (rig.hold === 'anchor' && b.spine) {
      turnBone(b.spine, UP, -BLADE);
      if (b.head) turnBone(b.head, UP, BLADE);
    }
    const holder = rig.hold === 'center' ? rig.center : rig.anchor;
    leanIn(rig, side, [[-1, gripTarget(holder, grips[0], _grip)]]);
    arm(rig, -1, holder, ...grips[0]);
    arm(rig, 1, holder, ...grips[1], grips[1][2] - grips[0][2] - 0.1);
  }
}

/** Play the death clip at time t; false when the model has none (the rig then tips over instead). */
export function deathSkin(rig, t) {
  const A = rig.skin?.actions;
  if (!A?.death) return false;
  for (const a of Object.values(A)) a.setEffectiveWeight(0);
  const d = A.death.getClip().duration;
  A.death.time = Math.min(t, d - 1e-3);
  A.death.setEffectiveWeight(1);
  rig.skin.mixer.update(0);
  if (rig.skin.afterMix) rig.skin.afterMix();
  return true;
}
