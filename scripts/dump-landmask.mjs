// Rasterises ALL_LAND into a PNG so the silhouette the app uses can be
// compared side-by-side with the book map.
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const bundle = await build({
  entryPoints: ['scripts/_placement-entry.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
});
const { ALL_LAND, LANDMARKS, toMapPx } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const land = ALL_LAND.map((ring) => ring.map(([nx, ny]) => [nx, 1 - ny])); // flip to image space
const marks = LANDMARKS.map((l) => ({
  p: [l.pos[0], 1 - l.pos[1]],
  name: l.name,
  g: l.group,
}));

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const url = await page.evaluate(
  async (land, marks) => {
    const S = 900;
    const c = document.getElementById('c');
    c.width = S;
    c.height = Math.round(S * (404 / 548));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a3a52';
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = '#c9b27a';
    ctx.beginPath();
    for (const ring of land) {
      ring.forEach(([x, y], i) => {
        const X = x * c.width;
        const Y = y * c.height;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
    }
    ctx.fill();

    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1;
    for (const ring of land) {
      ctx.beginPath();
      ring.forEach(([x, y], i) => {
        const X = x * c.width;
        const Y = y * c.height;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.stroke();
    }

    for (const m of marks) {
      ctx.beginPath();
      ctx.arc(m.p[0] * c.width, m.p[1] * c.height, 2.5, 0, Math.PI * 2);
      ctx.fillStyle =
        m.g === 'palace'
          ? '#f0c14a'
          : m.g === 'settlement'
            ? '#63d0a0'
            : m.g === 'human'
              ? '#e88b5a'
              : m.g === 'mountain'
                ? '#eee'
                : m.g === 'water'
                  ? '#5ab6e8'
                  : '#b184e0';
      ctx.fill();
    }
    return c.toDataURL('image/png');
  },
  land,
  marks,
);

await browser.close();
writeFileSync('reference/landmask.png', Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote reference/landmask.png');
