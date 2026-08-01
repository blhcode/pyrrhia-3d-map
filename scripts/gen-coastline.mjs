// Emits src/data/coastline.ts from the traced outline in reference/coast.json,
// plus the Bay of a Thousand Scales archipelago and the NightWing island, which
// are added by hand (see below).
//
// Run scripts/trace-coast.mjs first.
import { readFileSync, writeFileSync } from 'node:fs';

const traced = JSON.parse(readFileSync('reference/coast.json', 'utf8'));

const MAP_MARGIN = 26;
const MAP_IN_W = 548;
const MAP_IN_H = 404;
const px = (x, y) => [
  +((x - MAP_MARGIN) / MAP_IN_W).toFixed(4),
  +(1 - (y - MAP_MARGIN) / MAP_IN_H).toFixed(4),
];

/**
 * The Bay of a Thousand Scales, read off reference/crop-sea.png.
 *
 * These are drawn as 4–12 px specks on the source plate. The tracer cannot keep
 * them: the morphological closing needed to swallow label lettering is larger
 * than the islands themselves. Each entry is [centreX, centreY, radiusX,
 * radiusY, rotationDeg] in map pixels.
 */
const BAY_ISLANDS = [
  [457, 152, 8, 4, -25],
  [479, 151, 11, 4, 5],
  [494, 155, 3.5, 2.5, 0],
  [506, 163, 7, 5, -35],
  [440, 167, 4, 6, 10],
  [436, 185, 4, 5, -10],
  [484, 192, 3, 2.5, 0],
  [477, 202, 3.5, 3, 0],
  [449, 208, 5, 4.5, 20],
  [475, 211, 2.5, 2.5, 0],
  [465, 221, 4.5, 4, -15],
  [483, 219, 3, 2.5, 0],
  [450, 228, 3, 2.5, 0],
];

/**
 * The NightWing volcano. Deliberately absent from the published map — the
 * tribe kept it secret until The Dark Secret — so it is placed from the text:
 * a volcanic island off the south-east coast, tunnel-linked to the rainforest.
 */
const NIGHTWING = [478, 390, 13, 9, -15];

// Deterministic wobble so the islands read as painted land, not as ellipses.
function blob([cx, cy, rx, ry, rot], seed, steps = 14) {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const rad = (rot * Math.PI) / 180;
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = 0.78 + rand() * 0.44;
    const ex = Math.cos(a) * rx * k;
    const ey = Math.sin(a) * ry * k;
    ring.push(
      px(cx + ex * Math.cos(rad) - ey * Math.sin(rad), cy + ex * Math.sin(rad) + ey * Math.cos(rad)),
    );
  }
  ring.push(ring[0]);
  return ring;
}

/**
 * Chaikin corner-cutting. The Moore-neighbourhood march produces axis-aligned
 * stair-steps (pixel edges). Two passes of this leave the silhouette intact
 * while rounding those stairs into a coastline that reads as a coastline.
 */
function chaikin(ring, passes = 2) {
  let pts = ring.slice();
  // Drop the closing duplicate for processing; re-add at the end.
  if (
    pts.length > 1 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1]
  ) {
    pts = pts.slice(0, -1);
  }
  for (let p = 0; p < passes; p++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  // Round and close.
  const out = pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
  out.push(out[0]);
  return out;
}

const mainland = chaikin(traced.rings[0].ring, 2);

// Smaller traced components: coastal fragments the tracer split off the
// mainland (the eastern arm's outer shore, mostly). Keep them as land.
const fragments = traced.rings.slice(1).map((r) => chaikin(r.ring, 2));

const islands = BAY_ISLANDS.map((spec, i) => blob(spec, i + 1));
const nightwing = blob(NIGHTWING, 99, 18);

const fmt = (ring, indent) =>
  ring.map(([x, y]) => `${indent}[${x}, ${y}],`).join('\n');

const fmtList = (rings, name, doc) =>
  `${doc}\nexport const ${name}: NormPoint[][] = [\n` +
  rings.map((r) => `  [\n${fmt(r, '    ')}\n  ],`).join('\n') +
  `\n];\n`;

const out = `/**
 * Coastline of Pyrrhia, traced from the canonical Mike Schley map.
 *
 * GENERATED — do not edit by hand.
 *   node scripts/trace-coast.mjs && node scripts/gen-coastline.mjs
 *
 * The tracer classifies the painted plate into land and water, cleans up the
 * wave hatching and label lettering, and marches the boundary of each landmass.
 * The result is the actual silhouette the books print: the Ice Kingdom head in
 * the north-west, the Sky Kingdom sweeping north-east into the wing, the
 * Kingdom of the Sea bitten out of the east coast, and the Rainforest running
 * along the southern flank.
 *
 * Coordinates are normalised 0..1, origin south-west, +x east, +y north.
 * Rings are closed (first point repeated at the end).
 */

export type NormPoint = [number, number];

/** Outer mainland coastline. ${mainland.length - 1} traced vertices. */
export const MAINLAND: NormPoint[] = [
${fmt(mainland, '  ')}
];

${fmtList(
  fragments,
  'COASTAL_FRAGMENTS',
  `/**\n * Offshore fragments the tracer separated from the mainland — chiefly the outer\n * shore of the eastern arm, where the painted coastline stroke pinches the\n * landmass in two.\n */`,
)}
${fmtList(
  islands,
  'TAIL_ISLANDS',
  `/**\n * Bay of a Thousand Scales — the archipelago forming the dragon's tail, and the\n * SeaWings' home waters. Placed by hand: on the source plate these are 4–12 px\n * specks that no cleanup pass can preserve.\n */`,
)}
/** NightWing volcanic island, off the south-east coast. Never shown on the map. */
export const NIGHTWING_ISLAND: NormPoint[] = [
${fmt(nightwing, '  ')}
];

/** All land polygons for containment tests and rasterisation. */
export const ALL_LAND: NormPoint[][] = [
  MAINLAND,
  ...COASTAL_FRAGMENTS,
  NIGHTWING_ISLAND,
  ...TAIL_ISLANDS,
];
`;

writeFileSync('src/data/coastline.ts', out);
console.log(
  `wrote src/data/coastline.ts — mainland ${mainland.length - 1} pts, ` +
    `${fragments.length} fragments, ${islands.length} bay islands`,
);
