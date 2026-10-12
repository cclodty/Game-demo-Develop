import { defineConfig } from '@playwright/test';

/**
 * 瀏覽器端的操作驗收。用 Chromium 的軟體 WebGL（SwiftShader）執行，
 * 不需要顯示卡，所以在雲端或 CI 也能跑；畫面幀率會比實機低。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    // 較小的視窗讓軟體 WebGL 跑得快一些；版面在 960 寬以上與正式畫面相同
    viewport: { width: 960, height: 540 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
