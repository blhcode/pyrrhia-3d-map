// Bundled into the headless page by scripts/dump-terrain.mjs.
// Renders the generated heightfield straight to a canvas — albedo lit by a
// hillshade — so terrain features can be checked without waiting on a
// software-rasterised WebGL frame.
import { generateTerrain } from '../src/terrain/generate';

declare global {
  interface Window {
    dumpTerrain: (size: number, vertScale: number) => Promise<string>;
  }
}

window.dumpTerrain = async (size: number, vertScale: number): Promise<string> => {
  const t = await generateTerrain(size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);

  // Metres per texel, so the slope calculation is in real proportions.
  const spacing = 5_198_689 / size;
  const sun = { x: -0.55, y: 0.62, z: -0.56 };

  const heightAt = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(size - 1, x));
    const cy = Math.max(0, Math.min(size - 1, y));
    return t.data[(cy * size + cx) * 4] * vertScale;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const hl = heightAt(x - 1, y);
      const hr = heightAt(x + 1, y);
      const hu = heightAt(x, y - 1);
      const hd = heightAt(x, y + 1);

      let nx = (hl - hr) / (2 * spacing);
      let nz = (hu - hd) / (2 * spacing);
      const len = Math.hypot(nx, 1, nz);
      nx /= len;
      nz /= len;
      const ny = 1 / len;

      const lambert = Math.max(0, nx * sun.x + ny * sun.y + nz * sun.z);
      const shade = 0.32 + 0.78 * lambert;

      const isLand = t.data[i * 4 + 3] > 0.5;
      const base = t.data[i * 4];
      // Anything below the sea plane reads as water, inland or not.
      const flooded = isLand && base < 0;

      let r = t.albedo[i * 4] / 255;
      let g = t.albedo[i * 4 + 1] / 255;
      let b = t.albedo[i * 4 + 2] / 255;
      if (flooded) {
        r = 0.08;
        g = 0.31;
        b = 0.43;
      } else if (isLand) {
        // Tint the canopy density over the soil so the forest dump is readable
        // without waiting on a software-rasterised WebGL frame of every tree.
        const canopy = t.forest[i] / 255;
        r = r * (1 - canopy * 0.55) + 0.12 * canopy;
        g = g * (1 - canopy * 0.55) + 0.42 * canopy;
        b = b * (1 - canopy * 0.55) + 0.14 * canopy;
      }

      const s = isLand && !flooded ? shade : 1;
      img.data[i * 4] = Math.min(255, r * s * 255);
      img.data[i * 4 + 1] = Math.min(255, g * s * 255);
      img.data[i * 4 + 2] = Math.min(255, b * s * 255);
      img.data[i * 4 + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
};
