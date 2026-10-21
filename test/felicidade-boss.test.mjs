// Rua da Felicidade's boss (福隆新街頭目): the armoured truck (boss.js, the
// spare kind) drives in at the west end of the street and up and down it on
// the loop in the map's data, never through a shop. In the narrow street
// there is no getting out of its way along the road: its charge stops at the
// shop fronts, so a player inside a shop, behind its door, is safe where one
// on the street in front of it is run down. The stage's boss wave (4, or 12
// on a run from the docks) is the truck, and the route on the title says so.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=17'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    const fel = g.maps.findIndex((m) => m.id === 'felicidade');
    /** An arcade run from Rua da Felicidade at the start of wave 4, its boss wave. */
    window.toBoss = () => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(fel);
      g.waves.state = 'done';
      g.enemies.clear();
      g.waves.wave = 3;
      g.waves.startWave();
    };
    /** One logic step; the player kept whole unless `hurt`, nobody else about. */
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.enemies.clear();
      g.waves.pending.length = 0;
    };
    window.arrive = () => {
      let n = 0;
      while (g.boss.state === 'enter' && n++ < 2000) window.step();
    };
    /** Does the truck's box (as it stands) overlap a solid? Tested at its middle and both ends. */
    window.truckInWall = () => {
      const b = g.boss;
      const L = g.level;
      const fx = Math.sin(b.heading);
      const fz = Math.cos(b.heading);
      return [-2, 0, 2].some((k) => L.collideCircle.call({ solids: L.solids.filter((s) => s.alive && s.kind !== 'glass' && !s.edge) }, { x: b.x + fx * k, z: b.z + fz * k }, 1)); // not the invisible map edge it turns just past
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 4 on Rua da Felicidade is the armoured truck: in at the west end, up and down the street, never into a shop; the route names it', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toBoss();
    const start = { kind: b.def && b.def.kind, x: b.x, segments: b.segments, state: b.state };
    window.arrive();
    b.chargeT = b.unloadT = b.gunT = 999;
    let inWall = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 120 * 30; i++) {
      window.step();
      if (window.truckInWall()) inWall++;
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x);
    }
    const fel = g.maps.findIndex((m) => m.id === 'felicidade');
    const docks = g.maps.findIndex((m) => m.id === 'docks');
    return { start, inWall, span: [minX, maxX], routeFel: g.routeText(fel, 'arcade'), routeDocks: g.routeText(docks, 'arcade') };
  });
  assert.equal(r.start.kind, 'truck');
  assert.ok(r.start.x < -30, `it starts off the west end (${r.start.x})`);
  assert.equal(r.inWall, 0, 'never through a shop');
  assert.ok(r.span[0] < -15 && r.span[1] > 15, `up and down the street (${r.span.map((v) => v.toFixed(1))})`);
  assert.match(r.routeFel, /貨車/, r.routeFel);
  assert.match(r.routeDocks, /貨車/, 'from the docks, the last stage here: the truck again');
  assert.deepEqual(problems(logs), []);
});

test('in a shop behind its door the truck cannot reach the player; on the street in front of it, it runs the player down', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const charge = (x, z) => {
      window.toBoss();
      window.arrive();
      b.gunT = b.unloadT = 999;
      p.x = x;
      p.z = z;
      b.chargeT = 0;
      let n = 0;
      while (b.state !== 'charge' && n++ < 800) window.step();
      p.hp = 100;
      n = 0;
      while (b.state === 'charge' && n++ < 800) {
        const at = [p.x, p.z];
        window.step(true);
        [p.x, p.z] = at;
      }
      return { lost: 100 - p.hp, ran: b.ran, inWall: window.truckInWall() };
    };
    // a shop on the north side (its room behind the front at z = -3)
    const shop = g.level.map.shops.find((s) => s.side === 'n' && s.front === 'door');
    return { street: charge(shop.x, -1.5), shop: charge(shop.x, -5.5) };
  });
  assert.ok(r.street.lost > 0, `on the street: run down (${r.street.lost} HP)`);
  assert.equal(r.shop.lost, 0, 'in the shop: safe');
  assert.equal(r.shop.inWall, false, 'the truck stopped at the shop front');
});

test('screenshot: the truck charging down the street', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toBoss();
    window.arrive();
    for (let i = 0; i < 240; i++) window.step();
    g.player.x = b.x + 9;
    g.player.z = 1;
    b.chargeT = 0;
    let n = 0;
    while (b.state !== 'warn' && n++ < 800) window.step();
    for (let i = 0; i < 60; i++) window.step();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('felicidade-truck.png', OUT).pathname });
});
