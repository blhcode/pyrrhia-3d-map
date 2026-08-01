import type { NormPoint } from '../data/coastline';
import { LAKES, RIVERS } from '../data/rivers';
import { clamp01, mix, smoothstep } from './noise';
import { chamferDistance, createContext, fillPolygons, readMask } from './rasterize';

/** How far either side of a river the land is pulled down into its valley. */
const VALLEY_N = 0.0072;
/** Shore ramp around a lake, in normalised map units. */
const SHORE_N = 0.0055;
/** Lowest a river surface is allowed to sit, so it stays above the sea plane. */
const MIN_RIVER_LEVEL = 6;

/** One point along a river, with the height its water sits at. */
export interface RiverSample {
  nx: number;
  ny: number;
  /** Water surface elevation in metres. */
  level: number;
  /** Half-width of the water surface in normalised map units. */
  halfWidth: number;
}

export interface RiverSurface {
  id: string;
  name: string;
  branches: RiverSample[][];
}

export interface LakeSurface {
  id: string;
  name: string;
  polygon: NormPoint[];
  /** Water surface elevation in metres. */
  level: number;
}

export interface WaterData {
  rivers: RiverSurface[];
  lakes: LakeSurface[];
}

/** Bilinear read of a channel of the packed terrain texture. */
function sampleChannel(
  data: Float32Array,
  size: number,
  nx: number,
  ny: number,
  channel: number,
): number {
  const fx = clamp01(nx) * (size - 1);
  const fy = (1 - clamp01(ny)) * (size - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number) => data[(y * size + x) * 4 + channel];
  return mix(
    mix(at(x0, y0), at(x1, y0), tx),
    mix(at(x0, y1), at(x1, y1), tx),
    ty,
  );
}

/** Chaikin corner-cutting, endpoints pinned. Turns hand-read points into meanders. */
function chaikin(pts: NormPoint[], passes: number): NormPoint[] {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next: NormPoint[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const [ax, ay] = cur[i];
      const [bx, by] = cur[i + 1];
      next.push([ax + (bx - ax) * 0.25, ay + (by - ay) * 0.25]);
      next.push([ax + (bx - ax) * 0.75, ay + (by - ay) * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/** Walk a polyline emitting a point every `step` units of arc length. */
function resample(pts: NormPoint[], step: number): { nx: number; ny: number }[] {
  const out = [{ nx: pts[0][0], ny: pts[0][1] }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg < 1e-12) continue;
    let done = 0;
    while (carry + (seg - done) >= step) {
      done += step - carry;
      const t = done / seg;
      out.push({ nx: ax + (bx - ax) * t, ny: ay + (by - ay) * t });
      carry = 0;
    }
    carry += seg - done;
  }
  const end = pts[pts.length - 1];
  out.push({ nx: end[0], ny: end[1] });
  return out;
}

/** Box blur along a 1D profile, endpoints held. */
function smoothProfile(h: number[], radius: number): void {
  if (h.length < 3) return;
  const src = h.slice();
  for (let i = 1; i < h.length - 1; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(src.length - 1, i + radius);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += src[k];
    h[i] = sum / (hi - lo + 1);
  }
}

/**
 * Cut every river and lake into the finished heightfield.
 *
 * This runs after the main terrain pass rather than inside it because a river
 * has to know the land it is crossing before it can decide what height to run
 * at. Each centreline is sampled against the terrain, the profile is smoothed
 * and then forced to descend all the way to the mouth, so no river ever flows
 * uphill however lumpy the noise underneath happens to be.
 *
 * Mutates `data` and `albedo` in place; returns the water surfaces so the
 * renderer can lay actual water over the channels it just carved.
 */
export function carveWater(
  size: number,
  data: Float32Array,
  albedo: Uint8Array,
  land: Uint8Array,
  /** Canopy density, cleared wherever a channel is cut through it. */
  forest: Uint8Array,
): WaterData {
  const step = 0.75 / size;

  // ---- River centrelines, resampled and profiled ----
  interface Branch {
    river: (typeof RIVERS)[number];
    pts: { nx: number; ny: number }[];
    level: number[];
    /** Half-width of the water surface, per sample. */
    halfWidth: number[];
    /** Depth of the cut below the banks, per sample. */
    depth: number[];
  }
  const branches: Branch[] = [];

  for (const river of RIVERS) {
    const trunkLevels: { nx: number; ny: number; level: number }[] = [];

    river.branches.forEach((raw, bi) => {
      const pts = resample(chaikin([...raw], 2), step);
      const level = pts.map((p) => sampleChannel(data, size, p.nx, p.ny, 0));

      smoothProfile(level, 8);

      // Index 0 is the mouth (or, for a tributary, the confluence). Pin it,
      // then force the profile to climb going upstream.
      if (bi === 0 && river.endsAtSea) {
        level[0] = Math.max(MIN_RIVER_LEVEL, Math.min(level[0], 30));
      } else if (bi > 0) {
        let best = Infinity;
        let bestLevel = level[0];
        for (const t of trunkLevels) {
          const d = (t.nx - pts[0].nx) ** 2 + (t.ny - pts[0].ny) ** 2;
          if (d < best) {
            best = d;
            bestLevel = t.level;
          }
        }
        level[0] = bestLevel;
      }
      for (let i = 1; i < level.length; i++) {
        level[i] = Math.max(level[i], level[i - 1] + 0.4);
      }
      smoothProfile(level, 3);
      for (let i = 1; i < level.length; i++) {
        level[i] = Math.max(level[i], level[i - 1]);
      }

      let total = 0;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i].nx - pts[i - 1].nx, pts[i].ny - pts[i - 1].ny);
        cum.push(total);
      }
      const frac = cum.map((c) => (total > 0 ? c / total : 0));

      // A river gathers water as it runs, so it is widest and deepest at the
      // mouth and dwindles to a thread at its head. Tributaries carry less
      // than the stem they feed.
      const carried = bi === 0 ? 1 : 0.72;
      const halfWidth: number[] = [];
      const depth: number[] = [];
      for (const f of frac) {
        // A river that never reaches the sea has no mouth to speak of: fade it
        // out at the terminus the way the map's ink does.
        const fade = river.endsAtSea ? 1 : Math.min(1, f / 0.1);
        halfWidth.push(river.halfWidth * carried * (0.2 + 0.8 * (1 - f)) * fade);
        depth.push(river.depth * carried * (0.35 + 0.65 * (1 - f)) * fade);
      }

      if (bi === 0) {
        for (let i = 0; i < pts.length; i++) {
          trunkLevels.push({ nx: pts[i].nx, ny: pts[i].ny, level: level[i] });
        }
      }
      branches.push({ river, pts, level, halfWidth, depth });
    });
  }

  // ---- Candidate texels: everything near a centreline ----
  const seed = new Uint8Array(size * size);
  for (const b of branches) {
    for (const p of b.pts) {
      const x = Math.round(clamp01(p.nx) * (size - 1));
      const y = Math.round((1 - clamp01(p.ny)) * (size - 1));
      seed[y * size + x] = 1;
    }
  }
  const riverDist = chamferDistance(seed, size);
  const bandTexels = VALLEY_N * size + 2;

  // ---- Lakes: mask, shore band and surface level ----
  const ctx = createContext(size);
  ctx.clearRect(0, 0, size, size);
  fillPolygons(
    ctx,
    LAKES.map((l) => l.polygon),
    size,
  );
  const lakeMask = readMask(ctx, size);
  const lakeDist = chamferDistance(lakeMask, size);

  const lakeCentres: [number, number][] = [];
  const lakes: LakeSurface[] = LAKES.map((lake) => {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of lake.polygon) {
      cx += x;
      cy += y;
    }
    cx /= lake.polygon.length;
    cy /= lake.polygon.length;
    lakeCentres.push([cx, cy]);

    // Water settles at the low side of the rim, not the average of it.
    const rim = lake.polygon.map(([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return sampleChannel(
        data,
        size,
        x + (dx / len) * SHORE_N,
        y + (dy / len) * SHORE_N,
        0,
      );
    });
    rim.sort((a, b) => a - b);
    const level = Math.max(MIN_RIVER_LEVEL, rim[Math.floor(rim.length * 0.25)] - 20);
    return { id: lake.id, name: lake.name, polygon: lake.polygon, level };
  });

  // ---- Carve ----
  for (let j = 0; j < size; j++) {
    const ny = 1 - j / (size - 1);
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      if (!land[idx]) continue;

      const nearRiver = riverDist[idx] < bandTexels;
      const nearLake = lakeDist[idx] < (SHORE_N + 0.001) * size;
      if (!nearRiver && !nearLake) continue;

      const nx = i / (size - 1);
      let base = data[idx * 4];
      let amp = data[idx * 4 + 1];
      let wet = 0;
      let bank = 0;

      if (nearRiver) {
        // Nearest sample on any centreline. Samples sit under a texel apart,
        // so this is the distance to the line for all practical purposes.
        let bestD2 = Infinity;
        let bestLevel = 0;
        let bestHalf = 0;
        let bestDepth = 0;
        for (const b of branches) {
          for (let k = 0; k < b.pts.length; k++) {
            const dx = b.pts[k].nx - nx;
            const dy = b.pts[k].ny - ny;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestLevel = b.level[k];
              bestHalf = b.halfWidth[k];
              bestDepth = b.depth[k];
            }
          }
        }

        const d = Math.sqrt(bestD2);
        const wall = 0.7 / size;
        const chan = smoothstep(bestHalf + wall, bestHalf - wall, d);
        const valley = 1 - smoothstep(bestHalf, VALLEY_N, d);

        base = mix(base, bestLevel + 30, valley * valley);
        base = mix(base, bestLevel - bestDepth, chan);
        amp *= (1 - chan * 0.96) * mix(1, 0.35, valley);
        wet = chan;
        bank = valley;
      }

      if (nearLake) {
        const inside = lakeMask[idx] === 1;
        let nearest = 0;
        let bestD2 = Infinity;
        for (let l = 0; l < lakeCentres.length; l++) {
          const dx = lakeCentres[l][0] - nx;
          const dy = lakeCentres[l][1] - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            nearest = l;
          }
        }
        const surf = lakes[nearest].level;
        const depth = LAKES[nearest].depth;
        const shore = 1 - smoothstep(0, SHORE_N, lakeDist[idx] / size);

        if (inside) {
          base = surf - depth;
          amp = 0;
          wet = 1;
        } else {
          base = mix(base, surf + 25, shore * shore);
          amp *= mix(1, 0.3, shore);
          bank = Math.max(bank, shore);
        }
      }

      data[idx * 4] = base;
      data[idx * 4 + 1] = amp;

      // Silty bed under the water, lush floodplain either side of it.
      const p = idx * 4;
      let r = albedo[p] / 255;
      let g = albedo[p + 1] / 255;
      let b = albedo[p + 2] / 255;
      const flood = clamp01(bank) * 0.55;
      r = mix(r, 0.24, flood);
      g = mix(g, 0.46, flood);
      b = mix(b, 0.24, flood);
      r = mix(r, 0.10, wet);
      g = mix(g, 0.20, wet);
      b = mix(b, 0.26, wet);
      albedo[p] = Math.round(clamp01(r) * 255);
      albedo[p + 1] = Math.round(clamp01(g) * 255);
      albedo[p + 2] = Math.round(clamp01(b) * 255);
      if (wet > 0) forest[idx] = Math.round(forest[idx] * (1 - wet));
    }
  }

  // ---- Hand the finished surfaces back for meshing ----
  const rivers: RiverSurface[] = RIVERS.map((river) => ({
    id: river.id,
    name: river.name,
    branches: branches
      .filter((b) => b.river === river)
      .map((b) =>
        b.pts.map((p, k) => ({
          nx: p.nx,
          ny: p.ny,
          level: b.level[k],
          halfWidth: b.halfWidth[k],
        })),
      ),
  }));

  return { rivers, lakes };
}
