import { defineConfig } from 'vite';

// base: './' 讓建置結果可以放在 GitHub Pages 子路徑或任何靜態主機。
// --mode artifact：給單一 HTML 版本使用，Three.js 改由 CDN 載入（見 scripts/build-artifact.mjs）。
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // 單一 HTML 版本把模型等資源內嵌成 data URL；一般版本保持獨立檔案
    assetsInlineLimit: mode === 'artifact' ? 64 * 1024 * 1024 : 0,
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    rollupOptions: mode === 'artifact' ? { external: ['three'] } : {},
  },
  server: { host: true },
}));
