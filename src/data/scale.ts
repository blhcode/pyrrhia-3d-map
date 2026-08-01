/**
 * Pyrrhia real-world scale, derived from in-book travel times.
 *
 * Canon does not publish distances. Tui has casually compared Pyrrhia to
 * North America; NightWings claim it covers "a third of the world" (impossible
 * with Earth-like climates). We therefore calibrate from journey times.
 *
 * Flight model (mixed dragonet party — SeaWing/MudWing pace dominates):
 *   cruise  ≈ 20 mph  (32 km/h)   — Rouxzee size-chart cruise for slower tribes
 *   flying  ≈ 12 h/day             — sleep + meals
 *   daily range ≈ 240 miles = 386.24 km
 *
 * Anchors from the text:
 *   1. MudWing palace → Rainforest edge ≈ "a day's flight"
 *      (The Dark Secret / Starflight) → 386 km
 *   2. Scarlet's palace → Diamond Spray Delta < 2 days, partly by river
 *      (The Dragonet Prophecy) → ~580 km effective / ~360 mi fan estimate
 *   3. Diamond Spray Delta → nearest Bay of a Thousand Scales island ≈ 4 days
 *      (The Lost Heir) → ~1,545 km
 *   4. Pantala Cicada→Wasp Hive ≈ 2–3 days; Pyrrhia≃many× larger; oceans ≈ 1 week
 *
 * On the Mike Schley map, (1) is ~9% of the snout→tail axis and (2) is ~13% of
 * the SW-foot→wing-tip axis. Solving both consistently gives a continent
 * 2,800 miles across, east to west — contiguous-US coast-to-coast.
 *
 * That single number sets everything else. The traced coastline spans 475 of
 * the map's 548 usable pixels horizontally, so one map pixel is 2800/475
 * miles, and the world box is the full map frame at that scale. The continent
 * then works out 2,276 miles north to south, which is an independent check:
 * it was never fitted, it just falls out of the proportions of the drawing,
 * and it lands within 4% of the 2,200 miles the travel-time anchors imply.
 *
 * Scene units: 1 Three.js unit = 1 metre. Map frame centred on the origin.
 */

import { MAP_IN_H, MAP_IN_W } from './mapref';

export const MILES_TO_M = 1609.344;
export const KM_TO_M = 1000;

/** Mixed-party daily flight range used for all calibrations. */
export const DAILY_RANGE_M = 240 * MILES_TO_M; // 386,242.56 m

/** East–west span of the traced landmass, in map pixels. */
const CONTINENT_PX_W = 475;
/** The one calibrated quantity; everything below is derived from it. */
export const CONTINENT_EW_MILES = 2800;

export const MILES_PER_MAP_PX = CONTINENT_EW_MILES / CONTINENT_PX_W; // ≈ 5.895

export const WORLD_WIDTH_M = MAP_IN_W * MILES_PER_MAP_PX * MILES_TO_M;  // ≈ 5,198,689 m
export const WORLD_HEIGHT_M = MAP_IN_H * MILES_PER_MAP_PX * MILES_TO_M; // ≈ 3,832,610 m

/** Half-extents — continent is centred on (0,0). */
export const HALF_W = WORLD_WIDTH_M / 2;
export const HALF_H = WORLD_HEIGHT_M / 2;

/** Jade Mountain — tallest peak on modern Pyrrhia (Agate destroyed ~2000 yrs ago). */
export const JADE_MOUNTAIN_ELEV_M = 5200;

/** Typical Claws of the Clouds ridge elevation. */
export const CLAWS_RIDGE_ELEV_M = 3400;

/** Sea level / ocean floor visual depth under the water plane. */
export const OCEAN_FLOOR_M = -800;

/**
 * Convert normalised map coords (0..1, origin SW, +x east, +y north)
 * into centred world metres (x east, z south — Three.js Y-up).
 */
export function normToWorld(nx: number, ny: number): { x: number; z: number } {
  return {
    x: nx * WORLD_WIDTH_M - HALF_W,
    z: -(ny * WORLD_HEIGHT_M - HALF_H), // +ny (north) → −z
  };
}

export function worldToNorm(x: number, z: number): { nx: number; ny: number } {
  return {
    nx: (x + HALF_W) / WORLD_WIDTH_M,
    ny: (-z + HALF_H) / WORLD_HEIGHT_M,
  };
}

export function formatDistance(metres: number): string {
  const abs = Math.abs(metres);
  if (abs >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${metres.toFixed(0)} m`;
}

export function formatMiles(metres: number): string {
  return `${(metres / MILES_TO_M).toFixed(0)} mi`;
}
