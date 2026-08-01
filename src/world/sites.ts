import { LANDMARKS, type Landmark } from '../data/landmarks';

export type SiteKind =
  | 'palace'
  | 'city'
  | 'town'
  | 'village'
  | 'hut'
  | 'ruin'
  | 'cave'
  | 'none';

/** Who built the place, and therefore what size everything in it is. */
export type Occupant = 'dragon' | 'scavenger';

/** The module every building at a site is measured in. */
export interface BuildUnits {
  /** Median building footprint, metres. */
  span: number;
  /** Median building height, metres. */
  rise: number;
}

/**
 * Architecture follows the body that has to fit inside it.
 *
 * A scavenger stands 1.7 m, and stacks two storeys into a cottage about 8 m
 * across and 5 m to the ridge. An adult dragon is some 18 m nose to tail with
 * a wingspan to match, and needs a hall it can walk into, turn round in and
 * open its wings: nearer 26 m across and 13 m to the roof, all on one floor.
 *
 * So a dragon building covers around three times the ground of a human one and
 * stands two and a half times as tall — not the ten-to-one you get by naively
 * comparing a dragon's length to a human's height, because humans answer the
 * same need by building upwards. Where the ten-to-one does show up is in the
 * settlement as a whole: dragons need landing room and wing clearance between
 * their halls, so a dragon town sprawls several times wider than a human one
 * housing the same number, which is what the radii below encode.
 */
export const BUILD_UNITS: Record<Occupant, BuildUnits> = {
  dragon: { span: 26, rise: 13 },
  scavenger: { span: 8, rise: 5 },
};

export interface SiteSpec {
  kind: SiteKind;
  /** Built extent in metres. */
  radius: number;
  /** Wall / stone colour. */
  wall: number;
  /** Roof colour. */
  roof: number;
  walled: boolean;
  occupant: Occupant;
  /** Building module for this site's occupant. */
  units: BuildUnits;
}

/**
 * Buildings follow the terrain's vertical exaggeration, but damped.
 *
 * At the full 15× a 150 m tower becomes a 2.3 km needle and a town reads as a
 * bed of nails. Damping keeps architecture tall enough to stand out against
 * exaggerated hills while still looking like architecture, and collapses to
 * exactly 1× when the slider is at true scale.
 */
export function buildingVertScale(vertScale: number): number {
  return Math.pow(Math.max(1, vertScale), 0.4);
}

/** Height of the tallest structure, in true metres, used to frame the camera. */
export function siteTopHeight(spec: SiteSpec): number {
  const { rise } = spec.units;
  switch (spec.kind) {
    case 'palace':
      return spec.radius * 0.5;
    case 'city':
    case 'town':
      return rise * 9;
    case 'village':
      return rise * 7;
    case 'hut':
      return rise * 1.6;
    case 'ruin':
      return rise * 6;
    case 'cave':
      return spec.radius * 0.55;
    default:
      return 0;
  }
}

/**
 * How big each place is on the ground, and what it is made of.
 *
 * Radii are read from the books where they say anything useful (the Scorpion
 * Den is a sprawling walled city, the IceWing villages are hamlets) and are
 * otherwise typical for the type. Note how much smaller the scavenger entries
 * are: a human town covering the same ground as a dragon one would have to
 * hold sixty times the population.
 */
const OVERRIDES: Record<string, Partial<SiteSpec>> = {
  'sand-stronghold': {
    kind: 'palace',
    radius: 520,
    wall: 0xe0bf78,
    roof: 0xb56a32,
    walled: true,
  },
  'scorpion-den': { kind: 'city', radius: 1500, walled: true, wall: 0xe0bf78, roof: 0xb56a32 },
  possibility: { kind: 'city', radius: 1250, walled: false, wall: 0xd9b981, roof: 0xa86a38 },
  'lost-city-of-night': { kind: 'ruin', radius: 1400 },
  'jade-mountain-academy': { kind: 'cave', radius: 400 },
  'under-the-mountain': { kind: 'cave', radius: 220 },
  'nightwing-volcano': { kind: 'cave', radius: 500 },
  sanctuary: { kind: 'town', radius: 700 },
  // Seventeen soldiers in a cave in a cliff, no other dragons for miles.
  'skywing-outpost': { kind: 'cave', radius: 170 },
  // Human cliff-top city: stone, and a fraction of the footprint a dragon
  // city of the same standing would need.
  'indestructible-city': {
    kind: 'city',
    radius: 240,
    walled: true,
    wall: 0x9d9285,
    roof: 0x6d4b38,
  },
  // Nearly the size of the Indestructible City, and walled like it.
  'safe-harbor': {
    kind: 'city',
    radius: 200,
    walled: true,
    wall: 0x9d9285,
    roof: 0x6d4b38,
  },
  talisman: { kind: 'town', radius: 150 },
  valor: { kind: 'cave', radius: 90 },
  'jerboa-hut': { kind: 'hut', radius: 45 },
  'prickles-hut': { kind: 'hut', radius: 45 },
  'vultures-compound': { kind: 'palace', radius: 260, walled: true },
  'deep-palace': { kind: 'palace', radius: 520 },
  'bay-thousand-scales': { kind: 'none', radius: 0 },
  'great-five-tail-river': { kind: 'none', radius: 0 },
  'diamond-spray-river': { kind: 'none', radius: 0 },
  'winding-tail-river': { kind: 'none', radius: 0 },
  'diamond-spray-delta': { kind: 'village', radius: 600 },
  'great-ice-cliff': { kind: 'none', radius: 0 },
  'disputed-tundra': { kind: 'none', radius: 0 },
  'north-beach': { kind: 'none', radius: 0 },
  'beetle-kingdom': { kind: 'ruin', radius: 500 },
  'leaf-kingdom': { kind: 'ruin', radius: 500 },
  harmony: { kind: 'ruin', radius: 400 },
  // Pre-Scorching human empires: stone-built capitals, shown at their seat.
  'cottonmouth-empire': { kind: 'town', radius: 200, wall: 0xa2988a, roof: 0x6d4b38 },
  'diamond-empire': { kind: 'town', radius: 200, wall: 0xb4b2ad, roof: 0x5f6570 },
  'jaguar-empire': { kind: 'town', radius: 200, wall: 0xb8a37e, roof: 0x6b5a3a },
  'blaze-fortress': { kind: 'palace', radius: 300, walled: true },
  'blister-hideout': { kind: 'village', radius: 260 },
  // A NightWing camp patched into the old ruins, so it takes their dark stone
  // rather than the desert palette its position would otherwise pick up.
  renewal: { kind: 'village', radius: 300, wall: 0x6f6a63, roof: 0x4a453f },
};

/** Regional palettes — IceWing stone is not MudWing stone. */
function palette(lm: Landmark): { wall: number; roof: number } {
  const nx = lm.pos[0];
  const ny = lm.pos[1];

  // Ice Kingdom — the head. Pale glacial stone, blue-grey roofs of ice.
  if (ny > 0.66 && nx < 0.33) return { wall: 0xe8f2fc, roof: 0x7eb0d8 };
  // Rainforest — timber and green thatch.
  if (ny < 0.42 && nx > 0.46 && nx < 0.8) return { wall: 0xa07848, roof: 0x3f7a32 };
  // Mud Kingdom.
  if (nx > 0.52 && ny > 0.34 && ny < 0.7) return { wall: 0x8c6f4a, roof: 0x5a4228 };
  // Sea Kingdom / the tail.
  if (nx > 0.78) return { wall: 0xd4ebe8, roof: 0x2f8a96 };
  // Kingdom of Sand — warm sandstone (checked before Sky so the desert edge
  // of Possibility and the Stronghold stay sand-coloured).
  if (nx < 0.48 && ny < 0.7) return { wall: 0xe0bf78, roof: 0xb56a32 };
  // Sky Kingdom — grey mountain stone, terracotta roofs.
  return { wall: 0xb0aaa2, roof: 0x8a4e34 };
}

export function siteSpec(lm: Landmark): SiteSpec {
  const pal = palette(lm);
  const dragon = { occupant: 'dragon' as const, units: BUILD_UNITS.dragon };

  let base: SiteSpec;
  switch (lm.group) {
    case 'palace':
      base = {
        kind: 'palace',
        radius: 380,
        wall: pal.wall,
        roof: pal.roof,
        walled: true,
        ...dragon,
      };
      break;
    case 'settlement':
      base = {
        kind: 'village',
        radius: 320,
        wall: pal.wall,
        roof: pal.roof,
        walled: false,
        ...dragon,
      };
      break;
    case 'human':
      // A scavenger den is a knot of huts you could walk across in a minute,
      // not a dragon town — the regional dragon palette does not apply either,
      // since these are built of timber and thatch.
      base = {
        kind: 'village',
        radius: 125,
        wall: 0xbda478,
        roof: 0x7a6134,
        walled: false,
        occupant: 'scavenger',
        units: BUILD_UNITS.scavenger,
      };
      break;
    case 'ruin':
      base = {
        kind: 'ruin',
        radius: 350,
        wall: 0x6f6a63,
        roof: 0x4a453f,
        walled: false,
        ...dragon,
      };
      break;
    default:
      // Mountains and rivers are terrain, not architecture.
      base = { kind: 'none', radius: 0, wall: pal.wall, roof: pal.roof, walled: false, ...dragon };
      break;
  }

  const merged = { ...base, ...OVERRIDES[lm.id] };
  // An override may change who lives there, so the units are settled last.
  return { ...merged, units: BUILD_UNITS[merged.occupant] };
}

export const SITE_SPECS = new Map<string, SiteSpec>(
  LANDMARKS.map((lm) => [lm.id, siteSpec(lm)]),
);
