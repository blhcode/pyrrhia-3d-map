import * as THREE from 'three';
import { normToWorld } from '../data/scale';
import type { RiverSample, WaterData } from '../terrain/water';

/** Rivers below this sit in the estuary and are covered by the sea plane. */
const TIDAL_LIMIT_M = 34;
/** Lifts the surface clear of the bed so it never z-fights the terrain. */
const SURFACE_LIFT_M = 4;

/**
 * The actual water: ribbons down every river and a flat sheet on every lake,
 * laid into the channels `carveWater` cut out of the heightfield.
 *
 * Geometry is built in true metres and the whole group is scaled on Y, so the
 * exaggeration slider moves the water and the terrain together.
 */
export class WaterSurfaces {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;

  constructor(water: WaterData, vertScale: number) {
    this.material = new THREE.MeshStandardMaterial({
      color: 0x1d6b91,
      roughness: 0.12,
      metalness: 0.0,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });

    for (const river of water.rivers) {
      for (const branch of river.branches) {
        const geo = ribbon(branch);
        if (geo) this.group.add(new THREE.Mesh(geo, this.material));
      }
    }

    for (const lake of water.lakes) {
      const shape = new THREE.Shape(
        lake.polygon.map(([nx, ny]) => {
          const { x, z } = normToWorld(nx, ny);
          return new THREE.Vector2(x, z);
        }),
      );
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, lake.level + SURFACE_LIFT_M, 0);
      this.group.add(new THREE.Mesh(geo, this.material));
    }

    this.setVertScale(vertScale);
  }

  setVertScale(vertScale: number): void {
    this.group.scale.y = vertScale;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.material.dispose();
  }
}

/**
 * Sweep a flat strip along a river centreline, widening as it goes downstream.
 * Returns null when the whole branch is below the tidal limit, where the ocean
 * plane already does the job.
 */
function ribbon(samples: RiverSample[]): THREE.BufferGeometry | null {
  const usable = samples.filter((s) => s.level >= TIDAL_LIMIT_M);
  if (usable.length < 2) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < usable.length; i++) {
    const s = usable[i];
    const prev = usable[Math.max(0, i - 1)];
    const next = usable[Math.min(usable.length - 1, i + 1)];

    // Perpendicular to the direction of travel, in normalised space.
    let tx = next.nx - prev.nx;
    let ty = next.ny - prev.ny;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;

    // A shade narrower than the carved channel, so the banks hide the seam.
    const hw = s.halfWidth * 0.9;
    const leftN: [number, number] = [s.nx - ty * hw, s.ny + tx * hw];
    const rightN: [number, number] = [s.nx + ty * hw, s.ny - tx * hw];

    const y = s.level + SURFACE_LIFT_M;
    for (const [nx, ny] of [leftN, rightN]) {
      const { x, z } = normToWorld(nx, ny);
      positions.push(x, y, z);
      normals.push(0, 1, 0);
    }

    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}
