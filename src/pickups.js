// Weapon pickups: dropped by enemies or placed on the map's weapon pads.
// Walk over one to take it (or top up ammo of the same weapon); stand on a
// different weapon and press E to swap.

import * as THREE from 'three';
import { buildWeaponModel } from './characters.js';
import { PAD_POOL, PLAYER_WEAPONS } from './weapons.js';
import { rand } from './utils.js';

export class Pickups {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.prompt = null;
    this.mats = {
      gun: new THREE.MeshStandardMaterial({ color: 0x4a4e5a, metalness: 0.7, roughness: 0.3, emissive: 0x1a1d24 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xffc861, emissive: 0xffb347, emissiveIntensity: 1.1 }),
    };
    this.ringGeo = new THREE.RingGeometry(0.62, 0.76, 6).rotateX(-Math.PI / 2);
    this.beamGeo = new THREE.CylinderGeometry(0.42, 0.55, 2.2, 18, 1, true).translate(0, 1.1, 0);
  }

  spawn(kind, x, z, { ammo, pad = null, ttl = 18 } = {}) {
    const w = PLAYER_WEAPONS[kind];
    const group = new THREE.Group();
    const model = buildWeaponModel(w.model, this.mats);
    model.position.y = 1;
    model.scale.setScalar(1.35);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.75, 0.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.y = 0.075;
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.16, 0.11, 0.03),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(this.beamGeo, beamMat);
    group.add(model, ring, beam);
    this.game.style.dress(group);
    group.position.set(x, this.game.level.groundY(x, z), z); // on the ground where it lies (steps: 大三巴)
    this.game.scene.add(group);
    const p = { kind, x, z, ammo: ammo ?? w.ammo, pad, ttl: pad ? Infinity : ttl, group, model, ring, ringMat, beamMat, t: rand(0, 6) };
    if (pad) pad.pickup = p;
    this.list.push(p);
    const dropped = this.list.filter((q) => !q.pad);
    if (dropped.length > 6) this.remove(dropped[0]);
    return p;
  }

  drop(kind, x, z, ammoFrac = 0.6) {
    const w = PLAYER_WEAPONS[kind];
    const p = this.spawn(kind, x, z, { ammo: Math.max(1, Math.ceil(w.ammo * ammoFrac)) });
    this.game.fx.ring(x, z, 1.2, 0.35, 0xffc861, 2);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.game.scene.remove(p.group);
    p.ringMat.dispose();
    p.beamMat.dispose();
    if (p.pad && p.pad.pickup === p) p.pad.pickup = null;
    if (this.prompt === p) this.prompt = null;
  }

  clear() {
    while (this.list.length) this.remove(this.list[0]);
    this.prompt = null;
  }

  /**
   * Every pad gets the wave's weapon, a different one on each pad while the pool lasts; a weapon
   * still lying on a pad is swapped. Drawn from the wave's stream `rng`, so every run with a seed
   * sees the same pads, however it is played.
   */
  refillPads(rng) {
    const used = new Set();
    let n = 0;
    for (const pad of this.game.level.pads) {
      const fresh = PAD_POOL.filter((k) => !used.has(k));
      const kind = rng.pick(fresh.length ? fresh : PAD_POOL);
      used.add(kind);
      if (pad.pickup) this.remove(pad.pickup);
      this.spawn(kind, pad.x, pad.z, { pad });
      this.game.fx.ring(pad.x, pad.z, 1.6, 0.5, 0xffc861, 3);
      n++;
    }
    if (n) this.game.audio.padSpawn();
  }

  update(dt, realDt, input) {
    const player = this.game.player;
    let near = null;
    let nearD = Infinity;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      q.t += realDt;
      q.model.rotation.y = q.t * 1.6;
      q.model.position.y = 1 + Math.sin(q.t * 3) * 0.1;
      q.ring.rotation.y = -q.t * 0.8;
      if (q.ttl !== Infinity) {
        q.ttl -= dt;
        if (q.ttl <= 0) {
          this.remove(q);
          continue;
        }
        q.group.visible = q.ttl > 4 || Math.floor(q.ttl * 8) % 2 === 0;
      }
      if (!player.alive) continue;
      const d = Math.hypot(q.x - player.x, q.z - player.z);
      if (d > 1.15) continue;
      // nothing in slot 2, an emptied gun there, or more ammo for the same gun: just take it
      if (!player.special || player.special.empty || player.special.id === q.kind) {
        player.giveWeapon(q.kind, q.ammo);
        this.remove(q);
        continue;
      }
      if (d < nearD) {
        nearD = d;
        near = q;
      }
    }
    this.prompt = near;
    if (near && input.hit('KeyE') && !player.hostage && !player.eUsed) {
      const old = player.special;
      player.giveWeapon(near.kind, near.ammo, true);
      this.remove(near);
      if (old && old.ammo > 0) this.spawn(old.id, player.x, player.z, { ammo: old.ammo });
    }
  }
}
