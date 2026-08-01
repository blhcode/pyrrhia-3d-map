// Draws the land mask the app actually ships (src/data/coastline.ts) over the
// reference map, with every landmark plotted, so the fit can be judged by eye.
//
// Usage: node scripts/verify-silhouette.mjs
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
const { ALL_LAND, LANDMARKS, KINGDOMS, toMapPx } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const IMG = `data:image/png;base64,${readFileSync('reference/pyrrhia.png').toString('base64')}`;

const land = ALL_LAND.map((ring) => ring.map(([nx, ny]) => toMapPx(nx, ny)));
const marks = LANDMARKS.map((l) => ({
  p: toMapPx(l.pos[0], l.pos[1]),
  g: l.group,
}));
const borders = KINGDOMS.map((k) => ({
  name: k.name,
  label: k.label,
  ring: k.polygon.map(([nx, ny]) => toMapPx(nx, ny)),
}));

const GROUP_COLOUR = {
  palace: '#f0c14a',
  settlement: '#63d0a0',
  human: '#e88b5a',
  mountain: '#ffffff',
  water: '#5ab6e8',
  ruin: '#b184e0',
};

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const url = await page.evaluate(
  async (src, land, marks, borders, colours) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const S = 2;
    const c = document.getElementById('c');
    c.width = img.width * S;
    c.height = img.height * S;
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.drawImage(img, 0, 0);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.globalAlpha = 1;

    const path = (ring) => {
      ctx.beginPath();
      ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };

    // Kingdom territories as translucent washes.
    for (const b of borders) {
      ctx.fillStyle = b.label;
      ctx.globalAlpha = 0.18;
      path(b.ring);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = b.label;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // The shipped land mask.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#b00020';
    ctx.lineWidth = 1.1;
    for (const ring of land) {
      path(ring);
      ctx.stroke();
    }

    for (const m of marks) {
      ctx.beginPath();
      ctx.arc(m.p[0], m.p[1], 2.2, 0, Math.PI * 2);
      ctx.fillStyle = colours[m.g] ?? '#fff';
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    return c.toDataURL('image/png');
  },
  IMG,
  land,
  marks,
  borders,
  GROUP_COLOUR,
);

await browser.close();
writeFileSync('reference/silhouette-check.png', Buffer.from(url.split(',')[1], 'base64'));
console.log(
  `wrote reference/silhouette-check.png — ${land.length} land rings, ` +
    `${marks.length} landmarks, ${borders.length} territories`,
);
