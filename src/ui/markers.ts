import * as THREE from 'three';
import {
  LANDMARK_GROUPS,
  LANDMARKS,
  RANK_RANGE_M,
  labelRank,
  type LandmarkGroup,
} from '../data/landmarks';
import { normToWorld } from '../data/scale';
import { buildingVertScale, SITE_SPECS, siteTopHeight } from '../world/sites';

/**
 * Beacons marking every named location.
 *
 * At 1:1 scale a palace is far smaller than one pixel from orbit, so each site
 * gets a screen-space-sized marker: an octahedron whose world size grows with
 * camera distance, keeping it visible from 3,000 km up and from 200 m away.
 */
export class LandmarkMarkers {
  readonly group = new THREE.Group();

  private readonly meshes: THREE.Mesh[] = [];
  private readonly stalks: THREE.Mesh[] = [];
  private readonly basePos: THREE.Vector3[] = [];
  private readonly groupOf: LandmarkGroup[] = [];
  private readonly rangeOf: number[] = [];
  /** Height of the buildings below each beacon, in true metres. */
  private readonly topOf: number[] = [];
  private vertScale = 1;
  private visibleGroups = new Set<LandmarkGroup>(
    LANDMARK_GROUPS.map((g) => g.id),
  );

  constructor(groundAt: (nx: number, ny: number) => number) {
    const headGeo = new THREE.OctahedronGeometry(1, 0);
    // Unit-tall stalk anchored at its base so scaling grows it upward.
    const stalkGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 5);
    stalkGeo.translate(0, 0.5, 0);

    const heads = new Map<LandmarkGroup, THREE.MeshBasicMaterial>();
    const lines = new Map<LandmarkGroup, THREE.MeshBasicMaterial>();
    for (const g of LANDMARK_GROUPS) {
      const color = new THREE.Color(g.color);
      heads.set(
        g.id,
        new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }),
      );
      lines.set(
        g.id,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.4,
          depthTest: false,
        }),
      );
    }

    for (const lm of LANDMARKS) {
      const { x, z } = normToWorld(lm.pos[0], lm.pos[1]);

      // Cloned per site because each fades independently with distance.
      const head = new THREE.Mesh(headGeo, heads.get(lm.group)!.clone());
      const stalk = new THREE.Mesh(stalkGeo, lines.get(lm.group)!.clone());
      for (const m of [head, stalk]) {
        m.renderOrder = 10;
        m.frustumCulled = false;
        this.group.add(m);
      }

      this.meshes.push(head);
      this.stalks.push(stalk);
      this.basePos.push(new THREE.Vector3(x, groundAt(lm.pos[0], lm.pos[1]), z));
      this.groupOf.push(lm.group);
      this.rangeOf.push(RANK_RANGE_M[labelRank(lm.id)] * 1.6);
      const spec = SITE_SPECS.get(lm.id);
      this.topOf.push(spec ? siteTopHeight(spec) : 0);
    }
  }

  setVisibleGroups(groups: Set<LandmarkGroup>): void {
    this.visibleGroups = groups;
  }

  /** Recompute marker heights after the exaggeration slider moves. */
  refreshGround(groundAt: (nx: number, ny: number) => number): void {
    LANDMARKS.forEach((lm, i) => {
      this.basePos[i].y = groundAt(lm.pos[0], lm.pos[1]);
    });
  }

  setVertScale(v: number): void {
    this.vertScale = v;
  }

  update(camera: THREE.PerspectiveCamera): void {
    const fovScale = Math.tan((camera.fov * Math.PI) / 360);
    const bv = buildingVertScale(this.vertScale);

    for (let i = 0; i < this.meshes.length; i++) {
      const head = this.meshes[i];
      const stalk = this.stalks[i];
      const base = this.basePos[i];
      const dist = camera.position.distanceTo(base);

      // Minor sites drop out entirely once you climb away from them, so the
      // continent view shows landmarks rather than confetti.
      const show = this.visibleGroups.has(this.groupOf[i]) && dist < this.rangeOf[i];
      head.visible = show;
      stalk.visible = show;
      if (!show) continue;

      // Constant apparent size: ~0.6 % of viewport height at any range.
      const size = THREE.MathUtils.clamp(dist * fovScale * 0.011, 60, 45_000);
      // Clear the rooftops, or the beacon ends up buried in its own palace.
      const lift = size * 3.5 + this.topOf[i] * bv * 1.05;

      head.scale.setScalar(size);
      head.position.set(base.x, base.y + lift, base.z);
      head.rotation.y += 0.005;

      stalk.scale.set(size, lift, size);
      stalk.position.copy(base);

      // Fade out over the last quarter of a site's visible range.
      const fade =
        1 - THREE.MathUtils.smoothstep(dist, this.rangeOf[i] * 0.75, this.rangeOf[i]);
      (head.material as THREE.MeshBasicMaterial).opacity = fade;
      (stalk.material as THREE.MeshBasicMaterial).opacity = fade * 0.4;
    }
  }
}
