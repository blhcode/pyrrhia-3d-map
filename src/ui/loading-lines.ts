/**
 * Flavour text for the loading screen.
 *
 * The bar reports honest progress; these do not. They rotate on a timer while
 * the heightfield builds, because "carving ridges and river valleys" is a much
 * worse thing to read for three seconds than anything below.
 */
export const LOADING_LINES: readonly string[] = [
  'Greeting Queen Glory',
  'Consulting the Dragonet Prophecy',
  'Waking the dragonets under the mountain',
  'Three moons! Nearly there',
  'Talking Clay out of eating the scenery',
  'Asking Peril not to touch anything',
  'Polishing the Eye of Onyx',
  'Losing an argument with Queen Thorn',
  'Hiding the treasure from the scavengers',
  'Teaching Starflight to read in the dark',
  'Counting Tsunami’s siblings',
  'Warning Sunny this may take a moment',
  'Letting the NightWings pretend they foresaw this',
  'Rebuilding Queen Scarlet’s arena. Again',
  'Painting the RainWings a tasteful colour',
  'Distracting Darkstalker',
  'Checking Blister is not behind you',
  'Filling the Summer Palace with steam',
  'Handing out Jade Mountain Academy timetables',
  'Convincing an IceWing to smile',
  'Feeding the MudWing bigwings first',
  'Bribing a SkyWing guard',
  'Untangling the Talons of Peace',
  'Lighting the volcano',
  'Dropping a dreamvisitor down a deep well',
  'Reminding everyone that Clay is fireproof',
  'Sorting out the SandWing succession',
  'Waiting for Glory to finish her nap',
  'Making room for Whiteout’s poetry',
  'Shooing scavengers out of the tunnels',
  'Arguing about who gets the top cave',
  'Serving fruit in the rainforest',
];

/** Fisher–Yates copy, so no two loads read the same. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
