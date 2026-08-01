import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Tree models.
 *
 * Every tree is a real mesh — a trunk, branches and layered foliage — built
 * once at unit height and then instanced. Modelling them here instead of
 * loading a pack of GLBs keeps the whole map a single self-contained build,
 * lets each species be tuned to what the plate actually paints in that part of
 * Pyrrhia, and means the polygon budget is something we choose rather than
 * something we inherit.
 *
 * Bark and leaf colour ride on the vertex colours, so a whole tree is one
 * instance of one geometry and a stand of ten thousand costs one draw call.
 */

export type Species = 'conifer' | 'broadleaf' | 'jungle' | 'dead';

export const SPECIES: readonly Species[] = ['conifer', 'broadleaf', 'jungle', 'dead'];

/** Variants per species, so a stand is not the same tree ten thousand times. */
export const VARIANTS = 3;

/** True height range in metres, before vertical exaggeration. */
export const HEIGHT_M: Record<Species, readonly [number, number]> = {
  conifer: [22, 40],
  broadleaf: [15, 28],
  // Rainforest emergents stand well clear of the canopy below them.
  jungle: [30, 55],
  dead: [8, 18],
};

function rngFor(seed: number): () => number {
  let h = seed | 0;
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint one part a flat colour and drop the index, ready to merge. */
function part(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const n = flat.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  flat.deleteAttribute('uv');
  return flat;
}

function jitter(hex: number, rand: () => number, amount = 0.16): number {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 + (rand() - 0.5) * 2 * amount);
  return c.getHex();
}

const BARK = {
  conifer: 0x4a3524,
  broadleaf: 0x5c452e,
  jungle: 0x6b5a44,
  dead: 0x3a342d,
};

/** Spruce silhouette: a bare lower trunk under stacked, drooping tiers. */
function buildConifer(rand: () => number): THREE.BufferGeometry {
  const leaf = jitter(rand() < 0.4 ? 0x27492e : 0x33583a, rand);
  const parts = [
    part(
      new THREE.CylinderGeometry(0.016, 0.032, 1.0, 5).translate(0, 0.5, 0),
      BARK.conifer,
    ),
  ];

  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = 0.18 + t * 0.6;
    const r = 0.20 - t * 0.13;
    const h = 0.36 - t * 0.08;
    parts.push(
      part(
        new THREE.ConeGeometry(r * (0.88 + rand() * 0.24), h, 6).translate(0, y + h / 2, 0),
        i === tiers - 1 ? leaf : jitter(leaf, rand, 0.1),
      ),
    );
  }
  return mergeGeometries(parts)!;
}

/** Broad, rounded crown on a short trunk with a few visible limbs. */
function buildBroadleaf(rand: () => number): THREE.BufferGeometry {
  const leaf = jitter(rand() < 0.35 ? 0x4f7a33 : 0x5c8a3c, rand);
  const parts = [
    part(
      new THREE.CylinderGeometry(0.03, 0.055, 0.58, 5).translate(0, 0.29, 0),
      BARK.broadleaf,
    ),
  ];

  const limbs = 3;
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rand();
    const limb = new THREE.CylinderGeometry(0.012, 0.022, 0.3, 4);
    limb.translate(0, 0.15, 0);
    limb.rotateZ(0.7);
    limb.rotateY(a);
    limb.translate(0, 0.44, 0);
    parts.push(part(limb, BARK.broadleaf));
  }

  const blobs = 3;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rand() * 0.8;
    const r = 0.19 + rand() * 0.09;
    const rr = i === 0 ? 0 : 0.14;
    const crown = new THREE.IcosahedronGeometry(r, 0);
    crown.scale(1, 0.82, 1);
    crown.translate(Math.cos(a) * rr, 0.72 + (i === 0 ? 0.07 : 0) - rand() * 0.08, Math.sin(a) * rr);
    parts.push(part(crown, jitter(leaf, rand, 0.12)));
  }
  return mergeGeometries(parts)!;
}

/** Rainforest emergent: buttressed, long clean bole, flat spreading crown. */
function buildJungle(rand: () => number): THREE.BufferGeometry {
  const leaf = jitter(rand() < 0.4 ? 0x2c6428 : 0x387a2f, rand);
  const parts = [
    part(new THREE.CylinderGeometry(0.02, 0.042, 0.84, 5).translate(0, 0.42, 0), BARK.jungle),
  ];

  const roots = 4;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rand() * 0.5;
    const root = new THREE.ConeGeometry(0.026, 0.16, 3);
    root.translate(Math.cos(a) * 0.05, 0.08, Math.sin(a) * 0.05);
    parts.push(part(root, BARK.jungle));
  }

  for (let i = 0; i < 2; i++) {
    const crown = new THREE.IcosahedronGeometry(0.26 + rand() * 0.1, 0);
    crown.scale(1.15, 0.42, 1.15);
    crown.translate((rand() - 0.5) * 0.1, 0.84 + i * 0.09, (rand() - 0.5) * 0.1);
    parts.push(part(crown, jitter(leaf, rand, 0.14)));
  }
  return mergeGeometries(parts)!;
}

/**
 * The leafless, twisted trees left on the volcano's slopes — "like bones
 * sticking out of the dirt".
 */
function buildDead(rand: () => number): THREE.BufferGeometry {
  const bark = jitter(BARK.dead, rand, 0.22);
  const trunk = new THREE.CylinderGeometry(0.018, 0.055, 0.88, 5);
  trunk.translate(0, 0.44, 0);
  trunk.rotateZ((rand() - 0.5) * 0.3);
  const parts = [part(trunk, bark)];

  const limbs = 4;
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rand();
    const limb = new THREE.CylinderGeometry(0.006, 0.016, 0.24 + rand() * 0.16, 4);
    limb.translate(0, 0.12, 0);
    limb.rotateZ(0.9 + rand() * 0.5);
    limb.rotateY(a);
    limb.translate(0, 0.5 + rand() * 0.28, 0);
    parts.push(part(limb, bark));
  }
  return mergeGeometries(parts)!;
}

const BUILDERS: Record<Species, (rand: () => number) => THREE.BufferGeometry> = {
  conifer: buildConifer,
  broadleaf: buildBroadleaf,
  jungle: buildJungle,
  dead: buildDead,
};

let cache: Record<Species, THREE.BufferGeometry[]> | null = null;

/** Unit-height tree geometries, `VARIANTS` of each species. Built once. */
export function treeGeometries(): Record<Species, THREE.BufferGeometry[]> {
  if (cache) return cache;
  const out = {} as Record<Species, THREE.BufferGeometry[]>;
  SPECIES.forEach((s, si) => {
    out[s] = [];
    for (let v = 0; v < VARIANTS; v++) {
      out[s].push(BUILDERS[s](rngFor(si * 977 + v * 31 + 7)));
    }
  });
  cache = out;
  return out;
}

/**
 * Lambert, with the leaves lit from both sides and a dithered dissolve at the
 * far edge of the scatter radius.
 *
 * The terrain's aerial perspective is almost nothing at a few kilometres, so
 * trees would otherwise appear in a hard ring around the camera. Ordered
 * dither fades them out without the sorting cost — or the sorting bugs — of
 * ten thousand transparent instances.
 */
export function createTreeMaterial(fadeStart: number, fadeEnd: number): THREE.Material {
  // Every part is a closed solid, so there is no reason to pay for backfaces.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uFadeStart = { value: fadeStart };
  const uFadeEnd = { value: fadeEnd };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeStart = uFadeStart;
    shader.uniforms.uFadeEnd = uFadeEnd;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvCamDist = -mvPosition.z;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vCamDist;
uniform float uFadeStart;
uniform float uFadeEnd;
float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `float treeFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, vCamDist);
if (treeFade < bayer2(gl_FragCoord.xy * 0.5) * 0.25 + bayer2(gl_FragCoord.xy)) discard;
#include <clipping_planes_fragment>`,
      );
  };

  return mat;
}
