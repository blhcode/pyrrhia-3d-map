// Close passes over each river system and settlement, for eyeballing the water
// meshes and the built architecture in engine.
//
// Needs a real GPU. Under a software rasteriser a single frame of this terrain
// can take longer than the protocol timeout; use scripts/dump-terrain.mjs for
// landform checks and scripts/report-sites.mjs for building sizes instead.
// ONLY=name1,name2 picks a subset; W and H override the viewport.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const URL = process.env.URL ?? 'http://localhost:4174/';
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
// Deliberately small: the software rasteriser this runs on needs minutes per
// frame at anything larger.
await page.setViewport({
  width: Number(process.env.W ?? 640),
  height: Number(process.env.H ?? 420),
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page
  .waitForFunction(() => !document.getElementById('loading'), { timeout: 300000 })
  .catch(() => console.log('[warn] loading never cleared'));
await new Promise((r) => setTimeout(r, 6000));

// Map pixel → normalised, mirroring src/data/mapref.ts.
const MARGIN = 26;
const IN_W = 600 - MARGIN * 2;
const IN_H = 456 - MARGIN * 2;
const px = (x, y) => [(x - MARGIN) / IN_W, 1 - (y - MARGIN) / IN_H];

const all = {
  'water-diamond-spray': { at: px(355, 180), height: 520_000, tilt: 0.5 },
  'water-five-tail': { at: px(408, 295), height: 520_000, tilt: 0.5 },
  'water-lake': { at: px(363, 312), height: 200_000, tilt: 0.7 },
  'scavenger-den': { at: px(322, 294), height: 900, tilt: 1.4 },
  'scorpion-den': { at: px(190, 302), height: 4_500, tilt: 1.4 },
};
const only = process.env.ONLY?.split(',');
const shots = Object.entries(all)
  .filter(([name]) => !only || only.includes(name))
  .map(([name, s]) => ({ name, ...s }));

for (const s of shots) {
  await page.evaluate(
    (nx, ny, height, tilt) => {
      const api = window.__pyrrhia;
      const W = 5_198_689;
      const H = 3_832_610;
      const x = nx * W - W / 2;
      const z = -(ny * H - H / 2);
      api.camera.position.set(x, height, z + height * tilt);
      api.orbit.target.set(x, 0, z);
      api.camera.lookAt(x, 0, z);
      api.orbit.update();
    },
    s.at[0],
    s.at[1],
    s.height,
    s.tilt,
  );
  await new Promise((r) => setTimeout(r, 4500));
  const out = resolve('shots', `${s.name}.png`);
  await page.screenshot({ path: out });
  console.log('wrote', out);
}

await browser.close();
