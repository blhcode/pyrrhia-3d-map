import type { NormPoint } from './coastline';
import { px } from './mapref';

/**
 * Pyrrhia's inland water, traced off the Mike Schley map.
 *
 * Every centreline below was read from the artwork at 6–7× magnification
 * (see `scripts/trace-rivers.mjs`, which isolates water-coloured pixels that
 * fall inside the coastline). Branches run **mouth first**: index 0 is where
 * the water reaches the sea, and the carver relies on that ordering to make
 * each river run downhill the whole way.
 *
 * A note on width. At the calibrated scale one map pixel is ~9.5 km, so a
 * true-to-life river would be a fifth of a pixel wide and would vanish long
 * before it reached the heightmap. The widths here match the ink on the map
 * instead of reality, which is the only way the rivers read as rivers.
 */
export interface River {
  id: string;
  name: string;
  /** Mouth-first centrelines. Tributaries start at their confluence. */
  branches: NormPoint[][];
  /** Half-width of the water surface at the mouth, in normalised map units. */
  halfWidth: number;
  /** Depth of the cut below the surrounding land, in metres. */
  depth: number;
  /**
   * False for a river that never reaches the coast. Desert rivers on the map
   * simply fade out; without this the carver would drag their last stretch
   * down to sea level and leave a trench in the middle of the sand.
   */
  endsAtSea: boolean;
}

export interface Lake {
  id: string;
  name: string;
  polygon: NormPoint[];
  /** Depth below the shoreline, in metres. */
  depth: number;
}

/**
 * Diamond Spray River — the labelled river on the map, running from the peaks
 * behind Queen Scarlet's palace south-east to the delta on the Mud coast.
 */
const DIAMOND_SPRAY: River = {
  id: 'diamond-spray-river',
  name: 'Diamond Spray River',
  branches: [
    [
      px(383, 229),
      px(373, 224),
      px(362, 219),
      px(352, 212),
      px(345, 202),
      px(340, 190),
      px(336, 175),
      px(334, 160),
      px(335, 145),
      px(336, 128),
      px(333, 112),
    ],
  ],
  halfWidth: 0.0019,
  depth: 240,
  endsAtSea: true,
};

/**
 * Great Five-Tail River — the long meander down the Sand/Sky border, and the
 * most fought-over ground in Pyrrhia: SandWings on the west bank, SkyWings on
 * the east, and Possibility grown together across the middle of it. A Guide to
 * the Dragon World draws it exactly here, running past Queen Thorn's
 * Stronghold with the Claws of the Clouds away to the east.
 *
 * It runs *north*, not south. The water the plate paints at its top end is the
 * head of a sea inlet below the Great Ice Cliff — the unnamed delta the books
 * describe — so that end is the mouth and the whole river drains the high
 * desert into it.
 */
const FIVE_TAIL: River = {
  id: 'great-five-tail-river',
  name: 'Great Five-Tail River',
  branches: [
    [
      px(205, 180),
      px(206, 187),
      px(206, 195),
      px(207, 204),
      px(208, 213),
      px(211, 222),
      px(213, 230),
      px(212, 237),
      px(208, 241),
      px(206, 246),
      px(209, 252),
      px(216, 258),
      px(223, 264),
      px(230, 270),
      px(236, 277),
      px(240, 282),
      px(239, 288),
      px(234, 294),
      px(230, 300),
      px(228, 307),
    ],
  ],
  halfWidth: 0.0015,
  depth: 190,
  endsAtSea: true,
};

/**
 * Winding Tail River — the Sky/Mud border, and the one the plate draws most
 * clearly once you know to look for it. It rises high in the Claws of the
 * Clouds, bends west at the scavenger den the humans call the Indestructible
 * City, then turns south down the eastern flank of the range, passes Jade
 * Mountain on its east side and empties into the southern sea. Traced off the
 * plate at 10x; A Guide to the Dragon World paints the same course in blue.
 */
const WINDING_TAIL: River = {
  id: 'winding-tail-river',
  name: 'Winding Tail River',
  branches: [
    [
      px(265, 365),
      px(270, 359),
      px(276, 355),
      px(281, 351),
      px(282, 344),
      px(283, 337),
      px(284, 330),
      px(285, 322),
      px(287, 315),
      px(290, 309),
      px(295, 305),
      px(301, 302),
      px(307, 301),
      px(313, 298),
      px(318, 294),
      px(323, 288),
      px(327, 283),
      px(329, 275),
      px(332, 266),
      px(334, 258),
    ],
  ],
  halfWidth: 0.0015,
  depth: 190,
  endsAtSea: true,
};

/**
 * The unnamed river network of the Mud Kingdom — the braid of channels the
 * plate paints east of Queen Moorhen's Lake, draining the lowlands into the
 * bay beside the Diamond Spray Delta. The books never name these; the Great
 * Five-Tail, which they do name, is over in the desert.
 */
const MUD_RIVERS: River = {
  id: 'mud-kingdom-rivers',
  name: 'Mud Kingdom Rivers',
  branches: [
    // trunk, mouth first
    [
      px(396, 252),
      px(398, 261),
      px(400, 270),
      px(402, 280),
      px(404, 290),
      px(405, 300),
      px(404, 310),
    ],
    // first tail — east, joining just inland of the mouth
    [px(400, 270), px(410, 276), px(421, 281), px(433, 285), px(445, 288)],
    // second tail — south-east
    [px(402, 280), px(413, 288), px(424, 296), px(435, 305)],
    // third tail — west, skirting the palace lake
    [px(404, 290), px(394, 297), px(385, 305), px(377, 314)],
    // fourth tail — off the head of the stem
    [px(405, 300), px(414, 309), px(421, 319), px(427, 329)],
    // fifth tail — the southernmost, out of the rainforest edge
    [px(404, 310), px(397, 318), px(392, 327), px(388, 336)],
  ],
  halfWidth: 0.0017,
  depth: 170,
  endsAtSea: true,
};

export const RIVERS: readonly River[] = [DIAMOND_SPRAY, FIVE_TAIL, WINDING_TAIL, MUD_RIVERS];

export const LAKES: readonly Lake[] = [
  {
    id: 'moorhens-lake',
    name: 'Queen Moorhen’s Lake',
    polygon: [
      px(355, 306),
      px(360, 303),
      px(367, 304),
      px(371, 309),
      px(372, 316),
      px(369, 322),
      px(363, 323),
      px(357, 319),
      px(355, 313),
    ],
    depth: 120,
  },
];
