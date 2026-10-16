// v10 ambience (viewer only, while strolling): a soundscape made in the browser, no recordings. A low city hum,
// traffic that swells near the avenues and sits on the side they are on, the fountain's water by distance, birds
// that sing most in the morning, and footsteps on the stone. Everything is noise and oscillators shaped by
// filters, so nothing is downloaded and nothing needs a licence. Sound starts only from the 聲音 button (browsers
// allow audio after a click).

// traffic weight per OSM highway class (roads open to cars)
const TRAFFIC = { primary: 1, secondary: 1, tertiary: 0.6, residential: 0.2, service: 0.1 };

export const AMBIENCE = {
  master: 0.8,
  bed: 0.1,                         // city hum, everywhere
  traffic: 0.55, trafficReach: 10,  // gain at the kerb of a main road; falls off as 1 / (1 + (d / reach)²)
  fountain: 0.32, fountainReach: 6,
  birds: 0.1,                       // chirp level at full song
  step: 0.22,
  night: { bed: 0.6, traffic: 0.45 },   // shares of the day level after dark
};

// birdsong through the day: dawn chorus, quiet at midday, a little again before dusk
const songAt = (h) => (h < 9 ? 1 : h < 11 ? 1 - 0.7 * (h - 9) / 2 : h < 15.5 ? 0.3 : 0.3 + 0.35 * Math.min(1, (h - 15.5) / 1.5));

export function createAmbience(data) {
  // road segments with a weight, in a 25 m grid, for the traffic level around the listener; a street mapped as
  // several OSM ways counts once, by its name
  const cell = 25, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const r of data.roads) {
    const w = r.car && TRAFFIC[r.hw];
    if (!w) continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1], s = { a, b, w, half: r.w / 2, road: r.name || r.id };
      for (let i = Math.floor(Math.min(a[0], b[0]) / cell); i <= Math.floor(Math.max(a[0], b[0]) / cell); i++) {
        for (let j = Math.floor(Math.min(a[1], b[1]) / cell); j <= Math.floor(Math.max(a[1], b[1]) / cell); j++) {
          if (!grid.has(key(i, j))) grid.set(key(i, j), []);
          grid.get(key(i, j)).push(s);
        }
      }
    }
  }
  // traffic level at p (0..1) and the direction it comes from (unit vector, data axes): each street by its
  // nearest point, the streets combined so two quiet ones do not add up to an avenue
  function trafficAt(p) {
    const R = AMBIENCE.trafficReach, near = new Map();
    const ci = Math.floor(p[0] / cell), cj = Math.floor(p[1] / cell);
    for (let i = ci - 3; i <= ci + 3; i++) {
      for (let j = cj - 3; j <= cj + 3; j++) {
        for (const s of grid.get(key(i, j)) || []) {
          const ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1], L2 = ex * ex + ey * ey || 1e-9;
          const t = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * ex + (p[1] - s.a[1]) * ey) / L2));
          const cx = s.a[0] + ex * t - p[0], cy = s.a[1] + ey * t - p[1];
          const g = s.w / (1 + (Math.max(0, Math.hypot(cx, cy) - s.half) / R) ** 2);
          const best = near.get(s.road);
          if (!best || g > best.g) near.set(s.road, { g, cx, cy });
        }
      }
    }
    let quiet = 1, dx = 0, dy = 0, sum = 0;
    for (const { g, cx, cy } of near.values()) {
      quiet *= 1 - Math.min(0.95, g);
      const n = Math.hypot(cx, cy) || 1;
      dx += (cx / n) * g; dy += (cy / n) * g; sum += g;
    }
    const n = Math.hypot(dx, dy);
    return { level: 1 - quiet, dir: n > 1e-6 ? [dx / n, dy / n] : [0, 0], spread: sum > 0 ? n / sum : 0 };
  }

  let ac = null, out = null, on = false, birdNext = 0, nextTick = 0;
  const N = {};
  const noise = (seconds, brown) => {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0, seed = 0x2545f491;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1; };
    for (let i = 0; i < len; i++) {
      const w = rnd();
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    // fade the loop seam over 20 ms
    const f = Math.floor(ac.sampleRate * 0.02);
    for (let i = 0; i < f; i++) { const k = i / f; d[len - f + i] = d[len - f + i] * (1 - k) + d[i] * k; }
    return buf;
  };
  const loop = (buf, offset = 0) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, offset); return s; };
  const filter = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v = 0) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const pan = () => (ac.createStereoPanner ? ac.createStereoPanner() : gain(1));
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    out = gain(0);
    chain(out, comp, ac.destination);
    const brown = noise(6, true), white = noise(3, false);
    N.bed = gain(); chain(loop(brown), filter('lowpass', 380), N.bed, out);
    N.trafficPan = pan(); N.traffic = gain();
    chain(loop(brown, 2.7), filter('lowpass', 820), N.traffic);
    chain(loop(white, 1.1), filter('bandpass', 1100, 0.6), gain(0.08), N.traffic);
    chain(N.traffic, N.trafficPan, out);
    N.fountainPan = pan(); N.fountain = gain();
    chain(loop(white, 0.4), filter('highpass', 450), filter('lowpass', 5200), N.fountain, N.fountainPan, out);
    N.birds = gain(1); chain(N.birds, out);
    N.steps = gain(1); chain(N.steps, out);
    N.white = white;
  }

  // one bird phrase: sparrow chirps (short falling sweeps near 4 kHz) or a bulbul's whistled notes near 2 kHz
  function bird(t, level, panAt) {
    const p = pan();
    if (p.pan) p.pan.value = panAt;
    const g0 = gain(level);
    chain(g0, p, N.birds);
    const sparrow = Math.random() < 0.6;
    const n = sparrow ? 2 + Math.floor(Math.random() * 5) : 3 + Math.floor(Math.random() * 2);
    const base = sparrow ? 3600 + Math.random() * 900 : 1700 + Math.random() * 500;
    for (let k = 0; k < n; k++) {
      const o = ac.createOscillator(), e = gain(0);
      const dur = sparrow ? 0.05 + Math.random() * 0.04 : 0.12 + Math.random() * 0.08;
      const f0 = sparrow ? base * (1.1 + Math.random() * 0.15) : base * [1, 1.26, 1.12, 1.5][k % 4];
      const f1 = sparrow ? base * 0.8 : f0 * (0.97 + Math.random() * 0.08);
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(1, t + 0.008);
      e.gain.exponentialRampToValueAtTime(0.001, t + dur);
      chain(o, e, g0);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + (sparrow ? 0.03 + Math.random() * 0.08 : 0.06 + Math.random() * 0.1);
    }
    setTimeout(() => { g0.disconnect(); p.disconnect(); }, (t - ac.currentTime + 0.5) * 1000);
  }

  const ramp = (param, v, tc = 0.25) => param.setTargetAtTime(v, ac.currentTime, tc);
  const panTo = (node, dir, yaw) => {
    // the source's side relative to where the walker faces: right is (sin yaw, -cos yaw) in data axes
    if (node.pan) ramp(node.pan, Math.max(-0.85, Math.min(0.85, dir[0] * Math.sin(yaw) - dir[1] * Math.cos(yaw))), 0.15);
  };

  return {
    get on() { return on; },
    get context() { return ac; },
    trafficAt,
    // turn the sound on or off (on needs a click: call from the button's handler)
    setOn(v) {
      on = v;
      if (on && !ac) build();
      if (!ac) return;
      if (on && ac.state === 'suspended') ac.resume().catch(() => {});
      ramp(out.gain, on ? AMBIENCE.master : 0, 0.3);
    },
    // every frame while strolling: listener at p (data metres) facing yaw; hour of day; night
    update(dt, { p, yaw, hour, night, active }) {
      if (!ac || !on) return;
      const now = ac.currentTime;
      if (!active) { ramp(out.gain, 0, 0.3); return; }
      ramp(out.gain, AMBIENCE.master, 0.6);
      if (now < nextTick) return;
      nextTick = now + 0.1;
      const A = AMBIENCE, k = night ? A.night : { bed: 1, traffic: 1 };
      ramp(N.bed.gain, A.bed * k.bed);
      const tr = trafficAt(p);
      // a little swell and ebb, as cars come and go
      const flow = 0.8 + 0.2 * Math.sin(now * 0.37) * Math.sin(now * 0.23 + 1.3);
      ramp(N.traffic.gain, A.traffic * k.traffic * tr.level * flow, 0.4);
      panTo(N.trafficPan, tr.dir.map((v) => v * tr.spread), yaw);
      const f = data.fountain;
      if (f) {
        const fx = f.x - p[0], fy = f.y - p[1], d = Math.hypot(fx, fy);
        ramp(N.fountain.gain, A.fountain / (1 + (d / A.fountainReach) ** 2) * (0.92 + 0.08 * Math.random()), 0.1);
        panTo(N.fountainPan, d > 0.5 ? [fx / d, fy / d] : [0, 0], yaw);
      }
      const song = night ? 0 : songAt(hour);
      if (song > 0.05 && now >= birdNext) {
        bird(now + 0.05, A.birds * (0.4 + 0.6 * Math.random()) * Math.min(1, song + 0.2), Math.random() * 1.6 - 0.8);
        birdNext = now + (1.5 + Math.random() * 6) / song;
      }
    },
    // a footstep on stone: a short bright scuff and a soft heel thump; pace 1 = walking
    step(pace = 1) {
      if (!ac || !on) return;
      const t = ac.currentTime + 0.01, v = AMBIENCE.step * Math.min(1.6, 0.6 + 0.4 * pace) * (0.85 + 0.3 * Math.random());
      const s = ac.createBufferSource(), e = gain(0), bp = filter('bandpass', 1500 + Math.random() * 900, 1.3);
      s.buffer = N.white;
      s.playbackRate.value = 0.9 + Math.random() * 0.2;
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(v, t + 0.004);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      chain(s, bp, e, N.steps);
      s.start(t, Math.random() * 2, 0.09);
      const o = ac.createOscillator(), h = gain(0);
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.06);
      h.gain.setValueAtTime(0, t);
      h.gain.linearRampToValueAtTime(v * 0.9, t + 0.005);
      h.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      chain(o, h, N.steps);
      o.start(t);
      o.stop(t + 0.1);
    },
  };
}
