import * as THREE from 'three';

export const MAX_WATER_TILES = 40;
export const MAX_RIPPLES = 16;
export const MAX_GLOWS = 10;

const vert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform float uQuality;
uniform float uTime;
uniform float uFlow;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSkyTop;
uniform vec3 uFoam;
uniform vec3 uFog;
uniform vec3 uBank;
uniform vec3 uBankTop;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uLantern;
uniform float uHalfWidth;
uniform vec4 uTiles[${MAX_WATER_TILES}];   // x, z, strength, glimmer(0 none, 1 meld, 2 win)
uniform int uTileCount;
uniform vec4 uRipples[${MAX_RIPPLES}];  // x, z, t0, strength
uniform vec4 uGlows[${MAX_GLOWS}];      // x, z, intensity, radius
uniform vec4 uEddy;       // x, z, r, on
uniform vec3 uRapids;     // z0, z1, on
uniform float uMist;      // mist line z (or -999)
uniform float uFogNear;
uniform float uFogFar;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  int oct = uQuality > 0.5 ? 4 : 2;
  for (int i = 0; i < 4; i++) { if (i >= oct) break; v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return oct == 4 ? v : v * 1.33;
}

// Height field of the flowing surface (flow is along +z).
float surf(vec2 p) {
  vec2 q = vec2(p.x * 1.1, (p.y - uFlow) * 0.55);
  float h = fbm(q + vec2(0.0, uTime * 0.03)) * 0.6;
  h += noise(vec2(p.x * 3.2 + uTime * 0.2, (p.y - uFlow * 1.15) * 1.4)) * 0.25;
  h += sin(p.x * 2.1 + (p.y - uFlow) * 0.9 + uTime * 0.6) * 0.05;
  return h;
}

void main() {
  vec2 p = vWorld.xz;
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);

  // ------------- bank mask
  float edge = abs(p.x) - uHalfWidth;
  float bankT = smoothstep(0.25, 0.55, edge);

  // ------------- normal from height field
  float e = 0.06;
  float h0 = surf(p);
  float hx = surf(p + vec2(e, 0.0));
  float hz = surf(p + vec2(0.0, e));
  float amp = 0.55;
  // rapids roughen the surface
  float rap = uRapids.z * smoothstep(uRapids.x - 0.8, uRapids.x + 0.4, p.y) * (1.0 - smoothstep(uRapids.y - 0.4, uRapids.y + 0.8, p.y));
  amp += rap * 0.9;
  vec3 N = normalize(vec3(-(hx - h0) / e * amp * 0.35, 1.0, -(hz - h0) / e * amp * 0.35));

  // ------------- tiles: contact shadow, wake, ripples, glimmer
  float shadow = 0.0;
  float foamT = 0.0;
  vec3 glimmer = vec3(0.0);
  for (int i = 0; i < ${MAX_WATER_TILES}; i++) {
    if (i >= uTileCount) break;
    vec4 t = uTiles[i];
    vec2 d = p - t.xy;
    if (d.x * d.x + (d.y + 1.0) * (d.y + 1.0) > 7.5) continue; // cheap reject (wake extends upstream)
    float r = length(d * vec2(1.0, 0.85));
    shadow += exp(-r * r * 5.5) * 0.55 * t.z;
    // bow wave: bright band just outside the tile, stronger on the upstream side
    float ring = exp(-pow((r - 0.5) * 11.0, 2.0));
    float up = 0.35 + 0.65 * smoothstep(0.3, -0.5, d.y);
    foamT += ring * up * 0.22 * t.z;
    // wake trailing upstream (water runs past the tile relative to its drift)
    float wake = exp(-abs(d.x) * 7.0) * smoothstep(0.35, -1.6, d.y) * smoothstep(-2.6, -0.3, d.y);
    foamT += wake * 0.18 * t.z * (0.7 + 0.3 * sin(d.x * 23.0 + (p.y - uFlow) * 11.0));
    // hint glimmer
    if (t.w > 0.5) {
      float pulse = 0.65 + 0.35 * sin(uTime * 5.0 + t.x * 3.0);
      float g = exp(-pow((r - 0.62) * 6.0, 2.0)) * pulse + exp(-r * r * 2.0) * 0.25;
      vec3 gc = t.w > 1.5 ? vec3(1.0, 0.78, 0.3) * 1.6 : vec3(0.55, 0.85, 1.0) * 0.9;
      glimmer += gc * g;
    }
  }
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    if (rp.w <= 0.0) continue;
    float age = uTime - rp.z;
    if (age < 0.0 || age > 1.4) continue;
    float rr = length(p - rp.xy);
    float rad = 0.3 + age * 0.85;
    float ring = exp(-pow((rr - rad) * 9.0, 2.0)) * (1.0 - age / 1.4) * (1.0 - age / 1.4);
    foamT += ring * rp.w * 0.9;
    N = normalize(N + vec3((p - rp.xy) / max(rr, 0.01) * ring * 0.8 * rp.w, 0.0).xzy);
  }

  // ------------- eddy swirl
  if (uEddy.w > 0.5) {
    vec2 d = p - uEddy.xy;
    float r = length(d * vec2(1.0, 1.25));
    float a = atan(d.y, d.x);
    float sw = sin(a * 3.0 + r * 6.0 - uTime * 3.2);
    float mask = smoothstep(uEddy.z + 0.4, uEddy.z * 0.3, r);
    foamT += smoothstep(0.75, 1.0, sw) * mask * 0.45;
    shadow += mask * 0.25 * smoothstep(uEddy.z * 0.6, 0.0, r);
  }

  // ------------- colours
  float band = fbm(vec2(p.x * 0.35 + 3.0, (p.y - uFlow * 0.85) * 0.14));
  float across = clamp(abs(p.x) / (uHalfWidth + 0.3), 0.0, 1.0);
  float depth = 1.0 - across * across;
  vec3 body = mix(uShallow, uDeep, clamp(depth * 0.9 + (band - 0.5) * 0.5 + 0.1, 0.0, 1.0));
  body += uShallow * max(h0 - 0.5, 0.0) * 0.9;            // light through wave crests
  body *= 1.0 - shadow * 0.5;

  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  float skyT = clamp(R.y * 1.2, 0.0, 1.0);
  vec3 skyCol = mix(uSky, uSkyTop, pow(skyT, 0.7));
  // low reflection angles see the dark banks / mountains rather than open sky
  skyCol = mix(mix(uBank, uFog, 0.45) * 1.1, skyCol, smoothstep(0.03, 0.22, R.y + (abs(p.x) / (uHalfWidth + 1.0)) * -0.08));
  // capped so ivory tiles always stand out against the water
  vec3 col = mix(body, skyCol * 0.85, clamp(0.1 + fres * 0.8, 0.0, 0.5));

  // sun / moon glitter path
  vec3 L = normalize(uSunDir);
  float sd = max(dot(R, L), 0.0);
  col += uSun * (pow(sd, 90.0) * 0.9 + pow(sd, 12.0) * 0.035);
  float sparkle = smoothstep(0.975, 0.995, noise(p * vec2(7.0, 12.0) + vec2(uTime * 0.9, -uFlow * 5.0)));
  col += uSun * sparkle * pow(sd, 4.0) * 0.6 * uQuality;

  // lantern reflections: streaks stretched toward the viewer
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    vec4 g = uGlows[i];
    if (g.z <= 0.0) continue;
    vec2 d = p - g.xy;
    float wob = sin(p.y * 7.0 - uFlow * 9.0 + uTime * 2.0) * 0.08;
    float streak = exp(-pow((d.x + wob) * 2.6 / g.w, 2.0)) * exp(-pow(max(d.y * 0.8, -d.y * 2.8) / (g.w * 2.2), 2.0));
    float halo = exp(-dot(d, d) / (g.w * g.w * 0.7));
    col += uLantern * (streak * 0.75 + halo * 0.4) * g.z;
  }

  // foam: thin broken current lines + bank froth + rapids
  float n1 = noise(vec2(p.x * 7.0, (p.y - uFlow * 1.1) * 1.1));
  float gate = smoothstep(0.35, 0.75, fbm(vec2(p.x * 1.3, (p.y - uFlow) * 0.5)));
  float lines = smoothstep(0.8, 0.92, n1) * gate * 0.4;
  float bankFoam = exp(-pow(edge * 5.0, 2.0)) * (0.35 + 0.65 * noise(vec2(p.x * 6.0, (p.y - uFlow) * 2.5)));
  float rapFoam = rap * smoothstep(0.5, 0.85, noise(vec2(p.x * 3.5, (p.y - uFlow * 1.7) * 1.3)));
  foamT += lines + bankFoam * 0.7 + rapFoam * 0.9;
  col = mix(col, uFoam, clamp(foamT, 0.0, 1.0) * 0.6);
  col += glimmer;

  // ------------- bank
  float grass = noise(p * 2.5) * 0.5 + noise(p * 9.0) * 0.25;
  vec3 bankCol = mix(uBank, uBankTop, smoothstep(0.35, 1.2, edge) * (0.6 + grass));
  float wet = exp(-max(edge - 0.3, 0.0) * 3.0) * 0.45;
  bankCol *= 1.0 - wet;
  col = mix(col, bankCol, bankT);

  // ------------- mist
  if (uMist > -900.0) {
    // soft bank of mist over the upper river: low-contrast, slowly drifting wisps
    float m = smoothstep(uMist + 1.6, uMist - 1.4, p.y);
    float mn = fbm(vec2(p.x * 0.35 + uTime * 0.04, p.y * 0.25 - uTime * 0.015));
    col = mix(col, uFog, m * (0.72 + 0.18 * mn));
  }

  // ------------- distance fog
  float f = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFog, f);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeWater() {
  const uniforms = {
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() },
    uSkyTop: { value: new THREE.Color() },
    uFoam: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uBank: { value: new THREE.Color() },
    uBankTop: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, -1) },
    uLantern: { value: new THREE.Color() },
    uHalfWidth: { value: 3.55 },
    uTiles: { value: Array.from({ length: MAX_WATER_TILES }, () => new THREE.Vector4()) },
    uTileCount: { value: 0 },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uGlows: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uEddy: { value: new THREE.Vector4(0, 0, 1, 0) },
    uRapids: { value: new THREE.Vector3(0, 0, 0) },
    uMist: { value: -999 },
    uFogNear: { value: 14 },
    uFogFar: { value: 30 },
    uQuality: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag });
  const geo = new THREE.PlaneGeometry(48, 70, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -12);
  let rippleIdx = 0;
  return {
    mesh,
    uniforms,
    ripple(x, z, strength = 1) {
      const r = uniforms.uRipples.value[rippleIdx];
      r.set(x, z, uniforms.uTime.value, strength);
      rippleIdx = (rippleIdx + 1) % MAX_RIPPLES;
    },
  };
}
