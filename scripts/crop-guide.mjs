// Crops the A Guide to the Dragon World map with a labelled grid, so the many
// places it names (and the arc-2 plate does not) can be read off precisely.
// Usage: node scripts/crop-guide.mjs x0 y0 x1 y1 [scale] [out.png]
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const [x0 = 0, y0 = 0, x1 = 1703, y1 = 990] = process.argv
  .slice(2, 6)
  .map(Number)
  .filter((n) => !Number.isNaN(n));
const scale = Number(process.argv[6] ?? 2);
const dst = process.argv[7] ?? 'reference/guide-crop.png';

const IMG = `data:image/png;base64,${readFileSync('reference/agttdw.png').toString('base64')}`;

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
    ctx.imageSmoothingEnabled = S < 3;
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w * S, h * S);

    const step = w > 800 ? 100 : w > 300 ? 50 : 25;
    ctx.font = '11px monospace';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      ctx.strokeStyle = 'rgba(200,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo((x - x0) * S, 0);
      ctx.lineTo((x - x0) * S, h * S);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect((x - x0) * S + 2, 2, 30, 13);
      ctx.fillStyle = '#c00';
      ctx.fillText(String(x), (x - x0) * S + 4, 3);
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      ctx.strokeStyle = 'rgba(200,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, (y - y0) * S);
      ctx.lineTo(w * S, (y - y0) * S);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(2, (y - y0) * S + 2, 30, 13);
      ctx.fillStyle = '#c00';
      ctx.fillText(String(y), 4, (y - y0) * S + 3);
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
console.log(`wrote ${dst}  ${x0},${y0}..${x1},${y1} @${scale}x`);
