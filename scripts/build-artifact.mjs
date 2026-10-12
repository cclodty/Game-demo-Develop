// 把 Vite 建置結果打包成單一 HTML（給 claude.ai Artifact 發布用）。
// Artifact 會自動補上 <!doctype>/<head>/<body>，所以這裡只輸出內容本身；
// 自己的 CSS 與 JS 內嵌，Three.js 則透過 import map 從 jsDelivr 載入（版本與 package.json 相同）。
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist-artifact';
const threeVersion = JSON.parse(readFileSync('package.json', 'utf8')).dependencies.three;
if (!/^\d+\.\d+\.\d+$/.test(threeVersion)) throw new Error(`three 版本需固定為確切版本，目前為 ${threeVersion}`);
const importMap = JSON.stringify({ imports: { three: `https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js` } });
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
  `<script type="importmap">${importMap}</script>`,
  `<script type="module">\n${js}\n</script>`,
  '',
].join('\n');

mkdirSync('artifact', { recursive: true });
writeFileSync(join('artifact', 'index.html'), out);
console.log(`artifact/index.html ${(out.length / 1024).toFixed(0)} KB`);
