import * as THREE from 'three';
import { Rng } from '../util/math';

/**
 * 以程式即時繪製的像素材質（暫用素材）。
 * 每張材質都很小（16～64 像素），以「最近鄰」取樣保留像素顆粒；
 * 約每公尺 16 個材質像素，與像素風低解析度畫面的密度接近。
 */

export const TEXELS_PER_METER = 16;

type Painter = (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => void;

const cache = new Map<string, THREE.CanvasTexture>();

function hex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function parse(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(color: string, amount: number): string {
  const [r, g, b] = parse(color);
  return hex(r + amount, g + amount, b + amount);
}

function noiseFill(ctx: CanvasRenderingContext2D, size: number, base: string, amp: number, rng: Rng): void {
  const [r, g, b] = parse(base);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (rng.next() - 0.5) * 2 * amp;
      ctx.fillStyle = hex(r + n, g + n, b + n * 1.1);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function make(key: string, size: number, seed: number, paint: Painter, sizeY = size): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = sizeY;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx, size, new Rng(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

export const Textures = {
  asphalt: () =>
    make('asphalt', 64, 11, (ctx, s, rng) => {
      noiseFill(ctx, s, '#2c2e33', 5, rng);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = rng.next() < 0.5 ? '#3a3c41' : '#232428';
        ctx.fillRect(rng.int(0, s - 1), rng.int(0, s - 1), 1, 1);
      }
      // 裂縫
      for (let k = 0; k < 2; k++) {
        let x = rng.int(0, s - 1);
        let y = rng.int(0, s - 1);
        ctx.fillStyle = '#1d1e21';
        for (let i = 0; i < 18; i++) {
          ctx.fillRect(((x % s) + s) % s, ((y % s) + s) % s, 1, 1);
          x += rng.int(-1, 1);
          y += rng.int(0, 1);
        }
      }
    }),

  sidewalk: () =>
    make('sidewalk', 32, 12, (ctx, s, rng) => {
      noiseFill(ctx, s, '#5b5c5a', 4, rng);
      ctx.fillStyle = '#434442';
      for (let i = 0; i < s; i += 16) {
        ctx.fillRect(i, 0, 1, s);
        ctx.fillRect(0, i, s, 1);
      }
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = '#4e4f4c';
        ctx.fillRect(rng.int(1, s - 3), rng.int(1, s - 3), 2, 1);
      }
    }),

  concrete: () =>
    make('concrete', 32, 13, (ctx, s, rng) => {
      noiseFill(ctx, s, '#4d5052', 4, rng);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(30,28,24,0.35)';
        const w = rng.int(3, 8);
        ctx.fillRect(rng.int(0, s - w), rng.int(0, s - 3), w, rng.int(2, 4));
      }
      ctx.fillStyle = '#404244';
      ctx.fillRect(0, 0, s, 1);
      ctx.fillRect(0, 0, 1, s);
    }),

  wood: () =>
    make('wood', 32, 14, (ctx, s, rng) => {
      const tones = ['#4f4136', '#534438', '#4c3e33', '#514237'];
      for (let row = 0; row < s / 4; row++) {
        const base = tones[row % tones.length];
        const [r, g, b] = parse(base);
        // 木紋：沿木板長度方向緩慢變化的隨機起伏（不用週期函數，避免出現整齊的直條紋）
        let grain = 0;
        const grainRow: number[] = [];
        for (let x = 0; x < s; x++) {
          grain = grain * 0.85 + (rng.next() - 0.5) * 3;
          grainRow.push(grain);
        }
        for (let y = row * 4; y < row * 4 + 3; y++) {
          for (let x = 0; x < s; x++) {
            const n = (rng.next() - 0.5) * 5 + grainRow[x];
            ctx.fillStyle = hex(r + n, g + n, b + n);
            ctx.fillRect(x, y, 1, 1);
          }
        }
        ctx.fillStyle = '#41352c';
        ctx.fillRect(0, row * 4 + 3, s, 1);
        // 長木板：接縫很少，避免看起來像磚牆
        if (row % 3 === 0) {
          ctx.fillStyle = '#3a2f27';
          ctx.fillRect((row * 13) % s, row * 4, 1, 3);
        }
      }
    }),

  dirt: () =>
    make('dirt', 32, 15, (ctx, s, rng) => {
      noiseFill(ctx, s, '#2f2a22', 6, rng);
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = rng.pick(['#3b3727', '#3f3a26', '#25211a', '#46402e']);
        ctx.fillRect(rng.int(0, s - 1), rng.int(0, s - 1), 1, rng.int(1, 2));
      }
    }),

  brick: () =>
    make('brick', 32, 16, (ctx, s, rng) => {
      ctx.fillStyle = '#2e2622';
      ctx.fillRect(0, 0, s, s);
      for (let row = 0; row < s / 4; row++) {
        const off = row % 2 === 0 ? 0 : 4;
        for (let col = -1; col < s / 8 + 1; col++) {
          const [r, g, b] = parse(rng.pick(['#5c3a2e', '#653f31', '#54352b', '#6a4636']));
          for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 7; x++) {
              const n = (rng.next() - 0.5) * 10;
              ctx.fillStyle = hex(r + n, g + n, b + n);
              ctx.fillRect(col * 8 + off + x, row * 4 + y, 1, 1);
            }
          }
        }
      }
      // 底部髒污（材質下緣對應牆腳）
      for (let y = s - 6; y < s; y++) {
        ctx.fillStyle = `rgba(20,16,12,${((y - (s - 6)) / 6) * 0.45})`;
        ctx.fillRect(0, y, s, 1);
      }
    }),

  plaster: () =>
    make('plaster', 32, 17, (ctx, s, rng) => {
      noiseFill(ctx, s, '#7b766b', 4, rng);
      for (let y = s - 10; y < s; y++) {
        ctx.fillStyle = `rgba(35,30,24,${((y - (s - 10)) / 10) * 0.5})`;
        ctx.fillRect(0, y, s, 1);
      }
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(40,36,30,0.5)';
        const x = rng.int(0, s - 1);
        const y = rng.int(0, s - 12);
        ctx.fillRect(x, y, 1, rng.int(2, 6));
      }
      ctx.fillStyle = '#5c584f';
      ctx.fillRect(0, s - 3, s, 1);
    }),

  wallTop: () =>
    make('wallTop', 16, 18, (ctx, s, rng) => {
      noiseFill(ctx, s, '#24262a', 3, rng);
    }),

  roof: () =>
    make('roof', 32, 19, (ctx, s, rng) => {
      noiseFill(ctx, s, '#33343a', 7, rng);
      ctx.fillStyle = '#26272c';
      for (let i = 0; i < s; i += 8) ctx.fillRect(0, i, s, 1);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = rng.pick(['#3d3f45', '#2a2b30']);
        ctx.fillRect(rng.int(0, s - 2), rng.int(0, s - 2), 2, 2);
      }
    }),

  facade: () =>
    make('facade', 64, 20, (ctx, s, rng) => {
      // 64px = 4m：上下兩排窗，偶有亮著的窗（自發光貼圖另外產生）
      noiseFill(ctx, s, '#4a4440', 4, rng);
      ctx.fillStyle = '#3c3733';
      for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          const x = col * 16 + 4;
          const y = row * 32 + 8;
          ctx.fillStyle = '#26221f';
          ctx.fillRect(x - 1, y - 1, 10, 14);
          ctx.fillStyle = '#151a22';
          ctx.fillRect(x, y, 8, 12);
          ctx.fillStyle = '#2a3442';
          ctx.fillRect(x, y, 8, 2);
          ctx.fillStyle = '#26221f';
          ctx.fillRect(x + 4, y, 1, 12);
        }
      }
      for (let y = s - 6; y < s; y++) {
        ctx.fillStyle = `rgba(15,12,10,${((y - (s - 6)) / 6) * 0.5})`;
        ctx.fillRect(0, y, s, 1);
      }
    }),

  facadeGlow: () =>
    make('facadeGlow', 64, 21, (ctx, s) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, s, s);
      // 只有少數窗戶亮燈，形成「還有人在」的氣氛
      const lit = [
        [1, 0],
        [3, 1],
      ];
      for (const [col, row] of lit) {
        const x = col * 16 + 4;
        const y = row * 32 + 8;
        ctx.fillStyle = '#8a5a22';
        ctx.fillRect(x, y + 2, 8, 10);
        ctx.fillStyle = '#c58a3a';
        ctx.fillRect(x + 1, y + 6, 3, 5);
      }
    }),

  metal: () =>
    make('metal', 32, 22, (ctx, s, rng) => {
      for (let x = 0; x < s; x++) {
        const rib = x % 4;
        const base = rib === 0 ? '#3e5257' : rib === 1 ? '#4f666b' : rib === 2 ? '#475c61' : '#344548';
        const [r, g, b] = parse(base);
        for (let y = 0; y < s; y++) {
          const n = (rng.next() - 0.5) * 6;
          ctx.fillStyle = hex(r + n, g + n, b + n);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = rng.pick(['#6b4a2f', '#5a3b25', '#7a5634']);
        const x = rng.int(0, s - 3);
        const y = rng.int(0, s - 3);
        ctx.fillRect(x, y, rng.int(1, 3), rng.int(1, 4));
      }
    }),

  metalRed: () =>
    make('metalRed', 32, 23, (ctx, s, rng) => {
      for (let x = 0; x < s; x++) {
        const rib = x % 4;
        const base = rib === 0 ? '#5a2e26' : rib === 1 ? '#6e3a2f' : rib === 2 ? '#64352b' : '#4c2721';
        const [r, g, b] = parse(base);
        for (let y = 0; y < s; y++) {
          const n = (rng.next() - 0.5) * 6;
          ctx.fillStyle = hex(r + n, g + n, b + n);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = rng.pick(['#3b2a20', '#2f2219']);
        ctx.fillRect(rng.int(0, s - 3), rng.int(0, s - 3), rng.int(1, 3), rng.int(1, 3));
      }
    }),

  crate: () =>
    make('crate', 16, 24, (ctx, s, rng) => {
      noiseFill(ctx, s, '#6b4f30', 7, rng);
      ctx.fillStyle = '#3e2c19';
      ctx.fillRect(0, 0, s, 2);
      ctx.fillRect(0, s - 2, s, 2);
      ctx.fillRect(0, 0, 2, s);
      ctx.fillRect(s - 2, 0, 2, s);
      for (let i = 2; i < s - 2; i++) {
        ctx.fillRect(i, i, 1, 1);
        ctx.fillRect(s - 1 - i, i, 1, 1);
      }
      ctx.fillStyle = '#8a6a42';
      ctx.fillRect(1, 1, s - 2, 1);
    }),

  ammoCrate: () =>
    make('ammoCrate', 16, 25, (ctx, s, rng) => {
      noiseFill(ctx, s, '#3f4a2c', 5, rng);
      ctx.fillStyle = '#2a3120';
      ctx.fillRect(0, 0, s, 1);
      ctx.fillRect(0, s - 1, s, 1);
      ctx.fillStyle = '#d6b44a';
      ctx.fillRect(3, 6, 10, 4);
      ctx.fillStyle = '#3f4a2c';
      ctx.fillRect(5, 7, 1, 2);
      ctx.fillRect(8, 7, 1, 2);
      ctx.fillRect(11, 7, 1, 2);
    }),

  medkit: () =>
    make('medkit', 16, 26, (ctx, s, rng) => {
      noiseFill(ctx, s, '#c9c4b8', 4, rng);
      ctx.fillStyle = '#b3342b';
      ctx.fillRect(6, 3, 4, 10);
      ctx.fillRect(3, 6, 10, 4);
    }),

  barrel: () =>
    make('barrel', 16, 27, (ctx, s, rng) => {
      noiseFill(ctx, s, '#4a3a2c', 8, rng);
      ctx.fillStyle = '#2c231b';
      ctx.fillRect(0, 3, s, 1);
      ctx.fillRect(0, s - 4, s, 1);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = rng.pick(['#6d4a2a', '#7a4f26', '#3a2c20']);
        ctx.fillRect(rng.int(0, s - 2), rng.int(0, s - 2), 2, 1);
      }
    }),

  hazard: () =>
    make('hazard', 16, 28, (ctx, s, rng) => {
      noiseFill(ctx, s, '#6a6a64', 4, rng);
      for (let x = 0; x < s; x++) {
        if (Math.floor(x / 4) % 2 === 0) {
          ctx.fillStyle = '#a8862e';
          ctx.fillRect(x, s - 5, 1, 3);
        }
      }
    }),

  shelf: () =>
    make('shelf', 16, 29, (ctx, s, rng) => {
      noiseFill(ctx, s, '#3b2a1d', 5, rng);
      ctx.fillStyle = '#22180f';
      for (let y = 0; y < s; y += 5) ctx.fillRect(0, y, s, 1);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = rng.pick(['#6c5a3a', '#4f5a62', '#7a3f30', '#8c8063']);
        ctx.fillRect(rng.int(1, s - 4), rng.int(0, 2) * 5 + 1 + rng.int(0, 1), rng.int(2, 3), 3);
      }
    }),

  fabric: () =>
    make('fabric', 16, 30, (ctx, s, rng) => {
      noiseFill(ctx, s, '#4a3d52', 6, rng);
    }),
};

/** 角色色調用的 3 階明暗，形成卡通式的分段光影。 */
let toonRamp: THREE.DataTexture | null = null;
export function getToonRamp(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([96, 165, 255]);
  toonRamp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

export { shade };
