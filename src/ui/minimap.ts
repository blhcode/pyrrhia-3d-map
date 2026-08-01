import { ALL_LAND } from '../data/coastline';
import type { NormPoint } from '../data/coastline';
import { KINGDOMS, SEA_KINGDOM_META } from '../data/kingdoms';
import { LANDMARK_GROUPS, LANDMARKS, type LandmarkGroup } from '../data/landmarks';
import { worldToNorm } from '../data/scale';

const GROUP_COLOR = new Map<LandmarkGroup, string>(
  LANDMARK_GROUPS.map((g) => [g.id, g.color]),
);

export type TeleportHandler = (nx: number, ny: number) => void;

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onTeleport: TeleportHandler;
  private camNx = 0.5;
  private camNy = 0.5;
  private heading = 0;
  private visibleGroups = new Set<LandmarkGroup>(LANDMARK_GROUPS.map((g) => g.id));

  constructor(canvas: HTMLCanvasElement, onTeleport: TeleportHandler) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.onTeleport = onTeleport;

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const nx = x / canvas.width;
      const ny = 1 - y / canvas.height;
      this.onTeleport(nx, ny);
    });

    this.draw();
  }

  setVisibleGroups(groups: Set<LandmarkGroup>): void {
    this.visibleGroups = new Set(groups);
    this.draw();
  }

  setCamera(worldX: number, worldZ: number, yawRad: number): void {
    const { nx, ny } = worldToNorm(worldX, worldZ);
    this.camNx = nx;
    this.camNy = ny;
    this.heading = yawRad;
    this.draw();
  }

  private draw(): void {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // ocean
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1a3a55');
    grad.addColorStop(1, '#0d2438');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const toCanvas = (p: NormPoint): [number, number] => [
      p[0] * w,
      (1 - p[1]) * h,
    ];

    const fillPoly = (poly: NormPoint[], fill: string, stroke?: string) => {
      ctx.beginPath();
      poly.forEach((p, i) => {
        const [x, y] = toCanvas(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    for (const k of KINGDOMS) {
      fillPoly(k.polygon, rgb(k.color), 'rgba(0,0,0,0.25)');
    }

    // leftover land / islands not in kingdom polys
    for (const land of ALL_LAND) {
      ctx.beginPath();
      land.forEach((p, i) => {
        const [x, y] = toCanvas(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Sea Kingdom label area
    ctx.fillStyle = SEA_KINGDOM_META.label;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillText('Sea Kingdom', 0.82 * w, (1 - 0.38) * h);

    for (const lm of LANDMARKS) {
      if (!this.visibleGroups.has(lm.group)) continue;
      const [x, y] = toCanvas(lm.pos);
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = GROUP_COLOR.get(lm.group) ?? '#fff6c8';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 0.8;
      ctx.fill();
      ctx.stroke();
    }

    // camera marker
    const cx = this.camNx * w;
    const cy = (1 - this.camNy) * h;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.heading); // yaw: 0 looks -Z (north)
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}
