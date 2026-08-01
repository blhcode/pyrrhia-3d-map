// Renders the generated terrain to a relief PNG without touching WebGL.
// Use it to check landforms — rivers, lakes, ranges — against the book map.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const SIZE = Number(process.env.SIZE ?? 1024);
const VERT = Number(process.env.VERT ?? 15);
mkdirSync('shots', { recursive: true });

const bundle = await build({
  entryPoints: ['scripts/_terrain-entry.ts'],
  bundle: true,
  format: 'iife',
  write: false,
  platform: 'browser',
});

const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 600_000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setContent('<body></body>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });

const started = Date.now();
const url = await page.evaluate(
  (size, vert) => window.dumpTerrain(size, vert),
  SIZE,
  VERT,
);
console.log(`generated ${SIZE}² in ${((Date.now() - started) / 1000).toFixed(1)} s`);

const out = resolve('shots', `relief-${SIZE}.png`);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
