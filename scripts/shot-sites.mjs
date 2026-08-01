import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const SITES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Scorpion Den', 'IceWing Palace', 'Possibility', 'Lost City of Night'];

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
await page.setViewport({ width: 1280, height: 760 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.getElementById('loading'), {
  timeout: 300_000,
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
await settle(4000);

for (const name of SITES) {
  const ok = await page.evaluate((n) => {
    const b = [...document.querySelectorAll('.lm-btn')].find((x) =>
      x.textContent.includes(n),
    );
    if (b) b.click();
    return Boolean(b);
  }, name);

  if (!ok) {
    logs.push(`[miss] no button for ${name}`);
    continue;
  }

  await settle(9000);
  const file = `shots/site-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  writeFileSync(file, await page.screenshot());
  logs.push(`[shot] ${file}`);
}

// How much geometry is actually in the scene at the last site.
const stats = await page.evaluate(() => ({
  altitude: document.getElementById('hud-alt')?.textContent,
  ground: document.getElementById('hud-ground')?.textContent,
}));

console.log(JSON.stringify(stats, null, 2));
console.log(logs.join('\n'));
await browser.close();
