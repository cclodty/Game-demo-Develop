import { expect, test, type Page } from '@playwright/test';

/**
 * M1 完成條件的瀏覽器驗收（對應 docs/design/goal-start-brief.md）。
 * 以真實的鍵盤與滑鼠事件操作；測試介面 window.__m1 只用來擺放場景與讀取數值。
 */

type Api = Record<string, (...args: never[]) => unknown>;

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?test');
  await page.waitForFunction(() => (window as unknown as { __m1?: { ready: boolean } }).__m1?.ready === true);
  await page.click('#btn-start');
  await page.waitForTimeout(300);
  return errors;
}

async function call<T = unknown>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([f, a]) => {
      const api = (window as unknown as { __m1: Api }).__m1;
      return (api[f as string] as (...x: unknown[]) => unknown)(...(a as unknown[]));
    },
    [fn, args] as const,
  ) as Promise<T>;
}

interface State {
  mode: string;
  player: { x: number; z: number; yaw: number; vx: number; vz: number; hp: number; alive: boolean; mag: number; reserve: number; reloading: boolean };
  aim: { x: number; z: number; yaw: number; onTarget: boolean };
  laser: { x0: number; z0: number; x1: number; z1: number; hit: string };
  bt: { energy: number; active: boolean; scale: number; visual: number; activations: number };
  zombies: { id: number; x: number; z: number; hp: number; state: string; alive: boolean }[];
  dummies: { hits: number; total: number }[];
  camera: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; targetX: number; targetZ: number };
  stats: { shots: number; hits: number; wallHits: number; kills: number; blockedAtMuzzle: number; damageTaken: number };
  pixel: { lowW: number; lowH: number; pixel: number };
  gameTime: number;
  bullets: number;
}

const state = (page: Page) => call<State>(page, 'state');

async function aimAt(page: Page, x: number, z: number): Promise<{ x: number; y: number }> {
  const p = await call<{ x: number; y: number }>(page, 'worldToScreen', x, 1.2, z);
  await page.mouse.move(p.x, p.y);
  return p;
}

/** 鏡頭會因瞄準偏移而移動，反覆對準幾次讓游標穩定落在目標上。 */
async function settleAim(page: Page, x: number, z: number): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await aimAt(page, x, z);
    await page.waitForTimeout(180);
  }
}

async function waitState(page: Page, pred: (s: State) => boolean, timeout = 10_000): Promise<State> {
  const end = Date.now() + timeout;
  let s = await state(page);
  while (!pred(s)) {
    if (Date.now() > end) throw new Error(`等待逾時，最後狀態：${JSON.stringify(s).slice(0, 600)}`);
    await page.waitForTimeout(100);
    s = await state(page);
  }
  return s;
}

const deg = (r: number) => (r * 180) / Math.PI;
const angleDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

test('啟動後畫面正常、中文介面正常、沒有執行錯誤', async ({ page }) => {
  const errors = await boot(page);
  await page.waitForTimeout(1000);
  const st = await call<{ mean: number; std: number }>(page, 'frameStats');
  expect(st.mean).toBeGreaterThan(8);
  expect(st.std).toBeGreaterThan(6);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('.meter-hp .meter-label')).toContainText('生命');
  await expect(page.locator('#bt-meter')).toContainText('子彈時間');
  await expect(page.locator('#weapon-name')).toContainText('通用步槍');
  expect(errors).toEqual([]);
});

test('主角能移動，且會被牆擋住', async ({ page }) => {
  await boot(page);
  // 住屋東牆內側（牆面 x = -12.15）
  await call(page, 'teleport', -13.2, 5, Math.PI / 2);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  const s = await state(page);
  expect(s.player.x).toBeGreaterThan(-13.0);
  expect(s.player.x).toBeLessThanOrEqual(-12.15 - 0.35 + 0.02);
});

test('鏡頭觀看方向固定，並跟隨主角移動', async ({ page }) => {
  await boot(page);
  await call(page, 'teleport', -2, 6, 0);
  await page.mouse.move(640, 360);
  await page.waitForTimeout(300);
  const a = await state(page);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await waitState(page, (s) => s.player.x - a.player.x > 2.2, 15_000);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(1200);
  const b = await state(page);
  // 移動方向依畫面：W＋D＝畫面右上（世界 +X、-Z）
  expect(b.player.x - a.player.x).toBeGreaterThan(1.5);
  expect(b.player.z - a.player.z).toBeLessThan(-1.5);
  // 鏡頭旋轉完全不變
  for (const k of ['qx', 'qy', 'qz', 'qw'] as const) expect(Math.abs(b.camera[k] - a.camera[k])).toBeLessThan(1e-6);
  // 鏡頭目標跟著主角（允許瞄準偏移）
  expect(Math.hypot(b.camera.targetX - b.player.x, b.camera.targetZ - b.player.z)).toBeLessThan(3.6);
  expect(Math.hypot(b.camera.targetX - a.camera.targetX, b.camera.targetZ - a.camera.targetZ)).toBeGreaterThan(1.5);
});

test('滑鼠繞一圈，整個人物連續轉滿 360°，沒有 4／8 方向吸附', async ({ page }) => {
  await boot(page);
  // 關閉瞄準時的鏡頭偏移，讓角色固定在畫面同一點，游標繞著角色畫圓
  await call(page, 'setSetting', { lookAhead: 0 });
  await call(page, 'teleport', -1, 4, 0);
  await page.waitForTimeout(300);
  const c = await call<{ x: number; y: number }>(page, 'worldToScreen', -1, 1.2, 4);
  // 先把游標放在起始角度並等人物轉到位，再開始記錄
  await page.mouse.move(c.x + 170, c.y);
  await waitState(page, (s) => angleDiff(s.player.yaw, s.aim.yaw) < 0.01 && angleDiff(s.aim.yaw, Math.PI / 2) < 0.1, 5000);
  const yaws: number[] = [(await state(page)).player.yaw];
  const steps = 72;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    await page.mouse.move(c.x + Math.cos(a) * 170, c.y + Math.sin(a) * 170);
    await page.waitForTimeout(45);
    yaws.push((await state(page)).player.yaw);
  }
  await waitState(page, (s) => angleDiff(s.player.yaw, s.aim.yaw) < 0.01, 5000);
  yaws.push((await state(page)).player.yaw);
  let total = 0;
  let maxStep = 0;
  for (let i = 1; i < yaws.length; i++) {
    let d = yaws[i] - yaws[i - 1];
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    total += d;
    maxStep = Math.max(maxStep, Math.abs(d));
  }
  expect(Math.abs(total)).toBeGreaterThan(Math.PI * 2 * 0.95);
  expect(deg(maxStep)).toBeLessThan(30);
  const distinct = new Set(yaws.map((y) => deg(y).toFixed(1)));
  expect(distinct.size).toBeGreaterThan(50);
  const nearDiagonal = yaws.filter((y) => {
    const d = ((deg(y) % 45) + 45) % 45;
    return d < 1 || d > 44;
  }).length;
  expect(nearDiagonal / yaws.length).toBeLessThan(0.25);
});

test('能邊後退、邊橫移，同時朝滑鼠方向射擊', async ({ page }) => {
  await boot(page);
  await call(page, 'teleport', 0, 5, Math.PI / 2);
  await settleAim(page, 6, 5);
  const before = await state(page);
  expect(angleDiff(before.player.yaw, Math.PI / 2)).toBeLessThan((8 * Math.PI) / 180);

  // 後退（面向東、往西走）同時射擊
  await page.keyboard.down('KeyA');
  await page.mouse.down();
  const mid = await waitState(page, (s) => s.stats.shots >= 3 && s.player.vx < -2, 15_000);
  const shot = await call<{ dx: number; dz: number; moveX: number }>(page, 'lastShot');
  await page.mouse.up();
  await page.keyboard.up('KeyA');
  expect(mid.player.vx).toBeLessThan(-2);
  expect(mid.stats.shots).toBeGreaterThanOrEqual(3);
  expect(shot.dx).toBeGreaterThan(0.95);
  expect(shot.moveX).toBeLessThan(-1);

  // 橫移（往北走）同時向東射擊
  await call(page, 'teleport', 0, 8, Math.PI / 2);
  await settleAim(page, 6, 8);
  const shots0 = (await state(page)).stats.shots;
  await page.keyboard.down('KeyW');
  await page.mouse.down();
  const mid2 = await waitState(page, (s) => s.stats.shots >= shots0 + 3 && s.player.vz < -2, 15_000);
  const shot2 = await call<{ dx: number; moveZ: number }>(page, 'lastShot');
  await page.mouse.up();
  await page.keyboard.up('KeyW');
  expect(mid2.player.vz).toBeLessThan(-2);
  expect(shot2.dx).toBeGreaterThan(0.9);
  expect(shot2.moveZ).toBeLessThan(-1);
});

test('命中敵人有回饋，牆會擋住子彈', async ({ page }) => {
  await boot(page);
  // 開闊街道：命中
  await call(page, 'teleport', -1, 6, Math.PI / 2);
  const id = await call<number>(page, 'spawnZombie', 5, 6);
  await call(page, 'freezeZombie', id);
  await settleAim(page, 5, 6);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  const hit = await waitState(page, (s) => s.stats.hits >= 1);
  expect(hit.zombies[0].hp).toBeLessThan(100);
  await expect(page.locator('#crosshair')).toHaveAttribute('data-hit', /hit|kill/);
  await call(page, 'clearZombies');

  // 隔著住屋東牆：子彈打在牆上，牆外的喪屍不受傷
  await call(page, 'teleport', -14.5, 5, Math.PI / 2);
  const id2 = await call<number>(page, 'spawnZombie', -9.5, 5);
  await call(page, 'freezeZombie', id2);
  await settleAim(page, -9.5, 5);
  expect((await state(page)).laser.hit).toBe('wall');
  const wallBefore = (await state(page)).stats.wallHits;
  await page.mouse.down();
  const after = await waitState(page, (s) => s.stats.wallHits >= wallBefore + 3, 15_000);
  await page.mouse.up();
  expect(after.zombies[0].hp).toBe(100);
});

test('槍口伸進牆裡時不會穿牆射擊', async ({ page }) => {
  await boot(page);
  // 貼著住屋東牆內側，槍口會伸過牆面
  await call(page, 'teleport', -12.52, 5, Math.PI / 2);
  const id = await call<number>(page, 'spawnZombie', -11.2, 5);
  await call(page, 'freezeZombie', id);
  await settleAim(page, -6, 5);
  const s0 = await state(page);
  expect(s0.laser.hit).toBe('wall');
  await page.mouse.down();
  await waitState(page, (s) => s.stats.shots >= 3, 15_000);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const s1 = await state(page);
  expect(s1.stats.shots).toBeGreaterThanOrEqual(2);
  expect(s1.stats.blockedAtMuzzle).toBeGreaterThanOrEqual(2);
  expect(s1.zombies[0].hp).toBe(100);
});

test('喪屍會追近並造成看得見的傷害', async ({ page }) => {
  await boot(page);
  await call(page, 'teleport', -1, 6, 0);
  await call(page, 'spawnZombie', -1, 0);
  const s = await waitState(page, (st) => st.player.hp < 100, 15_000);
  expect(s.player.hp).toBeLessThan(100);
  await expect(page.locator('#hp-text')).toHaveText(String(Math.ceil(s.player.hp)));
});

test('子彈時間：放慢、耗盡、部分回復後可再次啟動，瞄準仍即時', async ({ page }) => {
  await boot(page);
  await call(page, 'teleport', -1, 4, 0);
  await page.mouse.move(900, 360);
  await page.waitForTimeout(300);
  await page.keyboard.down('Space');
  const on = await waitState(page, (s) => s.bt.active, 2000);
  expect(on.bt.scale).toBeCloseTo(0.3, 5);

  // 遊戲時間約以 0.3 倍前進
  // 以「遊戲時間 ÷ 實際經過的幀時間」檢查倍率（不受測試機幀率影響）
  const ratio = await page.evaluate(async () => {
    const g = (window as unknown as { __m1: { game: { gameTime: number } } }).__m1.game;
    const g0 = g.gameTime;
    let real = 0;
    let last = performance.now();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      real += Math.min(0.1, (now - last) / 1000);
      last = now;
    }
    return (g.gameTime - g0) / real;
  });
  expect(ratio).toBeGreaterThan(0.24);
  expect(ratio).toBeLessThan(0.36);

  // 子彈時間中，滑鼠轉向仍即時
  const c = await call<{ x: number; y: number }>(page, 'worldToScreen', -1, 1.2, 4);
  await page.mouse.move(c.x - 200, c.y);
  const t0 = Date.now();
  const turned = await waitState(page, (s) => angleDiff(s.player.yaw, -Math.PI / 2) < (15 * Math.PI) / 180, 3000);
  // 轉向以現實時間計算：即使遊戲放慢到 0.3 倍，也應在約半秒內轉到位
  expect(Date.now() - t0).toBeLessThan(1500);
  expect(turned.bt.active).toBe(true);

  // 按住不放直到耗盡：自動回到正常速度
  const drained = await waitState(page, (s) => !s.bt.active, 8000);
  expect(drained.bt.energy).toBeLessThan(10);
  expect(drained.bt.scale).toBe(1);
  // 繼續按住也不會自己再開（需放開再按）
  await waitState(page, (s) => s.bt.energy > 30, 8000);
  const held = await state(page);
  expect(held.bt.active).toBe(false);
  expect(held.bt.activations).toBe(1);
  await page.keyboard.up('Space');
  await page.waitForTimeout(150);

  // 部分回復（未回滿）就能再開
  const partial = await state(page);
  expect(partial.bt.energy).toBeGreaterThanOrEqual(22);
  expect(partial.bt.energy).toBeLessThan(100);
  await page.keyboard.down('Space');
  const again = await waitState(page, (s) => s.bt.active, 2000);
  expect(again.bt.activations).toBeGreaterThanOrEqual(2);
  await page.keyboard.up('Space');
  await waitState(page, (s) => !s.bt.active && s.bt.scale === 1, 2000);
});

test('倒下後可重設：生命、彈藥、敵人、子彈時間與時間倍率全部恢復', async ({ page }) => {
  await boot(page);
  await call(page, 'teleport', -1, 6, 0);
  await settleAim(page, -1, 1.5);
  await page.mouse.down();
  await waitState(page, (s) => s.stats.shots >= 3, 10_000);
  await page.mouse.up();
  await call(page, 'spawnZombie', 6, -6);
  await call(page, 'spawnZombie', -7, -6);
  await page.keyboard.down('Space');
  await waitState(page, (s) => s.bt.active, 2000);
  await call(page, 'damagePlayer', 999);
  const down = await state(page);
  expect(down.player.alive).toBe(false);
  expect(down.bt.active).toBe(false);
  expect(down.bt.scale).toBe(1);
  await page.keyboard.up('Space');
  await expect(page.locator('#dead')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#dead')).toBeHidden();
  const s = await state(page);
  expect(s.mode).toBe('playing');
  expect(s.player.alive).toBe(true);
  expect(s.player.hp).toBe(100);
  expect(s.player.mag).toBe(30);
  expect(s.player.reserve).toBe(90);
  expect(s.zombies.length).toBe(0);
  expect(s.bt.energy).toBe(100);
  expect(s.bt.scale).toBe(1);
  expect(s.bt.active).toBe(false);
  expect(s.stats.shots).toBe(0);
});

test('彈藥會消耗、可換彈、耗盡後可從彈藥箱補充', async ({ page }) => {
  await boot(page);
  await call(page, 'teleport', -1, 6, 0);
  await settleAim(page, -1, 1.5);
  await page.mouse.down();
  await waitState(page, (s) => s.player.mag === 0 || s.player.reloading, 20_000);
  await page.mouse.up();
  // 打空後自動換彈，不需要再按
  const r = await waitState(page, (s) => !s.player.reloading && s.player.mag === 30, 6000);
  expect(r.player.reserve).toBe(60);
  // 走到街道中央的彈藥箱 (0.5, -1.5)
  await call(page, 'teleport', 0.5, -0.2, 0);
  await page.keyboard.down('KeyW');
  const p = await waitState(page, (s) => s.player.reserve > 60, 8000);
  await page.keyboard.up('KeyW');
  expect(p.player.reserve).toBe(120);
});

test('暫停時遊戲時間與能量回復都停止', async ({ page }) => {
  await boot(page);
  await call(page, 'setEnergy', 40);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  const a = await state(page);
  await page.waitForTimeout(800);
  const b = await state(page);
  expect(b.gameTime).toBe(a.gameTime);
  expect(b.bt.energy).toBe(a.bt.energy);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeHidden();
  await page.waitForTimeout(500);
  expect((await state(page)).bt.energy).toBeGreaterThan(a.bt.energy);
});

for (const pixelMode of [true, false]) {
  test(`${pixelMode ? '像素風' : '標準'}呈現：游標、瞄準點與畫面上的雷射點對齊`, async ({ page }) => {
    await boot(page);
    await call(page, 'setSetting', { pixelMode });
    await call(page, 'teleport', 13, 8, Math.PI / 2);
    // 對準假人中心
    await settleAim(page, 21, 8);
    const mouse = await aimAt(page, 21, 8);
    await page.waitForTimeout(250);
    const s = await state(page);
    expect(Math.hypot(s.aim.x - 21, s.aim.z - 8)).toBeLessThan(0.15);
    expect(s.laser.hit).toBe('dummy');
    if (pixelMode) expect(s.pixel.pixel).toBe(3);
    else expect(s.pixel.pixel).toBe(1);

    // 讀回畫面：雷射終點附近應出現紅色雷射點
    const end = await call<{ x: number; y: number }>(page, 'worldToScreen', s.laser.x1, 1.2, s.laser.z1);
    expect(Math.hypot(end.x - mouse.x, end.y - mouse.y)).toBeLessThan(30);
    const radius = 8;
    const px = await call<{ w: number; data: number[] }>(page, 'readPixels', end.x, end.y, radius);
    let red = 0;
    for (let i = 0; i < px.data.length; i += 4) {
      const [r, g, b] = [px.data[i], px.data[i + 1], px.data[i + 2]];
      if (r > 170 && g < 120 && b < 110) red++;
    }
    expect(red).toBeGreaterThan(0);
  });
}

test('點過介面按鈕後，按空白鍵只會開子彈時間，不會再觸發按鈕', async ({ page }) => {
  await boot(page);
  await page.click('#btn-reset');
  await call(page, 'teleport', -1, 6, 0);
  await settleAim(page, -1, 1.5);
  await page.mouse.down();
  await waitState(page, (s) => s.stats.shots >= 2, 10_000);
  await page.mouse.up();
  const shots = (await state(page)).stats.shots;
  await page.keyboard.down('Space');
  await waitState(page, (s) => s.bt.active, 2000);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  const s = await state(page);
  expect(s.stats.shots).toBe(shots);
  expect(s.bt.activations).toBe(1);
});

test('外部角色模型：載入後會播放待機與移動動作（沒有放模型時略過）', async ({ page }) => {
  const errors = await boot(page);
  const models = await page.evaluate(() => (window as unknown as { __m1: { state: () => { models: { player: string | null; zombie: string | null } } } }).__m1.state().models);
  test.skip(!models.player && !models.zombie, 'src/assets/models/ 沒有模型檔，使用方塊人形');
  type ModelState = State & { models: { playerClips: string[] } };
  if (models.player) {
    await call(page, 'teleport', -1, 5, Math.PI / 2);
    await settleAim(page, 5, 5);
    const idle = (await state(page)) as ModelState;
    expect(idle.models.playerClips.length).toBeGreaterThan(0);
    await page.keyboard.down('KeyW');
    const moving = (await waitState(page, (s) => (s as ModelState).models.playerClips.join() !== idle.models.playerClips.join(), 5000)) as ModelState;
    await page.keyboard.up('KeyW');
    expect(moving.models.playerClips.length).toBeGreaterThan(0);
  }
  if (models.zombie) {
    await call(page, 'teleport', -1, 6, 0);
    await call(page, 'spawnZombie', -1, 1);
    await waitState(page, (s) => s.player.hp < 100, 15_000);
  }
  expect(errors).toEqual([]);
});
