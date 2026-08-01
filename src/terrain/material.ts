import * as THREE from 'three';

/**
 * GLSL mirror of the CPU detail noise in noise.ts.
 * The baked heightmap is only ~4 km per texel, so all sub-kilometre relief is
 * synthesised here in the vertex shader as real displaced geometry.
 */
const NOISE_GLSL = /* glsl */ `
float dhash(vec2 p) {
  p = mod(p, 2048.0);
  return fract(sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453);
}

float dvnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dhash(i);
  float b = dhash(i + vec2(1.0, 0.0));
  float c = dhash(i + vec2(0.0, 1.0));
  float d = dhash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float dfbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * dvnoise(p);
    n += a;
    p *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

float dridge(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < 4; i++) {
    float v = 1.0 - abs(dvnoise(p) * 2.0 - 1.0);
    v *= v;
    s += a * v;
    n += a;
    p *= 2.07;
    a *= 0.5;
  }
  return s / n;
}
`;

const VERTEX = /* glsl */ `
precision highp float;

attribute vec2 iOffset;
attribute float iScale;

uniform sampler2D uHeight;
uniform vec2 uWorldSize;
uniform float uVertScale;
uniform vec3 uCamPos;
uniform float uRes;
uniform float uMorphStart;
uniform float uMorphEnd;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vElev;
varying float vLand;

#include <common>
#include <logdepthbuf_pars_vertex>

${NOISE_GLSL}

vec2 worldToUv(vec2 w) {
  return (w + uWorldSize * 0.5) / uWorldSize;
}

// Fades the procedural detail out once a patch cell grows larger than the
// features themselves — saves the noise cost at range and stops it aliasing
// into shimmer when the whole continent is on screen.
float gDetailFade;

float heightAt(vec2 w) {
  vec4 hd = texture2D(uHeight, clamp(worldToUv(w), vec2(0.0005), vec2(0.9995)));
  float h = hd.r;
  if (hd.g > 0.5 && gDetailFade > 0.001) {
    float f = abs(hd.b);
    vec2 p = w * 0.001 * f;
    float n = hd.b > 0.0 ? dridge(p) : dfbm(p);
    h += (n - 0.45) * hd.g * gDetailFade;
  }
  return h;
}

void main() {
  vec2 grid = position.xz;

  float cell = iScale / uRes;
  gDetailFade = 1.0 - smoothstep(1500.0, 14000.0, cell);

  // CDLOD morph: blend this patch's grid toward its parent's grid with
  // distance so neighbouring LOD levels meet without cracks or popping.
  vec2 preW = iOffset + grid * iScale;
  float dist = distance(uCamPos.xz, preW);
  float ms = iScale * uMorphStart;
  float me = iScale * uMorphEnd;
  float k = clamp((dist - ms) / max(me - ms, 1.0), 0.0, 1.0);

  vec2 idx = grid * uRes;
  vec2 parentGrid = (floor(idx * 0.5 + 0.001) * 2.0) / uRes;
  vec2 g = mix(grid, parentGrid, k);

  vec2 w = iOffset + g * iScale;

  vec4 hd = texture2D(uHeight, clamp(worldToUv(w), vec2(0.0005), vec2(0.9995)));
  float h = heightAt(w);

  // Analytic-ish normal from finite differences at this LOD's cell size.
  float e = max(cell, 6.0);
  float hL = heightAt(w - vec2(e, 0.0));
  float hR = heightAt(w + vec2(e, 0.0));
  float hB = heightAt(w - vec2(0.0, e));
  float hF = heightAt(w + vec2(0.0, e));
  vec3 nrm = normalize(vec3((hL - hR) * uVertScale, 2.0 * e, (hB - hF) * uVertScale));

  vec3 worldPos = vec3(w.x, h * uVertScale, w.y);

  vWorld = worldPos;
  vNormal = nrm;
  vUv = worldToUv(w);
  vElev = h;
  vLand = hd.a;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);

  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uAlbedo;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vElev;
varying float vLand;

#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>

  vec3 n = normalize(vNormal);
  vec3 albedo = texture2D(uAlbedo, vUv).rgb;

  // Steep faces lose their vegetation / snow and show bare rock.
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  albedo = mix(albedo, vec3(0.33, 0.29, 0.26), smoothstep(0.30, 0.80, slope) * vLand * 0.85);

  float ndl = max(dot(n, normalize(uSunDir)), 0.0);
  float wrap = max(dot(n, normalize(uSunDir)) * 0.5 + 0.5, 0.0);

  vec3 sky = vec3(0.42, 0.56, 0.72);
  vec3 col = albedo * (0.22 + 0.95 * ndl);
  col += albedo * sky * 0.30 * wrap;

  // Subtle aerial perspective. Kept weak on purpose: at continental range even
  // a mild exponential term saturates and turns the whole map sky-coloured.
  float d = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-d * uFogDensity);
  col = mix(col, uFogColor, clamp(fog, 0.0, 0.55));

  // Darken the seabed so the coastline stays legible underwater.
  col *= mix(0.55, 1.0, clamp(vLand + smoothstep(-400.0, 0.0, vElev), 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

export interface TerrainMaterialOptions {
  heightTexture: THREE.DataTexture;
  albedoTexture: THREE.DataTexture;
  worldWidth: number;
  worldHeight: number;
  patchRes: number;
}

export function createTerrainMaterial(opts: TerrainMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: opts.heightTexture },
      uAlbedo: { value: opts.albedoTexture },
      uWorldSize: { value: new THREE.Vector2(opts.worldWidth, opts.worldHeight) },
      uVertScale: { value: 6 },
      uCamPos: { value: new THREE.Vector3() },
      uRes: { value: opts.patchRes },
      uMorphStart: { value: 1.15 },
      uMorphEnd: { value: 1.95 },
      uSunDir: { value: new THREE.Vector3(-0.55, 0.78, -0.30).normalize() },
      uFogColor: { value: new THREE.Color(0x8eb6d4) },
      uFogDensity: { value: 6e-8 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.FrontSide,
  });
}
