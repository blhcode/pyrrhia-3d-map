// Times a teleport into forested ground and reports what the scatterer built.
//
// The site screenshots go through SwiftShader, where a stand of trees costs
// orders of magnitude more than it does on a GPU, so this exists to separate
// "the forest is wrong" from "software rasterising a forest is slow".
// Usage: node scripts/probe-forest.mjs "RainWing Village" ...
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const SITES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['RainWing Village', 'Northern SkyWing Outpost', 'NightWing Volcano'];

const SHOT = process.env.SHOT === '1';
const W = Number(process.env.W ?? 320);
const H = Number(process.env.H ?? 200);
const SETTLE = Number(process.env.SETTLE ?? 0);
mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 900_000,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
  ],
});

const page = await browser.newPage();
// Small by default: fill rate is the thing we are not trying to measure.
await page.setViewport({ width: W, height: H });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text());
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.getElementById('loading'), {
  timeout: 300_000,
});
console.log('loaded');

for (const name of SITES) {
  const t0 = Date.now();
  const ok = await page.evaluate((n) => {
    const b = [...document.querySelectorAll('.lm-btn')].find((x) =>
      x.textContent.includes(n),
    );
    if (b) b.click();
    return Boolean(b);
  }, name);
  if (!ok) {
    console.log(`${name}: no button`);
    continue;
  }

  if (SETTLE) await new Promise((r) => setTimeout(r, SETTLE));

  const info = await page.evaluate(() => {
    const r = window.__pyrrhia;
    return {
      trees: r?.forests?.treeCount ?? null,
      calls: r?.renderer?.info?.render?.calls ?? null,
      tris: r?.renderer?.info?.render?.triangles ?? null,
    };
  });
  console.log(`${name}: ${JSON.stringify(info)} (${Date.now() - t0} ms)`);

  if (SHOT) {
    const file = `shots/forest-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    writeFileSync(file, await page.screenshot());
    console.log('  wrote', file);
  }
}

await browser.close();
