import * as THREE from 'three';
import { LANDMARKS, type Landmark } from '../data/landmarks';
import { normToWorld } from '../data/scale';
import { sampleSurfaceHeight, type TerrainData } from '../terrain/generate';
import { buildingVertScale, SITE_SPECS, type SiteSpec } from './sites';

/** Deterministic per-site RNG so a town looks the same on every reload. */
function rngFor(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Part {
  /** box | cyl | cone | ring */
  shape: 0 | 1 | 2 | 3;
  x: number;
  z: number;
  /** Footprint radius / half-width, metres. */
  w: number;
  d: number;
  /** Height in metres above the local ground. */
  h: number;
  /** Vertical offset (used to sink ruins / raise roofs). */
  y: number;
  rot: number;
  color: number;
  /** Lean, for collapsed ruins. */
  tilt: number;
}

// Shared across every site; only the per-instance transforms differ.
// Index 3 is an open-ended cylinder used as a continuous curtain wall — built
// from separate box segments it splayed apart into a ring of loose slabs.
const SHAPES = [
  new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  new THREE.CylinderGeometry(0.5, 0.55, 1, 8).translate(0, 0.5, 0),
  new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0),
  new THREE.CylinderGeometry(0.5, 0.5, 1, 40, 1, true).translate(0, 0.5, 0),
];

/**
 * Procedural architecture for every named place.
 *
 * Nothing here is canon geometry — the books describe towns, not floor plans.
 * The goal is that arriving at the Scorpion Den puts a walled desert city in
 * front of you instead of an empty dune, and that a palace, a hamlet and a
 * ruin are distinguishable at a glance.
 */
export class SiteStructures {
  readonly group = new THREE.Group();

  private readonly built = new Map<string, THREE.Group>();
  private readonly centres = new Map<string, THREE.Vector3>();
  private readonly ranges = new Map<string, number>();
  private vertScale: number;
  private visibleGroups = new Set(LANDMARKS.map((l) => l.group));

  constructor(
    private readonly terrain: TerrainData,
    vertScale: number,
  ) {
    this.vertScale = vertScale;
    for (const lm of LANDMARKS) {
      const spec = SITE_SPECS.get(lm.id)!;
      if (spec.kind === 'none') continue;
      const { x, z } = normToWorld(lm.pos[0], lm.pos[1]);
      // y holds the site's true ground height; the noise behind it is far too
      // costly to re-evaluate for every site on every frame.
      this.centres.set(
        lm.id,
        new THREE.Vector3(x, sampleSurfaceHeight(terrain, x, z), z),
      );
      // Visible from ~28 town-radii out, so a city shows from far further
      // away than a single hut. The floor is occupant-sized too: there is no
      // point building a scavenger den 9 km out, where it covers a pixel.
      this.ranges.set(lm.id, Math.max(spec.units.span * 320, spec.radius * 28));
    }
  }

  setVisibleGroups(groups: Set<string>): void {
    this.visibleGroups = new Set(groups) as Set<Landmark['group']>;
  }

  setVertScale(v: number): void {
    this.vertScale = v;
    const bv = buildingVertScale(v);
    for (const [id, g] of this.built) {
      g.scale.set(1, bv, 1);
      g.position.setY(this.centres.get(id)!.y * v);
    }
  }

  private groundY(wx: number, wz: number): number {
    return sampleSurfaceHeight(this.terrain, wx, wz);
  }

  update(camera: THREE.PerspectiveCamera): void {
    const cam = camera.position;
    for (const lm of LANDMARKS) {
      const c = this.centres.get(lm.id);
      if (!c) continue;

      const dx = cam.x - c.x;
      const dy = cam.y - c.y * this.vertScale;
      const dz = cam.z - c.z;
      const range = this.ranges.get(lm.id)!;
      const near =
        this.visibleGroups.has(lm.group) && dx * dx + dy * dy + dz * dz < range * range;

      const existing = this.built.get(lm.id);
      if (near && !existing) this.build(lm);
      else if (existing) existing.visible = near;
    }
  }

  private build(lm: Landmark): void {
    const spec = SITE_SPECS.get(lm.id)!;
    const parts = buildParts(spec, rngFor(lm.id));

    const centre = this.centres.get(lm.id)!;
    const baseY = centre.y;

    const g = new THREE.Group();
    g.position.set(centre.x, baseY * this.vertScale, centre.z);
    g.scale.set(1, buildingVertScale(this.vertScale), 1);

    // Each part is dropped onto the terrain under it, so a town drapes over a
    // slope instead of hovering off one edge. Divided by the building scale
    // because the group stretches those offsets too.
    const conform = buildingVertScale(this.vertScale);
    for (const mesh of assemble(parts, (px, pz) =>
      ((this.groundY(centre.x + px, centre.z + pz) - baseY) * this.vertScale) / conform,
    )) {
      g.add(mesh);
    }

    this.group.add(g);
    this.built.set(lm.id, g);
  }
}

/**
 * Lay out one site's architecture, in true metres relative to its centre.
 * Separate from the meshing so the dimensions can be inspected directly —
 * see `scripts/report-sites.mjs`.
 */
export function buildParts(spec: SiteSpec, rand: () => number): Part[] {
  const parts: Part[] = [];
  switch (spec.kind) {
    case 'palace':
      buildPalace(parts, spec, rand);
      break;
    case 'city':
      buildTown(parts, spec, rand, 1.0);
      break;
    case 'town':
      buildTown(parts, spec, rand, 0.7);
      break;
    case 'village':
      buildTown(parts, spec, rand, 0.45);
      break;
    case 'hut':
      buildHut(parts, spec, rand);
      break;
    case 'ruin':
      buildRuin(parts, spec, rand);
      break;
    case 'cave':
      buildCave(parts, spec, rand);
      break;
  }
  return parts;
}

/** Deterministic per-site RNG, exported for the same inspection scripts. */
export { rngFor };

/** Group parts by shape into one InstancedMesh each, with per-instance colour. */
function assemble(
  parts: Part[],
  groundOffset: (x: number, z: number) => number,
): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  for (let shape = 0; shape <= 3; shape++) {
    const subset = parts.filter((p) => p.shape === shape);
    if (subset.length === 0) continue;

    // No vertexColors: InstancedMesh.setColorAt drives the colour, and asking
    // for vertex colours too would look for a geometry attribute that a shared
    // box has no reason to carry.
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.05,
      // The curtain wall is a surface with no thickness, so it needs a back.
      side: shape === 3 ? THREE.DoubleSide : THREE.FrontSide,
    });
    const inst = new THREE.InstancedMesh(SHAPES[shape], mat, subset.length);
    inst.castShadow = false;

    subset.forEach((p, i) => {
      pos.set(p.x, p.y + groundOffset(p.x, p.z), p.z);
      e.set(p.tilt, p.rot, 0);
      q.setFromEuler(e);
      scl.set(p.w, p.h, p.d);
      m.compose(pos, q, scl);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setHex(p.color));
    });

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    out.push(inst);
  }

  return out;
}

function jitterColor(base: number, rand: () => number, amount = 0.14): number {
  const c = new THREE.Color(base);
  const k = 1 + (rand() - 0.5) * 2 * amount;
  c.multiplyScalar(k);
  return c.getHex();
}

/** Ring of wall segments with gate gaps, used by palaces and walled cities. */
function addWall(
  parts: Part[],
  radius: number,
  height: number,
  thickness: number,
  color: number,
  rand: () => number,
  towers = 8,
  /** Building module of the occupant, so merlons are sized for the defender. */
  span = 26,
): void {
  parts.push({
    shape: 3,
    x: 0,
    z: 0,
    w: radius * 2,
    d: radius * 2,
    h: height,
    y: 0,
    rot: 0,
    color,
    tilt: 0,
  });

  // Merlons along the parapet, sized for whoever shelters behind them. Capped
  // so a human wall does not cost thousands of instances for teeth a metre
  // wide that nobody will ever be close enough to count.
  const merlons = Math.min(140, Math.max(20, Math.round(radius / (span * 0.7))));
  for (let i = 0; i < merlons; i++) {
    const a = (i / merlons) * Math.PI * 2;
    parts.push({
      shape: 0,
      x: Math.cos(a) * radius,
      z: Math.sin(a) * radius,
      w: (Math.PI * radius) / merlons,
      d: thickness * 1.6,
      h: height * 0.3,
      y: height,
      rot: -a + Math.PI / 2,
      color: jitterColor(color, rand, 0.08),
      tilt: 0,
    });
  }

  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2 + 0.2;
    parts.push({
      shape: 1,
      x: Math.cos(a) * radius,
      z: Math.sin(a) * radius,
      w: thickness * 3.2,
      d: thickness * 3.2,
      h: height * 1.7,
      y: 0,
      rot: 0,
      color,
      tilt: 0,
    });
  }
}

function buildPalace(parts: Part[], spec: SiteSpec, rand: () => number): void {
  const r = spec.radius;

  // Central keep — a squat fortress block, not a needle.
  const keepW = r * 0.38;
  const keepH = r * 0.28;
  parts.push({
    shape: 0,
    x: 0,
    z: 0,
    w: keepW,
    d: keepW * 0.85,
    h: keepH,
    y: 0,
    rot: 0,
    color: spec.wall,
    tilt: 0,
  });
  parts.push({
    shape: 2,
    x: 0,
    z: 0,
    w: keepW * 1.35,
    d: keepW * 1.1,
    h: keepH * 0.4,
    y: keepH,
    rot: 0,
    color: spec.roof,
    tilt: 0,
  });

  // Corner towers — thicker and shorter so they read as towers, not pins.
  const spires = 6;
  for (let i = 0; i < spires; i++) {
    const a = (i / spires) * Math.PI * 2;
    const rr = r * 0.3;
    const th = keepH * (1.05 + rand() * 0.45);
    const tw = r * 0.12;
    parts.push({
      shape: 1,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: tw,
      d: tw,
      h: th,
      y: 0,
      rot: 0,
      color: spec.wall,
      tilt: 0,
    });
    parts.push({
      shape: 2,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: tw * 1.35,
      d: tw * 1.35,
      h: r * 0.1,
      y: th,
      rot: 0,
      color: spec.roof,
      tilt: 0,
    });
  }

  // Outbuildings inside the curtain wall.
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const rr = r * (0.45 + rand() * 0.4);
    const w = r * (0.08 + rand() * 0.08);
    parts.push({
      shape: 0,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w,
      d: w * (0.7 + rand() * 0.6),
      h: r * (0.06 + rand() * 0.08),
      y: 0,
      rot: rand() * Math.PI,
      color: jitterColor(spec.wall, rand),
      tilt: 0,
    });
  }

  if (spec.walled) {
    addWall(parts, r, r * 0.18, r * 0.03, spec.wall, rand, 8);
  }
}

function buildTown(
  parts: Part[],
  spec: SiteSpec,
  rand: () => number,
  density: number,
): void {
  const r = spec.radius;
  const { span, rise } = spec.units;
  const count = Math.round(28 + density * 260);

  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    // sqrt keeps area density even; the extra power pulls it toward a centre.
    const rr = r * Math.pow(Math.sqrt(rand()), 0.8) * 0.94;

    const big = rand() < 0.12;
    // Everything in building modules, so a scavenger den comes out as cottages
    // and a dragon town as halls. Wide and low rather than tall and thin: at
    // 15× damped exaggeration anything slender reads as a pin.
    const w = span * (big ? 1.4 + rand() * 1.5 : 0.7 + rand() * 0.92);
    const h = rise * (big ? 1.4 + rand() * 2.5 : 0.6 + rand() * 1.08);

    parts.push({
      shape: 0,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w,
      d: w * (0.65 + rand() * 0.7),
      h,
      y: 0,
      rot: rand() * Math.PI,
      color: jitterColor(spec.wall, rand),
      tilt: 0,
    });

    // Flat-roofed desert boxes mostly; pitched roofs elsewhere.
    if (rand() < 0.45) {
      parts.push({
        shape: 2,
        x: Math.cos(a) * rr,
        z: Math.sin(a) * rr,
        w: w * 1.25,
        d: w * 1.05,
        h: w * (0.35 + rand() * 0.4),
        y: h,
        rot: 0,
        color: jitterColor(spec.roof, rand),
        tilt: 0,
      });
    }
  }

  // A few landmark towers so the skyline is not uniform.
  const towers = Math.max(1, Math.round(density * 5));
  for (let i = 0; i < towers; i++) {
    const a = rand() * Math.PI * 2;
    const rr = r * rand() * 0.5;
    const h = rise * (2.4 + rand() * 3.6);
    const tw = span * (1.08 + rand() * 0.69);
    parts.push({
      shape: 1,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: tw,
      d: tw,
      h,
      y: 0,
      rot: 0,
      color: spec.wall,
      tilt: 0,
    });
    parts.push({
      shape: 2,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: tw * 1.4,
      d: tw * 1.4,
      h: tw * 0.9,
      y: h,
      rot: 0,
      color: spec.roof,
      tilt: 0,
    });
  }

  if (spec.walled) {
    addWall(parts, r, rise * 2.6, span * 0.35, spec.wall, rand, 10, span);
  }
}

function buildHut(parts: Part[], spec: SiteSpec, rand: () => number): void {
  const { span, rise } = spec.units;
  const wallH = rise * 0.69;
  parts.push({
    shape: 0,
    x: 0,
    z: 0,
    w: span * 0.62,
    d: span * 0.5,
    h: wallH,
    y: 0,
    rot: rand() * Math.PI,
    color: spec.wall,
    tilt: 0,
  });
  parts.push({
    shape: 2,
    x: 0,
    z: 0,
    w: span * 0.85,
    d: span * 0.73,
    h: rise * 0.62,
    y: wallH,
    rot: 0,
    color: spec.roof,
    tilt: 0,
  });
  // Palms / posts around it.
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const rr = span * (0.77 + rand() * 0.85);
    parts.push({
      shape: 1,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: span * 0.062,
      d: span * 0.062,
      h: rise * (0.92 + rand() * 0.62),
      y: 0,
      rot: 0,
      color: 0x6b5335,
      tilt: (rand() - 0.5) * 0.2,
    });
  }
}

function buildRuin(parts: Part[], spec: SiteSpec, rand: () => number): void {
  const r = spec.radius;
  const { span, rise } = spec.units;
  const count = Math.round(40 + r * 0.14);

  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const rr = r * Math.sqrt(rand()) * 0.95;

    // Broken stubs of wall, half-sunk and leaning.
    parts.push({
      shape: 0,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: span * (0.46 + rand() * 1.15),
      d: span * (0.15 + rand() * 0.31),
      h: rise * (0.46 + rand() * 2.0),
      y: rise * (-0.15 - rand() * 0.31),
      rot: rand() * Math.PI,
      color: jitterColor(spec.wall, rand, 0.2),
      tilt: (rand() - 0.5) * 0.28,
    });
  }

  // Surviving columns.
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const rr = r * rand() * 0.6;
    const cw = span * (0.27 + rand() * 0.19);
    parts.push({
      shape: 1,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: cw,
      d: cw,
      h: rise * (1.92 + rand() * 4.23),
      y: 0,
      rot: 0,
      color: jitterColor(spec.wall, rand, 0.2),
      tilt: (rand() - 0.5) * 0.12,
    });
  }
}

/**
 * Cave-mouth sites: a carved entrance plus terraces, no free-standing town.
 * The opening is rock and stays sized to the mountain; everything built around
 * it belongs to whoever lives inside and is sized accordingly.
 */
function buildCave(parts: Part[], spec: SiteSpec, rand: () => number): void {
  const r = spec.radius;
  const { span, rise } = spec.units;

  parts.push({
    shape: 2,
    x: 0,
    z: 0,
    w: r * 0.5,
    d: r * 0.5,
    h: r * 0.55,
    y: 0,
    rot: 0,
    color: 0x2a2622,
    tilt: 0,
  });

  for (let i = 0; i < 5; i++) {
    const a = -0.9 + (i / 4) * 1.8;
    const rr = r * 0.55;
    parts.push({
      shape: 0,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: span * (1.2 + rand() * 0.7),
      d: span * (0.9 + rand() * 0.5),
      h: rise * (1.1 + rand() * 1.1),
      y: 0,
      rot: -a,
      color: jitterColor(spec.wall, rand),
      tilt: 0,
    });
  }

  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const rr = r * (0.7 + rand() * 0.5);
    parts.push({
      shape: 1,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      w: span * 0.2,
      d: span * 0.2,
      h: rise * (1.0 + rand() * 1.4),
      y: 0,
      rot: 0,
      color: spec.wall,
      tilt: 0,
    });
  }
}
