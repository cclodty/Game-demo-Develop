// The look: "neon figures" (decided 2026-10-17, see docs/DECISIONS.md). Flat
// toon shading with two steps on characters and three on the world, a black
// inverted-hull outline on characters and props, cyan afterimages behind the
// player's moves, character poses held at 12 fps while everything else runs
// smooth, and comic proportions on worn models. Rendering only: nothing here
// changes play. Each part has a switch in the stats panel, remembered in
// localStorage; ?style=off turns everything off for the session.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { hooks } from './characters.js';
import { STYLE } from './config.js';
import { addCutaway } from './cutaway.js';

const KEY = 'bullet-ballet.style';

/** The switches, with their panel labels. `toon` takes effect on reload; the rest switch live. */
export const SWITCHES = {
  toon: '卡通色階（重新整理生效）',
  outline: '描邊',
  ghosts: '殘影',
  stepped: '12 格頓格',
  proportion: '漫畫比例',
  worldOutline: '世界描邊',
};
const DEFAULTS = { toon: true, outline: true, ghosts: true, stepped: true, proportion: true, worldOutline: false };
const MAX_GHOSTS = 8;

// bone name patterns (Mixamo-style names, lower-cased) for the proportions
const BONE = { head: /head$/, hand: /hand$/, foot: /foot$/, upLeg: /upleg$/, leg: /(?<!up)leg$/ };
const PLAIN = { head: 1, hand: 1, foot: 1, thigh: 1 };
const lifts = new WeakMap(); // model template -> how far the proportions lift its soles (rig units, rest pose)
const _box = new THREE.Box3();
const _scale = new THREE.Vector3();

function scaleBones(bones, k) {
  for (const b of bones.head) b.scale.setScalar(k.head);
  for (const b of bones.hand) b.scale.setScalar(k.hand);
  for (const b of bones.foot) b.scale.setScalar(k.foot);
  for (const b of bones.upLeg) b.scale.setScalar(k.thigh);
  for (const b of bones.leg) b.scale.setScalar(1 / k.thigh);
}

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
const save = (on) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(on));
  } catch {
    /* storage unavailable */
  }
};

/** A toon ramp of `steps` grey levels from `floor` up to white. */
function ramp(steps, floor) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round(255 * (floor + ((1 - floor) * i) / Math.max(1, steps - 1)));
    data.set([v, v, v, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Inverted hull: the mesh again, back faces only, pushed out along its normals (before skinning, so it follows the pose). */
function hullMaterial(width) {
  const m = new THREE.MeshBasicMaterial({ color: 0x06040e, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `hull${width}`;
  return m;
}

const isLit = (m) => !!m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial);
const eachMaterial = (o, fn) => {
  o.material = Array.isArray(o.material) ? o.material.map(fn) : fn(o.material);
};

export class Style {
  constructor(game) {
    this.game = game;
    const off = new URLSearchParams(location.search).get('style') === 'off';
    this.session = off; // ?style=off: everything off, and choices made now are not remembered
    this.on = { ...DEFAULTS, ...(off ? {} : load()) };
    if (off) for (const k in this.on) this.on[k] = false;
    this.ramps = { char: ramp(STYLE.charSteps, 0.41), world: ramp(STYLE.worldSteps, 0.27) };
    this.hullMats = { char: hullMaterial(STYLE.charLine), world: hullMaterial(STYLE.worldLine) };
    this.twins = new WeakMap(); // original lit material -> its toon twin
    this.hulls = { char: new Set(), world: new Set() };
    this.rigs = new Set();
    this.level = null;
    this.ghosts = { pool: [], live: [] };
    this.ghostT = 0;
    hooks.rigBuilt = (rig) => this.dressRig(rig);
    hooks.rigChanged = (rig) => this.dressRig(rig);
    hooks.rigDisposed = (rig) => this.forgetRig(rig);
  }

  get lowQuality() {
    return this.game.quality === 'low';
  }
  get outlineOn() {
    return this.on.outline && !this.lowQuality;
  }
  get ghostsOn() {
    return this.on.ghosts && !this.lowQuality;
  }

  // ------------------------------------------------------------ switches

  /** Flip a switch; live for everything but `toon`, which the caller applies with a reload. */
  set(key, on) {
    if (!(key in this.on) || this.on[key] === on) return;
    this.on[key] = on;
    if (!this.session) save(this.on);
    if (key === 'outline') {
      if (on) {
        // lines were not built while the switch was off
        for (const rig of this.rigs) this.outline(rig.inner, 'char');
        if (this.level) for (const p of this.level.props) this.outline(p.mesh, 'char');
      }
      for (const h of this.hulls.char) h.visible = this.outlineOn;
    }
    if (key === 'worldOutline') {
      if (on && this.level) this.outlineLevel(this.level);
      for (const h of this.hulls.world) h.visible = on && !this.lowQuality;
    }
    if (key === 'ghosts' && !on) this.clearGhosts();
    if (key === 'proportion') for (const rig of this.rigs) this.proportion(rig, on);
  }

  // ------------------------------------------------------------ materials

  /** The toon twin of a lit material (cached), or the material itself when it is not lit or toon is off. */
  toon(mat, kind, cut = null) {
    if (!mat || !this.on.toon || !isLit(mat)) return mat;
    let t = this.twins.get(mat);
    if (t) return t;
    t = new THREE.MeshToonMaterial({
      color: mat.color,
      map: mat.map,
      gradientMap: this.ramps[kind],
      emissive: mat.emissive,
      emissiveMap: mat.emissiveMap,
      emissiveIntensity: mat.emissiveIntensity,
      normalMap: mat.normalMap,
      normalScale: mat.normalScale,
      aoMap: mat.aoMap,
      alphaMap: mat.alphaMap,
      transparent: mat.transparent,
      opacity: mat.opacity,
      side: mat.side,
      alphaTest: mat.alphaTest,
      depthWrite: mat.depthWrite,
      depthTest: mat.depthTest,
      vertexColors: mat.vertexColors,
      polygonOffset: mat.polygonOffset,
      polygonOffsetFactor: mat.polygonOffsetFactor,
      polygonOffsetUnits: mat.polygonOffsetUnits,
      shadowSide: mat.shadowSide,
      name: mat.name,
    });
    t.userData = { ...mat.userData, cutaway: false }; // e0/ei0 for the skin flash come along
    if (mat.userData.cutaway && cut) addCutaway(t, cut);
    this.twins.set(mat, t);
    return t;
  }

  /** Toon every lit material under `root`, with the level's cutaway where the original had it. */
  retone(root, kind, cut = null) {
    if (!this.on.toon) return;
    root.traverse((o) => {
      if (o.isMesh && !o.userData.hull && !o.userData.ghost) eachMaterial(o, (m) => this.toon(m, kind, cut));
    });
  }

  /** Give every lit mesh under `root` an outline child it does not have yet (only while that outline is switched on). */
  outline(root, kind) {
    if (kind === 'char' ? !this.outlineOn : !(this.on.worldOutline && !this.lowQuality)) return;
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && !o.userData.hull && !o.userData.ghost && !o.userData.hulled) meshes.push(o);
    });
    for (const m of meshes) {
      m.userData.hulled = true;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (!mat || mat.isMeshBasicMaterial || mat.isShaderMaterial) continue; // rings, beams, lasers, glow: no line
      const h = m.clone(false);
      h.position.set(0, 0, 0);
      h.quaternion.identity();
      h.scale.set(1, 1, 1);
      h.material = this.hullMats[kind];
      h.castShadow = h.receiveShadow = false;
      h.userData = { hull: true };
      if (m.isSkinnedMesh) h.bind(m.skeleton, m.bindMatrix);
      h.visible = kind === 'char' ? this.outlineOn : this.on.worldOutline && !this.lowQuality;
      m.add(h);
      this.hulls[kind].add(h);
    }
  }

  /** A thing added to the scene later (a weapon on the floor, a thrown gun, a grenade): toon and line it like a character. */
  dress(root) {
    this.retone(root, 'char');
    this.outline(root, 'char');
  }

  /** A character rig: its material table (setFlash and new weapon parts use it), its worn model's list (flashSkin uses it), lines and proportions. */
  dressRig(rig) {
    this.rigs.add(rig);
    if (this.on.toon) {
      for (const k in rig.mats) rig.mats[k] = this.toon(rig.mats[k], 'char');
      if (rig.skin) rig.skin.mats = rig.skin.mats.map((m) => this.toon(m, 'char'));
      this.retone(rig.root, 'char');
    }
    this.outline(rig.inner, 'char');
    if (rig.skin && !rig.skin.proportioned) this.proportion(rig, this.on.proportion);
  }

  forgetRig(rig) {
    this.rigs.delete(rig);
    rig.root.traverse((o) => {
      if (o.userData.hull) this.hulls.char.delete(o);
    });
  }

  /** A freshly loaded level: toon its material table and everything under its root, line the props. */
  dressLevel(level) {
    this.level = level;
    const cut = level.cut;
    // hulls of the previous level went away with it
    for (const h of this.hulls.world) this.hulls.world.delete(h);
    for (const h of this.hulls.char) if (!this.inScene(h)) this.hulls.char.delete(h);
    if (this.on.toon) {
      for (const k in level.mat) level.mat[k] = this.toon(level.mat[k], 'world', cut);
      this.retone(level.root, 'world', cut);
    }
    for (const p of level.props) this.outline(p.mesh, 'char');
    if (this.on.worldOutline) this.outlineLevel(level);
  }

  outlineLevel(level) {
    this.outline(level.root, 'world');
  }

  inScene(o) {
    for (let p = o; p; p = p.parent) if (p === this.game.scene) return true;
    return false;
  }

  // ------------------------------------------------------------ proportions

  /**
   * Bigger head, hands and feet and a shorter thigh on a worn model. The
   * model moves down (shorter legs) or up (bigger feet sink) so the soles
   * still touch the ground: measured once per model in its rest pose, since
   * where the sole sits under the ankle differs from model to model.
   */
  proportion(rig, on) {
    const skin = rig.skin;
    if (!skin) return;
    const k = on ? STYLE : PLAIN;
    const bones = { head: [], hand: [], foot: [], upLeg: [], leg: [] };
    skin.model.traverse((o) => {
      if (!o.isBone) return;
      const n = o.name.toLowerCase();
      for (const key in BONE) if (BONE[key].test(n)) bones[key].push(o);
    });
    let lift = lifts.get(skin.tpl);
    if (on && lift === undefined) {
      const sole = (kk) => {
        scaleBones(bones, kk);
        skin.model.updateMatrixWorld(true);
        return _box.setFromObject(skin.model, true).min.y;
      };
      const plain = sole(PLAIN);
      lift = (sole(STYLE) - plain) / skin.root.parent.getWorldScale(_scale).y;
      lifts.set(skin.tpl, lift);
    }
    const apply = () => scaleBones(bones, k);
    apply();
    skin.afterMix = apply; // a clip with scale tracks would undo this every frame
    skin.root.position.y = on ? -lift : 0; // 0 (not -0) when the proportions are off
    skin.proportioned = true;
  }

  // ------------------------------------------------------------ stepping

  /** True when a rig's pose should refresh this frame: always, or every 1/stepHz s of world time when stepped. */
  poseDue(rig, worldTime) {
    if (!this.on.stepped) return true;
    const idx = Math.floor(worldTime * STYLE.stepHz);
    if (rig.stepIdx === idx) return false;
    rig.stepIdx = idx;
    return true;
  }

  // ------------------------------------------------------------ afterimages

  ghostMaterial() {
    const [r, g, b] = STYLE.ghostColor;
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity: STYLE.ghostAlpha, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  buildGhost(rig) {
    const group = new THREE.Group();
    group.userData.ghost = true;
    const g = { rig, kind: rig.skin ? 'skin' : 'block', group, mat: this.ghostMaterial(), life: 0, busy: false, src: [], dst: [] };
    if (rig.skin) {
      const model = cloneSkinned(rig.skin.model);
      rig.skin.model.traverse((o) => g.src.push(o));
      model.traverse((o) => g.dst.push(o));
      const drop = [];
      model.traverse((o) => {
        if (o.userData.hull) drop.push(o);
        else if (o.isMesh) {
          o.material = g.mat;
          o.castShadow = o.receiveShadow = false;
          o.frustumCulled = false;
          o.userData = { ghost: true };
        }
      });
      for (const o of drop) o.parent.remove(o);
      group.add(model);
    }
    return g;
  }

  /** Leave an afterimage of a rig's current pose where it stands. */
  snapshot(rig) {
    if (!this.ghostsOn) return;
    const { pool, live } = this.ghosts;
    const kind = rig.skin ? 'skin' : 'block';
    let g = pool.find((q) => !q.busy && q.rig === rig && q.kind === kind);
    if (!g) {
      if (live.length >= MAX_GHOSTS) this.release(live[0]);
      g = this.buildGhost(rig);
      pool.push(g);
    }
    const src = rig.skin ? rig.skin.root : rig.inner;
    src.updateWorldMatrix(true, false);
    src.matrixWorld.decompose(g.group.position, g.group.quaternion, g.group.scale);
    if (g.kind === 'skin') {
      for (let i = 0; i < g.src.length; i++) {
        g.dst[i].position.copy(g.src[i].position);
        g.dst[i].quaternion.copy(g.src[i].quaternion);
        g.dst[i].scale.copy(g.src[i].scale);
      }
    } else {
      // a block rig: a fresh copy each time, since its weapon parts change
      g.group.clear();
      const copy = rig.inner.clone();
      const drop = [];
      copy.traverse((o) => {
        if (o.userData.hull) drop.push(o);
        else if (o.isMesh) {
          o.material = g.mat;
          o.castShadow = false;
          o.userData = { ghost: true };
        }
      });
      for (const o of drop) o.parent.remove(o);
      copy.position.set(0, 0, 0);
      copy.quaternion.identity();
      copy.scale.set(1, 1, 1);
      g.group.add(copy);
    }
    g.life = STYLE.ghostLife;
    g.mat.opacity = STYLE.ghostAlpha;
    g.busy = true;
    g.group.visible = true;
    this.game.scene.add(g.group);
    live.push(g);
  }

  release(g) {
    const live = this.ghosts.live;
    const i = live.indexOf(g);
    if (i >= 0) live.splice(i, 1);
    this.game.scene.remove(g.group);
    g.busy = false;
  }

  clearGhosts() {
    while (this.ghosts.live.length) this.release(this.ghosts.live[0]);
    this.ghostT = 0;
  }

  /** Once per displayed frame with the world time step: fade the afterimages, leave new ones behind the player's moves. */
  update(worldDt) {
    const live = this.ghosts.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i];
      g.life -= worldDt;
      if (g.life <= 0) this.release(g);
      else g.mat.opacity = STYLE.ghostAlpha * (g.life / STYLE.ghostLife);
    }
    const p = this.game.player;
    const moving = p && p.alive && (p.spinT > 0 || p.slideT > 0 || p.kickT > 0);
    if (moving && this.ghostsOn) {
      this.ghostT -= worldDt;
      if (this.ghostT <= 0) {
        this.ghostT = STYLE.ghostEvery;
        this.snapshot(p.rig);
      }
    } else this.ghostT = 0;
  }
}
