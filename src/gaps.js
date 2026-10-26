// The gap guarantee (彈幕 ② A②, DECISIONS 2026-10-26; config.js HELL): in a
// room, whatever is in the air, there is somewhere near the player to be that
// no round is on its way to. A line of fire is a live enemy round's way across
// the floor; a safe spot is a circle `gap` m across, on open ground within
// `reach` m of the player, that no line of fire within `gapRange` m of him
// crosses. A man whose shot would take the last such spot away waits a beat
// (enemies.js gapAllows) before he looks again. Logic only: nothing is drawn.
// test/gap.test.mjs samples a wave every logic step and finds a spot at each.

/**
 * The lines of fire about (px, pz): every live enemy round that has not gone by and whose way passes within `range` m
 * of it, each as [x, z, dx, dz] (where it is, which way it goes). Grenades are not rounds (grenades.js).
 */
export function fireLines(bullets, px, pz, range) {
  const out = [];
  for (const b of bullets) {
    if (b.owner !== 'enemy') continue;
    const rx = px - b.x;
    const rz = pz - b.z;
    const along = rx * b.dx + rz * b.dz; // how far ahead of the round the player is along its way
    if (along < -range) continue; // gone by
    const off = Math.abs(rx * b.dz - rz * b.dx); // how far off its way he is
    if (off > range) continue;
    out.push([b.x, b.z, b.dx, b.dz]);
  }
  return out;
}

/** How far the point (x, z) is from the way of the line [lx, lz, dx, dz] ahead of it (behind it, from its start). */
function offLine(x, z, [lx, lz, dx, dz]) {
  const rx = x - lx;
  const rz = z - lz;
  const along = rx * dx + rz * dz;
  if (along <= 0) return Math.hypot(rx, rz);
  return Math.abs(rx * dz - rz * dx);
}

/**
 * A safe spot by the player: a point within `reach` m of (px, pz) where `walkable(x, z)`, no line of `lines` coming
 * nearer than `gap` / 2 to it; the nearest to him, as { x, z }, or null when there is none. The ground is sampled on a
 * grid of `step` m.
 */
export function safeSpot(lines, px, pz, { reach, gap, walkable, step = 0.4 }) {
  const half = gap / 2;
  let best = null;
  let bd = Infinity;
  const n = Math.ceil(reach / step);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = px + i * step;
      const z = pz + j * step;
      const d = Math.hypot(i * step, j * step);
      if (d > reach || d >= bd || !walkable(x, z)) continue;
      let clear = true;
      for (const l of lines) {
        if (offLine(x, z, l) < half) {
          clear = false;
          break;
        }
      }
      if (clear) {
        bd = d;
        best = { x, z };
      }
    }
  }
  return best;
}
