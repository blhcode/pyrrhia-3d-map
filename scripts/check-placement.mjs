// Verifies every landmark sits on land, reports which kingdom polygon it falls
// in, and flags anything offshore with the nearest dry map pixel to move it to.
//
// Usage: node scripts/check-placement.mjs
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['scripts/_placement-entry.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
});
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const { LANDMARKS, ALL_LAND, KINGDOMS: KD, toMapPx, px } = mod;

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const onLand = (nx, ny) => ALL_LAND.some((poly) => inside(poly, nx, ny));

// Territories overlap on purpose. The rasteriser paints them in array order and
// lets later ones win, so the last match is the effective kingdom.
function kingdomOf(nx, ny) {
  let name = '—';
  for (const k of KD) if (inside(k.polygon, nx, ny)) name = k.name;
  return name;
}

/** Nearest dry map pixel, searched in rings, for repositioning suggestions. */
function nearestLand(mx, my) {
  for (let r = 2; r <= 60; r += 2) {
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2;
      const x = mx + Math.cos(t) * r;
      const y = my + Math.sin(t) * r;
      const [nx, ny] = px(x, y);
      if (onLand(nx, ny)) return [Math.round(x), Math.round(y), r];
    }
  }
  return null;
}

const offshore = [];
const rows = [];
for (const lm of LANDMARKS) {
  const [nx, ny] = lm.pos;
  const [mx, my] = toMapPx(nx, ny);
  const land = onLand(nx, ny);
  // Underwater and island sites are meant to be offshore.
  const marine = ['deep-palace', 'bay-thousand-scales'].includes(lm.id);
  if (!land && !marine) offshore.push({ lm, mx, my });
  rows.push({
    id: lm.id,
    px: `${Math.round(mx)},${Math.round(my)}`,
    land: land ? 'land' : marine ? 'sea*' : 'SEA ',
    kingdom: kingdomOf(nx, ny),
  });
}

for (const r of rows) {
  console.log(
    `${r.land}  ${r.px.padStart(8)}  ${r.id.padEnd(28)} ${r.kingdom}`,
  );
}

console.log(`\n${LANDMARKS.length} landmarks, ${offshore.length} in open water`);
for (const { lm, mx, my } of offshore) {
  const near = nearestLand(mx, my);
  console.log(
    `  ${lm.id.padEnd(28)} at px(${Math.round(mx)}, ${Math.round(my)})` +
      (near ? ` → nearest land px(${near[0]}, ${near[1]}), ${near[2]}px away` : ' → no land within 60px'),
  );
}
if (offshore.length) process.exitCode = 1;
