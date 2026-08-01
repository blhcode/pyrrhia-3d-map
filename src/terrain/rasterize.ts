import type { NormPoint } from '../data/coastline';
import { ALL_LAND } from '../data/coastline';
import { KINGDOMS } from '../data/kingdoms';

export interface Masks {
  size: number;
  /** 1 = land, 0 = ocean. */
  land: Uint8Array;
  /** Kingdom index, 0 = none/ocean. See KINGDOM_ORDER. */
  kingdom: Uint8Array;
  /**
   * Signed distance to the coastline in normalised map units
   * (positive inland, negative offshore).
   */
  coastSDF: Float32Array;
  /**
   * How much of each kingdom's ground shows at every texel, indexed by
   * KINGDOM_ORDER and summing to 1 on land. Index 0 is land no kingdom
   * polygon claims — the Bay islands and the unowned stretches of coast.
   */
  weights: Float32Array[];
}

export const KINGDOM_ORDER = ['ocean', 'ice', 'sand', 'sky', 'mud', 'rain', 'night'] as const;

/**
 * Width of the band over which one kingdom's ground gives way to the next, in
 * normalised map units.
 *
 * Borders on the plate are political, not geological: nothing in the world
 * changes the moment you cross one. 0.05 is a little over 150 miles at this
 * continent's scale, so the desert spends most of a day's flight going
 * gradually white as you approach the Ice Kingdom instead of ending at a line.
 */
const BLEND_NORM = 0.07;

/**
 * Blend weights for every kingdom, from each texel's distance to the nearest
 * ground that kingdom actually holds.
 *
 * A compact quadratic falloff rather than an exponential: it reaches exactly
 * zero at the blend radius, so a kingdom on the far side of the continent
 * contributes nothing at all instead of a vanishing sliver that still costs a
 * multiply. On a border both distances are zero and the two split evenly.
 */
function kingdomWeights(
  kingdom: Uint8Array,
  land: Uint8Array,
  size: number,
): Float32Array[] {
  const n = KINGDOM_ORDER.length;
  const radius = BLEND_NORM * size;
  const cells = size * size;
  const out: Float32Array[] = [];
  const mask = new Uint8Array(cells);

  for (let k = 0; k < n; k++) {
    let any = false;
    for (let i = 0; i < cells; i++) {
      const hit = land[i] === 1 && kingdom[i] === k ? 1 : 0;
      mask[i] = hit;
      if (hit) any = true;
    }
    const w = new Float32Array(cells);
    // chamferDistance on an empty mask returns infinities, which would poison
    // the normalisation below.
    if (!any) {
      out.push(w);
      continue;
    }
    const d = chamferDistance(mask, size);
    for (let i = 0; i < cells; i++) {
      const t = d[i] / radius;
      if (t < 1) w[i] = (1 - t) * (1 - t);
    }
    out.push(w);
  }

  for (let i = 0; i < cells; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += out[k][i];
    if (sum > 0) {
      const inv = 1 / sum;
      for (let k = 0; k < n; k++) out[k][i] *= inv;
    } else {
      // Deep ocean, out of reach of every kingdom. The land branch never reads
      // these, but leaving them all zero would make the blend produce black.
      out[0][i] = 1;
    }
  }

  return out;
}

export function createContext(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export function fillPolygons(
  ctx: CanvasRenderingContext2D,
  polys: NormPoint[][],
  size: number,
): void {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (const poly of polys) {
    poly.forEach(([nx, ny], i) => {
      const x = nx * size;
      const y = (1 - ny) * size; // row 0 = north
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fill();
}

export function readMask(ctx: CanvasRenderingContext2D, size: number): Uint8Array {
  const img = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = img[p] > 127 ? 1 : 0;
  }
  return out;
}

/**
 * Two-pass chamfer distance transform (3-4 kernel).
 * Returns distance in pixels from every cell to the nearest cell where
 * `target` is 1.
 */
export function chamferDistance(target: Uint8Array, size: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(size * size);
  for (let i = 0; i < d.length; i++) d[i] = target[i] ? 0 : INF;

  const D1 = 1;
  const D2 = 1.41421356;

  // forward pass
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let v = d[i];
      if (y > 0) {
        if (x > 0) v = Math.min(v, d[i - size - 1] + D2);
        v = Math.min(v, d[i - size] + D1);
        if (x < size - 1) v = Math.min(v, d[i - size + 1] + D2);
      }
      if (x > 0) v = Math.min(v, d[i - 1] + D1);
      d[i] = v;
    }
  }
  // backward pass
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      let v = d[i];
      if (y < size - 1) {
        if (x < size - 1) v = Math.min(v, d[i + size + 1] + D2);
        v = Math.min(v, d[i + size] + D1);
        if (x > 0) v = Math.min(v, d[i + size - 1] + D2);
      }
      if (x < size - 1) v = Math.min(v, d[i + 1] + D1);
      d[i] = v;
    }
  }
  return d;
}

/**
 * Rasterise the coastline and kingdom polygons into masks.
 * Canvas fill is orders of magnitude faster than per-texel point-in-polygon,
 * which is what made the previous 1024² generation slow.
 */
export function rasterizeMasks(size: number): Masks {
  const ctx = createContext(size);

  // --- land mask ---
  ctx.clearRect(0, 0, size, size);
  fillPolygons(ctx, ALL_LAND, size);
  const land = readMask(ctx, size);

  // --- kingdom mask (one pass per kingdom to avoid antialias bleed) ---
  const kingdom = new Uint8Array(size * size);
  for (let k = 1; k < KINGDOM_ORDER.length; k++) {
    const id = KINGDOM_ORDER[k];
    const def = KINGDOMS.find((x) => x.id === id);
    if (!def) continue;
    ctx.clearRect(0, 0, size, size);
    fillPolygons(ctx, [def.polygon], size);
    const m = readMask(ctx, size);
    for (let i = 0; i < m.length; i++) {
      if (m[i]) kingdom[i] = k;
    }
  }

  // --- signed distance to coast ---
  const ocean = new Uint8Array(size * size);
  for (let i = 0; i < land.length; i++) ocean[i] = land[i] ? 0 : 1;
  const distToOcean = chamferDistance(ocean, size);
  const distToLand = chamferDistance(land, size);

  const coastSDF = new Float32Array(size * size);
  const invSize = 1 / size;
  for (let i = 0; i < coastSDF.length; i++) {
    coastSDF[i] = land[i] ? distToOcean[i] * invSize : -distToLand[i] * invSize;
  }

  return { size, land, kingdom, coastSDF, weights: kingdomWeights(kingdom, land, size) };
}
