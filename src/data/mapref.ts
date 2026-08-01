/**
 * Reference frame for the canonical Pyrrhia map.
 *
 * Every piece of geography in this project — coastline, kingdom borders,
 * landmark positions — is authored in pixel coordinates of Mike Schley's
 * published Pyrrhia map (the 600×456 plate used in books 6–10 and A Guide to
 * the Dragon World), then converted here. Working in map pixels means a
 * position can be checked by opening the reference image and reading it off
 * the grid, rather than being guessed in abstract 0..1 space.
 *
 * `scripts/trace-coast.mjs` traces the coastline out of that same image, so the
 * outline and everything placed on it share one coordinate system.
 */

import type { NormPoint } from './coastline';

export const MAP_PX_W = 600;
export const MAP_PX_H = 456;

/** Painted border thickness. Map content lives inside this inset. */
export const MAP_MARGIN = 26;

export const MAP_IN_W = MAP_PX_W - MAP_MARGIN * 2; // 548
export const MAP_IN_H = MAP_PX_H - MAP_MARGIN * 2; // 404

/**
 * Map pixel → normalised world coords (0..1, origin south-west, +x east,
 * +y north). Image rows run south, so y is flipped.
 */
export function px(x: number, y: number): NormPoint {
  return [(x - MAP_MARGIN) / MAP_IN_W, 1 - (y - MAP_MARGIN) / MAP_IN_H];
}

/** Inverse of `px`, for tooling that reports world positions in map space. */
export function toMapPx(nx: number, ny: number): [number, number] {
  return [nx * MAP_IN_W + MAP_MARGIN, (1 - ny) * MAP_IN_H + MAP_MARGIN];
}
