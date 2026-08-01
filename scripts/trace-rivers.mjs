// Highlights inland water on the reference map — rivers, deltas and lakes —
// by finding water-coloured pixels that fall inside the traced coastline.
// Output is a magnified view for reading river paths off the artwork.
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const bundle = await build({
  entryPoints: ['scripts/_placement-entry.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
});
const { ALL_LAND, toMapPx, px: toNorm } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const landPx = ALL_LAND.map((r) => r.map(([nx, ny]) => toMapPx(nx, ny)));
const IMG = `data:image/png;base64,${readFileSync('reference/pyrrhia.png').toString('base64')}`;

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas><canvas id="d"></canvas>');

const url = await page.evaluate(
  async (src, landPx) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.width;
    const H = img.height;

    const c = document.getElementById('c');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data;

    // Land mask from the shipped coastline.
    const m = document.getElementById('d');
    m.width = W;
    m.height = H;
    const mctx = m.getContext('2d', { willReadFrequently: true });
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, W, H);
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    for (const ring of landPx) {
      ring.forEach(([x, y], i) => (i ? mctx.lineTo(x, y) : mctx.moveTo(x, y)));
      mctx.closePath();
    }
    mctx.fill();
    const mask = mctx.getImageData(0, 0, W, H).data;

    // Shrink the land mask so the coast itself isn't reported as inland water.
    const inland = new Uint8Array(W * H);
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        let all = 1;
        for (let dy = -2; dy <= 2 && all; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (mask[((y + dy) * W + (x + dx)) * 4] < 128) {
              all = 0;
              break;
            }
        inland[y * W + x] = all;
      }
    }

    // Water-coloured pixels sitting inland. Threshold is looser than the
    // coastline tracer's: painted rivers are one or two pixels wide and heavily
    // blended with the terrain either side.
    const out = ctx.createImageData(W, H);
    let count = 0;
    for (let i = 0; i < W * H; i++) {
      const r = px[i * 4];
      const g = px[i * 4 + 1];
      const b = px[i * 4 + 2];
      const wet = b - r > 18 && b > 120 && g > r;
      const hit = wet && inland[i];
      if (hit) count++;
      out.data[i * 4] = hit ? 0 : Math.round(r * 0.35 + 160);
      out.data[i * 4 + 1] = hit ? 90 : Math.round(g * 0.35 + 160);
      out.data[i * 4 + 2] = hit ? 255 : Math.round(b * 0.35 + 160);
      out.data[i * 4 + 3] = 255;
    }

    const S = 2;
    const o = document.createElement('canvas');
    o.width = W * S;
    o.height = H * S;
    const octx = o.getContext('2d');
    ctx.putImageData(out, 0, 0);
    octx.imageSmoothingEnabled = false;
    octx.drawImage(c, 0, 0, W * S, H * S);

    // Grid for reading coordinates.
    octx.font = '10px monospace';
    octx.textBaseline = 'top';
    for (let x = 0; x <= W; x += 25) {
      const major = x % 100 === 0;
      octx.strokeStyle = major ? 'rgba(200,0,0,0.8)' : 'rgba(0,0,0,0.15)';
      octx.lineWidth = major ? 1.4 : 0.6;
      octx.beginPath();
      octx.moveTo(x * S, 0);
      octx.lineTo(x * S, H * S);
      octx.stroke();
      if (major) {
        octx.fillStyle = '#c00';
        octx.fillText(String(x), x * S + 3, 3);
      }
    }
    for (let y = 0; y <= H; y += 25) {
      const major = y % 100 === 0;
      octx.strokeStyle = major ? 'rgba(200,0,0,0.8)' : 'rgba(0,0,0,0.15)';
      octx.lineWidth = major ? 1.4 : 0.6;
      octx.beginPath();
      octx.moveTo(0, y * S);
      octx.lineTo(W * S, y * S);
      octx.stroke();
      if (major) {
        octx.fillStyle = '#c00';
        octx.fillText(String(y), 3, y * S + 3);
      }
    }

    return { url: o.toDataURL('image/png'), count };
  },
  IMG,
  landPx,
);

await browser.close();
writeFileSync('reference/rivers.png', Buffer.from(url.url.split(',')[1], 'base64'));
console.log(`wrote reference/rivers.png — ${url.count} inland water pixels`);
