import type { NormPoint } from './coastline';
import { px } from './mapref';

export type KingdomId =
  | 'ice'
  | 'sand'
  | 'sky'
  | 'mud'
  | 'rain'
  | 'sea'
  | 'night'
  | 'ocean';

export interface Kingdom {
  id: KingdomId;
  name: string;
  /** Tribe that rules it (modern era, post–Jade Mountain Prophecy). */
  tribe: string;
  /** Approximate territory polygon in normalised coords. */
  polygon: NormPoint[];
  /** Biome tint used on the terrain colour map. */
  color: [number, number, number];
  /** Label colour for HUD / minimap. */
  label: string;
}

/**
 * Kingdom territories traced against the painted regions of the canonical map:
 * the white glacier of the north-west, the pale desert filling the western
 * body, the grey Claws of the Clouds running north-east into the wing, the
 * olive floodplain on the east coast, and the dark green rainforest along the
 * southern flank.
 *
 * Borders deliberately overshoot the coastline. The rasteriser intersects them
 * with the land mask, and overshooting avoids untinted slivers where a border
 * and the coast very nearly coincide.
 */
export const KINGDOMS: Kingdom[] = [
  {
    id: 'ice',
    name: 'Ice Kingdom',
    tribe: 'IceWings · Queen Snowfall',
    color: [0.82, 0.9, 0.96],
    label: '#c8e4f8',
    polygon: [
      px(40, 92),
      px(52, 58),
      px(82, 30),
      px(122, 16),
      px(168, 18),
      px(204, 36),
      px(228, 66),
      px(240, 104),
      px(236, 140),
      px(222, 168),
      px(198, 183),
      px(166, 190),
      px(128, 184),
      px(94, 171),
      px(64, 152),
      px(46, 124),
      px(40, 92),
    ],
  },
  {
    id: 'sand',
    name: 'Kingdom of Sand',
    tribe: 'SandWings · Queen Thorn',
    color: [0.86, 0.74, 0.42],
    label: '#e8c86a',
    polygon: [
      px(46, 148),
      px(94, 172),
      px(142, 187),
      px(188, 191),
      px(222, 188),
      px(240, 208),
      px(250, 243),
      px(259, 278),
      px(268, 308),
      px(272, 332),
      px(252, 350),
      px(220, 357),
      px(190, 352),
      px(162, 342),
      px(142, 352),
      px(126, 375),
      px(104, 396),
      px(80, 398),
      px(74, 374),
      px(82, 346),
      px(86, 316),
      px(78, 284),
      px(66, 248),
      px(54, 208),
      px(46, 148),
    ],
  },
  {
    id: 'sky',
    name: 'Sky Kingdom',
    tribe: 'SkyWings · Queen Ruby',
    color: [0.72, 0.42, 0.32],
    label: '#e07058',
    polygon: [
      px(222, 150),
      px(238, 108),
      px(262, 82),
      px(296, 62),
      px(336, 48),
      px(382, 44),
      px(424, 48),
      px(456, 62),
      px(462, 84),
      px(444, 112),
      px(420, 146),
      px(402, 182),
      px(392, 216),
      px(376, 246),
      px(346, 262),
      px(316, 276),
      px(290, 296),
      px(266, 306),
      px(248, 286),
      px(236, 246),
      px(228, 200),
      px(222, 150),
    ],
  },
  {
    id: 'mud',
    name: 'Mud Kingdom',
    tribe: 'MudWings · Queen Moorhen',
    color: [0.45, 0.52, 0.3],
    label: '#8a9a4a',
    polygon: [
      px(330, 246),
      px(368, 234),
      px(400, 230),
      px(436, 240),
      px(470, 256),
      px(502, 268),
      px(528, 282),
      px(546, 300),
      px(540, 322),
      px(512, 330),
      px(476, 328),
      px(438, 322),
      px(398, 318),
      px(360, 320),
      px(332, 314),
      px(318, 292),
      px(320, 268),
      px(330, 250),
    ],
  },
  {
    id: 'rain',
    name: 'Rainforest Kingdom',
    tribe: 'RainWings · Queen Glory',
    color: [0.18, 0.48, 0.28],
    label: '#3cb86a',
    polygon: [
      px(276, 330),
      px(318, 318),
      px(360, 322),
      px(400, 320),
      px(440, 324),
      px(478, 330),
      px(500, 344),
      px(486, 366),
      px(452, 384),
      px(414, 398),
      px(374, 408),
      px(334, 408),
      px(300, 398),
      px(276, 380),
      px(268, 354),
      px(276, 330),
    ],
  },
  {
    id: 'night',
    name: 'NightWing Island',
    tribe: 'NightWings (former volcanic home)',
    color: [0.28, 0.22, 0.32],
    label: '#a070c0',
    polygon: [
      px(350, 33),
      px(355, 39),
      px(354, 47),
      px(349, 52),
      px(341, 52),
      px(335, 47),
      px(334, 40),
      px(339, 35),
      px(346, 34),
      px(350, 33),
    ],
  },
];

/** Sea Kingdom is mostly ocean — we mark the island cluster for the minimap. */
export const SEA_KINGDOM_META = {
  id: 'sea' as const,
  name: 'Kingdom of the Sea',
  tribe: 'SeaWings · Queen Coral',
  label: '#4aa8d8',
  color: [0.25, 0.55, 0.7] as [number, number, number],
};
