// The race (東望洋跑道 ②): now and then a pack of racing cars sweeps along the track at full speed, a moving wall
// that runs down whoever is on the road. The map's `race` data gives the racing line and the timetable (the first
// pass and the gap between passes, in world seconds since the stage began); config.js RACE the cars and the warning.
// RACE.warn seconds before each pass the track's lights turn red and a line glows along the road, then the cars come
// along it in world time (so bullet time slows them as it does everything else). An enemy run down dies (main.js:
// GRAND PRIX); the player is hurt hard and no move saves him, not a slide, a spin or a dive: only being off the
// track. A barrel on the road is sent flying and goes off where it lands. The teams are made up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RACE } from './config.js';

const RED = new THREE.Color(1, 0.12, 0.08);

export class Race {
  /** `def`: the map's race ({ line: [[x, z], …], first, every }); built when the map loads (level.js). */
  constructor(level, def) {
    this.level = level;
    this.def = def;
    // the racing line as segments with their lengths, for a position s metres along it
    this.segs = [];
    let len = 0;
    for (let i = 0; i + 1 < def.line.length; i++) {
      const [ax, az] = def.line[i];
      const [bx, bz] = def.line[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      this.segs.push({ ax, az, dx: (bx - ax) / l, dz: (bz - az) / l, l, s0: len });
      len += l;
    }
    this.length = len;
    this.cars = [];
    for (let i = 0; i < RACE.cars; i++) this.cars.push(this.buildCar(i));
    this.line = this.buildLine();
    this.lightColors = level.points.map((p) => p.light.color.clone());
    this.reset();
  }

  /** A new stage or a restart: the timetable from the start, no cars on the road. */
  reset() {
    this.t = 0;
    this.next = this.def.first;
    this.passT = -1;
    this.warned = false;
    for (const c of this.cars) c.group.visible = false;
    this.showWarning(false);
  }

  /** Where s metres along the line is, and which way the line runs there. */
  at(s) {
    let seg = this.segs[0];
    for (const q of this.segs) if (s >= q.s0) seg = q;
    const k = Math.min(Math.max(s - seg.s0, 0), seg.l);
    return { x: seg.ax + seg.dx * k, z: seg.az + seg.dz * k, dx: seg.dx, dz: seg.dz };
  }

  /** True while the cars are coming or on the road: the warning showing. */
  get warning() {
    return this.warned;
  }

  update(dt) {
    this.t += dt;
    if (this.passT < 0) {
      if (!this.warned && this.t >= this.next - RACE.warn) {
        this.warned = true;
        this.showWarning(true);
        this.level.game.notes.log('賽車將至');
      }
      if (this.t >= this.next) this.passT = 0;
      else return;
    }
    this.passT += dt;
    let onRoad = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const s = this.passT * RACE.speed - i * RACE.gap;
      c.group.visible = s > 0 && s < this.length;
      if (!c.group.visible) {
        if (s <= 0) onRoad++;
        continue;
      }
      onRoad++;
      const p = this.at(s);
      // each car on a line of its own across the road (RACE.lanes): the pack covers it kerb to kerb
      const off = RACE.lanes[i % RACE.lanes.length];
      c.x = p.x - p.dz * off;
      c.z = p.z + p.dx * off;
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = Math.atan2(p.dx, p.dz);
      this.runDown(c, p.dx, p.dz);
    }
    if (!onRoad) {
      // the last car is gone: the next pass
      this.passT = -1;
      this.next += this.def.every;
      this.warned = false;
      this.showWarning(false);
    }
  }

  /** Whatever the car's body is over: enemies die, the player is hurt, barrels fly. */
  runDown(c, dx, dz) {
    const g = this.level.game;
    const hl = RACE.length / 2;
    const hw = RACE.width / 2;
    /** Is (x, z), with radius r, under the car? */
    const under = (x, z, r) => {
      const ox = x - c.x;
      const oz = z - c.z;
      return Math.abs(ox * dx + oz * dz) < hl + r && Math.abs(ox * dz - oz * dx) < hw + r;
    };
    for (const e of g.enemies.list) {
      if (!e.alive || e.aloft || e.state === 'enter' || !under(e.x, e.z, e.radius)) continue;
      e.die(dx, dz, { cause: 'race' });
    }
    const p = g.player;
    if (p.alive && p.invuln <= 0 && under(p.x, p.z, 0.35)) {
      // no dodge gets under a racing car: the hurt is a blast's, which a spin or a dive does not turn
      p.hurt(RACE.damage, dx, dz, true, '賽車');
    }
    for (const b of this.level.barrels) {
      if (!b.alive || b.carried || b.thrown || (b.y || 0) > 0.6 || !under(b.x, b.z, b.r)) continue;
      b.vx = dx * RACE.speed * 0.4;
      b.vz = dz * RACE.speed * 0.4;
      b.vy = 7;
      b.thrown = true;
    }
  }

  /** The warning: the map's lights red, a red line along the road. Only drawn: nothing in play reads it. */
  showWarning(on) {
    this.line.visible = on;
    this.level.points.forEach((p, i) => p.light.color.copy(on ? RED : this.lightColors[i]));
  }

  /** A line along the racing line, lying on the road: one merged mesh, lit red. */
  buildLine() {
    const L = this.level;
    const parts = this.segs.map((q) => new THREE.PlaneGeometry(0.35, q.l + 0.2).rotateX(-Math.PI / 2).rotateY(Math.atan2(q.dx, q.dz)).translate(q.ax + (q.dx * q.l) / 2, 0.035, q.az + (q.dz * q.l) / 2));
    const mesh = new THREE.Mesh(L.own(mergeGeometries(parts)), L.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.15), transparent: true, opacity: 0.85, depthWrite: false })));
    mesh.visible = false;
    return L.add(mesh);
  }

  /** A racing car: a low body in a team's colours with a nose, a wing at the back and four wheels; two meshes. */
  buildCar(i) {
    const L = this.level;
    const team = RACE.teams[i % RACE.teams.length];
    const box = (x, y, z, w, h, d) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const len = RACE.length;
    const wid = RACE.width;
    const body = new THREE.Mesh(
      L.own(mergeGeometries([box(0, 0.12, 0, wid * 0.7, 0.42, len * 0.62), box(0, 0.12, len * 0.38, wid * 0.32, 0.28, len * 0.26), box(0, 0.55, -len * 0.08, wid * 0.36, 0.3, len * 0.22)])),
      L.own(new THREE.MeshStandardMaterial({ color: team, roughness: 0.35, metalness: 0.4 })),
    );
    const dark = [box(0, 0.75, -len * 0.45, wid * 0.95, 0.06, 0.45), box(0, 0.12, -len * 0.45, 0.08, 0.66, 0.2), box(0, 0.1, len * 0.48, wid, 0.05, 0.3)];
    for (const sx of [-1, 1]) for (const sz of [-0.32, 0.3]) dark.push(box((sx * wid) / 2 - sx * 0.12, 0, sz * len, 0.28, 0.6, 0.62));
    const rest = new THREE.Mesh(L.own(mergeGeometries(dark)), L.mat.darkMetal);
    const group = new THREE.Group();
    group.add(body, rest);
    group.visible = false;
    L.add(group); // dressed with the rest of the map (style.js dressLevel)
    return { group, x: 0, z: 0 };
  }
}
