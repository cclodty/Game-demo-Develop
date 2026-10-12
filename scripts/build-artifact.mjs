// 把 Vite 建置結果打包成單一 HTML（給 claude.ai Artifact 發布用）。
// Artifact 會自動補上 <!doctype>/<head>/<body>，所以這裡只輸出內容本身，
// 並把 CSS 與 JS 全部內嵌（外部腳本只允許指定的 CDN）。
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');
const jsFiles = assets.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`預期只有一個 JS 檔，實際為：${jsFiles.join(', ')}`);
const js = readFileSync(join(dist, 'assets', jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0];
const fonts = html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/)?.[0];
const app = html.match(/<!--APP-START-->([\s\S]*?)<!--APP-END-->/)?.[1];
if (!title || !fonts || !app) throw new Error('index.html 缺少 title、字型連結或 APP 區塊標記');

const out = [
  title,
  fonts,
  `<style>\n${css}\n</style>`,
  app.trim(),
  `<script type="module">\n${js}\n</script>`,
  '',
].join('\n');

mkdirSync('artifact', { recursive: true });
writeFileSync(join('artifact', 'index.html'), out);
console.log(`artifact/index.html ${(out.length / 1024).toFixed(0)} KB`);
