// Converts a reference image to PNG at a given width, so it can be inspected.
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import puppeteer from 'puppeteer';

const src = process.argv[2];
const dst = process.argv[3];
const width = Number(process.argv[4] ?? 1000);

const mime = extname(src).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const data = `data:${mime};base64,${readFileSync(src).toString('base64')}`;

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const out = await page.evaluate(
  async (s, w) => {
    const img = new Image();
    img.src = s;
    await img.decode();
    const scale = w / img.width;
    const c = document.getElementById('c');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/png'), w: img.width, h: img.height };
  },
  data,
  width,
);

await browser.close();
writeFileSync(dst, Buffer.from(out.url.split(',')[1], 'base64'));
console.log(`${src} is ${out.w}x${out.h} -> wrote ${dst} at width ${width}`);
