// Build a Pyrrhia .glb on disk via the running app's export path.
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import puppeteer from 'puppeteer';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT_DIR = resolve('models');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'shell',
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
await page.setViewport({ width: 1280, height: 800 });

const client = await page.createCDPSession();
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: OUT_DIR,
});

page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text());
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('loading'), {
  timeout: 180000,
});

// Let a couple of frames render so the app is fully alive.
await new Promise((r) => setTimeout(r, 2000));

console.log('Exporting GLB…');
await page.click('#btn-export');

// Wait until the hint reports a size, or until the file appears.
await page.waitForFunction(
  () => {
    const t = document.getElementById('export-hint')?.textContent ?? '';
    return t.includes('MB') || t.includes('failed');
  },
  { timeout: 180000 },
);

const hint = await page.$eval('#export-hint', (n) => n.textContent);
console.log('Hint:', hint);

// Give the download a moment to flush to disk.
await new Promise((r) => setTimeout(r, 3000));

const { readdirSync, statSync } = await import('node:fs');
const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.glb'));
for (const f of files) {
  const s = statSync(resolve(OUT_DIR, f));
  console.log(`Wrote ${f} (${(s.size / 1e6).toFixed(2)} MB)`);
}

await browser.close();
