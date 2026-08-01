// Crops a region of the reference map and blows it up with a fine grid, for
// reading small features (sea islands, palace icons) off the artwork.
// Usage: node scripts/crop-map.mjs x0 y0 x1 y1 [scale] [out.png]
// Set SRC to crop something other than the reference map, e.g. a relief dump.
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const [x0, y0, x1, y1] = process.argv.slice(2, 6).map(Number);
const scale = Number(process.argv[6] ?? 6);
const dst = process.argv[7] ?? 'reference/crop.png';

const src = process.env.SRC ?? 'reference/pyrrhia.png';
const IMG = `data:image/png;base64,${readFileSync(src).toString('base64')}`;

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const url = await page.evaluate(
  async (src, x0, y0, x1, y1, S) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = x1 - x0;
    const h = y1 - y0;
    const c = document.getElementById('c');
    c.width = w * S;
    c.height = h * S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w * S, h * S);

    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) {
      const major = x % 50 === 0;
      ctx.strokeStyle = major ? 'rgba(200,0,0,0.8)' : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = major ? 1.5 : 0.7;
      ctx.beginPath();
      ctx.moveTo((x - x0) * S, 0);
      ctx.lineTo((x - x0) * S, h * S);
      ctx.stroke();
      ctx.fillStyle = major ? '#c00' : '#555';
      ctx.fillText(String(x), (x - x0) * S + 2, 2);
    }
    for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) {
      const major = y % 50 === 0;
      ctx.strokeStyle = major ? 'rgba(200,0,0,0.8)' : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = major ? 1.5 : 0.7;
      ctx.beginPath();
      ctx.moveTo(0, (y - y0) * S);
      ctx.lineTo(w * S, (y - y0) * S);
      ctx.stroke();
      ctx.fillStyle = major ? '#c00' : '#555';
      ctx.fillText(String(y), 2, (y - y0) * S + 2);
    }
    return c.toDataURL('image/png');
  },
  IMG,
  x0,
  y0,
  x1,
  y1,
  scale,
);

await browser.close();
writeFileSync(dst, Buffer.from(url.split(',')[1], 'base64'));
console.log(`wrote ${dst}`);
