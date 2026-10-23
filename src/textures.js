// Procedural canvas textures, so the game ships without image assets.

import * as THREE from 'three';
import { pick, rand } from './utils.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function floorTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#3a3a44';
  g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rand(-9, 9);
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // stains
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(10,10,20,${rand(0.05, 0.14)})`;
    g.beginPath();
    g.ellipse(rand(0, 512), rand(0, 512), rand(20, 70), rand(15, 50), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  // slab seams
  g.strokeStyle = 'rgba(15,15,22,0.85)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 128, 0);
    g.lineTo(i * 128, 512);
    g.moveTo(0, i * 128);
    g.lineTo(512, i * 128);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,120,140,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 128 + 2, 0);
    g.lineTo(i * 128 + 2, 512);
    g.moveTo(0, i * 128 + 2);
    g.lineTo(512, i * 128 + 2);
    g.stroke();
  }
  return finish(c, { repeat: [44 / 8, 30 / 8] });
}

export function helipadTexture() {
  const [c, g] = canvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(230,200,70,0.55)';
  g.lineWidth = 16;
  g.beginPath();
  g.arc(256, 256, 220, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(256, 256, 186, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(230,200,70,0.5)';
  g.fillRect(166, 140, 42, 232);
  g.fillRect(304, 140, 42, 232);
  g.fillRect(166, 236, 180, 40);
  // wear
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${rand(0.2, 0.7)})`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(2, 10), rand(2, 10));
  }
  return finish(c);
}

export function crateTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#6b4a2b';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i % 2 ? '#734f2e' : '#654528';
    g.fillRect(0, i * 25.6, 128, 25.6);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, i * 25.6, 128, 2);
  }
  g.strokeStyle = '#3d2914';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.beginPath();
  g.moveTo(8, 8);
  g.lineTo(120, 120);
  g.stroke();
  return finish(c);
}

export function windowTexture(lit = 0.35) {
  const [c, g] = canvas(128, 512);
  g.fillStyle = '#05050a';
  g.fillRect(0, 0, 128, 512);
  const palette = ['#ffd79a', '#ffc46b', '#9ae7ff', '#ff8ad8', '#c9b8ff'];
  for (let y = 4; y < 512; y += 12) {
    for (let x = 4; x < 128; x += 10) {
      if (rand(0, 1) < lit) {
        g.fillStyle = pick(palette);
        g.globalAlpha = rand(0.35, 1);
        g.fillRect(x, y, 6, 7);
      }
    }
  }
  g.globalAlpha = 1;
  return finish(c);
}

export function signTexture() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 256);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const glowText = (text, x, y, font, color, glow) => {
    g.font = font;
    g.shadowColor = glow;
    g.shadowBlur = 24;
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeText(text, x, y);
    g.shadowBlur = 8;
    g.fillStyle = '#fff';
    g.fillText(text, x, y);
  };
  glowText('子彈芭蕾', 512, 96, 'bold 112px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif', '#ff3fa4', '#ff3fa4');
  glowText('BULLET  BALLET', 512, 200, 'bold 64px "Bebas Neue", Impact, sans-serif', '#3fe6ff', '#3fe6ff');
  return finish(c);
}

/** Generic neon sign: lines = [{ text, font, color, y }]. */
export function neonSignTexture(lines, w = 1024, h = 256) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (const l of lines) {
    g.font = l.font;
    g.shadowColor = l.color;
    g.shadowBlur = 24;
    g.strokeStyle = l.color;
    g.lineWidth = 6;
    g.strokeText(l.text, w / 2, l.y);
    g.shadowBlur = 8;
    g.fillStyle = '#fff';
    g.fillText(l.text, w / 2, l.y);
  }
  return finish(c);
}

export function clubFloorTexture() {
  const [c, g] = canvas(512, 512);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#17121f' : '#1f1829';
      g.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, 512);
    g.moveTo(0, i * 64);
    g.lineTo(512, i * 64);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.01, 0.04)})`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(20, 90), rand(1, 3));
  }
  return finish(c, { repeat: [5, 3.5] });
}

/** A teahouse's floor (rooms.js): dark grey-green terrazzo in large tiles, flecked; dark, so bullets stand out on it. */
export function teahouseFloorTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#1b2321';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = rand(0, 1);
    g.fillStyle = v < 0.7 ? 'rgba(70,84,80,0.35)' : v < 0.95 ? 'rgba(12,16,15,0.5)' : 'rgba(150,130,100,0.35)';
    const s = rand(1, 3.5);
    g.fillRect(rand(0, 512), rand(0, 512), s, s);
  }
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 128, 0);
    g.lineTo(i * 128, 512);
    g.moveTo(0, i * 128);
    g.lineTo(512, i * 128);
    g.stroke();
  }
  return finish(c, { repeat: [4, 3] });
}

export function asphaltTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#2b2d31';
  g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rand(-15, 15);
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(12,12,14,0.7)';
  for (let i = 0; i < 10; i++) {
    g.lineWidth = rand(1, 2.5);
    g.beginPath();
    let x = rand(0, 512);
    let y = rand(0, 512);
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += rand(-40, 40);
      y += rand(-40, 40);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(5,5,8,${rand(0.08, 0.2)})`;
    g.beginPath();
    g.ellipse(rand(0, 512), rand(0, 512), rand(15, 60), rand(10, 40), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  return finish(c, { repeat: [6, 4] });
}

/** Grey corrugation; tint it with the material colour. */
export function corrugatedTexture(repeatX = 1) {
  const [c, g] = canvas(256, 128);
  for (let x = 0; x < 256; x += 8) {
    const grad = g.createLinearGradient(x, 0, x + 8, 0);
    grad.addColorStop(0, '#9a9a9a');
    grad.addColorStop(0.5, '#e6e6e6');
    grad.addColorStop(1, '#8a8a8a');
    g.fillStyle = grad;
    g.fillRect(x, 0, 8, 128);
  }
  g.fillStyle = 'rgba(60,40,30,0.25)';
  for (let i = 0; i < 30; i++) g.fillRect(rand(0, 256), rand(0, 128), rand(2, 18), rand(4, 30));
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 256, 5);
  g.fillRect(0, 123, 256, 5);
  return finish(c, { repeat: [repeatX, 1] });
}

export function fenceTexture() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(190,200,215,0.9)';
  g.lineWidth = 2;
  for (let i = -128; i < 256; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.moveTo(i + 128, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  return finish(c, { repeat: [8, 1] });
}

/** Grey brick courses with pale mortar (福隆新街's walls); one tile is about 1.2 m square. */
export function brickTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7a756e';
  g.fillRect(0, 0, 256, 256);
  const rows = 16;
  const rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 16 : 0;
    for (let x = -off; x < 256; x += 32) {
      const v = rand(-12, 12);
      g.fillStyle = `rgb(${82 + v},${78 + v},${76 + v})`;
      g.fillRect(x + 1.5, r * rh + 1.5, 29, rh - 3);
    }
  }
  return finish(c, { repeat: [1, 1] });
}

/**
 * One bay of an old two-storey shop front on 福隆新街 (4.6 m wide, 6.6 m tall): grey brick, a ground floor of red
 * wooden folding doors (or left dark, `open`, where a real opening stands), an upper floor of two red-framed
 * windows with lattice panes, a ledge between and a cornice on top.
 */
export function shopfrontTexture(open = false) {
  const [c, g] = canvas(256, 368);
  const H = 368;
  const m = H / 6.6; // pixels a metre, up the bay
  const y = (metres) => H - metres * m;
  g.fillStyle = '#6e6a64';
  g.fillRect(0, 0, 256, H);
  // brick courses
  for (let r = 0; r * 8 < H; r++) {
    g.fillStyle = 'rgba(40,36,34,0.22)';
    g.fillRect(0, r * 8, 256, 1);
    for (let x = r % 2 ? 0 : 12; x < 256; x += 24) g.fillRect(x, r * 8, 1, 8);
  }
  // ground floor: folding doors of red wood, or the dark of an opening
  const gx = 18;
  const gw = 220;
  if (open) {
    g.fillStyle = '#120a0a';
    g.fillRect(gx, y(2.6), gw, 2.6 * m);
  } else {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#8e2620' : '#9c2c24';
      g.fillRect(gx + (i * gw) / 8, y(2.6), gw / 8 - 1, 2.6 * m);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(gx + (i * gw) / 8 + 5, y(2.2), gw / 8 - 11, 0.7 * m);
      g.fillRect(gx + (i * gw) / 8 + 5, y(1.2), gw / 8 - 11, 0.7 * m);
    }
  }
  g.fillStyle = '#5a1712';
  g.fillRect(gx - 6, y(2.75), gw + 12, 0.15 * m);
  // the ledge and the cornice
  g.fillStyle = '#c9c2b6';
  g.fillRect(0, y(3.05), 256, 0.18 * m);
  g.fillRect(0, 0, 256, 0.3 * m);
  // two windows upstairs: red frames, lattice panes, a warm lamp behind one
  for (const wx of [34, 142]) {
    g.fillStyle = '#7e1e18';
    g.fillRect(wx, y(5.9), 80, 2.2 * m);
    g.fillStyle = rand(0, 1) < 0.5 ? '#ffb46a' : '#2a1414';
    g.fillRect(wx + 7, y(5.75), 66, 1.9 * m);
    g.strokeStyle = '#7e1e18';
    g.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo(wx + 7 + (k * 66) / 4, y(5.75));
      g.lineTo(wx + 7 + (k * 66) / 4, y(3.85));
      g.stroke();
    }
    g.beginPath();
    g.moveTo(wx + 7, y(4.8));
    g.lineTo(wx + 73, y(4.8));
    g.stroke();
  }
  return finish(c, { repeat: [1, 1] });
}

/** Floor tiles for a shop inside: small cream and terracotta squares. */
export function tileTexture() {
  const [c, g] = canvas(128, 128);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      g.fillStyle = (i + j) % 2 ? '#6e6252' : '#5a3a30';
      g.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  return finish(c, { repeat: [1, 1] });
}
