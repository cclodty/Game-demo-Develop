// Blocky low-poly humanoids. Read well from a top-down camera: glowing
// shoulder pads + visor carry each faction's colour. Weapons are swappable
// models so the player (and pickups) can show what is being held. When a
// rigged model has been made for a character (see src/models.js) it is worn
// over the block rig, which keeps driving the aim, weapons and moves.

import * as THREE from 'three';
import { characterTemplate } from './models.js';
import { createSkin, deathSkin, disposeSkin, flashSkin, poseSkin } from './skin.js';

const geoCache = new Map();
function box(w, h, d, tx = 0, ty = 0, tz = 0) {
  const key = `${w}|${h}|${d}|${tx}|${ty}|${tz}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d).translate(tx, ty, tz);
    geoCache.set(key, g);
  }
  return g;
}
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });

/**
 * Body proportions in metres (1 unit = 1 m, the same scale as the Senado
 * model). Roughly a 1.78 m adult with 0.46 m shoulders, close to the scale
 * figure used by the Senado viewer. Change these to restyle every character.
 */
export const BODY = {
  hip: 0.9, // leg length
  legW: 0.15,
  legD: 0.17,
  legGap: 0.095,
  torsoW: 0.44,
  torsoH: 0.56,
  torsoD: 0.24,
  torsoY: 1.18, // torso centre
  headW: 0.2,
  headH: 0.23,
  headD: 0.22,
  headY: 1.6, // head centre; hair tops out at ~1.78 m
  shoulderX: 0.27,
  shoulderY: 1.4,
  armW: 0.095,
  armLen: 0.58,
  ring: [0.4, 0.5], // glowing ground ring under each character
};

export const SHOULDER_X = BODY.shoulderX;
export const SHOULDER_Y = BODY.shoulderY;
export const MUZZLE_Z = 0.95;

const ringGeo = new THREE.RingGeometry(BODY.ring[0], BODY.ring[1], 36).rotateX(-Math.PI / 2);
const ANCHOR = { x: -0.12, y: SHOULDER_Y - 0.04, z: 0.22 };
const CENTER = { x: 0, y: SHOULDER_Y - 0.06, z: 0.3 };

/**
 * Weapon models. `hold` says where the parts attach:
 *   dual   - one copy on each forearm
 *   right  - right forearm only
 *   anchor - a two-handed long gun held at the right shoulder
 *   center - a heavy gun held at the chest
 * Parts are [w, h, d, x, y, z, material]; `end` is the barrel tip along z.
 */
export const MODELS = {
  dualPistol: { hold: 'dual', end: 0.9, parts: [[0.07, 0.13, 0.3, 0, 0.05, 0.74, 'gun']] },
  dualSmg: {
    hold: 'dual',
    end: 1.04,
    parts: [
      [0.08, 0.14, 0.4, 0, 0.05, 0.78, 'gun'],
      [0.05, 0.2, 0.07, 0, -0.08, 0.68, 'gun'],
      [0.09, 0.03, 0.18, 0, 0.13, 0.8, 'accent'],
    ],
  },
  pistol: { hold: 'right', end: 0.9, parts: [[0.07, 0.13, 0.3, 0, 0.05, 0.74, 'gun']] },
  shotgun: {
    hold: 'anchor',
    end: 1.02,
    parts: [
      [0.08, 0.08, 1.0, 0, 0.05, 0.5, 'gun'],
      [0.07, 0.07, 0.75, 0, -0.04, 0.45, 'gun'],
      [0.12, 0.1, 0.26, 0, -0.04, 0.64, 'wood'],
      [0.1, 0.16, 0.36, 0, -0.02, -0.12, 'wood'],
    ],
    grips: [
      [0, -0.07, 0.08],
      [0, -0.06, 0.52],
    ],
  },
  rifle: {
    hold: 'anchor',
    end: 1.08,
    parts: [
      [0.1, 0.16, 0.72, 0, 0.02, 0.3, 'gun'],
      [0.05, 0.05, 0.45, 0, 0.05, 0.86, 'gun'],
      [0.07, 0.24, 0.1, 0, -0.14, 0.36, 'gun'],
      [0.11, 0.03, 0.32, 0, 0.11, 0.3, 'accent'],
    ],
    grips: [
      [0, -0.1, 0.3],
      [0, -0.02, 0.62],
    ],
  },
  sniper: {
    hold: 'anchor',
    end: 1.46,
    parts: [
      [0.09, 0.14, 0.82, 0, 0, 0.24, 'gun'],
      [0.045, 0.045, 0.8, 0, 0.03, 1.06, 'gun'],
      [0.07, 0.07, 0.36, 0, 0.13, 0.3, 'gun'],
      [0.075, 0.075, 0.02, 0, 0.13, 0.49, 'accent'],
    ],
  },
  launcher: {
    hold: 'anchor',
    end: 0.88,
    parts: [
      [0.2, 0.2, 0.86, 0, 0.03, 0.43, 'gun'],
      [0.27, 0.27, 0.24, 0, -0.02, 0.14, 'gun'],
      [0.23, 0.23, 0.05, 0, 0.03, 0.86, 'accent'],
    ],
  },
  minigun: {
    hold: 'center',
    end: 1.15,
    parts: [
      [0.3, 0.3, 1.15, 0, 0, 0.55, 'gun'],
      [0.34, 0.08, 0.1, 0, 0, 1.1, 'accent'],
    ],
    grips: [
      [-0.16, -0.1, 0.15],
      [0.16, 0, 0.45],
    ],
  },
  blade: { hold: 'right', end: 1.15, parts: [[0.05, 0.04, 0.55, 0, 0, 0.9, 'accent']] },
};

/** Where a skinned model's right and left hands go on a two-handed gun, in the gun's space. */
const GRIPS = {
  anchor: [
    [0, -0.08, 0.15],
    [0, -0.05, 0.5],
  ],
  center: [
    [-0.16, -0.1, 0.15],
    [0.16, 0, 0.45],
  ],
};

const POSES = {
  dual: { lx: 0, ly: 0.04, rx: 0, ry: -0.04 },
  right: { lx: 1.3, ly: 0, rx: 0, ry: 0 },
  anchor: { lx: 0, ly: -0.62, rx: 0, ry: 0.28 },
  center: { lx: 0, ly: -0.3, rx: 0, ry: 0.3 },
  blade: { lx: 0.95, ly: 0, rx: 0.5, ry: 0 },
};

function partMesh(p, mats) {
  const [w, h, d, x, y, z, m] = p;
  const mesh = new THREE.Mesh(box(w, h, d, x, y, z), m === 'wood' ? woodMat : mats[m]);
  mesh.castShadow = true;
  return mesh;
}

/** A free-standing copy of a weapon model (used by floor pickups). */
export function buildWeaponModel(model, mats) {
  const def = MODELS[model];
  const g = new THREE.Group();
  const copies = def.hold === 'dual' ? [-0.16, 0.16] : [0];
  for (const off of copies) {
    const sub = new THREE.Group();
    for (const p of def.parts) sub.add(partMesh(p, mats));
    sub.position.set(off, 0, def.hold === 'dual' ? -0.7 : -def.end / 2);
    g.add(sub);
  }
  return g;
}

/** Swap the weapon a rig is holding and set the matching arm pose. */
export function attachWeapon(rig, model) {
  for (const m of rig.weaponParts) m.parent.remove(m);
  rig.weaponParts.length = 0;
  const def = MODELS[model];
  const add = (parent) => {
    for (const p of def.parts) {
      const mesh = partMesh(p, rig.mats);
      parent.add(mesh);
      rig.weaponParts.push(mesh);
    }
  };
  const s = rig.scale;
  if (def.hold === 'dual') {
    add(rig.armL);
    add(rig.armR);
    rig.muzzles = [
      [-SHOULDER_X * s, def.end * s],
      [SHOULDER_X * s, def.end * s],
    ];
  } else if (def.hold === 'right') {
    add(rig.armR);
    rig.muzzles = [[-SHOULDER_X * s, def.end * s]];
  } else {
    const a = def.hold === 'center' ? CENTER : ANCHOR;
    const anchor = def.hold === 'center' ? rig.center : rig.anchor;
    add(anchor);
    rig.muzzles = [[a.x * s, (a.z + def.end) * s]];
    rig.gripZ = a.z * s;
  }
  const pose = POSES[model === 'blade' ? 'blade' : def.hold];
  rig.pose = pose;
  rig.armL.rotation.set(pose.lx, pose.ly, 0);
  rig.armR.rotation.set(pose.rx, pose.ry, 0);
  rig.model = model;
  rig.hold = def.hold;
  rig.grips = def.grips || GRIPS[def.hold];
}

export function buildCharacter(options) {
  const o = {
    body: 0x24242c,
    pants: 0x18181f,
    skin: 0xd9a77c,
    hair: 0x141414,
    accent: 0xff3355,
    gun: 0x2b2b33,
    weapon: 'pistol',
    scale: 1,
    glow: 2.2,
    ring: 0.5,
    model: null, // asset id of a rigged model to wear, if one has been made
    ...options,
  };
  const std = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0, ...extra });
  const mats = {
    body: std(o.body),
    pants: std(o.pants),
    skin: std(o.skin),
    hair: std(o.hair),
    accent: std(o.accent, { emissive: new THREE.Color(o.accent), emissiveIntensity: o.glow, roughness: 0.4 }),
    gun: std(o.gun, { metalness: 0.7, roughness: 0.35, emissiveIntensity: 0 }),
  };
  mats.gun.emissive.setRGB(0, 0, 0);

  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(o.scale);
  root.add(inner);

  const B = BODY;
  const legL = new THREE.Mesh(box(B.legW, B.hip, B.legD, 0, -B.hip / 2, 0), mats.pants);
  legL.position.set(B.legGap, B.hip, 0);
  const legR = new THREE.Mesh(box(B.legW, B.hip, B.legD, 0, -B.hip / 2, 0), mats.pants);
  legR.position.set(-B.legGap, B.hip, 0);

  const torso = new THREE.Group();
  torso.position.y = B.torsoY;
  torso.add(new THREE.Mesh(box(B.torsoW, B.torsoH, B.torsoD), mats.body));
  const padW = B.torsoW * 0.34;
  const padL = new THREE.Mesh(box(padW, 0.05, B.torsoD * 0.9), mats.accent);
  padL.position.set(B.torsoW / 2 - padW / 2, B.torsoH / 2 + 0.02, 0);
  const padR = new THREE.Mesh(box(padW, 0.05, B.torsoD * 0.9), mats.accent);
  padR.position.set(-B.torsoW / 2 + padW / 2, B.torsoH / 2 + 0.02, 0);
  torso.add(padL, padR);

  const head = new THREE.Group();
  head.position.y = B.headY;
  head.add(new THREE.Mesh(box(B.headW, B.headH, B.headD), mats.skin));
  head.add(new THREE.Mesh(box(B.headW + 0.03, 0.08, B.headD + 0.03, 0, B.headH / 2 + 0.02, -0.01), mats.hair));
  head.add(new THREE.Mesh(box(B.headW * 0.92, 0.045, 0.03, 0, 0.02, B.headD / 2 + 0.01), mats.accent));

  const makeArm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
    g.add(new THREE.Mesh(box(B.armW, B.armW, B.armLen, 0, 0, B.armLen / 2 - 0.03), mats.body));
    g.add(new THREE.Mesh(box(0.085, 0.085, 0.085, 0, 0, B.armLen), mats.skin));
    return g;
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);
  const anchor = new THREE.Group();
  anchor.position.set(ANCHOR.x, ANCHOR.y, ANCHOR.z);
  const center = new THREE.Group();
  center.position.set(CENTER.x, CENTER.y, CENTER.z);

  inner.add(legL, legR, torso, head, armL, armR, anchor, center);
  inner.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });

  // normal (not additive) blending so the ring also shows on pale daylight paving
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(o.accent).multiplyScalar(o.ring),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.065;
  ring.scale.setScalar(o.scale);
  root.add(ring);

  const rig = { root, inner, legL, legR, torso, head, armL, armR, anchor, center, mats, ring, scale: o.scale, weaponParts: [], muzzles: [], gripZ: 0 };
  rig.anim = { phase: 0, moveAmt: 0, moveDir: undefined, swing: 0 };
  const tpl = o.model && characterTemplate(o.model);
  if (tpl) {
    // wear the model; the block body hides but its arms keep holding the weapons
    rig.skin = createSkin(tpl);
    inner.add(rig.skin.root);
    for (const part of [legL, legR, torso, head]) part.visible = false;
    for (const a of [armL, armR]) for (const m of a.children) m.visible = false;
  }
  attachWeapon(rig, o.weapon);
  return rig;
}

/** moveDir: world angle the character is moving in (lets a model's legs run sideways or backwards). */
export function animateRig(rig, phase, moveAmt, moveDir) {
  const swing = Math.sin(phase) * 0.75 * moveAmt;
  const an = rig.anim;
  an.phase = phase;
  an.moveAmt = moveAmt;
  an.moveDir = moveDir;
  an.swing = swing;
  const bob = Math.abs(Math.cos(phase)) * 0.04 * moveAmt;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.torso.position.y = BODY.torsoY + bob;
  rig.head.position.y = BODY.headY + bob;
}

/** Call once the block rig is fully posed for the frame; poses the worn model, if any. */
export function finishRig(rig, time) {
  if (rig.skin) poseSkin(rig, time);
}

/** Pose a worn model's death clip; false if there is none (then tip the rig over instead). */
export function deathPose(rig, t) {
  return deathSkin(rig, t);
}

export function setFlash(rig, v) {
  if (rig.skin) flashSkin(rig.skin, v);
  rig.mats.body.emissiveIntensity = v;
  rig.mats.pants.emissiveIntensity = v;
  rig.mats.skin.emissiveIntensity = v;
  rig.mats.hair.emissiveIntensity = v;
}

export function disposeRig(rig) {
  if (rig.skin) disposeSkin(rig.skin);
  for (const m of Object.values(rig.mats)) m.dispose();
  rig.ring.material.dispose();
}
