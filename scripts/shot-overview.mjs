// Quick overview capture against the preview server.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const URL = process.env.URL ?? 'http://localhost:4173/';
mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 900_000,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 950 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page
  .waitForFunction(() => !document.getElementById('loading'), { timeout: 240000 })
  .catch(() => console.log('[warn] loading never cleared'));

await new Promise((r) => setTimeout(r, 6000));

await page.evaluate(() => {
  const api = /** @type {any} */ (window).__pyrrhia;
  if (!api) return;
  // True top-down, matching the printed map's orientation.
  api.camera.position.set(0, 5_800_000, 20_000);
  api.orbit.target.set(0, 0, 0);
  api.camera.lookAt(0, 0, 0);
  api.orbit.update();
});
await new Promise((r) => setTimeout(r, 3500));

const out = resolve('shots', 'dragon-silhouette.png');
await page.screenshot({ path: out });
console.log('wrote', out);
console.log('patches:', await page.$eval('#patches', (n) => n.textContent).catch(() => '?'));
await browser.close();
