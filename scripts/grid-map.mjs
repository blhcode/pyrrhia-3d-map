// Renders the reference map at 2x with a labelled pixel grid, so landmark
// positions can be read off it directly instead of guessed.
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const IMG = `data:image/png;base64,${readFileSync('reference/pyrrhia.png').toString('base64')}`;
const SCALE = 2;

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const data = await page.evaluate(
  async (src, S) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.width;
    const H = img.height;
    const c = document.getElementById('c');
    c.width = W * S;
    c.height = H * S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, W * S, H * S);

    ctx.font = '11px monospace';
    ctx.textBaseline = 'top';

    for (let x = 0; x <= W; x += 25) {
      const major = x % 100 === 0;
      ctx.strokeStyle = major ? 'rgba(200,0,0,0.75)' : 'rgba(0,0,0,0.22)';
      ctx.lineWidth = major ? 1.5 : 0.75;
      ctx.beginPath();
      ctx.moveTo(x * S, 0);
      ctx.lineTo(x * S, H * S);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x * S + 2, 2, 26, 13);
        ctx.fillStyle = '#c00';
        ctx.fillText(String(x), x * S + 4, 3);
      }
    }
    for (let y = 0; y <= H; y += 25) {
      const major = y % 100 === 0;
      ctx.strokeStyle = major ? 'rgba(200,0,0,0.75)' : 'rgba(0,0,0,0.22)';
      ctx.lineWidth = major ? 1.5 : 0.75;
      ctx.beginPath();
      ctx.moveTo(0, y * S);
      ctx.lineTo(W * S, y * S);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(2, y * S + 2, 26, 13);
        ctx.fillStyle = '#c00';
        ctx.fillText(String(y), 4, y * S + 3);
      }
    }
    return c.toDataURL('image/png');
  },
  IMG,
  SCALE,
);

await browser.close();
writeFileSync('reference/pyrrhia-grid.png', Buffer.from(data.split(',')[1], 'base64'));
console.log('wrote reference/pyrrhia-grid.png');
