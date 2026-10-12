import { Game } from './game';
import { loadCharacterTemplates } from './entities/characterAssets';

declare global {
  interface Window {
    __m1?: ReturnType<Game['testApi']> & { ready: boolean; game: Game };
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  if (!canvas) return;
  const params = new URLSearchParams(window.location.search);
  const testMode = params.has('test') || window.location.hash === '#test';

  // 先載入角色模型；載入期間「開始測試」按鈕暫時停用
  const startBtn = document.getElementById('btn-start') as HTMLButtonElement | null;
  const label = startBtn?.textContent ?? '';
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = '載入角色模型…';
  }
  const { templates, errors } = await loadCharacterTemplates();
  for (const e of errors) console.warn(`角色模型載入失敗，改用方塊人形：${e}`);
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = label;
  }

  let game: Game;
  try {
    game = new Game(canvas, { testMode, characters: templates });
  } catch (err) {
    showFatal(err);
    return;
  }
  window.__m1 = Object.assign(game.testApi(), { ready: true, game });
  const loop = (now: number) => {
    game.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function showFatal(err: unknown): void {
  console.error(err);
  const start = document.getElementById('start');
  if (!start) return;
  start.hidden = false;
  start.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const h = document.createElement('h2');
  h.textContent = '無法啟動 3D 畫面';
  const p = document.createElement('p');
  p.className = 'lead';
  p.textContent = '瀏覽器沒有提供 WebGL 2。請改用最新版 Chrome、Edge 或 Firefox，並確認已開啟硬體加速。';
  card.append(h, p);
  start.append(card);
}

void boot();
