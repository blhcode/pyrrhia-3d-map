import * as THREE from 'three';
import { worldToNorm } from '../data/scale';
import {
  sampleForest,
  sampleKingdomId,
  sampleSurfaceHeight,
  type TerrainData,
} from '../terrain/generate';
import { valueNoise } from '../terrain/noise';
import { buildingVertScale } from './sites';
import {
  createTreeMaterial,
  HEIGHT_M,
  treeGeometries,
  VARIANTS,
  type Species,
} from './trees';

/** Side of one scatter tile, metres. */
const TILE_M = 2000;

/** Radius around the camera kept planted, metres. */
const VIEW_M = 4800;

/** Tiles further out than this are thrown away. */
const DROP_M = VIEW_M * 1.7;

/** Nominal gap between trees in closed canopy, metres. */
const SPACING_M = 95;

/**
 * True metres above ground beyond which the forest stops drawing.
 *
 * Pyrrhia is 2,800 miles across. Planting it at a real 400 stems a hectare
 * would be some hundreds of billions of trees, so what grows here is a stand
 * around the camera: dense enough to fly through, gone by the time you are
 * high enough that a tree is smaller than a pixel.
 */
const MAX_AGL_M = 7000;

/** Tiles built per frame, to keep planting off the frame budget. */
const BUILD_BUDGET = 2;

interface Tile {
  group: THREE.Group;
  /** Squared distance test uses the tile's centre. */
  cx: number;
  cz: number;
}

function tileRng(ix: number, iz: number): () => number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which tree grows where, from the kingdom the ground belongs to. */
function speciesAt(kingdom: string, rand: () => number): Species {
  switch (kingdom) {
    case 'rain':
      return 'jungle';
    case 'night':
      return 'dead';
    case 'ice':
      return 'conifer';
    case 'sky':
      // The plate paints the eastern Sky Kingdom in ranks of conifers, with
      // broadleaf coming in on the lower ground.
      return rand() < 0.72 ? 'conifer' : 'broadleaf';
    default:
      return 'broadleaf';
  }
}

/**
 * Forest cover, streamed as tiles of instanced trees around the camera.
 *
 * The heightmap only stores canopy density every five kilometres or so, which
 * is far too coarse to place a tree by, so the density is broken up here with
 * a clumping field: stands thin into clearings and thicken into thickets
 * inside what the terrain thinks is uniform forest.
 */
export class Forests {
  readonly group = new THREE.Group();

  private readonly tiles = new Map<string, Tile>();
  private readonly material: THREE.Material;
  private readonly geometries = treeGeometries();
  private vertScale: number;

  constructor(
    private readonly terrain: TerrainData,
    vertScale: number,
  ) {
    this.vertScale = vertScale;
    this.material = createTreeMaterial(VIEW_M * 0.62, VIEW_M);
    this.group.scale.set(1, buildingVertScale(vertScale), 1);
  }

  setVertScale(v: number): void {
    this.vertScale = v;
    // Tree bases are stored in group space, which the exaggeration stretches,
    // so replanting is the only way to keep them on the ground.
    this.clear();
    this.group.scale.set(1, buildingVertScale(v), 1);
  }

  private clear(): void {
    for (const tile of this.tiles.values()) {
      this.group.remove(tile.group);
      tile.group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    }
    this.tiles.clear();
  }

  update(camera: THREE.PerspectiveCamera): void {
    const ground = sampleSurfaceHeight(this.terrain, camera.position.x, camera.position.z);
    const agl = (camera.position.y - ground * this.vertScale) / this.vertScale;
    if (agl > MAX_AGL_M) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const cx = camera.position.x;
    const cz = camera.position.z;

    for (const [key, tile] of this.tiles) {
      const dx = tile.cx - cx;
      const dz = tile.cz - cz;
      if (dx * dx + dz * dz > DROP_M * DROP_M) {
        this.group.remove(tile.group);
        tile.group.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) o.dispose();
        });
        this.tiles.delete(key);
      }
    }

    const reach = Math.ceil(VIEW_M / TILE_M);
    const bx = Math.floor(cx / TILE_M);
    const bz = Math.floor(cz / TILE_M);

    // Nearest first, so a teleport fills in the ground under you before the
    // horizon.
    const wanted: [number, number, number][] = [];
    for (let iz = bz - reach; iz <= bz + reach; iz++) {
      for (let ix = bx - reach; ix <= bx + reach; ix++) {
        if (this.tiles.has(`${ix},${iz}`)) continue;
        const tx = (ix + 0.5) * TILE_M - cx;
        const tz = (iz + 0.5) * TILE_M - cz;
        const d2 = tx * tx + tz * tz;
        if (d2 > VIEW_M * VIEW_M) continue;
        wanted.push([d2, ix, iz]);
      }
    }
    wanted.sort((a, b) => a[0] - b[0]);

    // A teleport lands on bare ground, so the first frame after arriving plants
    // the lot rather than dribbling the forest in over several seconds.
    const budget = this.tiles.size === 0 ? wanted.length : BUILD_BUDGET;
    for (let i = 0; i < Math.min(budget, wanted.length); i++) {
      this.plant(wanted[i][1], wanted[i][2]);
    }
  }

  /** Scatter one tile and hand back an InstancedMesh per species and variant. */
  private plant(ix: number, iz: number): void {
    const rand = tileRng(ix, iz);
    const x0 = ix * TILE_M;
    const z0 = iz * TILE_M;
    const bv = buildingVertScale(this.vertScale);
    const steps = Math.round(TILE_M / SPACING_M);

    // Bucketed by species then variant.
    const buckets = new Map<string, THREE.Matrix4[]>();
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scl = new THREE.Vector3();

    for (let gz = 0; gz < steps; gz++) {
      for (let gx = 0; gx < steps; gx++) {
        const x = x0 + (gx + rand()) * SPACING_M;
        const z = z0 + (gz + rand()) * SPACING_M;
        const { nx, ny } = worldToNorm(x, z);

        // Clumping: 0.55–1.45 over roughly a kilometre, so the coarse density
        // becomes thickets and clearings instead of an even lawn.
        const clump = 0.55 + 0.9 * valueNoise(x / 900, z / 900);
        const density = sampleForest(this.terrain, nx, ny) * clump;
        if (density <= 0 || rand() > density) continue;

        const h = sampleSurfaceHeight(this.terrain, x, z);
        if (h < 2) continue;

        const species = speciesAt(sampleKingdomId(this.terrain, nx, ny), rand);
        const variant = Math.floor(rand() * VARIANTS);
        const [lo, hi] = HEIGHT_M[species];
        const height = lo + rand() * (hi - lo);
        const girth = 0.82 + rand() * 0.42;

        pos.set(x, (h * this.vertScale) / bv, z);
        euler.set(0, rand() * Math.PI * 2, 0);
        quat.setFromEuler(euler);
        scl.set(height * girth, height, height * girth);
        m.compose(pos, quat, scl);

        const key = `${species}:${variant}`;
        const list = buckets.get(key);
        if (list) list.push(m.clone());
        else buckets.set(key, [m.clone()]);
      }
    }

    const group = new THREE.Group();
    for (const [key, mats] of buckets) {
      const [species, variant] = key.split(':');
      const geo = this.geometries[species as Species][Number(variant)];
      const inst = new THREE.InstancedMesh(geo, this.material, mats.length);
      inst.castShadow = false;
      inst.receiveShadow = false;
      mats.forEach((mat, i) => inst.setMatrixAt(i, mat));
      inst.instanceMatrix.needsUpdate = true;
      // Without this the bounds come from the unit-height source geometry and
      // the whole tile vanishes the moment the world origin leaves the view.
      inst.computeBoundingSphere();
      group.add(inst);
    }

    this.group.add(group);
    this.tiles.set(`${ix},${iz}`, {
      group,
      cx: (ix + 0.5) * TILE_M,
      cz: (iz + 0.5) * TILE_M,
    });
  }

  /** Total trees currently planted, for the HUD. */
  get treeCount(): number {
    let n = 0;
    for (const tile of this.tiles.values()) {
      for (const child of tile.group.children) {
        if (child instanceof THREE.InstancedMesh) n += child.count;
      }
    }
    return n;
  }
}
