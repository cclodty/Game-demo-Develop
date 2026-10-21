import * as THREE from 'three';
import { GUN_Y, PAN, PLAYER, UMBRELLA } from './config.js';
import { aimArm, animateRig, attachWeapon, BODY, buildCharacter, deathPose, finishRig, HOLDS, holdBoth, holdInHand, keyPose, MUZZLE_Z, SHOULDER_X, setFlash } from './characters.js';
import { Laser } from './fx.js';
import { carryHands } from './thrown.js';
import { angleTo, clamp, damp, rand, wrapAngle } from './utils.js';
import { PLAYER_WEAPONS } from './weapons.js';

const KICK_TIME = 0.28; // s a kick takes, for its key pose (characters.js KEY_POSES.kick)

/**
 * Turn the hero texture's teal jacket to `hue` (degrees), or back to the original (null). The
 * texture is shared by the model's material and its toon twin, so both change.
 */
function recolorJacket(skin, hue) {
  const tex = (skin.mats.find((m) => m.map) || {}).map;
  if (!tex || !tex.image) return;
  const src = (tex.userData.jacketSource ??= tex.image);
  if (hue === null) {
    tex.image = src;
    tex.needsUpdate = true;
    return;
  }
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const to = new THREE.Color();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max ? (max - min) / max : 0;
    if (s < 0.25 || v < 0.12) continue;
    let h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
    h = ((h * 60) % 360 + 360) % 360;
    if (h < 165 || h > 215) continue; // the jacket's teal
    to.setHSL(hue / 360, s, v * (1 - s / 2));
    d[i] = Math.round(to.r * 255);
    d[i + 1] = Math.round(to.g * 255);
    d[i + 2] = Math.round(to.b * 255);
  }
  ctx.putImageData(img, 0, 0);
  tex.image = c;
  tex.needsUpdate = true;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = buildCharacter({
      body: 0x2f9fbf,
      pants: 0x1c2333,
      skin: 0xe2b48c,
      hair: 0x1b1b22,
      accent: 0x2ee8ff,
      gun: 0x3a3d48,
      weapon: 'dualPistol',
      glow: 2.6,
      ring: 0.9,
      model: 'hero',
    });
    this.anchorZ = this.rig.anchor.position.z;
    this.centerZ = this.rig.center.position.z;
    game.scene.add(this.rig.root);
    this.aimLaser = new Laser(game.scene, new THREE.Color(0.25, 1.2, 1.5));
    this.splitLaser = new Laser(game.scene, new THREE.Color(1.8, 0.35, 1.3));
    this.reset();
  }

  reset() {
    const start = this.game.level.start;
    this.x = start.x;
    this.z = start.z;
    this.vx = this.vz = 0;
    this.facing = Math.PI;
    this.hp = PLAYER.hp;
    this.alive = true;
    this.spinT = 0;
    this.spinCd = 0;
    this.spinReload = false;
    this.slideT = 0;
    this.slideCd = 0;
    this.slideDirX = 0;
    this.slideDirZ = 1;
    this.diveT = 0; // in the air on a dive: s left
    this.rollT = 0; // landed: the roll, s left
    this.diveCd = 0;
    this.diveDirX = 1;
    this.diveDirZ = 0;
    this.spinDirX = 0;
    this.spinDirZ = -1;
    this.fireCd = 0;
    this.ammo = PLAYER_WEAPONS.pistols.mag;
    this.reloadT = 0;
    this.special = null;
    this.slot = 'pistols';
    this.kickCd = 0;
    this.kickT = 0;
    this.swingT = 0; // the pan's swing (smash)
    this.throwT = 0; // a throw's arm over the top (characters.js HOLDS.throw), s left
    this.shieldOn = false; // the umbrella held open (shield): F held with it in hand
    this.shieldK = 0; // how far open it shows, 0–1
    this.shieldCd = 0;
    this.shieldHits = 0; // bullets caught in this opening (the PARASOL cap)
    this.execT = 0; // an execution under way: s left
    this.splitTarget = null;
    this.sinceHurt = 99;
    this.hurtFlash = 0;
    this.invuln = 0;
    this.nextGun = 0;
    this.phase = 0;
    this.moveAmt = 0;
    this.recoilL = 0;
    this.recoilR = 0;
    this.deathT = 0;
    const r = this.rig;
    r.root.visible = true;
    r.inner.rotation.set(0, 0, 0);
    r.inner.position.set(0, 0, 0);
    r.ring.visible = true;
    // a variant (rules.js startWeapon) starts the run with a special weapon in hand
    const first = PLAYER_WEAPONS[this.game.ruleset.startWeapon];
    if (first && first.id !== 'pistols') {
      this.special = { id: first.id, ammo: first.ammo, empty: false };
      this.slot = 'special';
    }
    attachWeapon(r, this.weapon.model);
    setFlash(r, 0);
    this.syncRig(0);
  }

  /** The jacket's colour (an unlock, looks only): the block rig's body, and the jacket in the hero model's texture. */
  setCoat(coat) {
    const r = this.rig;
    for (const m of [r.mats.body, this.game.style.twins.get(r.mats.body)]) if (m) m.color.setHex(coat.rgb);
    if (r.skin) recolorJacket(r.skin, coat.hue);
  }

  /** Put the player back at the map's start (used between stages). */
  placeAtStart() {
    const start = this.game.level.start;
    this.x = start.x;
    this.z = start.z;
    this.vx = this.vz = 0;
    this.spinT = 0;
    this.diveT = this.rollT = 0;
    this.splitTarget = null;
    this.syncRig(0);
  }

  get sliding() {
    return this.slideT > 0;
  }

  get spinning() {
    return this.spinT > 0;
  }

  /** In the air on a dive (bullets pass under). */
  get diving() {
    return this.diveT > 0;
  }

  /** Landed from a dive, rolling out of it. */
  get rolling() {
    return this.rollT > 0;
  }

  get weapon() {
    return this.slot === 'special' && this.special ? PLAYER_WEAPONS[this.special.id] : PLAYER_WEAPONS.pistols;
  }

  /** No pistols (rules.js startWeapon 'none', the 無槍 variant): the left button and R do nothing, the hands are empty. */
  get unarmed() {
    return this.game.ruleset.startWeapon === 'none' && this.slot === 'pistols';
  }

  get reloadProgress() {
    return this.reloadT > 0 ? 1 - this.reloadT / PLAYER_WEAPONS.pistols.reload : 1;
  }

  // ------------------------------------------------------------ weapons

  equip(slot) {
    if (slot === 'special' && (!this.special || this.special.empty)) return;
    if (slot === this.slot && this.rig.model === this.weapon.model) return;
    this.slot = slot;
    this.reloadT = 0;
    this.spinReload = false;
    this.fireCd = Math.max(this.fireCd, 0.12);
    if (!this.weapon.dual) this.splitTarget = null;
    attachWeapon(this.rig, this.weapon.model);
    this.game.audio.weaponSwitch();
  }

  giveWeapon(kind, ammo, replace = false) {
    const w = PLAYER_WEAPONS[kind];
    this.game.notes.log(`拿起 ${w.name}${replace ? '（交換）' : ''}`);
    if (this.special && this.special.id === kind && !replace) {
      this.special.ammo = Math.min(this.special.ammo + ammo, w.ammo * 2);
      this.special.empty = false;
    } else {
      this.special = { id: kind, ammo, empty: false };
    }
    this.slot = 'pistols';
    this.equip('special');
    this.game.hud.toast(`${w.name} <small>${w.en}</small>`);
    this.game.audio.pickup();
  }

  /** Ammo for the shot about to be fired. Returns false if empty. */
  useAmmo() {
    if (this.slot === 'special') {
      if (this.special.ammo <= 0) return false;
      this.special.ammo--;
      return true;
    }
    if (this.ammo <= 0) return false;
    this.ammo--;
    return true;
  }

  /** Local (character space) point -> world. */
  local(lx, lz) {
    const f = this.facing;
    return { x: this.x + lx * Math.cos(f) + lz * Math.sin(f), z: this.z - lx * Math.sin(f) + lz * Math.cos(f) };
  }

  /** World position of a shoulder. side -1 = right hand, +1 = left hand. */
  shoulder(side) {
    return this.local(side * SHOULDER_X, 0);
  }

  muzzle(side, angle) {
    const s = this.shoulder(side);
    const len = this.rig.muzzles[0] ? this.rig.muzzles[0][1] : MUZZLE_Z;
    return { x: s.x + Math.sin(angle) * len, z: s.z + Math.cos(angle) * len };
  }

  /** How far the body has turned in the current spin dodge (two full turns, easing out); 0 when not spinning. */
  spinYaw() {
    if (this.spinT <= 0) return 0;
    const k = 1 - this.spinT / PLAYER.spinDuration;
    return (1 - (1 - k) * (1 - k)) * Math.PI * 4;
  }

  // -------------------------------------------------------------- update

  update(dt, input) {
    if (!this.alive) {
      this.updateDeath(dt);
      return;
    }
    const g = this.game;
    this.spinCd -= dt;
    this.slideCd -= dt;
    this.diveCd -= dt;
    this.fireCd -= dt;
    this.kickCd -= dt;
    this.invuln -= dt;
    this.sinceHurt += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    this.recoilL = Math.max(0, this.recoilL - dt * 8);
    this.recoilR = Math.max(0, this.recoilR - dt * 8);
    if (this.sinceHurt > PLAYER.regenDelay && this.hp < PLAYER.hp) this.hp = Math.min(PLAYER.hp, this.hp + PLAYER.regenRate * dt);

    // --- weapon switching
    if (input.hit('Digit1')) this.equip('pistols');
    else if (input.hit('Digit2')) this.equip('special');
    else if (input.wheel && this.special && !this.special.empty) this.equip(this.slot === 'pistols' ? 'special' : 'pistols');
    const w = this.weapon;

    // --- movement (camera never rotates, so WASD maps to world axes)
    let ix = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let iz = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
    const il = Math.hypot(ix, iz);
    if (il > 0) {
      ix /= il;
      iz /= il;
      // W always means "up the screen", whichever way the camera faces (the step's input carries its yaw)
      const yaw = input.yaw;
      if (yaw) {
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const rx = ix * c + iz * s;
        iz = -ix * s + iz * c;
        ix = rx;
      }
    }

    // slide: only out of a run, locked to the direction of travel; a spin can cut it short
    const curSp = Math.hypot(this.vx, this.vz);
    if (input.hit('KeyC') && this.slideCd <= 0 && this.slideT <= 0 && this.spinT <= 0 && this.diveT <= 0 && this.rollT <= 0 && this.execT <= 0 && !this.shieldOn && curSp >= PLAYER.slideMinSpeed) {
      this.slideT = PLAYER.slideDuration;
      this.slideDirX = this.vx / curSp;
      this.slideDirZ = this.vz / curSp;
      g.audio.slide();
      g.notes.log('滑鏟');
    }

    // in bullet time with a direction held, Space is a dive that way; otherwise the spin
    const canDive = g.focusActive && il > 0 && this.diveCd <= 0 && this.diveT <= 0 && this.rollT <= 0 && !(g.thrown && g.thrown.carry);
    if (input.hit('Space') && canDive && this.execT <= 0) {
      this.diveT = PLAYER.dive.air;
      this.diveDirX = ix;
      this.diveDirZ = iz;
      this.spinT = this.slideT = 0;
      g.audio.slide();
      g.notes.log('飛撲');
    } else if (input.hit('Space') && this.spinCd <= 0 && this.spinT <= 0 && this.diveT <= 0 && this.rollT <= 0 && this.execT <= 0) {
      this.spinT = PLAYER.spinDuration;
      this.slideT = 0;
      g.notes.log('旋轉閃避');
      // a spin finishes a reload: what is left of it (or a fresh one for an empty magazine) ends with the spin
      if (this.slot === 'pistols' && (this.reloadT > 0 || this.ammo <= 0)) {
        if (this.reloadT <= 0) g.audio.reload();
        this.reloadT = Math.min(this.reloadT > 0 ? this.reloadT : PLAYER_WEAPONS.pistols.reload, PLAYER.spinDuration);
        this.spinReload = true;
      }
      if (il > 0) {
        this.spinDirX = ix;
        this.spinDirZ = iz;
      } else {
        this.spinDirX = Math.sin(this.facing);
        this.spinDirZ = Math.cos(this.facing);
      }
      g.audio.spin();
    }

    let tx;
    let tz;
    let accel = PLAYER.accel;
    const speed = PLAYER.speed * (w.moveMul || 1) * (this.shieldOn ? UMBRELLA.walkMul : 1); // an open umbrella is a walk
    if (this.execT > 0) {
      // an execution: standing over him until it is done
      this.execT -= dt;
      tx = tz = 0;
      accel = 40;
    } else if (this.diveT > 0) {
      // through the air at a set speed: the distance is the dive's, whatever the run was
      this.diveT -= dt;
      const sp = PLAYER.dive.dist / PLAYER.dive.air;
      tx = this.diveDirX * sp;
      tz = this.diveDirZ * sp;
      this.vx = tx;
      this.vz = tz;
      if (this.diveT <= 0) {
        this.rollT = PLAYER.dive.roll;
        g.notes.log('落地翻滾');
      }
    } else if (this.rollT > 0) {
      this.rollT -= dt;
      tx = this.diveDirX * speed * PLAYER.dive.rollMul;
      tz = this.diveDirZ * speed * PLAYER.dive.rollMul;
      accel = 30;
      if (this.rollT <= 0) this.diveCd = PLAYER.dive.cooldown;
    } else if (this.spinT > 0) {
      this.spinT -= dt;
      const sp = speed * PLAYER.spinSpeedMul;
      tx = this.spinDirX * sp;
      tz = this.spinDirZ * sp;
      accel = 30;
      // the sparkle cloud marks the spin only when there are no afterimages to do it
      if (!g.style.ghostsOn && rand(0, 1) < 0.8) {
        g.fx.glow.spawn({ x: this.x + rand(-0.3, 0.3), y: rand(0.4, 1.8), z: this.z + rand(-0.3, 0.3), life: 0.3, size: rand(0.06, 0.12), r: 0.5, g: 2.6, b: 3.4 });
      }
      if (this.spinT <= 0) this.spinCd = PLAYER.spinCooldown;
    } else if (this.slideT > 0) {
      this.slideT -= dt;
      const k = Math.max(0, this.slideT / PLAYER.slideDuration); // 1 at launch, 0 at the end
      const sp = speed * PLAYER.slideSpeedMul * (0.35 + 0.65 * k);
      tx = this.slideDirX * sp;
      tz = this.slideDirZ * sp;
      accel = 40;
      if (rand(0, 1) < 0.6) {
        g.fx.smoke.spawn({ x: this.x - this.slideDirX * 0.4 + rand(-0.2, 0.2), y: 0.1, z: this.z - this.slideDirZ * 0.4 + rand(-0.2, 0.2), vy: 0.5, life: rand(0.3, 0.5), size: 0.22, r: 0.4, g: 0.4, b: 0.45, drag: 2, grow: 1.6 });
      }
      if (this.slideT <= 0) this.slideCd = PLAYER.slideCooldown;
    } else {
      tx = ix * speed;
      tz = iz * speed;
    }
    this.vx = damp(this.vx, tx, accel, dt);
    this.vz = damp(this.vz, tz, accel, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.collide();

    // --- aim
    const aim = input.aim;
    const aimDist = Math.hypot(aim.x - this.x, aim.z - this.z);
    if (aimDist > 0.35 && this.execT <= 0) this.facing = angleTo(this.x, this.z, aim.x, aim.z);

    // --- split aim (dual weapons only): hold right mouse to lock the left gun
    if (input.mouse.rightPressed && w.dual && !this.unarmed) {
      this.splitTarget = g.enemies.closestTo(aim.x, aim.z, 7) || g.enemies.closestTo(this.x, this.z, 30);
      if (!this.splitTarget) g.audio.denied();
    }
    if (!input.mouse.right || !w.dual || this.unarmed) this.splitTarget = null;
    else if (this.splitTarget && !this.splitTarget.alive) {
      this.splitTarget = g.enemies.closestTo(this.splitTarget.x, this.splitTarget.z, 14);
    }

    // --- reload (pistols only) / fire
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammo = PLAYER_WEAPONS.pistols.mag;
        g.audio.reloadDone();
        if (this.spinReload) {
          this.spinReload = false;
          g.score.style('SPIN RELOAD', 20, false);
          g.notes.log('旋轉中換彈');
        }
      }
    } else if (input.hit('KeyR') && this.slot === 'pistols' && !this.unarmed && this.ammo < PLAYER_WEAPONS.pistols.mag) {
      this.startReload();
    }
    // --- carry / throw (G); a carried thing is thrown with G or the left button
    // E picks up what lies here (a pad's weapon swap has first call: pickups.js); G throws
    if (input.hit('KeyE') && !g.pickups.prompt) g.thrown.pickAction();
    if (input.hit('KeyG')) g.thrown.throwAction();
    const carrying = !!g.thrown.carry && !g.thrown.inHand; // a pan in hand leaves the left gun free: only a load overhead is thrown by the left button
    if (carrying && input.mouse.leftPressed) g.thrown.throwCarried();
    if (input.mouse.left && this.fireCd <= 0 && !carrying && this.execT <= 0) {
      if (this.unarmed) {
        if (input.mouse.leftPressed) g.audio.empty(); // nothing in the hands: a dry click, no shot
      } else if (this.slot === 'pistols' && this.reloadT > 0) {
        if (input.mouse.leftPressed) g.audio.empty();
      } else if (this.slot === 'pistols' && this.ammo <= 0) {
        this.startReload();
      } else {
        this.fire();
      }
    }

    // --- kick; by an enemy still dazed from a kick or a throw, F is an execution instead
    if (this.kickT > 0) this.kickT -= dt;
    if (this.throwT > 0) this.throwT -= dt;
    if (this.swingT > 0) {
      this.swingT -= dt;
      if (g.thrown.inHand && this.swingT > PAN.swing - PAN.parry) this.parry();
    }
    // the umbrella: open while F is held with it in hand (and no execution is due), shut when let go
    this.shieldCd -= dt;
    const umbrella = g.thrown.inHand && g.thrown.carry.kind === 'umbrella' ? g.thrown.carry : null;
    const wantShield = !!umbrella && input.down('KeyF') && this.execT <= 0 && !this.executable();
    if (wantShield && !this.shieldOn && this.shieldCd <= 0) {
      this.shieldOn = true;
      this.shieldHits = 0;
      g.audio.slide();
      g.notes.log('開傘');
    } else if (!wantShield && this.shieldOn) {
      this.shieldOn = false;
      this.shieldCd = UMBRELLA.cooldown;
    }
    if (this.shieldOn) this.shield(umbrella);
    this.shieldK = clamp(this.shieldK + (this.shieldOn ? 8 : -8) * dt, 0, 1);
    if (umbrella) umbrella.open(this.shieldK);
    if (input.hit('KeyF') && this.execT <= 0) {
      const down = this.executable();
      if (down) this.execute(down);
      else if (umbrella) {
        // the umbrella's F is the hold above: not a kick
      } else if (g.thrown.hugged && g.thrown.carry.kind === 'extinguisher') g.thrown.spray();
      else if (this.kickCd <= 0) {
        if (g.thrown.inHand && g.thrown.carry.kind === 'pan') this.smash();
        else this.kick(); // with a net in hand too
      }
    }

    const sp = Math.hypot(this.vx, this.vz);
    this.moveAmt = damp(this.moveAmt, clamp(sp / PLAYER.speed, 0, 1), 10, dt);
    this.phase += sp * dt * 2.1;
    this.syncRig(dt);
    this.updateLasers();
  }

  collide() {
    const g = this.game;
    const R = PLAYER.radius;
    for (const p of g.level.props) {
      if (!p.alive || p.carried) continue;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const rr = R + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = rr - d;
      if (p.fixed) {
        // a lamp post or a sign's post: the body gives way, not the post
        this.x -= (dx / d) * push;
        this.z -= (dz / d) * push;
        continue;
      }
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      p.vx += (dx / d) * 1.5;
      p.vz += (dz / d) * 1.5;
    }
    for (const e of g.enemies.list) {
      if (!e.alive || e.aloft) continue; // a drone flies over, a man on a balcony stands over
      const dx = e.x - this.x;
      const dz = e.z - this.z;
      const rr = R + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      e.x += (dx / d) * push;
      e.z += (dz / d) * push;
      this.x -= (dx / d) * push;
      this.z -= (dz / d) * push;
    }
    g.level.collideCircle(this, R);
  }

  startReload() {
    if (this.reloadT > 0) return;
    this.reloadT = PLAYER_WEAPONS.pistols.reload;
    this.game.audio.reload();
  }

  fire() {
    const g = this.game;
    const w = this.weapon;
    const aim = g.cmd.aim;
    const shots = [];
    if (w.dual) {
      const target = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
      if (target) {
        shots.push({ side: -1, tx: aim.x, tz: aim.z, split: false }, { side: 1, tx: target.x, tz: target.z, split: true });
      } else {
        shots.push({ side: this.nextGun ? 1 : -1, tx: aim.x, tz: aim.z, split: false });
        this.nextGun ^= 1;
      }
    } else {
      shots.push({ side: 0, tx: aim.x, tz: aim.z, split: false });
    }
    if (g.thrown.inHand) {
      // the right hand holds the pan: the left pistol (side 1, rig.armL) alone
      shots.length = 0;
      shots.push({ side: 1, tx: aim.x, tz: aim.z, split: false });
    }
    // spin shot: while spinning the guns point where the body has turned to,
    // so holding fire sprays a ring instead of aiming at the cursor
    const yaw = this.spinYaw();
    if (yaw) {
      for (const s of shots) {
        const a = this.facing + yaw + (s.side || 0) * PLAYER.spinFan;
        s.spin = a;
        s.tx = this.x + Math.sin(a) * 30;
        s.tz = this.z + Math.cos(a) * 30;
        s.split = false;
      }
    }

    let fired = false;
    for (const s of shots) {
      if (!this.useAmmo()) break;
      fired = true;
      let origin;
      let m;
      let armAngle = this.facing;
      if (s.spin !== undefined) {
        armAngle = s.spin;
        origin = { x: this.x + Math.sin(armAngle) * 0.3, z: this.z + Math.cos(armAngle) * 0.3 };
        m = { x: this.x + Math.sin(armAngle) * 0.8, z: this.z + Math.cos(armAngle) * 0.8 };
      } else if (s.side) {
        const arm = s.side === 1 ? this.rig.armL : this.rig.armR;
        armAngle = this.facing + arm.rotation.y;
        origin = this.shoulder(s.side);
        m = this.muzzle(s.side, armAngle);
      } else {
        const [lx, lz] = this.rig.muzzles[0];
        origin = this.local(lx, this.rig.gripZ);
        m = this.local(lx, lz);
      }
      let dx = s.tx - origin.x;
      let dz = s.tz - origin.z;
      let l = Math.hypot(dx, dz);
      if (l < 1) {
        dx = Math.sin(armAngle);
        dz = Math.cos(armAngle);
        l = 1;
      }
      const base = Math.atan2(dx / l, dz / l);
      if (w.grenade) {
        g.grenades.spawn(m.x, m.z, s.tx, s.tz, w.speed);
        dx = Math.sin(base);
        dz = Math.cos(base);
      } else {
        const pellets = w.pellets || 1;
        for (let i = 0; i < pellets; i++) {
          const a = pellets > 1 ? base + (i / (pellets - 1) - 0.5) * w.spread * 2 + g.rng.range(-0.03, 0.03) : base + g.rng.range(-1, 1) * w.spread;
          dx = Math.sin(a);
          dz = Math.cos(a);
          g.bullets.spawn({
            x: origin.x,
            z: origin.z,
            dx,
            dz,
            speed: w.speed * (pellets > 1 ? g.rng.range(0.88, 1.08) : 1),
            owner: 'player',
            damage: w.damage,
            split: s.split,
            look: w.look,
            trail: w.trail,
            pierce: w.pierce,
            knock: w.knock,
            range: w.range,
            weapon: w.id,
            spinShot: s.spin !== undefined,
            diveShot: this.diveT > 0,
          });
        }
        dx = Math.sin(base);
        dz = Math.cos(base);
      }
      g.fx.muzzle(m.x, GUN_Y, m.z, dx, dz);
      if (w.pellets || w.scope) g.fx.muzzle(m.x, GUN_Y, m.z, dx, dz, [6, 4, 1.6]);
      const side = s.side || -1;
      const c = w.casing;
      if (!w.grenade) {
        g.fx.casing(m.x - dx * 0.5, GUN_Y, m.z - dz * 0.5, Math.cos(this.facing) * side, -Math.sin(this.facing) * side, c);
      }
      g.fx.flash(m.x, GUN_Y + 0.4, m.z, 0xffc070, w.flash || 16, w.scope ? 0.14 : 0.08, w.scope ? 14 : 9);
      if (s.side === 1) this.recoilL = 1;
      else this.recoilR = 1;
      if (w.recoil) {
        this.vx -= dx * w.recoil;
        this.vz -= dz * w.recoil;
      }
    }
    if (!fired) return;
    g.waves.shots++;
    g.level.noise(this.x, this.z, 11);
    g.audio.shot(w.sound, g.panFor(this.x));
    g.shake(w.shake);
    this.fireCd = w.interval * (yaw ? PLAYER.spinFireMul : 1);
    if (this.slot === 'pistols') {
      if (this.ammo <= 0) this.startReload();
    } else if (this.special.ammo <= 0) {
      this.special.empty = true; // kept in slot 2 so G can throw it
      this.equip('pistols');
      g.hud.toast('彈藥用盡 <small>OUT OF AMMO · G 擲出</small>');
    }
  }

  /** The nearest enemy within PLAYER.execRange still dazed from a kick, a throw or a body bowled into him. */
  executable() {
    let best = null;
    let bd = PLAYER.execRange;
    for (const e of this.game.enemies.list) {
      if (!e.alive || e.stunT <= 0 || e.aloft || !['kick', 'throw', 'strike', 'smash', 'net'].includes(e.stunCause)) continue;
      const d = Math.hypot(e.x - this.x, e.z - this.z);
      if (d <= bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Finish a dazed enemy: a sure kill, PLAYER.execTime s standing over him, the first PLAYER.execInvuln s untouchable. */
  execute(e) {
    const g = this.game;
    this.execT = PLAYER.execTime;
    this.invuln = Math.max(this.invuln, PLAYER.execInvuln);
    this.facing = angleTo(this.x, this.z, e.x, e.z);
    this.vx = this.vz = 0;
    const d = Math.hypot(e.x - this.x, e.z - this.z) || 1;
    e.die((e.x - this.x) / d, (e.z - this.z) / d, { cause: 'execution' });
    g.audio.kick(true);
    g.shake(0.35);
    g.hitstop(0.08);
  }

  /** The arc in front: (x, z) within `reach` and `arc` radians of the facing gives the way out from the player, else null. */
  cone(arc) {
    return (x, z, reach) => {
      const dx = x - this.x;
      const dz = z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return null;
      if (d > 0.3 && Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing)) > arc) return null;
      return d > 0.01 ? { x: dx / d, z: dz / d } : { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    };
  }

  /** A door in front swings open on whoever is behind it; a shutter's lock post gives (fixtures.js). True if anything did. */
  hitFixtures(inCone, reach) {
    let hit = false;
    for (const f of this.game.level.fixtures) {
      if (f.kind === 'door' && !f.open && inCone(f.x, f.z, reach + f.w / 2)) hit = f.kick(this.x, this.z) || hit;
      else if (f.kind === 'shutter' && inCone(f.x, f.z, reach + f.r)) hit = f.drop('kick') || hit;
    }
    return hit;
  }

  /**
   * The open umbrella: every enemy bullet within UMBRELLA.reach in the arc in front stops in the canopy (PARASOL
   * points, capped per opening). Each one wears it: at UMBRELLA.hits the ribs give and it falls from the hand, done for.
   */
  shield(umbrella) {
    const g = this.game;
    for (const b of g.bullets.list) {
      if (!b.alive || b.owner !== 'enemy') continue;
      // in front only: the kick's cone takes anything within 0.3 m whatever the angle, which would swallow a shot in the back
      const dx = b.x - this.x;
      const dz = b.z - this.z;
      if (Math.hypot(dx, dz) > UMBRELLA.reach || Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing)) > UMBRELLA.arc) continue;
      b.alive = false;
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 5, [7, 3, 6], 5);
      g.audio.deflect(g.panFor(b.x));
      if (this.shieldHits * UMBRELLA.block < UMBRELLA.blockCap) g.score.style('PARASOL', UMBRELLA.block, true);
      this.shieldHits++;
      if (++umbrella.hits >= UMBRELLA.hits) {
        // broken: out of the hand onto the floor in front, inside out, and no more shielding
        this.shieldOn = false;
        this.shieldCd = UMBRELLA.cooldown;
        g.thrown.release(umbrella);
        g.thrown.carry = null;
        umbrella.x = this.x + Math.sin(this.facing) * 0.6;
        umbrella.z = this.z + Math.cos(this.facing) * 0.6;
        umbrella.y = 0.3;
        umbrella.vx = umbrella.vz = 0;
        umbrella.vy = 1;
        umbrella.break();
        return;
      }
    }
  }

  /** The swing's first PAN.parry seconds: enemy bullets in the arc are batted back (bullets.js batBack), grenades in the air too. */
  parry() {
    const g = this.game;
    const inCone = this.cone(PAN.arc);
    for (const b of g.bullets.list) {
      if (!b.alive || b.owner !== 'enemy' || !inCone(b.x, b.z, PAN.reach)) continue;
      g.bullets.batBack(b);
    }
    g.grenades.kick(inCone, true);
  }

  /**
   * With a pan in hand, F swings it (PAN): whoever is in the arc flies and is dazed (a kill is PAN SMASH, and an
   * execution follows), a barrel is batted off and goes off where it lands, a door or a shutter as from a kick.
   */
  smash() {
    const g = this.game;
    this.kickCd = PLAYER.kickCooldown;
    this.swingT = PAN.swing;
    const inCone = this.cone(PAN.arc);
    let hit = this.hitFixtures(inCone, PAN.reach);
    for (const e of g.enemies.list) {
      if (!e.alive || e.spawnLock > 0 || e.aloft) continue;
      const dir = inCone(e.x, e.z, PAN.reach + e.radius);
      if (!dir) continue;
      e.kick(dir.x, dir.z, PAN.power, 'smash', PAN.damage);
      g.notes.log(`鑊擊中 ${e.cfg.label}`);
      hit = true;
    }
    if (g.boss.melee(inCone, PAN.reach, 'smash')) hit = true; // a boss within reach of a swing (boss.js: the blade queen's window)
    for (const p of g.level.props) {
      if (!p.alive || p.fixed || p.carried) continue;
      const dir = inCone(p.x, p.z, PAN.reach + p.r);
      if (!dir) continue;
      if (p.kind === 'barrel') {
        // batted off: it flies, and a barrel that lands from a flight goes off
        p.vx = dir.x * PAN.barrelFly;
        p.vz = dir.z * PAN.barrelFly;
        p.vy = 7;
        p.thrown = true;
      } else if (p.kind === 'pan') {
        p.hit(dir.x, dir.z, 9);
        p.vy = 8;
      } else if (p.kind === 'extinguisher' || p.kind === 'trolley') p.kick(dir.x, dir.z);
      else {
        p.vx += dir.x * 14;
        p.vz += dir.z * 14;
      }
      hit = true;
    }
    if (g.grenades.kick(inCone, true)) hit = true;
    g.audio.kick(hit);
    g.audio.impact(g.panFor(this.x));
    if (hit) {
      g.shake(0.3);
      g.hitstop(0.06);
      g.fx.sparks(this.x + Math.sin(this.facing) * 1.2, 1.1, this.z + Math.cos(this.facing) * 1.2, Math.sin(this.facing), Math.cos(this.facing), 12, [7, 7, 6], 7);
    }
  }

  kick() {
    const g = this.game;
    this.kickCd = PLAYER.kickCooldown;
    this.kickT = KICK_TIME;
    const inCone = this.cone(PLAYER.kickArc);
    let hit = this.hitFixtures(inCone, PLAYER.kickRange);
    for (const e of g.enemies.list) {
      if (!e.alive || e.spawnLock > 0 || e.aloft) continue;
      const dir = inCone(e.x, e.z, PLAYER.kickRange + e.radius);
      if (!dir) continue;
      e.kick(dir.x, dir.z, 14);
      hit = true;
    }
    if (g.boss.melee(inCone, PLAYER.kickRange, 'kick')) hit = true;
    for (const p of g.level.props) {
      if (!p.alive || p.fixed) continue;
      const dir = inCone(p.x, p.z, PLAYER.kickRange + p.r);
      if (!dir) continue;
      if (p.kind === 'pan') {
        p.hit(dir.x, dir.z, 9);
        p.vy = 8;
      } else if (p.kind === 'extinguisher' || p.kind === 'trolley') {
        p.kick(dir.x, dir.z); // off it careers (an extinguisher) or rolls (a trolley)
      } else if (!(p.kind === 'barrel' && p.rocket(dir.x, dir.z))) {
        // an LPG cylinder jets off instead of sliding
        p.vx += dir.x * 14;
        p.vz += dir.z * 14;
      }
      hit = true;
    }
    if (g.grenades.kick(inCone)) hit = true;
    g.audio.kick(hit);
    if (hit) {
      g.shake(0.25);
      g.hitstop(0.05);
      g.fx.sparks(this.x + Math.sin(this.facing), 0.8, this.z + Math.cos(this.facing), Math.sin(this.facing), Math.cos(this.facing), 8, [4, 4, 4], 6);
    }
  }

  hurt(dmg, dx = 0, dz = 0, explosion = false, source = '') {
    if (!this.alive || this.invuln > 0) return false;
    if ((this.spinning || this.diving) && !explosion) return false; // a bullet passes round a spin, under a dive
    const g = this.game;
    this.hp -= dmg;
    this.sinceHurt = 0;
    this.hurtFlash = 1;
    this.invuln = 0.08;
    this.vx += dx * 4;
    this.vz += dz * 4;
    g.fx.blood(this.x, 1.2, this.z, dx, dz, 10);
    g.onPlayerHurt(dmg, source || (explosion ? '爆炸' : '子彈'));
    if (this.hp <= 0 && g.tutorial.active) this.hp = 1; // the warm-up teaches; it does not end runs
    if (this.hp <= 0) this.die(dx, dz);
    return true;
  }

  die(dx, dz) {
    this.hp = 0;
    this.alive = false;
    this.deathT = 0;
    const l = Math.hypot(dx, dz) || 1;
    this.deathDx = dx / l;
    this.deathDz = dz / l;
    this.vx = this.deathDx * 6;
    this.vz = this.deathDz * 6;
    this.rig.root.rotation.y = Math.atan2(-this.deathDx, -this.deathDz);
    keyPose(this.rig, null); // fall from standing, not from where a slide or a spin left the body
    this.aimLaser.hide();
    this.splitLaser.hide();
    this.rig.ring.visible = false;
    this.game.fx.blood(this.x, 1.2, this.z, dx, dz, 30, 1.4);
    this.game.onPlayerDeath();
  }

  updateDeath(dt) {
    this.deathT += dt;
    const f = Math.exp(-4 * dt);
    this.vx *= f;
    this.vz *= f;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.game.level.collideCircle(this, PLAYER.radius);
    const k = clamp(this.deathT / 0.45, 0, 1);
    const r = this.rig;
    if (!deathPose(r, this.deathT)) {
      r.inner.rotation.x = (-Math.PI / 2) * (1 - (1 - k) * (1 - k));
      r.inner.position.y = 0.12 * k;
    }
    r.root.position.set(this.x, this.game.level.groundY(this.x, this.z), this.z);
    setFlash(r, 0);
  }

  syncRig() {
    const r = this.rig;
    r.root.position.set(this.x, this.game.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    // flash and ring track every frame; the pose below refreshes at the style's step rate
    setFlash(r, this.hurtFlash * 2.5);
    const ringBoost = this.spinT > 0 ? 3 : 1;
    r.ring.material.color.setRGB(0.25 * ringBoost, 0.85 * ringBoost, 1.0 * ringBoost);
    if (!this.game.style.poseDue(r, this.game.worldTime)) return;
    animateRig(r, this.phase, this.moveAmt, Math.atan2(this.vx, this.vz));

    // the moves' key poses (characters.js KEY_POSES), held, with one in-between at each end
    const thrown = this.game.thrown;
    const inHand = !!(thrown && thrown.inHand);
    const hugged = !!(thrown && thrown.hugged);
    const carrying = !!(thrown && thrown.carry) && !inHand && !hugged; // a load overhead: not a pan in hand, not an extinguisher in the arms
    r.inner.rotation.y = this.spinYaw();
    const held = (k) => (k < 0.12 || k > 0.88 ? 0.5 : 1);
    if (this.diveT > 0) keyPose(r, 'dive', held(1 - this.diveT / PLAYER.dive.air));
    else if (this.rollT > 0) keyPose(r, 'roll', held(1 - this.rollT / PLAYER.dive.roll));
    else if (this.slideT > 0) keyPose(r, 'slide', held(1 - this.slideT / PLAYER.slideDuration));
    else if (this.spinT > 0) keyPose(r, 'spin', held(1 - this.spinT / PLAYER.spinDuration));
    else if (this.kickT > 0) keyPose(r, 'kick', held(1 - this.kickT / KICK_TIME));
    else keyPose(r, carrying ? 'carry' : null);
    if (this.execT > 0) {
      // the execution: leaning in, a stamp down on him (the kick's leg, so a worn model shows it too)
      const k = 1 - this.execT / PLAYER.execTime;
      r.legR.rotation.x = -1.5 * Math.sin(Math.min(1, k * 1.6) * Math.PI);
      r.inner.rotation.x = 0.3 * Math.sin(k * Math.PI);
    }

    const pose = r.pose;
    const t = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
    if (t) {
      const sh = this.shoulder(1);
      r.armL.rotation.y = clamp(wrapAngle(angleTo(sh.x, sh.z, t.x, t.z) - this.facing), -1.5, 1.5);
    } else {
      r.armL.rotation.y = pose.ly;
    }
    r.armR.rotation.y = pose.ry;
    // something carried overhead: the guns put away, the hands up on it (a worn model's reach it, skin.js)
    const prop = carrying ? thrown.carry : null;
    r.anim.carry = prop ? carryHands(prop) : null;
    // a pan in the right hand: that pistol stays away; empty hands (無槍): both
    for (const m of r.weaponParts) m.visible = !prop && !hugged && !(inHand && m.parent === r.armR) && !this.unarmed;
    // the guns stay level with the aim however the body leans (a slide lies back, an execution leans in)
    const level = -r.inner.rotation.x;
    r.armL.rotation.x = (carrying ? -1.5 : pose.lx) + level;
    r.armR.rotation.x = (carrying ? -1.5 : pose.rx) + level;
    if (prop) {
      // block arms cannot bend: straight up and out just so far that the hands rest on its sides, not inside it
      const out = Math.asin(clamp((prop.r - SHOULDER_X) / BODY.armLen, 0, 1));
      r.armL.rotation.y = out;
      r.armR.rotation.y = -out;
    }
    // held things (characters.js HOLDS), after the guns' arm lines, which they replace: a pan or umbrella in the
    // right hand, from its rest to its use (the swing, the umbrella open); an extinguisher in both arms, the hands on it
    if (inHand) {
      const c = thrown.carry;
      const k = c.kind === 'pan' ? (this.swingT > 0 ? Math.sin((1 - this.swingT / PAN.swing) * Math.PI) : 0) : this.shieldK;
      holdInHand(r, c.mesh, HOLDS[c.kind], k);
    }
    if (hugged) r.anim.hands = holdBoth(r, thrown.carry.mesh, HOLDS[thrown.carry.kind]);
    if (this.throwT > 0) {
      // a throw: the right arm comes over the top
      const T = HOLDS.throw;
      const k = clamp(1 - this.throwT / T.time, 0, 1);
      aimArm(r.armR, ...[0, 1, 2].map((i) => T.from[i] + (T.to[i] - T.from[i]) * k));
    }
    r.anchor.rotation.x = r.center.rotation.x = level;
    if (r.hold === 'dual') {
      r.armL.position.z = -this.recoilL * 0.14;
      r.armR.position.z = -this.recoilR * 0.14;
    } else {
      r.armL.position.z = r.armR.position.z = -this.recoilR * 0.08;
      r.anchor.position.z = this.anchorZ - this.recoilR * 0.16;
      r.center.position.z = this.centerZ - this.recoilR * 0.1;
    }

    finishRig(r, this.game.worldTime);
  }

  updateLasers() {
    const g = this.game;
    const w = this.weapon;
    const aim = g.cmd.aim;
    let m;
    if (this.rig.hold === 'dual') {
      m = this.muzzle(-1, this.facing + this.rig.armR.rotation.y);
    } else {
      const [lx, lz] = this.rig.muzzles[0];
      m = this.local(lx, lz);
    }
    let dx = aim.x - m.x;
    let dz = aim.z - m.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.5) {
      dx /= l;
      dz /= l;
      if (w.scope) {
        // the sniper's sight runs all the way to the first wall
        const len = g.level.rayLength(m.x, m.z, dx, dz, 60);
        this.aimLaser.base.setRGB(1.6, 0.2, 0.25);
        this.aimLaser.set(m.x, m.z, m.x + dx * len, m.z + dz * len, 0.05, 1.1);
      } else {
        const len = g.level.rayLength(m.x, m.z, dx, dz, Math.min(l, 45));
        this.aimLaser.base.setRGB(0.25, 1.2, 1.5);
        this.aimLaser.set(m.x, m.z, m.x + dx * len, m.z + dz * len, 0.035, this.reloadT > 0 ? 0.25 : 0.7);
      }
    } else {
      this.aimLaser.hide();
    }

    const t = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
    if (t) {
      const armL = this.facing + this.rig.armL.rotation.y;
      const ml = this.muzzle(1, armL);
      let sx = t.x - ml.x;
      let sz = t.z - ml.z;
      const sl = Math.hypot(sx, sz) || 1;
      sx /= sl;
      sz /= sl;
      const len = g.level.rayLength(ml.x, ml.z, sx, sz, sl);
      this.splitLaser.set(ml.x, ml.z, ml.x + sx * len, ml.z + sz * len, 0.05, 1.2);
    } else {
      this.splitLaser.hide();
    }
  }
}
