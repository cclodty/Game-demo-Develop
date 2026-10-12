import { Game } from './game';

declare global {
  interface Window {
    __m1?: ReturnType<Game['testApi']> & { ready: boolean; game: Game };
  }
}

function boot(): void {
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  if (!canvas) return;
  const params = new URLSearchParams(window.location.search);
  const testMode = params.has('test') || window.location.hash === '#test';
  let game: Game;
  try {
    game = new Game(canvas, { testMode });
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

boot();
