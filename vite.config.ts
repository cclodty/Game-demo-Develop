import { defineConfig } from 'vite';

// base: './' 讓建置結果可以放在 GitHub Pages 子路徑或任何靜態主機。
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
  server: { host: true },
});
