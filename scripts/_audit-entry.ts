// Bundle entry for scripts/audit-map.mjs — re-exports the map data so the
// overlay can be drawn from Node without a TypeScript runtime.
export { LANDMARKS, LANDMARK_GROUPS } from '../src/data/landmarks';
export { ALL_LAND } from '../src/data/coastline';
export { KINGDOMS } from '../src/data/kingdoms';
export { RIVERS, LAKES } from '../src/data/rivers';
export { px, toMapPx } from '../src/data/mapref';
