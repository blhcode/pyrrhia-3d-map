import type { NormPoint } from './coastline';
import { px } from './mapref';

export type LandmarkGroup =
  | 'palace'
  | 'settlement'
  | 'human'
  | 'mountain'
  | 'water'
  | 'ruin';

export interface Landmark {
  id: string;
  name: string;
  /** Short blurb shown in the landmark list. */
  blurb: string;
  /** Normalised map position (0..1, origin SW, +x east, +y north). */
  pos: NormPoint;
  /** Suggested teleport altitude in metres AGL. */
  altitude: number;
  group: LandmarkGroup;
}

export interface GroupMeta {
  id: LandmarkGroup;
  label: string;
  /** Marker / chip colour. */
  color: string;
}

/**
 * Sites important enough to stay named from full-continent orbit — the ones a
 * printed map of Pyrrhia would label.
 */
const MAJOR = new Set([
  'ice-palace',
  'sand-stronghold',
  'sky-palace',
  'mud-palace',
  'summer-palace',
  'deep-palace',
  'rainwing-royal-pavilion',
  'scorpion-den',
  'possibility',
  'sanctuary',
  'jade-mountain-academy',
  'jade-mountain',
  'claws-of-the-clouds',
  'nightwing-volcano',
  'lost-city-of-night',
  'great-ice-cliff',
  'great-five-tail-river',
  'diamond-spray-river',
  'diamond-spray-delta',
  'winding-tail-river',
  'moorhens-lake',
  'talon-peninsula',
  'bay-thousand-scales',
  'indestructible-city',
]);

/** Sites only worth naming once you are actually flying over them. */
const MINOR = new Set([
  'vultures-compound',
  'rainwing-wingery',
  'rainwing-healers-pavilion',
  'jerboa-hut',
  'prickles-hut',
  'among-the-evergreens',
  'hamlet-whales-sing',
  'where-the-terns-fly',
  'where-whales-leap',
  'village-plentiful-seals',
  'venerate-caribou',
  'no-dragon-goes-hungry',
  'great-diamond',
  'nightwing-palace-old',
  'nightwing-school',
  'nightwing-library',
  'nightwing-museum',
  'darkstalkers-home',
  'clearsights-home',
  'borderland-mountain',
  'north-beach',
  'ruins-of-valor',
]);

/** 1 = label from orbit, 2 = regional, 3 = close range only. */
export function labelRank(id: string): 1 | 2 | 3 {
  if (MAJOR.has(id)) return 1;
  if (MINOR.has(id)) return 3;
  return 2;
}

/** Distance in metres beyond which a landmark of each rank stops drawing. */
export const RANK_RANGE_M: Record<1 | 2 | 3, number> = {
  1: 9_000_000,
  2: 1_600_000,
  3: 350_000,
};

export const LANDMARK_GROUPS: GroupMeta[] = [
  { id: 'palace', label: 'Palaces', color: '#f0c14a' },
  { id: 'settlement', label: 'Dragon settlements', color: '#63d0a0' },
  { id: 'human', label: 'Human settlements', color: '#e88b5a' },
  { id: 'mountain', label: 'Mountains', color: '#d8dde4' },
  { id: 'water', label: 'Rivers & landforms', color: '#5ab6e8' },
  { id: 'ruin', label: 'Ruins & lost places', color: '#b184e0' },
];

/**
 * Every named Pyrrhian location from the wiki's location index.
 *
 * Positions are map pixels on the canonical arc-2 plate. Anything that plate
 * labels — the two palaces, Burn's Stronghold, the Scorpion Den, Jade
 * Mountain, the Diamond Spray delta and river, the two scavenger dens — is
 * read straight off the artwork.
 *
 * The plate is not the only map, though, and it is the sparsest. Mike Schley
 * redrew Pyrrhia for A Guide to the Dragon World with roughly three times as
 * many labels, and that map is what fixes Sanctuary, Possibility, the
 * Indestructible City, Safe Harbor, Queen Moorhen's Lake, the ruins of the
 * Summer Palace and the old Night Kingdom on the Talon Peninsula. Where the
 * two maps show the same place, the plate wins, since that is the geometry
 * everything else here is traced from. Anything neither map plots is placed
 * from its description in the books and is approximate by nature.
 *
 * `scripts/check-placement.mjs` verifies none of them ends up in the sea, and
 * `scripts/audit-map.mjs` draws them back onto the plate to be eyeballed.
 */
export const LANDMARKS: Landmark[] = [
  // ───────────────────────────── Palaces ─────────────────────────────
  {
    id: 'ice-palace',
    name: 'IceWing Palace',
    blurb: 'Queen Snowfall’s seat in the far north, home of the gift of light.',
    pos: px(129, 64),
    altitude: 2500,
    group: 'palace',
  },
  {
    id: 'sand-stronghold',
    name: 'SandWing Stronghold',
    blurb: 'Queen Thorn’s palace — built for defence, not beauty.',
    pos: px(177, 267),
    altitude: 2000,
    group: 'palace',
  },
  {
    id: 'sky-palace',
    name: 'SkyWing Palace',
    blurb: 'Queen Ruby’s palace high in the northern mountains.',
    pos: px(357, 103),
    altitude: 3200,
    group: 'palace',
  },
  {
    id: 'mud-palace',
    name: 'MudWing Palace',
    blurb: 'Queen Moorhen’s palace on the shore of her lake, south of the delta.',
    pos: px(375, 305),
    altitude: 1600,
    group: 'palace',
  },
  {
    id: 'summer-palace',
    name: 'Ruins of the Summer Palace',
    blurb:
      'Canopy-hidden SeaWing pavilion on a Bay island; burned by Burn’s army in the war.',
    pos: px(457, 152),
    altitude: 1200,
    group: 'palace',
  },
  {
    id: 'deep-palace',
    name: 'Deep Palace',
    blurb: 'Queen Coral’s underwater capital, built of coral in a canyon.',
    pos: px(466, 206),
    altitude: 900,
    group: 'palace',
  },
  {
    id: 'island-palace',
    name: 'Island Palace',
    blurb: 'Above-water SeaWing palace for guests and parties; long abandoned.',
    pos: px(479, 151),
    altitude: 1200,
    group: 'palace',
  },
  {
    id: 'rainwing-royal-pavilion',
    name: 'RainWing Royal Pavilion',
    blurb: 'Queen Glory’s court, halfway between the Rain and Night villages.',
    pos: px(390, 365),
    altitude: 1500,
    group: 'palace',
  },

  // ──────────────────────── Dragon settlements ────────────────────────
  {
    id: 'scorpion-den',
    name: 'Scorpion Den',
    blurb: 'Sprawling walled city of criminals and hybrids; former Outclaws base.',
    pos: px(190, 302),
    altitude: 1500,
    group: 'settlement',
  },
  {
    id: 'vultures-compound',
    name: 'Vulture’s Compound',
    blurb: 'Mine-and-trap-lined fortress of the Talons of Power, inside the Den.',
    pos: px(197, 296),
    altitude: 1400,
    group: 'settlement',
  },
  {
    id: 'possibility',
    name: 'Possibility',
    blurb:
      'All-tribes town straddling the Great Five-Tail River — SandWing west bank, SkyWing east.',
    pos: px(217, 257),
    altitude: 1600,
    group: 'settlement',
  },
  {
    id: 'skywing-outpost',
    name: 'Northern SkyWing Outpost',
    blurb:
      'Cliff-top guardhouse watching the northern sea for IceWings; Morrowseer’s test in The Dark Secret.',
    pos: px(340, 84),
    altitude: 1400,
    group: 'settlement',
  },
  {
    id: 'sanctuary',
    name: 'Sanctuary',
    blurb: 'Talons of Peace town in the Claws of the Clouds foothills.',
    pos: px(272, 266),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'jade-mountain-academy',
    name: 'Jade Mountain Academy',
    blurb: 'Intertribal school founded by the dragonets of destiny.',
    pos: px(249, 322),
    altitude: 6500,
    group: 'settlement',
  },
  {
    id: 'rainwing-village',
    name: 'RainWing Village',
    blurb: 'Canopy village of hammocks and sun-time platforms.',
    pos: px(400, 372),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'nightwing-village',
    name: 'NightWing Village',
    blurb: 'The tribe’s home after the Exodus, beside the RainWing village.',
    pos: px(378, 358),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'rainwing-wingery',
    name: 'RainWing Wingery',
    blurb: 'Fortified play area for Rain and Night dragonets.',
    pos: px(394, 357),
    altitude: 1500,
    group: 'settlement',
  },
  {
    id: 'rainwing-healers-pavilion',
    name: 'Healer’s Pavilion',
    blurb: 'RainWing healing hut in the rainforest canopy.',
    pos: px(384, 372),
    altitude: 1500,
    group: 'settlement',
  },
  {
    id: 'renewal',
    name: 'Renewal',
    blurb: 'Fierceteeth’s encampment of twenty-seven NightWings among the old ruins.',
    pos: px(135, 364),
    altitude: 1600,
    group: 'settlement',
  },
  {
    id: 'among-the-evergreens',
    name: 'Among-the-Evergreens',
    blurb: 'IceWing village in the boreal forest.',
    pos: px(112, 126),
    altitude: 2000,
    group: 'settlement',
  },
  {
    id: 'hamlet-whales-sing',
    name: 'Hamlet-That-Worships-the-Whales-Who-Sing-at-Night',
    blurb: 'IceWing coastal hamlet with the longest name in Pyrrhia.',
    pos: px(98, 84),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'where-the-terns-fly',
    name: 'Where-the-Terns-Fly',
    blurb: 'IceWing village on the western ice shelf.',
    pos: px(88, 100),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'where-whales-leap',
    name: 'Where-the-Whales-Leap-at-Dawn',
    blurb: 'IceWing village on the eastern coast of the head.',
    pos: px(192, 112),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'village-plentiful-seals',
    name: 'Village-of-the-Plentiful-Seals',
    blurb: 'IceWing sealing village on the northern shore.',
    pos: px(151, 60),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'venerate-caribou',
    name: 'We-Remember-and-Venerate-Caribou',
    blurb: 'IceWing village of the inland tundra herds.',
    pos: px(172, 132),
    altitude: 1900,
    group: 'settlement',
  },
  {
    id: 'no-dragon-goes-hungry',
    name: 'Where-No-Dragon-Goes-Hungry',
    blurb: 'IceWing village near the southern fishing grounds.',
    pos: px(140, 152),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'jerboa-hut',
    name: 'Jerboa III’s Hut',
    blurb: 'Palm-frond hut in a quiet cove on the north-west desert coast.',
    pos: px(122, 217),
    altitude: 1000,
    group: 'settlement',
  },
  {
    id: 'prickles-hut',
    name: 'Prickle’s Hut',
    blurb: 'Burned-down hut beside a five-palm pool in the desert.',
    pos: px(214, 284),
    altitude: 1000,
    group: 'settlement',
  },
  {
    id: 'blaze-fortress',
    name: 'Blaze’s Fortress',
    blurb: 'War-era SandWing fortress near the Ice Kingdom border.',
    pos: px(156, 190),
    altitude: 1800,
    group: 'settlement',
  },
  {
    id: 'blister-hideout',
    name: 'Blister’s Hideout',
    blurb: 'Blister’s hidden war camp among the Bay islands.',
    pos: px(449, 208),
    altitude: 1400,
    group: 'settlement',
  },

  // ───────────────────────── Human settlements ─────────────────────────
  {
    id: 'indestructible-city',
    name: 'Indestructible City',
    blurb:
      'Cliff-top city of the Invincible Lord. Dragon maps mark it only as the largest scavenger den in Pyrrhia.',
    pos: px(325, 284),
    altitude: 2000,
    group: 'human',
  },
  {
    id: 'talisman',
    name: 'Talisman',
    blurb: 'Small town of the dragonmancers, south of the SkyWing palace.',
    pos: px(350, 142),
    altitude: 2200,
    group: 'human',
  },
  {
    id: 'valor',
    name: 'Valor',
    blurb: 'Underground human city of tunnels below the southern Claws of the Clouds.',
    pos: px(250, 305),
    altitude: 1800,
    group: 'human',
  },
  {
    id: 'ruins-of-valor',
    name: 'Ruins of Valor',
    blurb:
      'The burned surface town on the Sand–Jade Mountain border; dragons call it the scavenger ruins.',
    pos: px(236, 316),
    altitude: 1700,
    group: 'ruin',
  },
  {
    id: 'safe-harbor',
    name: 'Safe Harbor',
    blurb:
      'Walled human town on the east coast, nearly the size of the Indestructible City. Blister burned it.',
    pos: px(483, 283),
    altitude: 1600,
    group: 'human',
  },
  {
    id: 'cottonmouth-empire',
    name: 'Cottonmouth’s Empire',
    blurb: 'Pre-Scorching human empire of pine slopes and mountain villages.',
    pos: px(304, 134),
    altitude: 2400,
    group: 'human',
  },
  {
    id: 'diamond-empire',
    name: 'Diamond Empire',
    blurb: 'Cold pre-Scorching empire north of Cottonmouth’s, behind the range.',
    pos: px(338, 92),
    altitude: 2600,
    group: 'human',
  },
  {
    id: 'jaguar-empire',
    name: 'Jaguar Empire',
    blurb: 'Pre-Scorching empire of bays, islands and rock pools.',
    pos: px(396, 239),
    altitude: 1600,
    group: 'human',
  },

  // ────────────────────────────── Mountains ──────────────────────────────
  {
    id: 'jade-mountain',
    name: 'Jade Mountain',
    blurb: 'Twin fang-shaped peaks; tallest mountain in modern Pyrrhia.',
    pos: px(250, 320),
    altitude: 7000,
    group: 'mountain',
  },
  {
    id: 'agate-mountain',
    name: 'Agate Mountain',
    blurb: 'Once the tallest peak; collapsed ~2,000 years ago over Darkstalker’s cave.',
    pos: px(272, 296),
    altitude: 4200,
    group: 'mountain',
  },
  {
    id: 'claws-of-the-clouds',
    name: 'Claws of the Clouds Mountains',
    blurb: 'The spine of the continent, running north-east through the Sky Kingdom.',
    pos: px(300, 168),
    altitude: 5000,
    group: 'mountain',
  },
  {
    id: 'darkstalkers-teeth',
    name: 'Darkstalker’s Teeth',
    blurb: 'Sharp-edged range walling the lost city off from the Kingdom of Sand.',
    pos: px(152, 336),
    altitude: 2600,
    group: 'mountain',
  },
  {
    id: 'borderland-mountain',
    name: 'Borderland Mountain',
    blurb: 'Peak in the lower reaches of the old NightWing palace.',
    pos: px(133, 351),
    altitude: 2400,
    group: 'mountain',
  },
  {
    id: 'nightwing-volcano',
    name: 'NightWing Volcano',
    blurb:
      'The tribe’s abandoned island fortress above the lava, a day’s flight north of the Sky Kingdom.',
    pos: px(345, 42),
    altitude: 3500,
    group: 'mountain',
  },
  {
    id: 'under-the-mountain',
    name: 'Under the Mountain',
    blurb: 'The cave where the dragonets of destiny were raised for six years.',
    pos: px(254, 244),
    altitude: 2200,
    group: 'mountain',
  },

  // ───────────────────── Rivers, deltas and landforms ─────────────────────
  {
    id: 'great-ice-cliff',
    name: 'Great Ice Cliff',
    blurb: 'Animus-carved wall along the Ice–Sand border.',
    pos: px(168, 174),
    altitude: 1800,
    group: 'water',
  },
  {
    id: 'disputed-tundra',
    name: 'Disputed Tundra',
    blurb: 'Barren wasteland contested by IceWings and SandWings.',
    pos: px(160, 190),
    altitude: 1800,
    group: 'water',
  },
  {
    id: 'great-five-tail-river',
    name: 'Great Five-Tail River',
    blurb:
      'The most disputed ground in Pyrrhia — SandWings west bank, SkyWings east, Possibility in the middle.',
    pos: px(214, 250),
    altitude: 1500,
    group: 'water',
  },
  {
    id: 'diamond-spray-river',
    name: 'Diamond Spray River',
    blurb: 'Second-longest river; runs from the SkyWing palace to the sea.',
    pos: px(340, 190),
    altitude: 1600,
    group: 'water',
  },
  {
    id: 'diamond-spray-delta',
    name: 'Diamond Spray Delta',
    blurb: 'Where the lowest-born MudWings live, on the east coast.',
    pos: px(376, 231),
    altitude: 1400,
    group: 'water',
  },
  {
    id: 'winding-tail-river',
    name: 'Winding Tail River',
    blurb:
      'Silver river down the east flank of the Claws of the Clouds, past Jade Mountain to the sea.',
    pos: px(283, 330),
    altitude: 1500,
    group: 'water',
  },
  {
    id: 'moorhens-lake',
    name: 'Queen Moorhen’s Lake',
    blurb: 'The great lake of the Mud Kingdom, with the MudWing palace on its shore.',
    pos: px(363, 314),
    altitude: 1400,
    group: 'water',
  },
  {
    id: 'talon-peninsula',
    name: 'Talon Peninsula',
    blurb: 'Clawed spit south-west of the desert; what is left of the old Night Kingdom.',
    pos: px(118, 378),
    altitude: 1600,
    group: 'water',
  },
  {
    id: 'bay-thousand-scales',
    name: 'Bay of a Thousand Scales',
    blurb: 'Spiral archipelago of hundreds of islands — the dragon’s tail.',
    pos: px(470, 190),
    altitude: 2200,
    group: 'water',
  },
  {
    id: 'north-beach',
    name: 'North Beach',
    blurb:
      'Boulder-strewn beach at the peninsula’s north end, facing the Kingdom of Sand across the bay.',
    pos: px(134, 351),
    altitude: 1000,
    group: 'water',
  },

  // ─────────────────── Ruins: the lost city of night ───────────────────
  // The old Night Kingdom is not on the arc-2 plate at all — the tribe left it
  // two thousand years before the war and it was forgotten. A Guide to the
  // Dragon World finally plots it as the "Abandoned Ancient NightWing Palace"
  // on the Talon Peninsula, south-west of the Kingdom of Sand, ringed by
  // Darkstalker's Teeth. Within the city the Great Diamond runs palace and
  // school to the north, museum and library to the south.
  {
    id: 'lost-city-of-night',
    name: 'Lost City of Night',
    blurb: 'Ruined NightWing capital of canyons and carved caverns, half sunk into the sea.',
    pos: px(128, 359),
    altitude: 1800,
    group: 'ruin',
  },
  {
    id: 'great-diamond',
    name: 'The Great Diamond',
    blurb: 'Diamond formed by the tribe’s four great buildings.',
    pos: px(129, 358),
    altitude: 1600,
    group: 'ruin',
  },
  {
    id: 'nightwing-palace-old',
    name: 'NightWing Palace',
    blurb: 'Queen Vigilance’s towered palace, built into the mountain.',
    pos: px(131, 354),
    altitude: 1600,
    group: 'ruin',
  },
  {
    id: 'nightwing-school',
    name: 'NightWing School',
    blurb: 'Northern point of the Great Diamond; abandoned at the Exodus.',
    pos: px(134, 355),
    altitude: 1500,
    group: 'ruin',
  },
  {
    id: 'nightwing-library',
    name: 'NightWing Library',
    blurb: 'Southern point of the Diamond; Clearsight kept a study here.',
    pos: px(126, 363),
    altitude: 1500,
    group: 'ruin',
  },
  {
    id: 'nightwing-museum',
    name: 'NightWing Museum',
    blurb: 'Fourth of the great buildings of the Diamond.',
    pos: px(130, 362),
    altitude: 1500,
    group: 'ruin',
  },
  {
    id: 'darkstalkers-home',
    name: 'Darkstalker’s Home',
    blurb: 'House of Arctic, Foeslayer, Whiteout and Darkstalker.',
    pos: px(125, 357),
    altitude: 1400,
    group: 'ruin',
  },
  {
    id: 'clearsights-home',
    name: 'Clearsight’s Home',
    blurb: 'Home of Clearsight and Swiftwings in the old city.',
    pos: px(124, 361),
    altitude: 1400,
    group: 'ruin',
  },
  {
    id: 'harmony',
    name: 'Harmony',
    blurb: 'Ancient hybrid refuge in the forests between the Beetle and Leaf Kingdoms.',
    pos: px(404, 312),
    altitude: 1600,
    group: 'ruin',
  },
  {
    id: 'beetle-kingdom',
    name: 'Beetle Kingdom',
    blurb: 'Abandoned BeetleWing territory, split between Sky and Rain.',
    pos: px(462, 288),
    altitude: 2000,
    group: 'ruin',
  },
  {
    id: 'leaf-kingdom',
    name: 'Leaf Kingdom',
    blurb: 'Abandoned LeafWing territory before the flight to Pantala.',
    pos: px(342, 338),
    altitude: 2000,
    group: 'ruin',
  },
];
