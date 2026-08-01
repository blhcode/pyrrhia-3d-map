import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { normToWorld, WORLD_HEIGHT_M, WORLD_WIDTH_M } from '../data/scale';
import type { TerrainData } from '../terrain/generate';
import { fbm, ridged } from '../terrain/noise';

/** CPU mirror of the shader's detail displacement. */
function detailAt(amp: number, freq: number, worldX: number, worldZ: number): number {
  if (amp <= 0.5) return 0;
  const f = Math.abs(freq);
  const px = (worldX / 1000) * f;
  const pz = (worldZ / 1000) * f;
  const n = freq > 0 ? ridged(px, pz, 4) : fbm(px, pz, 4);
  return (n - 0.45) * amp;
}

function bilinear(t: TerrainData, nx: number, ny: number, c: number): number {
  const { size, data } = t;
  const x = Math.max(0, Math.min(size - 1.001, nx * (size - 1)));
  const y = Math.max(0, Math.min(size - 1.001, (1 - ny) * (size - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v00 = data[(y0 * size + x0) * 4 + c];
  const v10 = data[(y0 * size + x1) * 4 + c];
  const v01 = data[(y1 * size + x0) * 4 + c];
  const v11 = data[(y1 * size + x1) * 4 + c];
  return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
}

function albedoAt(t: TerrainData, nx: number, ny: number): [number, number, number] {
  const { size, albedo } = t;
  const i = Math.max(0, Math.min(size - 1, Math.round(nx * (size - 1))));
  const j = Math.max(0, Math.min(size - 1, Math.round((1 - ny) * (size - 1))));
  const p = (j * size + i) * 4;
  return [albedo[p] / 255, albedo[p + 1] / 255, albedo[p + 2] / 255];
}

export interface BuildMeshOptions {
  /** Vertices per side. 512 gives ~0.5 M triangles. */
  resolution: number;
  /** Vertical exaggeration baked into the exported model. */
  vertScale: number;
  /** Metres to divide by. 1000 exports in kilometres so the file is Blender-friendly. */
  unitDivisor: number;
}

/**
 * Build a single watertight-ish terrain mesh from the baked heightmap plus the
 * same procedural detail the GPU adds, with baked vertex colours.
 */
export function buildTerrainMesh(
  terrain: TerrainData,
  opts: BuildMeshOptions,
): THREE.Mesh {
  const N = opts.resolution;
  const div = opts.unitDivisor;
  const verts = new Float32Array(N * N * 3);
  const colors = new Float32Array(N * N * 3);
  const indices: number[] = [];

  for (let j = 0; j < N; j++) {
    const ny = 1 - j / (N - 1);
    for (let i = 0; i < N; i++) {
      const nx = i / (N - 1);
      const k = j * N + i;

      const { x, z } = normToWorld(nx, ny);
      const base = bilinear(terrain, nx, ny, 0);
      const amp = bilinear(terrain, nx, ny, 1);
      const freq = bilinear(terrain, nx, ny, 2);
      const h = base + detailAt(amp, freq, x, z);

      verts[k * 3] = x / div;
      verts[k * 3 + 1] = (h * opts.vertScale) / div;
      verts[k * 3 + 2] = z / div;

      const [r, g, b] = albedoAt(terrain, nx, ny);
      colors[k * 3] = r;
      colors[k * 3 + 1] = g;
      colors[k * 3 + 2] = b;
    }
  }

  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i;
      const b = j * N + i + 1;
      const c = (j + 1) * N + i;
      const d = (j + 1) * N + i + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Pyrrhia';
  return mesh;
}

export async function exportGLB(
  terrain: TerrainData,
  opts: BuildMeshOptions,
): Promise<Blob> {
  const mesh = buildTerrainMesh(terrain, opts);
  const scene = new THREE.Scene();
  scene.name = 'Pyrrhia';
  scene.add(mesh);

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const WORLD_EXTENTS = { WORLD_WIDTH_M, WORLD_HEIGHT_M };
