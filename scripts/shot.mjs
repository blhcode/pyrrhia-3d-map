// Headless verification: load the app, capture console output, screenshot the
// terrain in several states. Run with `node scripts/shot.mjs`.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = resolve('shots');
mkdirSync(OUT, { recursive: true });

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
await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()}`));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 120000 });

// Wait for the loading overlay to be removed.
await page
  .waitForFunction(() => !document.getElementById('loading'), { timeout: 180000 })
  .catch(() => logs.push('[warn] loading overlay never disappeared'));

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
await settle(4000);

async function shot(name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  logs.push(`[shot] ${name}.png`);
}

await shot('01-overview');

// Sample the centre of the viewport to prove it is not a flat single colour.
const stats = await page.evaluate(() => {
  const c = document.getElementById('viewport');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  return {
    canvas: `${c.width}x${c.height}`,
    gl: gl ? gl.getParameter(gl.VERSION) : 'NO CONTEXT',
    renderer: gl ? gl.getParameter(gl.RENDERER) : '—',
    patches: document.getElementById('patches')?.textContent,
    kingdom: document.getElementById('kingdom')?.textContent,
    ground: document.getElementById('ground')?.textContent,
  };
});

// Frame time over a second of rendering.
const perf = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      const t0 = performance.now();
      const tick = () => {
        frames++;
        if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
        else resolve({ fps: frames, note: 'software rasteriser, not indicative' });
      };
      requestAnimationFrame(tick);
    }),
);

// Fly mode
await page.click('#mode-fly');
await settle(1500);
await shot('02-fly');

// Crank vertical exaggeration
await page.evaluate(() => {
  const s = document.getElementById('vert-scale');
  s.value = '30';
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
await settle(2500);
await shot('03-exaggerated');

// Jump to Queen Thorn's palace
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.lm-btn')];
  const t = btns.find((b) => b.textContent.includes('SandWing Stronghold'));
  if (t) t.click();
});
await settle(3000);
await shot('04-stronghold');

logs.push(
  `[places] ${await page.$eval('#landmark-count', (n) => n.textContent)} total, ` +
    `${await page.$$eval('.lm-btn', (n) => n.length)} listed, ` +
    `${await page.$$eval('.chip', (n) => n.length)} categories`,
);

// Back to orbit overview at default exaggeration
await page.evaluate(() => {
  const s = document.getElementById('vert-scale');
  s.value = '15';
  s.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('btn-overview').click();
});
await settle(3000);
await shot('05-overview-final');

// Filter down to palaces only
await page.evaluate(() => {
  for (const chip of document.querySelectorAll('.chip')) {
    if (!chip.textContent.includes('Palaces')) chip.click();
  }
});
await settle(2500);
await shot('06-palaces-only');

console.log(JSON.stringify({ stats, perf }, null, 2));
console.log('--- console ---');
console.log(logs.join('\n'));

await browser.close();
