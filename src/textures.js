// Procedural canvas textures, so the game ships without image assets.

import * as THREE from 'three';
import { rand } from './utils.js';

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
    const n = (Math.random() - 0.5) * 18;
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
      if (Math.random() < lit) {
        g.fillStyle = palette[(Math.random() * palette.length) | 0];
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
