// Bundle entry for scripts/check-placement.mjs — re-exports the map data so it
// can be loaded from Node without a TypeScript runtime.
export { LANDMARKS } from '../src/data/landmarks';
export { ALL_LAND } from '../src/data/coastline';
export { KINGDOMS } from '../src/data/kingdoms';
export { px, toMapPx } from '../src/data/mapref';
