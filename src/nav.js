// Grid A* used by enemies to walk around cover.

export class NavGrid {
  constructor(minX, minZ, maxX, maxZ, cell) {
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.gen = 0;
    this.heapI = [];
    this.heapF = [];
  }

  build(solids, inflate) {
    const { cols, rows, cell } = this;
    this.blocked.fill(0);
    for (let r = 0; r < rows; r++) {
      const z = this.minZ + (r + 0.5) * cell;
      for (let c = 0; c < cols; c++) {
        const x = this.minX + (c + 0.5) * cell;
        for (const s of solids) {
          if (!s.alive) continue;
          if (x > s.minX - inflate && x < s.maxX + inflate && z > s.minZ - inflate && z < s.maxZ + inflate) {
            this.blocked[r * cols + c] = 1;
            break;
          }
        }
      }
    }
  }

  col(x) {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
  }

  row(z) {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
  }

  isWalkable(x, z) {
    return !this.blocked[this.row(z) * this.cols + this.col(x)];
  }

  centerX(i) {
    return this.minX + ((i % this.cols) + 0.5) * this.cell;
  }

  centerZ(i) {
    return this.minZ + (Math.floor(i / this.cols) + 0.5) * this.cell;
  }

  nearestOpen(x, z) {
    const c0 = this.col(x);
    const r0 = this.row(z);
    if (!this.blocked[r0 * this.cols + c0]) return r0 * this.cols + c0;
    for (let rad = 1; rad < 12; rad++) {
      let best = -1;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          const i = r * this.cols + c;
          if (this.blocked[i]) continue;
          const d = dr * dr + dc * dc;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Sample along the segment; true if every sample lands on an open cell. */
  lineWalkable(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  push(i, f) {
    const hi = this.heapI;
    const hf = this.heapF;
    let k = hi.length;
    hi.push(i);
    hf.push(f);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hi[k] = hi[p];
      hf[k] = hf[p];
      k = p;
    }
    hi[k] = i;
    hf[k] = f;
  }

  pop() {
    const hi = this.heapI;
    const hf = this.heapF;
    const top = hi[0];
    const li = hi.pop();
    const lf = hf.pop();
    const n = hi.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hi[k] = hi[c];
        hf[k] = hf[c];
        k = c;
      }
      hi[k] = li;
      hf[k] = lf;
    }
    return top;
  }

  /** Returns an array of {x,z} waypoints (excluding the start) or null. */
  findPath(x0, z0, x1, z1) {
    const start = this.nearestOpen(x0, z0);
    const goal = this.nearestOpen(x1, z1);
    if (start < 0 || goal < 0) return null;
    const endOpen = this.isWalkable(x1, z1);
    if (!endOpen) {
      x1 = this.centerX(goal);
      z1 = this.centerZ(goal);
    }
    if (start === goal || this.lineWalkable(x0, z0, x1, z1)) return [{ x: x1, z: z1 }];

    const { cols, rows, g, parent, seen, closed, blocked } = this;
    const gen = ++this.gen;
    this.heapI.length = 0;
    this.heapF.length = 0;
    const gc = goal % cols;
    const gr = (goal / cols) | 0;
    const h = (i) => {
      const dc = Math.abs((i % cols) - gc);
      const dr = Math.abs(((i / cols) | 0) - gr);
      return dc + dr + (Math.SQRT2 - 2) * Math.min(dc, dr);
    };

    g[start] = 0;
    seen[start] = gen;
    parent[start] = -1;
    this.push(start, h(start));
    let found = false;

    while (this.heapI.length) {
      const cur = this.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      const c = cur % cols;
      const r = (cur / cols) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const n = nr * cols + nc;
          if (blocked[n] || closed[n] === gen) continue;
          if (dr && dc && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
          const ng = g[cur] + (dr && dc ? Math.SQRT2 : 1);
          if (seen[n] !== gen || ng < g[n]) {
            seen[n] = gen;
            g[n] = ng;
            parent[n] = cur;
            this.push(n, ng + h(n));
          }
        }
      }
    }
    if (!found) return null;

    const cells = [];
    for (let i = goal; i !== -1; i = parent[i]) cells.push(i);
    cells.reverse();

    // String pulling: skip waypoints that are directly reachable.
    const pts = cells.map((i) => ({ x: this.centerX(i), z: this.centerZ(i) }));
    pts[pts.length - 1] = { x: x1, z: z1 };
    const out = [];
    let ax = x0;
    let az = z0;
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = pts.length - 1; j > k; j--) {
        if (this.lineWalkable(ax, az, pts[j].x, pts[j].z)) {
          far = j;
          break;
        }
      }
      out.push(pts[far]);
      ax = pts[far].x;
      az = pts[far].z;
      k = far + 1;
    }
    return out;
  }
}
