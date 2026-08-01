/**
 * Noise used to build the continent.
 *
 * `detailNoise*` functions are mirrored in GLSL (see material.ts) so the GPU can
 * add sub-texel relief that the CPU-side heightmap is too coarse to store.
 * The CPU copies here are only used for ground-clearance estimates, so small
 * float precision differences between JS `Math.sin` and GLSL `sin` are fine.
 */

const HASH_WRAP = 2048;

export function hash21(x: number, y: number): number {
  const px = ((x % HASH_WRAP) + HASH_WRAP) % HASH_WRAP;
  const py = ((y % HASH_WRAP) + HASH_WRAP) % HASH_WRAP;
  const s = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Standard fractal brownian motion, result 0..1. */
export function fbm(x: number, y: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(px, py);
    norm += amp;
    px *= 2.03;
    py *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Ridged multifractal — sharp crests, good for mountain ranges. Result 0..1. */
export function ridged(x: number, y: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < octaves; i++) {
    let v = 1 - Math.abs(valueNoise(px, py) * 2 - 1);
    v *= v;
    sum += amp * v;
    norm += amp;
    px *= 2.07;
    py *= 2.07;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Domain-warped fbm — breaks up the obvious lattice of plain value noise. */
export function warpedFbm(x: number, y: number, strength = 0.6): number {
  const wx = fbm(x + 5.2, y + 1.3, 3);
  const wy = fbm(x + 9.7, y + 4.1, 3);
  return fbm(x + strength * (wx * 2 - 1), y + strength * (wy * 2 - 1), 5);
}

/** Distance from (x,y) to a polyline, in the same units as the points. */
export function distanceToPolyline(
  x: number,
  y: number,
  pts: ReadonlyArray<readonly [number, number]>,
): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / len2));
    const dx = x - (ax + t * abx);
    const dy = y - (ay + t * aby);
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
