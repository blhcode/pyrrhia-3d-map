import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** True when the keystroke belongs to a text field rather than the camera. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Free-fly controller tuned for continent-scale worlds.
 * Speed auto-scales with altitude so you can cross an ocean or skim a dune
 * without touching the throttle.
 */
export class FlyControls {
  readonly camera: THREE.PerspectiveCamera;
  readonly dom: HTMLElement;

  enabled = false;
  /** Baseline ground speed in true metres per second. */
  moveSpeed = 400;
  lookSpeed = 0.0022;
  boost = 6;

  private keys = new Set<string>();
  private dragging = false;
  private prevX = 0;
  private prevY = 0;
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.dom = dom;
    this.euler.setFromQuaternion(camera.quaternion);

    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Alt-tabbing away with a key held would otherwise leave it stuck down and
    // the camera drifting forever.
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.dragging = true;
      this.prevX = e.clientX;
      this.prevY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.dragging) return;
      const dx = e.clientX - this.prevX;
      const dy = e.clientY - this.prevY;
      this.prevX = e.clientX;
      this.prevY = e.clientY;
      this.euler.y -= dx * this.lookSpeed;
      this.euler.x -= dy * this.lookSpeed;
      this.euler.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, this.euler.x),
      );
      this.camera.quaternion.setFromEuler(this.euler);
    });

    dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.85 : 1.15;
        this.moveSpeed = Math.max(20, Math.min(400_000, this.moveSpeed * factor));
      },
      { passive: false },
    );
  }

  /** Currently-held key codes. Used by the headless input diagnostic. */
  keysDebug(): string[] {
    return [...this.keys];
  }

  /** Inject a held key. Used by the headless input diagnostic. */
  keysDebugAdd(code: string): void {
    this.keys.add(code);
  }

  /** Release a held key. Used by the headless input diagnostic. */
  keysDebugDelete(code: string): void {
    this.keys.delete(code);
  }

  /** Re-read orientation from the camera after another controller moved it. */
  syncFromCamera(): void {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
  }

  /**
   * Travel speed for the current altitude and boost state, in scene units per
   * second. Rises with height so the same keys work for skimming a dune and
   * for crossing an ocean.
   *
   * @param groundScaled ground height already multiplied by vertical exaggeration
   * @param vertScale    current vertical exaggeration
   */
  speedFor(groundScaled: number, vertScale: number): number {
    const boosted = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const agl = Math.max(0, (this.camera.position.y - groundScaled) / vertScale);
    const altFactor = 1 + agl / 2500;
    return this.moveSpeed * altFactor * (boosted ? this.boost : 1);
  }

  /**
   * World-space movement asked for by the keys held this frame. Works whether
   * or not the controller is enabled, so orbit mode can drive its pivot with
   * the same keys rather than leaving them dead.
   *
   * @param levelled keep forward and strafe in the ground plane. Orbit mode
   *   wants this: looking almost straight down, an un-levelled W would fly you
   *   into the terrain instead of across it.
   */
  movementDelta(
    dt: number,
    groundScaled: number,
    vertScale: number,
    levelled = false,
  ): THREE.Vector3 {
    const wish = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    if (levelled) {
      forward.y = 0;
      if (forward.lengthSq() < 1e-8) {
        // Straight down: fall back to whichever compass direction is currently
        // pointing up the screen, which is what W means to the user.
        forward.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
        forward.y = 0;
      }
      forward.normalize();
    }

    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) wish.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) wish.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) wish.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) wish.sub(right);
    if (this.keys.has('KeyE') || this.keys.has('Space')) wish.y += 1;
    if (this.keys.has('KeyQ') || this.keys.has('ControlLeft')) wish.y -= 1;

    if (wish.lengthSq() === 0) return wish;
    return wish.normalize().multiplyScalar(this.speedFor(groundScaled, vertScale) * dt);
  }

  /** @returns speed actually applied, in scene units per second */
  update(dt: number, groundScaled: number, vertScale: number): number {
    this.camera.position.add(this.movementDelta(dt, groundScaled, vertScale));

    const minY = groundScaled + 30 * Math.max(1, vertScale * 0.2);
    if (this.camera.position.y < minY) this.camera.position.y = minY;

    return this.speedFor(groundScaled, vertScale);
  }
}
