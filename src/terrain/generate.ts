import { NIGHTWING_ISLAND, TAIL_ISLANDS } from '../data/coastline';
import { px } from '../data/mapref';
import { OCEAN_FLOOR_M, worldToNorm } from '../data/scale';
import { clamp01, distanceToPolyline, fbm, mix, ridged, smoothstep } from './noise';
import { KINGDOM_ORDER, rasterizeMasks } from './rasterize';
import { carveWater, type WaterData } from './water';

/**
 * Claws of the Clouds Mountains.
 *
 * The plate draws them as a hook rather than a line. A snow-capped arm runs
 * east–west a few miles inland of the north coast; at the SkyWing palace it
 * turns south-west and becomes the grey spine that carries the whole length of
 * the continent down to Jade Mountain. That northern arm is the "relentless
 * line" of snow-tipped peaks Starflight sees standing behind the cliffs when
 * he makes landfall in The Dark Secret.
 */
const CLAWS_SPINE: ReadonlyArray<readonly [number, number]> = [
  px(410, 96),
  px(392, 88),
  px(372, 87),
  px(352, 94),
  px(336, 108),
  px(322, 128),
  px(310, 150),
  px(300, 175),
  px(288, 200),
  px(276, 228),
  px(266, 254),
  px(258, 280),
  px(252, 302),
  px(248, 322),
];

/**
 * The lower brown ridge the plate runs down the massif's eastern flank, from
 * the Diamond Spray headwaters to the cliffs above the Indestructible City.
 * Forested to the crest, unlike the bare rock to the west of it.
 */
const DIAMOND_RIDGE: ReadonlyArray<readonly [number, number]> = [
  px(322, 186),
  px(316, 212),
  px(312, 238),
  px(312, 264),
  px(318, 288),
];

/**
 * The north-coast escarpment: the band of pink cliff the plate paints from the
 * north-western cape across to where the snow line starts. "A coast lined with
 * jagged cliffs, steep and rocky and plunging straight into the sea."
 */
const NORTH_CLIFFS: ReadonlyArray<readonly [number, number]> = [
  px(276, 96),
  px(292, 86),
  px(310, 80),
  px(330, 78),
  px(348, 80),
];

/**
 * Darkstalker's Teeth — the sharp range that walls the Talon Peninsula, and
 * the lost city of night on it, off from the Kingdom of Sand.
 */
const TEETH_SPINE: ReadonlyArray<readonly [number, number]> = [
  px(158, 328),
  px(151, 336),
  px(144, 345),
  px(138, 355),
];

/** Ice Kingdom highland ridge, along the jagged peaks drawn across the dome. */
const ICE_SPINE: ReadonlyArray<readonly [number, number]> = [
  px(106, 60),
  px(126, 62),
  px(146, 66),
  px(166, 62),
  px(181, 76),
  px(190, 98),
  px(197, 118),
];

export const JADE_MOUNTAIN_NORM: readonly [number, number] = px(250, 320);

/** Latitude of the Great Ice Cliff, read off the map. */
const GREAT_ICE_CLIFF_NY = px(168, 174)[1];

/** Index of the Ice Kingdom in KINGDOM_ORDER, for the snow line. */
const K_ICE = 1;

/**
 * What the ground of one kingdom is made of.
 *
 * These used to be a switch on the kingdom a texel fell in, which meant the
 * desert became tundra in the width of a single pixel. They are now weights
 * that get mixed (see `rasterizeMasks`), so every field here has to be
 * something it makes sense to average with its neighbours.
 */
interface Biome {
  /** Elevation of flat ground, metres. */
  flat: number;
  /** Extra relief, scaled by the broad noise field. */
  relief: number;
  /** GPU detail amplitude, metres. */
  amp: number;
  /**
   * Detail frequency in cycles/km. The sign picks the noise kind — positive
   * for ridged crests, negative for rolling dunes and hills.
   */
  freq: number;
  /** Ground colour at the low and high ends of the medium noise. */
  c0: readonly [number, number, number];
  c1: readonly [number, number, number];
  /**
   * Share of the ground under closed canopy. The plate paints its forests as
   * ranks of little trees, so here they are trees: the albedo below is the
   * soil and undergrowth, and `Forests` grows the canopy on top of it.
   */
  forest: number;
}

/** Indexed by KINGDOM_ORDER; 0 is land no kingdom claims. */
const BIOMES: readonly Biome[] = [
  // Unclaimed coast and the Bay islands — temperate grass and stands of wood.
  {
    flat: 30,
    relief: 120,
    amp: 45,
    freq: -0.18,
    c0: [0.34, 0.47, 0.28],
    c1: [0.47, 0.55, 0.34],
    forest: 0.45,
  },
  // Ice: snowfield over rock, with conifers only on the south-western arm.
  {
    flat: 220,
    relief: 620,
    amp: 95,
    freq: 0.035,
    c0: [0.86, 0.92, 0.97],
    c1: [0.86, 0.92, 0.97],
    forest: 0.1,
  },
  // Sand: dunes and hardpan.
  {
    flat: 150,
    relief: 240,
    amp: 55,
    freq: -0.3,
    c0: [0.84, 0.71, 0.44],
    c1: [0.72, 0.58, 0.34],
    forest: 0.02,
  },
  // Sky: high pasture and bare mountain, heavily wooded on the eastern side.
  // The plate's green here is the conifers; the ground underneath is dirt and
  // dry grass.
  {
    flat: 420,
    relief: 780,
    amp: 190,
    freq: 0.055,
    c0: [0.42, 0.4, 0.28],
    c1: [0.5, 0.46, 0.3],
    forest: 0.55,
  },
  // Mud: marsh and wet meadow, with stands of swamp timber.
  {
    flat: 12,
    relief: 70,
    amp: 12,
    freq: -0.09,
    c0: [0.38, 0.36, 0.22],
    c1: [0.46, 0.42, 0.26],
    forest: 0.35,
  },
  // Rain: unbroken jungle. The ground is leaf litter and damp earth — the
  // green lives in the trees, not the albedo, so a clearing looks like dirt.
  {
    flat: 80,
    relief: 300,
    amp: 85,
    freq: -0.13,
    c0: [0.28, 0.27, 0.16],
    c1: [0.36, 0.34, 0.2],
    forest: 0.95,
  },
  // Night: black lava. Two thousand years of eruptions took nearly all the
  // trees; what is left are the bare, twisted ones on the slopes.
  {
    flat: 60,
    relief: 120,
    amp: 70,
    freq: 0.09,
    c0: [0.22, 0.18, 0.21],
    c1: [0.22, 0.18, 0.21],
    forest: 0.08,
  },
];

export interface TerrainData {
  size: number;
  /**
   * RGBA float texture data.
   *  R = base elevation in metres (negative = seabed)
   *  G = GPU detail amplitude in metres
   *  B = detail frequency in cycles/km; sign selects the noise kind
   *      (positive = ridged crests, negative = rolling fbm)
   *  A = land mask (1 land, 0 ocean)
   */
  data: Float32Array;
  /** RGBA8 albedo. */
  albedo: Uint8Array<ArrayBuffer>;
  /** Canopy density, 0–255, sampled by the forest scatterer. */
  forest: Uint8Array;
  kingdom: Uint8Array;
  maxElevation: number;
  minElevation: number;
  /** River and lake surfaces cut into the heightfield, for the water meshes. */
  water: WaterData;
}

function islandCentre(poly: ReadonlyArray<readonly [number, number]>): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p[0];
    sy += p[1];
  }
  return [sx / poly.length, sy / poly.length];
}

const ISLAND_CENTRES = TAIL_ISLANDS.map(islandCentre);
const NIGHTWING_CENTRE = islandCentre(NIGHTWING_ISLAND);

function setColor(
  albedo: Uint8Array,
  i: number,
  r: number,
  g: number,
  b: number,
): void {
  albedo[i * 4] = Math.max(0, Math.min(255, Math.round(r * 255)));
  albedo[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
  albedo[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  albedo[i * 4 + 3] = 255;
}

export async function generateTerrain(
  size = 1024,
  onProgress?: (fraction: number) => void,
): Promise<TerrainData> {
  onProgress?.(0.02);
  await nextFrame();
  const masks = rasterizeMasks(size);
  onProgress?.(0.12);
  await nextFrame();
  const { land, kingdom, coastSDF, weights } = masks;

  const data = new Float32Array(size * size * 4);
  const albedo = new Uint8Array(size * size * 4);
  const forest = new Uint8Array(size * size);

  let maxElevation = -Infinity;
  let minElevation = Infinity;

  for (let j = 0; j < size; j++) {
    if (j % 64 === 0) {
      onProgress?.(0.12 + 0.86 * (j / size));
      await nextFrame();
    }
    const ny = 1 - j / (size - 1); // row 0 = north
    for (let i = 0; i < size; i++) {
      const nx = i / (size - 1);
      const idx = j * size + i;

      const isLand = land[idx] === 1;
      const sdf = coastSDF[idx];
      const kIdx = kingdom[idx];
      const kId = KINGDOM_ORDER[kIdx] ?? 'ocean';
      let canopy = 0;

      // Shared noise fields
      const broad = fbm(nx * 6, ny * 6, 4);
      const medium = fbm(nx * 24, ny * 24, 3);

      let base: number;
      let amp = 0;
      let freq = -0.1;
      let cr = 0;
      let cg = 0;
      let cb = 0;

      if (!isLand) {
        // ---- Seabed: continental shelf, slope, then abyssal plain ----
        const off = -sdf; // positive distance offshore
        const shelf = mix(-25, -190, smoothstep(0, 0.010, off));
        const slope = mix(shelf, -2600, smoothstep(0.010, 0.045, off));
        base = mix(slope, OCEAN_FLOOR_M * 5.2, smoothstep(0.045, 0.14, off));
        base += (broad - 0.5) * 220;

        amp = 0;
        freq = -0.05;

        const depthT = clamp01(-base / 3200);
        cr = mix(0.16, 0.02, depthT);
        cg = mix(0.42, 0.09, depthT);
        cb = mix(0.55, 0.20, depthT);
      } else {
        // ---- Land ----
        const beach = smoothstep(0.0, 0.0035, sdf); // gentle coastal ramp
        const inland = smoothstep(0.002, 0.020, sdf);

        // Mountain influence
        const dClaws = distanceToPolyline(nx, ny, CLAWS_SPINE);
        const dRidge = distanceToPolyline(nx, ny, DIAMOND_RIDGE);
        const dCliffs = distanceToPolyline(nx, ny, NORTH_CLIFFS);
        const dTeeth = distanceToPolyline(nx, ny, TEETH_SPINE);
        const dIce = distanceToPolyline(nx, ny, ICE_SPINE);

        const clawsMask = smoothstep(0.085, 0.004, dClaws);
        const ridgeMask = smoothstep(0.030, 0.003, dRidge);
        const cliffMask = smoothstep(0.018, 0.002, dCliffs);
        const teethMask = smoothstep(0.024, 0.002, dTeeth);
        const iceMask = smoothstep(0.045, 0.005, dIce);
        const mountainMask = clamp01(
          clawsMask + ridgeMask * 0.6 + teethMask * 0.85 + iceMask * 0.55 + cliffMask * 0.3,
        );

        let ridgeNoise = 0;
        if (mountainMask > 0.01) {
          ridgeNoise = ridged(nx * 14, ny * 14, 4);
        }

        // ---- Blended kingdom ground ----
        let flat = 0;
        let relief = 0;
        let freqMag = 0;
        let ridgedShare = 0;
        let forestW = 0;
        let br = 0;
        let bg = 0;
        let bb = 0;
        for (let k = 0; k < BIOMES.length; k++) {
          const w = weights[k][idx];
          if (w <= 0) continue;
          const b = BIOMES[k];
          flat += w * b.flat;
          relief += w * b.relief;
          amp += w * b.amp;
          freqMag += w * Math.abs(b.freq);
          if (b.freq > 0) ridgedShare += w;
          forestW += w * b.forest;
          br += w * mix(b.c0[0], b.c1[0], medium);
          bg += w * mix(b.c0[1], b.c1[1], medium);
          bb += w * mix(b.c0[2], b.c1[2], medium);
        }
        // Magnitude blends; the kind cannot, so the majority wins it. The
        // switch lands where the two are equal, which is also where the
        // amplitude is at its most anonymous.
        freq = ridgedShare > 0.5 ? freqMag : -freqMag;

        let kingdomBase = flat + relief * broad;

        // Great Ice Cliff along the southern IceWing border, at the latitude
        // the map puts it (y = 174 px). Doubling the weight keeps the step
        // full height right up to the border instead of letting the blend
        // grade away the one edge in Pyrrhia that is meant to be an edge.
        kingdomBase +=
          520 *
          clamp01(weights[K_ICE][idx] * 2) *
          Math.exp(-Math.pow((ny - GREAT_ICE_CLIFF_NY) / 0.010, 2));

        // Mountain ranges stacked on top
        const clawsHeight = 4800 * clawsMask * (0.25 + 0.75 * ridgeNoise);
        const ridgeHeight = 1800 * ridgeMask * (0.30 + 0.70 * ridgeNoise);
        const cliffHeight = 900 * cliffMask * (0.45 + 0.55 * ridgeNoise);
        const teethHeight = 2800 * teethMask * (0.25 + 0.75 * ridgeNoise);
        const iceHeight = 2100 * iceMask * (0.30 + 0.70 * ridgeNoise);

        // Jade Mountain — tallest peak in Pyrrhia
        const dJade = Math.hypot(nx - JADE_MOUNTAIN_NORM[0], ny - JADE_MOUNTAIN_NORM[1]);
        const jade = 6200 * Math.exp(-Math.pow(dJade / 0.022, 2));

        // Island cones (Bay of a Thousand Scales)
        let islandCone = 0;
        if (kIdx === 0) {
          for (const [cx, cy] of ISLAND_CENTRES) {
            const d = Math.hypot(nx - cx, ny - cy);
            if (d < 0.05) islandCone = Math.max(islandCone, 320 * Math.exp(-Math.pow(d / 0.014, 2)));
          }
        }
        // NightWing volcano: cone minus caldera
        let volcanoH = 0;
        if (kId === 'night') {
          const d = Math.hypot(nx - NIGHTWING_CENTRE[0], ny - NIGHTWING_CENTRE[1]);
          volcanoH =
            2900 * Math.exp(-Math.pow(d / 0.013, 2)) -
            1500 * Math.exp(-Math.pow(d / 0.0042, 2));
        }

        base =
          (kingdomBase +
            clawsHeight +
            ridgeHeight +
            cliffHeight +
            teethHeight +
            iceHeight +
            jade +
            islandCone +
            volcanoH) *
          beach;
        base += medium * 60 * inland;
        base = Math.max(base, 3 * beach);

        // Detail amplitude grows sharply in the ranges
        amp = mix(amp, 240 + 760 * mountainMask, clamp01(mountainMask * 1.4));
        if (mountainMask > 0.15) freq = 0.048;
        amp *= beach;

        // ---- Albedo ----
        const elev = base;
        const rockT = smoothstep(1100, 2600, elev);

        // Snow arrives two ways. Altitude puts it on the peaks, over a snow
        // line that climbs by 1,700 m between the ice cap and the rainforest —
        // which is why the plate's mountains are white at the north end of the
        // Claws and bare grey rock by the time they reach Jade Mountain.
        const snowLine = mix(3600, 1900, smoothstep(0.30, 0.92, ny));
        const alt = smoothstep(snowLine, snowLine + 1100, elev);

        // Latitude and nearness to the Ice Kingdom put it on the flat, and it
        // arrives as drifts before it arrives as cover: the desert goes patchy
        // white over a long approach and is solid by the time you are inside.
        const nearIce = clamp01(weights[K_ICE][idx] * 1.3);
        const polar = smoothstep(0.66, 0.92, ny) * 0.7;
        const cover = Math.max(nearIce, polar);
        const drift = smoothstep(0.32, 0.72, fbm(nx * 38 + 11, ny * 38 + 7, 3));
        const snowT = clamp01(Math.max(alt, cover * mix(drift, 1, cover)));

        // beaches at the waterline
        const sand = 1 - smoothstep(0.0004, 0.0026, sdf);
        br = mix(br, 0.86, sand * 0.85);
        bg = mix(bg, 0.79, sand * 0.85);
        bb = mix(bb, 0.58, sand * 0.85);

        // exposed rock then snow with altitude
        br = mix(br, 0.42, rockT * 0.8);
        bg = mix(bg, 0.39, rockT * 0.8);
        bb = mix(bb, 0.36, rockT * 0.8);

        cr = mix(br, 0.97, snowT);
        cg = mix(bg, 0.98, snowT);
        cb = mix(bb, 1.0, snowT);

        // The plate paints the Talon Peninsula green even though it sits
        // inside the Kingdom of Sand's political border — the old Night
        // Kingdom's forests, not desert. A local bump on top of the blended
        // kingdom weight puts the canopy back without inventing a seventh
        // kingdom for a spit of land.
        const dTalon = Math.hypot(nx - 0.17, ny - 0.12);
        if (dTalon < 0.085) {
          forestW = Math.max(forestW, 0.75 * smoothstep(0.085, 0.03, dTalon));
        }

        // Nothing grows on bare rock, above the tree line, under snow, or in
        // the surf. Everything left is forest.
        canopy = clamp01(
          forestW *
            (1 - smoothstep(1500, 2500, elev)) *
            (1 - snowT) *
            (1 - rockT * 0.7) *
            smoothstep(0.0006, 0.004, sdf),
        );
      }

      data[idx * 4] = base;
      data[idx * 4 + 1] = amp;
      data[idx * 4 + 2] = freq;
      data[idx * 4 + 3] = isLand ? 1 : 0;

      setColor(albedo, idx, cr, cg, cb);
      forest[idx] = Math.round(canopy * 255);

      const top = base + amp;
      if (top > maxElevation) maxElevation = top;
      if (base < minElevation) minElevation = base;
    }
  }

  onProgress?.(0.985);
  await nextFrame();
  const water = carveWater(size, data, albedo, land, forest);

  // Carving moves the extremes around, so re-measure them.
  maxElevation = -Infinity;
  minElevation = Infinity;
  for (let i = 0; i < size * size; i++) {
    const b = data[i * 4];
    const top = b + data[i * 4 + 1];
    if (top > maxElevation) maxElevation = top;
    if (b < minElevation) minElevation = b;
  }

  onProgress?.(1);
  return {
    size,
    data,
    albedo,
    forest,
    kingdom,
    maxElevation,
    minElevation,
    water,
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Bilinear sample of the base elevation (metres) at normalised coords. */
export function sampleBaseElevation(t: TerrainData, nx: number, ny: number): number {
  return sampleChannel(t, nx, ny, 0);
}

/** Bilinear sample of the detail amplitude (metres). */
export function sampleDetailAmp(t: TerrainData, nx: number, ny: number): number {
  return sampleChannel(t, nx, ny, 1);
}

function sampleChannel(t: TerrainData, nx: number, ny: number, c: number): number {
  const { size, data } = t;
  const x = Math.max(0, Math.min(size - 1.001, nx * (size - 1)));
  const y = Math.max(0, Math.min(size - 1.001, (1 - ny) * (size - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v00 = data[(y0 * size + x0) * 4 + c];
  const v10 = data[(y0 * size + x1) * 4 + c];
  const v01 = data[(y1 * size + x0) * 4 + c];
  const v11 = data[(y1 * size + x1) * 4 + c];
  return (
    v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty
  );
}

/**
 * Conservative ground height used for camera collision.
 * The fine relief lives on the GPU, so we bias upward by most of the detail
 * amplitude rather than trying to reproduce the shader noise exactly.
 */
export function sampleGroundCeiling(t: TerrainData, nx: number, ny: number): number {
  return sampleBaseElevation(t, nx, ny) + 0.85 * sampleDetailAmp(t, nx, ny);
}

// ---------------------------------------------------------------------------
// Exact CPU mirror of the vertex shader's displacement (material.ts).
//
// sampleGroundCeiling is deliberately conservative — fine for keeping a camera
// out of a hillside, useless for seating a building flush on the ground. These
// reproduce the shader's noise bit for bit so structures touch the surface the
// player actually sees. Detail fade is assumed 1: buildings only draw at close
// range, where every patch is past full refinement.
// ---------------------------------------------------------------------------

function glslMod(x: number, y: number): number {
  return x - y * Math.floor(x / y);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function dhash(px: number, py: number): number {
  const x = glslMod(px, 2048);
  const y = glslMod(py, 2048);
  return fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
}

function dvnoise(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = dhash(ix, iy);
  const b = dhash(ix + 1, iy);
  const c = dhash(ix, iy + 1);
  const d = dhash(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

function dfbm(px: number, py: number): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    s += a * dvnoise(px, py);
    n += a;
    px *= 2.03;
    py *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

function dridge(px: number, py: number): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    let v = 1 - Math.abs(dvnoise(px, py) * 2 - 1);
    v *= v;
    s += a * v;
    n += a;
    px *= 2.07;
    py *= 2.07;
    a *= 0.5;
  }
  return s / n;
}

/**
 * True rendered surface height in metres (before vertical exaggeration) at a
 * world XZ position.
 */
export function sampleSurfaceHeight(t: TerrainData, wx: number, wz: number): number {
  const { nx, ny } = worldToNorm(wx, wz);
  const base = sampleChannel(t, nx, ny, 0);
  const amp = sampleChannel(t, nx, ny, 1);
  if (amp <= 0.5) return base;

  const freq = sampleChannel(t, nx, ny, 2);
  const f = Math.abs(freq);
  const px = wx * 0.001 * f;
  const py = wz * 0.001 * f;
  const n = freq > 0 ? dridge(px, py) : dfbm(px, py);
  return base + (n - 0.45) * amp;
}

/** Canopy density 0..1 at normalised coords — nearest texel, no filtering. */
export function sampleForest(t: TerrainData, nx: number, ny: number): number {
  const { size, forest } = t;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return 0;
  const i = Math.max(0, Math.min(size - 1, Math.round(nx * (size - 1))));
  const j = Math.max(0, Math.min(size - 1, Math.round((1 - ny) * (size - 1))));
  return forest[j * size + i] / 255;
}

export function sampleKingdomId(t: TerrainData, nx: number, ny: number): string {
  const { size, kingdom } = t;
  const i = Math.max(0, Math.min(size - 1, Math.round(nx * (size - 1))));
  const j = Math.max(0, Math.min(size - 1, Math.round((1 - ny) * (size - 1))));
  const k = kingdom[j * size + i];
  if (k === 0) {
    return sampleChannel(t, nx, ny, 3) > 0.5 ? 'sea' : 'ocean';
  }
  return KINGDOM_ORDER[k];
}
