// Blocky low-poly humanoids. Read well from a top-down camera: glowing
// shoulder pads + visor carry each faction's colour.

import * as THREE from 'three';

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
const ringGeo = new THREE.RingGeometry(0.58, 0.7, 36).rotateX(-Math.PI / 2);

export const SHOULDER_X = 0.41;
export const SHOULDER_Y = 1.38;
export const MUZZLE_Z = 0.95;

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

  const legL = new THREE.Mesh(box(0.22, 0.8, 0.26, 0, -0.4, 0), mats.pants);
  legL.position.set(0.15, 0.8, 0);
  const legR = new THREE.Mesh(box(0.22, 0.8, 0.26, 0, -0.4, 0), mats.pants);
  legR.position.set(-0.15, 0.8, 0);

  const torso = new THREE.Group();
  torso.position.y = 1.16;
  torso.add(new THREE.Mesh(box(0.66, 0.68, 0.38), mats.body));
  const padL = new THREE.Mesh(box(0.2, 0.07, 0.32), mats.accent);
  padL.position.set(0.27, 0.36, 0);
  const padR = new THREE.Mesh(box(0.2, 0.07, 0.32), mats.accent);
  padR.position.set(-0.27, 0.36, 0);
  torso.add(padL, padR);

  const head = new THREE.Group();
  head.position.y = 1.72;
  head.add(new THREE.Mesh(box(0.36, 0.36, 0.36), mats.skin));
  head.add(new THREE.Mesh(box(0.4, 0.13, 0.4, 0, 0.17, -0.01), mats.hair));
  head.add(new THREE.Mesh(box(0.34, 0.07, 0.05, 0, 0.03, 0.185), mats.accent));

  const makeArm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
    g.add(new THREE.Mesh(box(0.15, 0.15, 0.6, 0, 0, 0.27), mats.body));
    g.add(new THREE.Mesh(box(0.13, 0.13, 0.13, 0, 0, 0.62), mats.skin));
    return g;
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);
  const pistol = () => new THREE.Mesh(box(0.09, 0.15, 0.36, 0, 0.06, 0.76), mats.gun);

  switch (o.weapon) {
    case 'dual':
      armL.add(pistol());
      armR.add(pistol());
      break;
    case 'pistol':
      armR.add(pistol());
      armL.rotation.x = 1.25;
      break;
    case 'long':
      armR.add(new THREE.Mesh(box(0.1, 0.14, 1.0, 0, 0.06, 0.82), mats.gun));
      armR.rotation.y = 0.12;
      armL.rotation.y = -0.5;
      break;
    case 'blade': {
      const knife = new THREE.Mesh(box(0.05, 0.04, 0.55, 0, 0, 0.9), mats.accent);
      armR.add(knife);
      armL.rotation.x = 0.9;
      armR.rotation.x = 0.5;
      break;
    }
    case 'minigun': {
      const gun = new THREE.Group();
      gun.add(new THREE.Mesh(box(0.3, 0.3, 1.15, 0, 0, 0.55), mats.gun));
      gun.add(new THREE.Mesh(box(0.34, 0.08, 0.1, 0, 0, 1.1), mats.accent));
      gun.position.set(0, SHOULDER_Y - 0.06, 0.35);
      inner.add(gun);
      armR.rotation.y = 0.35;
      armL.rotation.y = -0.35;
      break;
    }
  }

  inner.add(legL, legR, torso, head, armL, armR);
  inner.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });

  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(o.accent).multiplyScalar(o.ring),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.03;
  ring.scale.setScalar(o.scale);
  root.add(ring);

  return { root, inner, legL, legR, torso, head, armL, armR, mats, ring, scale: o.scale, weapon: o.weapon };
}

export function animateRig(rig, phase, moveAmt) {
  const swing = Math.sin(phase) * 0.75 * moveAmt;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.torso.position.y = 1.16 + Math.abs(Math.cos(phase)) * 0.05 * moveAmt;
  rig.head.position.y = 1.72 + Math.abs(Math.cos(phase)) * 0.05 * moveAmt;
}

export function setFlash(rig, v) {
  rig.mats.body.emissiveIntensity = v;
  rig.mats.pants.emissiveIntensity = v;
  rig.mats.skin.emissiveIntensity = v;
  rig.mats.hair.emissiveIntensity = v;
}

export function disposeRig(rig) {
  for (const m of Object.values(rig.mats)) m.dispose();
  rig.ring.material.dispose();
}
