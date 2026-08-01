// Draws our landmark positions, river centrelines and kingdom borders on top of
// the canonical Schley map, so placements can be checked against the printed
// artwork instead of taken on trust.
//
// Usage: node scripts/audit-map.mjs [x0 y0 x1 y1] [scale] [out.png]
//   WHAT=marks|rivers|kingdoms|all   which layers to draw (default all)
//   ONLY=id,id                       restrict markers to these landmark ids
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const bundle = await build({
  entryPoints: ['scripts/_audit-entry.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
});
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const { LANDMARKS, LANDMARK_GROUPS, KINGDOMS, RIVERS, LAKES, toMapPx } = mod;

const args = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const [x0 = 0, y0 = 0, x1 = 600, y1 = 456] = args;
const scale = args[4] ?? (x1 - x0 > 400 ? 3 : 7);
const out = process.argv.find((a) => a.endsWith('.png')) ?? 'reference/audit.png';
const what = process.env.WHAT ?? 'all';
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const colorOf = Object.fromEntries(LANDMARK_GROUPS.map((g) => [g.id, g.color]));

// Everything crosses into the browser as plain map-pixel coordinates.
const marks = LANDMARKS.filter((lm) => !only || only.has(lm.id)).map((lm) => {
  const [mx, my] = toMapPx(lm.pos[0], lm.pos[1]);
  return { id: lm.id, name: lm.name, x: mx, y: my, color: colorOf[lm.group] ?? '#fff' };
});
const rivers = RIVERS.map((r) => ({
  id: r.id,
  branches: r.branches.map((b) => b.map((p) => toMapPx(p[0], p[1]))),
}));
const lakes = LAKES.map((l) => ({ id: l.id, poly: l.polygon.map((p) => toMapPx(p[0], p[1])) }));
const kingdoms = KINGDOMS.map((k) => ({
  name: k.name,
  poly: k.polygon.map((p) => toMapPx(p[0], p[1])),
}));

const IMG = `data:image/png;base64,${readFileSync('reference/pyrrhia.png').toString('base64')}`;

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const url = await page.evaluate(
  async (src, box, S, layers, data) => {
    const [x0, y0, x1, y1] = box;
    const w = x1 - x0;
    const h = y1 - y0;
    const img = new Image();
    img.src = src;
    await img.decode();

    const c = document.getElementById('c');
    c.width = w * S;
    c.height = h * S;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = S < 4;
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w * S, h * S);

    const X = (mx) => (mx - x0) * S;
    const Y = (my) => (my - y0) * S;

    // Grid, so a mismatch can be read off as a pixel correction.
    const step = w > 300 ? 50 : w > 120 ? 25 : 10;
    ctx.font = `${Math.max(9, S * 1.6)}px monospace`;
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(X(x), 0);
      ctx.lineTo(X(x), h * S);
      ctx.stroke();
      ctx.fillStyle = '#a00';
      ctx.fillText(String(x), X(x) + 2, 2);
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, Y(y));
      ctx.lineTo(w * S, Y(y));
      ctx.stroke();
      ctx.fillStyle = '#a00';
      ctx.fillText(String(y), 2, Y(y) + 2);
    }

    const all = layers === 'all';

    if (all || layers === 'kingdoms') {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255,0,255,0.75)';
      for (const k of data.kingdoms) {
        ctx.beginPath();
        k.poly.forEach(([mx, my], i) =>
          i ? ctx.lineTo(X(mx), Y(my)) : ctx.moveTo(X(mx), Y(my)),
        );
        ctx.closePath();
        ctx.stroke();
      }
    }

    if (all || layers === 'rivers') {
      for (const r of data.rivers) {
        for (const b of r.branches) {
          ctx.strokeStyle = 'rgba(255,40,40,0.9)';
          ctx.lineWidth = Math.max(1.5, S * 0.5);
          ctx.beginPath();
          b.forEach(([mx, my], i) => (i ? ctx.lineTo(X(mx), Y(my)) : ctx.moveTo(X(mx), Y(my))));
          ctx.stroke();
          // Mouth end, so flow direction is visible.
          ctx.fillStyle = '#ff2828';
          ctx.beginPath();
          ctx.arc(X(b[0][0]), Y(b[0][1]), Math.max(2, S * 0.7), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const l of data.lakes) {
        ctx.strokeStyle = 'rgba(255,40,40,0.9)';
        ctx.lineWidth = Math.max(1.5, S * 0.4);
        ctx.beginPath();
        l.poly.forEach(([mx, my], i) => (i ? ctx.lineTo(X(mx), Y(my)) : ctx.moveTo(X(mx), Y(my))));
        ctx.closePath();
        ctx.stroke();
      }
    }

    if (all || layers === 'marks') {
      const fs = Math.max(9, S * 2.2);
      ctx.font = `bold ${fs}px sans-serif`;
      // Stagger labels down-right in turn so dense clusters stay legible.
      let n = 0;
      for (const m of data.marks) {
        const cx = X(m.x);
        const cy = Y(m.y);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(3, S * 0.9), 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#000';
        ctx.stroke();

        const dy = ((n++ % 3) - 1) * fs * 1.1;
        const tx = cx + S * 1.4;
        const ty = cy - fs * 0.5 + dy;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(m.id, tx, ty);
        ctx.fillStyle = '#000';
        ctx.fillText(m.id, tx, ty);
      }
    }

    return c.toDataURL('image/png');
  },
  IMG,
  [x0, y0, x1, y1],
  scale,
  what,
  { marks, rivers, lakes, kingdoms },
);

await browser.close();
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(`wrote ${out}  region ${x0},${y0}..${x1},${y1} @${scale}x  layers=${what}`);
