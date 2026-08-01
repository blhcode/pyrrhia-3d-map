// Traces the Pyrrhia coastline out of the reference map image.
//
// The map is a painted illustration: ocean is blue with fine black wave
// hatching, land runs white (ice) → tan (desert) → green (forest). We classify
// per pixel, clean up text and hatching with morphology, keep the components
// that are actually landmasses, then march the boundary and simplify it.
//
// Usage: node scripts/trace-coast.mjs [--ascii]
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

// Inlined as a data URL: a file:// image will not decode inside a page served
// from about:blank.
const IMG = `data:image/png;base64,${readFileSync('reference/pyrrhia.png').toString('base64')}`;
const SHOW_ASCII = process.argv.includes('--ascii');

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

// 1:1. Upscaling was tried to recover the Bay of a Thousand Scales specks, but
// the closing needed to swallow label text then also welds the pale halo behind
// the "Kingdom of the Sea" lettering onto the coast. The archipelago is added
// by hand instead.
const UP = 1;

const result = await page.evaluate(async (src, UP) => {
  const img = new Image();
  img.src = src;
  await img.decode();

  // Work upscaled. The Bay of a Thousand Scales is painted as 4–8 px specks in
  // the source; at 1:1 any morphology strong enough to clear the wave hatching
  // also erases the entire archipelago.
  const W = img.width * UP;
  const H = img.height * UP;
  const c = document.getElementById('c');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;

  // The illustration sits inside a painted orange border with a pale washed
  // rim just inside it. 26 px clears the rim while still leaving room above
  // the Ice Kingdom's north coast, which reaches y=36.
  const M = 26 * UP;

  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };

  // Measured from the artwork: open water sits at blue−red 67..120, while
  // every land tone — including the near-white glacier of the Ice Kingdom —
  // stays under 25.
  const isOcean = (r, g, b) => b - r > 35;
  // The decorative border, rgb(216,117,72). No painted terrain is this red
  // relative to its green; the desert is (247,212,131).
  const isFrame = (r, g, b) => r - g > 60 && b < 140;
  // Ink: the wave hatching, coastline stroke and label lettering. Near-black
  // and unsaturated, which no painted terrain here is.
  const isInk = (r, g, b) =>
    Math.max(r, g, b) < 100 && Math.max(r, g, b) - Math.min(r, g, b) < 45;

  let land = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < M || y < M || x >= W - M || y >= H - M) continue;
      const [r, g, b] = at(x, y);
      if (isOcean(r, g, b) || isInk(r, g, b) || isFrame(r, g, b)) continue;
      land[y * W + x] = 1;
    }
  }

  // --- morphology -------------------------------------------------------
  const dilate = (src, k) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let hit = 0;
        for (let dy = -k; dy <= k && !hit; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -k; dx <= k; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            if (src[yy * W + xx]) {
              hit = 1;
              break;
            }
          }
        }
        out[y * W + x] = hit;
      }
    }
    return out;
  };
  const erode = (src, k) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let all = 1;
        for (let dy = -k; dy <= k && all; dy++) {
          const yy = y + dy;
          for (let dx = -k; dx <= k; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W || yy < 0 || yy >= H || !src[yy * W + xx]) {
              all = 0;
              break;
            }
          }
        }
        out[y * W + x] = all;
      }
    }
    return out;
  };

  // Close: swallow label text and the black coastline stroke sitting on land.
  land = erode(dilate(land, 4 * UP), 4 * UP);
  // Open: clear the wave hatching and the decorative dragon vignettes.
  land = dilate(erode(land, 3 * UP), 3 * UP);

  // --- connected components --------------------------------------------
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!land[s] || label[s] !== -1) continue;
    const id = comps.length;
    let count = 0;
    stack.push(s);
    label[s] = id;
    const cells = [];
    while (stack.length) {
      const p = stack.pop();
      cells.push(p);
      count++;
      const x = p % W;
      const y = (p / W) | 0;
      const push = (xx, yy) => {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return;
        const q = yy * W + xx;
        if (land[q] && label[q] === -1) {
          label[q] = id;
          stack.push(q);
        }
      };
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    comps.push({ id, count, cells });
  }
  comps.sort((a, b) => b.count - a.count);

  // --- boundary trace (Moore neighbourhood) -----------------------------
  function trace(cells) {
    const set = new Set(cells);
    let start = cells[0];
    for (const p of cells) {
      const y = (p / W) | 0;
      const sy = (start / W) | 0;
      if (y < sy || (y === sy && p % W < start % W)) start = p;
    }
    const dirs = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ];
    const out = [];
    let cur = start;
    let dir = 0;
    const guard = cells.length * 8 + 1000;
    for (let step = 0; step < guard; step++) {
      const x = cur % W;
      const y = (cur / W) | 0;
      out.push([x, y]);
      let found = false;
      for (let i = 0; i < 8; i++) {
        const d = (dir + 6 + i) % 8;
        const nx = x + dirs[d][0];
        const ny = y + dirs[d][1];
        const q = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && set.has(q)) {
          cur = q;
          dir = d;
          found = true;
          break;
        }
      }
      if (!found) break;
      if (cur === start && out.length > 8) break;
    }
    return out;
  }

  // --- Douglas–Peucker ---------------------------------------------------
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const work = [[0, pts.length - 1]];
    while (work.length) {
      const [a, b] = work.pop();
      let best = -1;
      let bestD = eps;
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best > 0) {
        keep[best] = 1;
        work.push([a, best], [best, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  // Median colour per component: a real island is painted green or tan, while
  // the white halo behind an ocean label like "Kingdom of the Sea" is pale and
  // colourless. Without this the label reads as a landmass.
  function medianColour(cells) {
    const rs = [], gs = [], bs = [];
    const step = Math.max(1, Math.floor(cells.length / 400));
    for (let i = 0; i < cells.length; i += step) {
      const [r, g, b] = at(cells[i] % W, (cells[i] / W) | 0);
      rs.push(r); gs.push(g); bs.push(b);
    }
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    return [med(rs), med(gs), med(bs)];
  }

  const shapes = comps
    .filter((c) => c.count > 120 * UP * UP)
    .slice(0, 80)
    .map((c) => {
      const [r, g, b] = medianColour(c.cells);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      return {
        area: c.count,
        colour: [r, g, b],
        // Painted terrain is warm and saturated. This rejects the pale halo
        // behind the "Kingdom of the Sea" lettering (blue-white), the red
        // dragon vignettes in the margins (r far above g), and the grey
        // border ornaments (no chroma at all).
        painted: r - b > 5 && r < g + 30 && chroma >= 20,
        ring: simplify(trace(c.cells), 1.5 * UP),
      };
    });

  // Coarse ASCII view so the classification can be eyeballed.
  const cols = 92;
  const rows = 40;
  let ascii = '';
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const x = Math.round((q / (cols - 1)) * (W - 1));
      const y = Math.round((r / (rows - 1)) * (H - 1));
      ascii += land[y * W + x] ? '#' : '.';
    }
    ascii += '\n';
  }

  // Overlay the traced rings on the source art so the fit can be checked.
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  for (const s of shapes) {
    ctx.strokeStyle = s.painted ? '#c1121f' : '#7a7a7a';
    ctx.beginPath();
    s.ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }
  const overlay = c.toDataURL('image/png');

  return { W, H, M, UP, shapes, ascii, overlay };
}, IMG, UP);

await browser.close();

writeFileSync(
  'reference/trace-overlay.png',
  Buffer.from(result.overlay.split(',')[1], 'base64'),
);
delete result.overlay;

if (SHOW_ASCII) console.log(result.ascii);

console.log(
  `image ${result.W}x${result.H}, margin ${result.M}, ${result.shapes.length} shapes`,
);
for (const s of result.shapes.slice(0, 16)) {
  const xs = s.ring.map((p) => p[0]);
  const ys = s.ring.map((p) => p[1]);
  console.log(
    `  ${s.painted ? 'LAND' : 'skip'} area ${String(s.area).padStart(6)}` +
      `  pts ${String(s.ring.length).padStart(4)}` +
      `  rgb(${s.colour.join(',')})` +
      `  bbox x ${Math.min(...xs)}..${Math.max(...xs)} y ${Math.min(...ys)}..${Math.max(...ys)}`,
  );
}

// ---------------------------------------------------------------------------
// Normalise: the continent's own bounding box drives the scale, so the world
// keeps the proportions the artist drew.
// ---------------------------------------------------------------------------
const keep = result.shapes.filter((s) => s.painted);
if (keep.length === 0) throw new Error('no land components survived filtering');

const all = keep.flatMap((s) => s.ring);
const minX = Math.min(...all.map((p) => p[0]));
const maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1]));
const maxY = Math.max(...all.map((p) => p[1]));

const { W, H, M } = result;
const inX0 = M;
const inX1 = W - M;
const inY0 = M;
const inY1 = H - M;
const interiorW = inX1 - inX0;
const interiorH = inY1 - inY0;

// Image y runs down; map y runs north.
const norm = (ring) =>
  ring.map(([x, y]) => [
    +((x - inX0) / interiorW).toFixed(4),
    +(1 - (y - inY0) / interiorH).toFixed(4),
  ]);

const MILES_TO_M = 1609.344;
const CONTINENT_EW_MILES = 2800;
const metresPerPixel = (CONTINENT_EW_MILES * MILES_TO_M) / (maxX - minX);

console.log('\ncontinent bbox px:', {
  x: [minX, maxX],
  y: [minY, maxY],
  w: maxX - minX,
  h: maxY - minY,
  aspect: +((maxX - minX) / (maxY - minY)).toFixed(4),
});
console.log('metres per pixel:', Math.round(metresPerPixel));
console.log('world width  m:', Math.round(interiorW * metresPerPixel));
console.log('world height m:', Math.round(interiorH * metresPerPixel));
console.log(
  'continent N-S miles:',
  Math.round(((maxY - minY) * metresPerPixel) / MILES_TO_M),
);

const out = {
  worldWidthM: Math.round(interiorW * metresPerPixel),
  worldHeightM: Math.round(interiorH * metresPerPixel),
  rings: keep
    .sort((a, b) => b.area - a.area)
    .map((s) => ({ area: s.area, colour: s.colour, ring: norm(s.ring) })),
};
writeFileSync('reference/coast.json', JSON.stringify(out, null, 1));
console.log('wrote reference/coast.json');
