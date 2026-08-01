import * as THREE from 'three';

export interface CDLODOptions {
  /** Patch grid resolution (quads per side). Power of two. */
  patchRes: number;
  /** World extents in metres, used to skip nodes entirely off-map. */
  worldWidth: number;
  worldHeight: number;
  /** Deepest subdivision level. */
  maxDepth: number;
  /** Subdivide while cameraDistance < nodeSize * lodFactor. */
  lodFactor: number;
  /** Vertical bounds for frustum culling, in metres (pre vertical-scale). */
  minElevation: number;
  maxElevation: number;
  maxInstances: number;
}

/**
 * Continuous Distance-Dependent LOD terrain.
 *
 * A quadtree is walked every frame and the selected leaves are drawn as a
 * single instanced draw call; the vertex shader displaces each patch from the
 * heightmap and morphs it toward its parent grid to hide LOD seams. This is
 * what makes 1:1 continental scale viewable — the whole 4,500 km landmass from
 * orbit and metre-scale ridgelines when you drop into a valley, same mesh.
 */
export class CDLODTerrain {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.InstancedBufferGeometry;

  private readonly opts: CDLODOptions;
  private readonly offsets: Float32Array;
  private readonly scales: Float32Array;
  private readonly offsetAttr: THREE.InstancedBufferAttribute;
  private readonly scaleAttr: THREE.InstancedBufferAttribute;

  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly box = new THREE.Box3();

  private count = 0;
  private rootSize: number;
  private rootOrigin: number;

  /** Number of patches drawn last frame (for the HUD). */
  lastPatchCount = 0;

  constructor(material: THREE.ShaderMaterial, opts: CDLODOptions) {
    this.opts = opts;

    const res = opts.patchRes;
    const base = new THREE.PlaneGeometry(1, 1, res, res);
    base.rotateX(-Math.PI / 2);
    base.translate(0.5, 0, 0.5); // unit patch spanning [0,1] in x and z

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);

    this.offsets = new Float32Array(opts.maxInstances * 2);
    this.scales = new Float32Array(opts.maxInstances);
    this.offsetAttr = new THREE.InstancedBufferAttribute(this.offsets, 2);
    this.scaleAttr = new THREE.InstancedBufferAttribute(this.scales, 1);
    this.offsetAttr.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iOffset', this.offsetAttr);
    geo.setAttribute('iScale', this.scaleAttr);

    // The shader positions vertices in world space, so bypass frustum culling
    // on the container and cull per-node during selection instead.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;

    // Root covers the world plus margin, snapped to a power of two.
    const span = Math.max(opts.worldWidth, opts.worldHeight) * 1.3;
    this.rootSize = Math.pow(2, Math.ceil(Math.log2(span)));
    this.rootOrigin = -this.rootSize / 2;
  }

  update(camera: THREE.PerspectiveCamera, vertScale: number): void {
    this.count = 0;

    camera.updateMatrixWorld();
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);

    const camX = camera.position.x;
    const camZ = camera.position.z;

    this.select(
      this.rootOrigin,
      this.rootOrigin,
      this.rootSize,
      0,
      camX,
      camZ,
      vertScale,
    );

    this.offsetAttr.needsUpdate = true;
    this.scaleAttr.needsUpdate = true;
    this.geometry.instanceCount = this.count;
    this.lastPatchCount = this.count;
  }

  private select(
    x: number,
    z: number,
    size: number,
    depth: number,
    camX: number,
    camZ: number,
    vertScale: number,
  ): void {
    if (this.count >= this.opts.maxInstances) return;

    const halfW = this.opts.worldWidth / 2;
    const halfH = this.opts.worldHeight / 2;
    // Skip nodes completely outside the mapped area — ocean plane covers those.
    if (x > halfW || x + size < -halfW || z > halfH || z + size < -halfH) return;

    this.box.min.set(x, this.opts.minElevation * vertScale - 200, z);
    this.box.max.set(
      x + size,
      this.opts.maxElevation * vertScale + 200,
      z + size,
    );
    if (!this.frustum.intersectsBox(this.box)) return;

    // Distance from camera to the nearest point on this node's footprint.
    const dx = Math.max(x - camX, 0, camX - (x + size));
    const dz = Math.max(z - camZ, 0, camZ - (z + size));
    const dist = Math.hypot(dx, dz);

    const shouldSplit = depth < this.opts.maxDepth && dist < size * this.opts.lodFactor;

    if (!shouldSplit) {
      this.emit(x, z, size);
      return;
    }

    const h = size / 2;
    this.select(x, z, h, depth + 1, camX, camZ, vertScale);
    this.select(x + h, z, h, depth + 1, camX, camZ, vertScale);
    this.select(x, z + h, h, depth + 1, camX, camZ, vertScale);
    this.select(x + h, z + h, h, depth + 1, camX, camZ, vertScale);
  }

  private emit(x: number, z: number, size: number): void {
    const i = this.count;
    this.offsets[i * 2] = x;
    this.offsets[i * 2 + 1] = z;
    this.scales[i] = size;
    this.count = i + 1;
  }
}
