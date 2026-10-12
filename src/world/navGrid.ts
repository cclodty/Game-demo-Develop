import { type Box, lineClear } from './collision';

/**
 * 給敵人尋路用的格子圖。格子中心若落在「方塊外擴敵人半徑」的範圍內就視為不可走。
 * 規模很小（約 100×75 格），每次 A* 搜尋只需不到一毫秒。
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private search = 0;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    readonly maxX: number,
    readonly maxZ: number,
    readonly cell: number,
    private readonly boxes: readonly Box[],
    readonly agentRadius: number,
  ) {
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    const pad = agentRadius + 0.04;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = minX + (c + 0.5) * cell;
        const z = minZ + (r + 0.5) * cell;
        for (const b of boxes) {
          if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) {
            this.blocked[r * this.cols + c] = 1;
            break;
          }
        }
      }
    }
  }

  isBlockedAt(x: number, z: number): boolean {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  private cellIndex(x: number, z: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
    return r * this.cols + c;
  }

  /** 找最近的可走格（起點或終點剛好貼牆時使用）。 */
  private nearestOpen(idx: number): number {
    if (!this.blocked[idx]) return idx;
    const c0 = idx % this.cols;
    const r0 = Math.floor(idx / this.cols);
    for (let rad = 1; rad < 8; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          const i = r * this.cols + c;
          if (!this.blocked[i]) return i;
        }
      }
    }
    return idx;
  }

  private center(idx: number): { x: number; z: number } {
    const c = idx % this.cols;
    const r = Math.floor(idx / this.cols);
    return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell };
  }

  /** A* 搜尋並把路徑拉直；回傳的路點不含起點。找不到時回傳 null。 */
  findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    const start = this.nearestOpen(this.cellIndex(sx, sz));
    const goal = this.nearestOpen(this.cellIndex(tx, tz));
    if (this.blocked[start] || this.blocked[goal]) return null;
    const id = ++this.search;
    const cols = this.cols;
    const gc = goal % cols;
    const gr = Math.floor(goal / cols);
    const heap = new MinHeap();
    this.g[start] = 0;
    this.stamp[start] = id;
    this.parent[start] = -1;
    heap.push(start, 0);
    const SQ2 = Math.SQRT2;
    let found = false;
    let expanded = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > 6000) break;
      const cc = cur % cols;
      const cr = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
          const ni = nr * cols + nc;
          if (this.blocked[ni] || this.closed[ni] === id) continue;
          // 斜走時不切牆角。
          if (dr !== 0 && dc !== 0) {
            if (this.blocked[cr * cols + nc] || this.blocked[nr * cols + cc]) continue;
          }
          const ng = this.g[cur] + (dr !== 0 && dc !== 0 ? SQ2 : 1);
          if (this.stamp[ni] !== id || ng < this.g[ni]) {
            this.stamp[ni] = id;
            this.g[ni] = ng;
            this.parent[ni] = cur;
            const hx = Math.abs(nc - gc);
            const hz = Math.abs(nr - gr);
            const h = Math.max(hx, hz) + (SQ2 - 1) * Math.min(hx, hz);
            heap.push(ni, ng + h);
          }
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let i = goal; i !== -1 && i !== start; i = this.parent[i]) cells.push(i);
    cells.reverse();
    const raw = cells.map((i) => this.center(i));
    raw[raw.length - 1] = { x: tx, z: tz };
    return this.smooth(sx, sz, raw);
  }

  /** 拉直路徑：能直接走到的路點就略過中間點。 */
  private smooth(sx: number, sz: number, pts: { x: number; z: number }[]): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    let ax = sx;
    let az = sz;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !lineClear(ax, az, pts[j].x, pts[j].z, this.boxes, 0, this.agentRadius * 0.9)) j--;
      out.push(pts[j]);
      ax = pts[j].x;
      az = pts[j].z;
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    const items = this.items;
    const keys = this.keys;
    items.push(item);
    keys.push(key);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= keys[i]) break;
      [items[p], items[i]] = [items[i], items[p]];
      [keys[p], keys[i]] = [keys[i], keys[p]];
      i = p;
    }
  }
  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length > 0) {
      items[0] = lastItem;
      keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && keys[l] < keys[m]) m = l;
        if (r < items.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        [keys[m], keys[i]] = [keys[i], keys[m]];
        i = m;
      }
    }
    return top;
  }
}
