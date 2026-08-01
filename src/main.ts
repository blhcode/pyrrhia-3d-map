import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FlyControls } from './controls/fly';
import { KINGDOMS, SEA_KINGDOM_META } from './data/kingdoms';
import {
  LANDMARK_GROUPS,
  LANDMARKS,
  RANK_RANGE_M,
  labelRank,
  type LandmarkGroup,
} from './data/landmarks';
import {
  formatDistance,
  normToWorld,
  worldToNorm,
  WORLD_HEIGHT_M,
  WORLD_WIDTH_M,
} from './data/scale';
import { downloadBlob, exportGLB } from './export/mesh';
import { CDLODTerrain } from './terrain/cdlod';
import {
  generateTerrain,
  sampleBaseElevation,
  sampleKingdomId,
  sampleSurfaceHeight,
  type TerrainData,
} from './terrain/generate';
import { createTerrainMaterial } from './terrain/material';
import { LOADING_LINES, shuffled } from './ui/loading-lines';
import { LandmarkMarkers } from './ui/markers';
import { Minimap } from './ui/minimap';
import { Forests } from './world/forests';
import { buildingVertScale, SITE_SPECS, siteTopHeight } from './world/sites';
import { SiteStructures } from './world/structures';
import { WaterSurfaces } from './world/water';

const PATCH_RES = 64;

const HEIGHTMAP_SIZE = 1024;

/** How long each loading-screen saying stays up, in milliseconds. */
const LINE_HOLD_MS = 2000;

/** How many sayings a load should get through. */
const LOADING_LINE_COUNT = 3;

/**
 * Shortest the loading screen may stay up. Pyrrhia builds in about a second,
 * which is not long enough to read anything, so the screen lingers for its
 * full quota of sayings and only then fades.
 */
const MIN_LOADING_MS = LINE_HOLD_MS * LOADING_LINE_COUNT;

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function boot(): Promise<void> {
  const bar = el<HTMLDivElement>('load-bar');
  const label = el<HTMLParagraphElement>('load-label');
  const setBar = (f: number): void => {
    bar.style.width = `${Math.round(f * 100)}%`;
  };

  const openedAt = performance.now();
  const lines = shuffled(LOADING_LINES);
  let line = 0;
  let lastSwap = openedAt;
  label.textContent = lines[0];

  /** Advance only once the current saying has had its full turn on screen. */
  const rotateIfRead = (): boolean => {
    if (performance.now() - lastSwap < LINE_HOLD_MS) return false;
    lastSwap = performance.now();
    line = (line + 1) % lines.length;
    label.textContent = lines[line];
    return true;
  };

  // Terrain is the bulk of the wait but not all of it, so it only gets most
  // of the bar; building the scene and compiling shaders takes the rest.
  const terrain = await generateTerrain(HEIGHTMAP_SIZE, (f) => {
    setBar(f * 0.92);
    // Rotated here rather than on an interval: generation holds the main
    // thread in long bursts, and a bare timer can go an entire load without
    // getting a turn. Progress callbacks land in the gaps by design.
    rotateIfRead();
  });

  // Scene setup runs in one synchronous block, so give the browser a chance to
  // paint the current line before the thread disappears for the duration.
  setBar(0.96);
  await nextFrame();

  start(terrain, () => {
    setBar(1);
    const screen = el('loading');
    // The map is built, but the render loop is free now, so an interval finally
    // gets its turn: let the remaining sayings play out at a readable pace
    // rather than cutting the screen after a single one.
    const tick = (): void => {
      const spentEnough = performance.now() - openedAt >= MIN_LOADING_MS;
      const readCurrent = performance.now() - lastSwap >= LINE_HOLD_MS;
      if (!readCurrent) return;
      if (!spentEnough) {
        rotateIfRead();
        return;
      }
      window.clearInterval(timer);
      screen.classList.add('is-done');
      window.setTimeout(() => screen.remove(), 450);
    };
    const timer = window.setInterval(tick, 100);
    tick();
  });
}

function start(terrain: TerrainData, onFirstFrame?: () => void): void {
  const canvas = el<HTMLCanvasElement>('viewport');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = 'label-layer';
  el('app').appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x9dc0dc);
  scene.background = skyColor;

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    1,
    40_000_000,
  );

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
  sun.position.set(-3_000_000, 4_000_000, -3_500_000);
  scene.add(sun);

  // ---- Textures ----
  const half = new Uint16Array(terrain.data.length);
  for (let i = 0; i < terrain.data.length; i++) {
    half[i] = THREE.DataUtils.toHalfFloat(terrain.data[i]);
  }
  const heightTex = new THREE.DataTexture(
    half,
    terrain.size,
    terrain.size,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
  heightTex.needsUpdate = true;

  const albedoTex = new THREE.DataTexture(
    terrain.albedo,
    terrain.size,
    terrain.size,
    THREE.RGBAFormat,
  );
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.magFilter = THREE.LinearFilter;
  albedoTex.minFilter = THREE.LinearMipmapLinearFilter;
  albedoTex.generateMipmaps = true;
  albedoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  albedoTex.wrapS = albedoTex.wrapT = THREE.ClampToEdgeWrapping;
  albedoTex.needsUpdate = true;

  // ---- Terrain ----
  const material = createTerrainMaterial({
    heightTexture: heightTex,
    albedoTexture: albedoTex,
    worldWidth: WORLD_WIDTH_M,
    worldHeight: WORLD_HEIGHT_M,
    patchRes: PATCH_RES,
  });

  let vertScale = 15;
  material.uniforms.uVertScale.value = vertScale;
  material.uniforms.uFogColor.value = skyColor;

  const cdlod = new CDLODTerrain(material, {
    patchRes: PATCH_RES,
    worldWidth: WORLD_WIDTH_M,
    worldHeight: WORLD_HEIGHT_M,
    maxDepth: 15,
    lodFactor: 6,
    minElevation: terrain.minElevation,
    maxElevation: terrain.maxElevation,
    maxInstances: 12000,
  });
  scene.add(cdlod.mesh);

  // ---- Ocean ----
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_WIDTH_M * 3, WORLD_HEIGHT_M * 3),
    new THREE.MeshStandardMaterial({
      color: 0x14506e,
      roughness: 0.15,
      metalness: 0.5,
      transparent: true,
      opacity: 0.9,
    }),
  );
  ocean.rotation.x = -Math.PI / 2;
  scene.add(ocean);

  // ---- Inland water: rivers and lakes ----
  const water = new WaterSurfaces(terrain.water, vertScale);
  scene.add(water.group);

  // ---- Landmarks: 3D beacons + labels ----
  const groundAt = (nx: number, ny: number): number => {
    const { x, z } = normToWorld(nx, ny);
    return sampleSurfaceHeight(terrain, x, z) * vertScale;
  };

  const markers = new LandmarkMarkers(groundAt);
  markers.setVertScale(vertScale);
  scene.add(markers.group);

  // Actual buildings: palaces, walled cities, hamlets and ruins, built on
  // demand as the camera comes within range of each site.
  const structures = new SiteStructures(terrain, vertScale);
  scene.add(structures.group);

  // Real trees over the forested ground, streamed in around wherever you are.
  const forests = new Forests(terrain, vertScale);
  scene.add(forests.group);

  const activeGroups = new Set<LandmarkGroup>(LANDMARK_GROUPS.map((g) => g.id));

  const labelObjects: CSS2DObject[] = LANDMARKS.map((lm) => {
    const { x, z } = normToWorld(lm.pos[0], lm.pos[1]);
    const div = document.createElement('div');
    div.className = `world-label group-${lm.group}`;
    div.textContent = lm.name;
    const obj = new CSS2DObject(div);
    obj.position.set(x, 0, z);
    scene.add(obj);
    return obj;
  });

  function refreshLabelHeights(): void {
    LANDMARKS.forEach((lm, i) => {
      const spec = SITE_SPECS.get(lm.id);
      const top = spec ? siteTopHeight(spec) * buildingVertScale(vertScale) : 0;
      labelObjects[i].position.y = groundAt(lm.pos[0], lm.pos[1]) + top * 1.15;
    });
    markers.refreshGround(groundAt);
  }
  refreshLabelHeights();

  // ---- Controls ----
  const fly = new FlyControls(camera, canvas);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.maxDistance = 18_000_000;
  orbit.minDistance = 2_000;
  orbit.zoomSpeed = 1.1;

  let mode: 'orbit' | 'fly' = 'orbit';

  function frameContinent(): void {
    // Near top-down from the south so the dragon silhouette reads the way
    // the printed map does: Ice head west, Sky wing north-east, Bay islands
    // east, Rainforest along the southern flank. Slight tilt for relief.
    camera.position.set(80_000, 5_400_000, 1_100_000);
    orbit.target.set(0, 0, 0);
    camera.lookAt(orbit.target);
    orbit.update();
    fly.syncFromCamera();
  }

  // Exposed for headless verification scripts.
  (window as unknown as { __pyrrhia: unknown }).__pyrrhia = {
    camera,
    orbit,
    fly,
    renderer,
    forests,
    frameContinent,
    panOrbit,
    setMode: (m: 'orbit' | 'fly') => setMode(m),
    modeDebug: () => mode,
  };

  /**
   * Slide the orbit rig across the map with the movement keys.
   *
   * The mouse belongs to OrbitControls in this mode, so the keys drive the
   * pivot instead of the view: camera and target shift together, which leaves
   * dragging free to keep swinging around whatever you are looking at.
   * Movement is levelled because the overview camera stares almost straight
   * down, and an un-levelled W there just flies you into the ground.
   *
   * @returns speed applied, in scene units per second
   */
  function panOrbit(dt: number, groundScaled: number, vertScale: number): number {
    const pan = fly.movementDelta(dt, groundScaled, vertScale, true);
    if (pan.lengthSq() === 0) return 0;
    camera.position.add(pan);
    orbit.target.add(pan);
    return fly.speedFor(groundScaled, vertScale);
  }

  function setMode(next: 'orbit' | 'fly'): void {
    mode = next;
    orbit.enabled = next === 'orbit';
    fly.enabled = next === 'fly';
    el('mode-orbit').classList.toggle('active', next === 'orbit');
    el('mode-fly').classList.toggle('active', next === 'fly');
    if (next === 'fly') fly.syncFromCamera();
    else {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      orbit.target.copy(camera.position).addScaledVector(dir, 400_000);
      orbit.update();
    }
  }

  frameContinent();
  setMode('orbit');

  // Keep keyboard focus off the sidebar buttons. A focused button swallows
  // Space (re-firing the click) and makes the movement keys feel dead.
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.closest('button')) {
      (t.closest('button') as HTMLButtonElement).blur();
    }
  });

  function teleport(nx: number, ny: number, agl = 4000, siteId?: string): void {
    const { x, z } = normToWorld(nx, ny);
    const ground = sampleSurfaceHeight(terrain, x, z) * vertScale;

    // Frame the site itself when there is something built there: stand back
    // far enough for the whole town to fit, and high enough to clear its
    // towers, both of which grow with the exaggeration slider.
    const spec = siteId ? SITE_SPECS.get(siteId) : undefined;
    let back: number;
    let height: number;
    if (spec && spec.kind !== 'none') {
      const top = siteTopHeight(spec) * buildingVertScale(vertScale);
      back = Math.max(spec.radius * 2.8, spec.units.span * 14) + top * 0.5;
      height = top * 1.1 + spec.radius * 0.35;
    } else {
      height = agl * Math.max(1, vertScale * 0.35);
      back = height * 2.4;
    }

    // Stand off to the south-west rather than landing on top of the site, so
    // the place is actually in front of you on arrival.
    camera.position.set(x - back * 0.45, ground + height, z + back);
    camera.lookAt(x, ground + height * 0.25, z);

    if (mode === 'orbit') {
      orbit.target.set(x, ground, z);
      orbit.update();
    } else {
      fly.syncFromCamera();
    }
    fly.syncFromCamera();

    // Spawn the destination's buildings and trees on this same frame, so you
    // don't arrive to an empty dune and wait a beat for the place to appear.
    structures.update(camera);
    forests.update(camera);
  }

  // ---- UI ----
  el('mode-orbit').addEventListener('click', () => setMode('orbit'));
  el('mode-fly').addEventListener('click', () => setMode('fly'));
  el('btn-overview').addEventListener('click', () => {
    setMode('orbit');
    frameContinent();
  });

  const vertSlider = el<HTMLInputElement>('vert-scale');
  const vertOut = el<HTMLOutputElement>('vert-scale-out');
  vertSlider.addEventListener('input', () => {
    vertScale = Number(vertSlider.value);
    vertOut.textContent = `${vertScale}×`;
    material.uniforms.uVertScale.value = vertScale;
    refreshLabelHeights();
    structures.setVertScale(vertScale);
    markers.setVertScale(vertScale);
    water.setVertScale(vertScale);
    forests.setVertScale(vertScale);

    // Keep the camera's lateral position and its altitude *above* the scaled
    // ground, so changing exaggeration never flings you into space.
    const ground = sampleSurfaceHeight(terrain, camera.position.x, camera.position.z) * vertScale;
    const agl = Math.max(200, camera.position.y - ground);
    // If we are in a high orbit, keep the absolute height ratio instead.
    if (agl > 80_000) {
      /* leave camera.y alone — orbit overview is independent of relief */
    } else {
      camera.position.y = ground + agl;
    }
    if (mode === 'orbit') {
      orbit.target.y =
        sampleSurfaceHeight(terrain, orbit.target.x, orbit.target.z) * vertScale;
      orbit.update();
    }
  });

  const minimap = new Minimap(el<HTMLCanvasElement>('minimap'), (nx, ny) =>
    teleport(nx, ny, 6000),
  );

  // Filter chips, one per landmark category.
  const chipRow = el('group-filters');
  for (const g of LANDMARK_GROUPS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip active';
    chip.style.setProperty('--chip', g.color);
    const count = LANDMARKS.filter((l) => l.group === g.id).length;
    chip.innerHTML = `<i></i>${g.label} <b>${count}</b>`;
    chip.addEventListener('click', () => {
      if (activeGroups.has(g.id)) activeGroups.delete(g.id);
      else activeGroups.add(g.id);
      chip.classList.toggle('active', activeGroups.has(g.id));
      markers.setVisibleGroups(activeGroups);
      structures.setVisibleGroups(activeGroups);
      renderLandmarkList();
      minimap.setVisibleGroups(activeGroups);
    });
    chipRow.appendChild(chip);
  }

  const list = el('landmark-list');
  const search = el<HTMLInputElement>('landmark-search');

  function renderLandmarkList(): void {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();

    for (const g of LANDMARK_GROUPS) {
      if (!activeGroups.has(g.id)) continue;
      const items = LANDMARKS.filter(
        (lm) =>
          lm.group === g.id &&
          (q === '' ||
            lm.name.toLowerCase().includes(q) ||
            lm.blurb.toLowerCase().includes(q)),
      );
      if (items.length === 0) continue;

      const header = document.createElement('h3');
      header.className = 'lm-group';
      header.style.setProperty('--chip', g.color);
      header.textContent = g.label;
      list.appendChild(header);

      for (const lm of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lm-btn';
        btn.style.setProperty('--chip', g.color);
        btn.innerHTML = `<strong>${lm.name}</strong><span>${lm.blurb}</span>`;
        btn.addEventListener('click', () =>
          teleport(lm.pos[0], lm.pos[1], lm.altitude, lm.id),
        );
        list.appendChild(btn);
      }
    }

    if (!list.firstChild) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No places match.';
      list.appendChild(empty);
    }
  }

  search.addEventListener('input', renderLandmarkList);
  renderLandmarkList();
  el('landmark-count').textContent = `${LANDMARKS.length}`;

  const exportBtn = el<HTMLButtonElement>('btn-export');
  const exportHint = el('export-hint');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    const original = exportHint.textContent;
    exportHint.textContent = 'Building mesh and packing GLB…';
    try {
      const blob = await exportGLB(terrain, {
        resolution: 512,
        vertScale,
        unitDivisor: 1000, // export in kilometres
      });
      downloadBlob(blob, `pyrrhia-${vertScale}x.glb`);
      exportHint.textContent = `Saved (${(blob.size / 1e6).toFixed(1)} MB, units = km).`;
    } catch (err) {
      console.error(err);
      exportHint.textContent = 'Export failed — see console.';
    } finally {
      exportBtn.disabled = false;
      setTimeout(() => {
        exportHint.textContent = original;
      }, 6000);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') {
      setMode('orbit');
      frameContinent();
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- HUD ----
  const posEl = el('pos');
  const altEl = el('alt');
  const groundEl = el('ground');
  const kingdomEl = el('kingdom');
  const spdEl = el('spd');
  const patchesEl = el('patches');

  function kingdomName(id: string): string {
    if (id === 'ocean') return 'Open Ocean';
    if (id === 'sea') return SEA_KINGDOM_META.name;
    return KINGDOMS.find((k) => k.id === id)?.name ?? id;
  }

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  const labelRanking: [number, number][] = [];
  const placed: [number, number, number][] = [];
  // Estimated from the 11px label font; avoids a layout read every frame.
  const labelHalfWidths = LANDMARKS.map((lm) => (lm.name.length * 5.9 + 18) / 2);
  const MAX_LABELS = 18;

  function frame(): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());

    const { nx, ny } = worldToNorm(camera.position.x, camera.position.z);
    const groundTrue = sampleSurfaceHeight(terrain, camera.position.x, camera.position.z);
    const groundScaled = groundTrue * vertScale;

    let speed = 0;
    if (mode === 'fly') {
      speed = fly.update(dt, groundScaled, vertScale);
    } else {
      speed = panOrbit(dt, groundScaled, vertScale);
      orbit.update();
      if (camera.position.y < groundScaled + 200) {
        camera.position.y = groundScaled + 200;
      }
    }

    material.uniforms.uCamPos.value.copy(camera.position);
    cdlod.update(camera, vertScale);

    minimap.setCamera(camera.position.x, camera.position.z, cameraYaw(camera));

    const trueAgl = (camera.position.y - groundScaled) / vertScale;
    posEl.textContent = `${formatDistance(camera.position.x)} E · ${formatDistance(-camera.position.z)} N`;
    altEl.textContent = `${formatDistance(trueAgl)} AGL`;
    groundEl.textContent = `${sampleBaseElevation(terrain, nx, ny).toFixed(0)} m`;
    kingdomEl.textContent = kingdomName(sampleKingdomId(terrain, nx, ny));
    spdEl.textContent =
      mode === 'fly' || speed > 0
        ? `${((speed / vertScale) * 2.23694).toFixed(0)} mph`
        : 'orbit';
    patchesEl.textContent = `${cdlod.lastPatchCount}`;

    markers.update(camera);
    structures.update(camera);
    forests.update(camera);

    // Label de-cluttering: with 60+ places most of them overlap, so only the
    // nearest few in the enabled categories get a name tag.
    labelRanking.length = 0;
    for (let i = 0; i < LANDMARKS.length; i++) {
      const lm = LANDMARKS[i];
      labelObjects[i].element.style.opacity = '0';
      if (!activeGroups.has(lm.group)) continue;

      const { x, z } = normToWorld(lm.pos[0], lm.pos[1]);
      tmp.set(x, labelObjects[i].position.y, z);
      const d = camera.position.distanceTo(tmp);
      if (d > RANK_RANGE_M[labelRank(lm.id)]) continue;
      labelRanking.push([i, d]);
    }
    // Nearest first, then drop any tag that would land on top of one already
    // placed — closer sites win the space.
    labelRanking.sort((a, b) => a[1] - b[1]);
    placed.length = 0;
    for (const [i] of labelRanking) {
      if (placed.length >= MAX_LABELS) break;

      tmp.copy(labelObjects[i].position).project(camera);
      if (tmp.z > 1) continue;
      const px = (tmp.x * 0.5 + 0.5) * innerWidth;
      const py = (-tmp.y * 0.5 + 0.5) * innerHeight;
      const halfW = labelHalfWidths[i];

      let clear = true;
      for (const [ox, oy, ow] of placed) {
        if (Math.abs(px - ox) < halfW + ow && Math.abs(py - oy) < 16) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;

      placed.push([px, py, halfW]);
      labelObjects[i].element.style.opacity = '1';
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);

    if (onFirstFrame) {
      // The first render is where shaders compile, so the loading screen stays
      // up until it lands rather than exposing a blank canvas.
      const done = onFirstFrame;
      onFirstFrame = undefined;
      done();
    }
  }

  frame();
}

function cameraYaw(camera: THREE.Camera): number {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return Math.atan2(-dir.x, -dir.z);
}

boot().catch((err) => {
  console.error(err);
  const label = document.getElementById('load-label');
  if (label) label.textContent = 'Failed to build Pyrrhia — see console.';
});
