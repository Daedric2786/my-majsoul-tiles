// Sky dome, distant mountains and riverbank props. All procedural, palette-driven.
import * as THREE from 'three';
import { RIVER } from '../game/game.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rand = (() => { let a = 9127; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();

export class Scenery {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.buildSky();
    this.buildMountains();
    this.buildBanks();
    this.buildKoi();
  }

  // ---------------------------------------------------------------- sky
  buildSky() {
    const geo = new THREE.SphereGeometry(70, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.3, -1) }, uStars: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uFog; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uStars; uniform float uTime;
        varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          float y = max(vDir.y, 0.0);
          vec3 col = mix(uHorizon, uTop, pow(y, 0.55));
          col = mix(uFog, col, smoothstep(0.0, 0.12, y));
          vec3 L = normalize(uSunDir);
          float d = max(dot(normalize(vDir), L), 0.0);
          col += uSun * (pow(d, 900.0) * 3.0 + pow(d, 30.0) * 0.35 + pow(d, 4.0) * 0.12);
          // stars
          vec3 q = floor(vDir * 180.0);
          float s = step(0.9965, h(q)) * smoothstep(0.08, 0.4, y) * uStars;
          col += vec3(0.9, 0.95, 1.0) * s * (0.6 + 0.4 * sin(uTime * 2.0 + h(q + 1.0) * 30.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.position.set(0, -0.5, -10);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);
  }

  // ---------------------------------------------------------------- mountains (layered silhouettes)
  buildMountains() {
    this.mountains = [];
    const layers = [
      { z: -58, h: 14, w: 150, rough: 0.9, seed: 1, fog: 0.75 },
      { z: -46, h: 9, w: 120, rough: 0.7, seed: 2, fog: 0.55 },
      { z: -36, h: 5.5, w: 100, rough: 0.55, seed: 3, fog: 0.35 },
    ];
    for (const L of layers) {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(0, 256);
      let y = 140;
      const pts = [];
      for (let x = 0; x <= 1024; x += 4) {
        const n = Math.sin(x * 0.006 * (1 + L.seed * 0.3) + L.seed) * 50 + Math.sin(x * 0.021 + L.seed * 3) * 22 * L.rough + Math.sin(x * 0.07 + L.seed) * 6 * L.rough;
        y = 120 - n;
        // leave a valley around the river mouth
        const vx = (x - 512) / 512;
        y += Math.exp(-vx * vx * 30) * 60;
        pts.push([x, y]);
        g.lineTo(x, y);
      }
      g.lineTo(1024, 256);
      g.closePath();
      g.fill();
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0x223344, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h * 2), mat);
      m.position.set(0, L.h * 0.55 - 0.6, L.z);
      m.renderOrder = -9;
      this.group.add(m);
      this.mountains.push({ mesh: m, fog: L.fog });
    }
  }

  // ---------------------------------------------------------------- banks
  buildBanks() {
    const edge = RIVER.halfWidth + 0.62;
    // ground strips (slightly raised) with a soft grass/earth shader
    this.bankMat = new THREE.ShaderMaterial({
      uniforms: { uBank: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uFogNear: { value: 14 }, uFogFar: { value: 30 } },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBank; uniform vec3 uTop; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y); }
        void main(){
          float n = noise(vW.xz * 1.7) * 0.6 + noise(vW.xz * 6.0) * 0.4;
          float away = smoothstep(0.0, 2.5, abs(vW.x) - ${edge.toFixed(2)});
          vec3 col = mix(uBank, uTop, clamp(n * 0.9 + away * 0.4, 0.0, 1.0));
          col *= 0.75 + 0.35 * noise(vW.xz * 0.4);
          float d = length(cameraPosition - vW);
          col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(22, 80, 22, 40);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + 11; // 0..22 away from the edge
        const z = pos.getZ(i);
        const bump = Math.sin(z * 0.35 + side) * 0.12 + Math.sin(z * 1.3) * 0.05;
        pos.setY(i, Math.min(0.55, x * 0.12) + (x > 1 ? bump + Math.sin(x * 0.7 + z * 0.2) * 0.25 * Math.min(1, x / 6) : 0) - 0.02);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.bankMat);
      m.position.set(side * (edge + 11) - side * 0.35, 0, -14);
      if (side < 0) m.scale.x = -1;
      this.group.add(m);
    }

    // rocks along the waterline (instanced)
    const rockGeo = new THREE.DodecahedronGeometry(0.3, 0);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.9, flatShading: true });
    const ROCKS = 70;
    this.rocks = new THREE.InstancedMesh(rockGeo, this.rockMat, ROCKS);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < ROCKS; i++) {
      const side = i % 2 ? 1 : -1;
      p.set(side * (edge + 0.15 + rand() * 1.2), -0.05 + rand() * 0.06, -34 + rand() * 40);
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
      const k = 0.6 + rand() * 1.4;
      s.set(k * (1 + rand() * 0.5), k * 0.55, k);
      mtx.compose(p, q, s);
      this.rocks.setMatrixAt(i, mtx);
    }
    this.group.add(this.rocks);

    // reeds: instanced thin blades
    const bladeGeo = new THREE.PlaneGeometry(0.05, 1, 1, 3);
    bladeGeo.translate(0, 0.5, 0);
    const bp = bladeGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) { const yy = bp.getY(i); bp.setX(i, bp.getX(i) * (1 - yy) + yy * yy * 0.12); }
    this.reedMat = new THREE.MeshStandardMaterial({ color: 0x2c4a2a, roughness: 0.8, side: THREE.DoubleSide });
    const REEDS = 260;
    this.reeds = new THREE.InstancedMesh(bladeGeo, this.reedMat, REEDS);
    this.reedData = [];
    for (let i = 0; i < REEDS; i++) {
      const side = i % 2 ? 1 : -1;
      const cluster = Math.floor(i / 10);
      const cz = -34 + (cluster * 37) % 40;
      const d = { x: side * (edge + 0.3 + rand() * 1.4), z: cz + rand() * 1.4, h: 0.6 + rand() * 1.1, r: rand() * 6.28, lean: (rand() - 0.5) * 0.4, ph: rand() * 6 };
      this.reedData.push(d);
    }
    this.group.add(this.reeds);

    // stone lanterns (toro) with warm windows: merged into two meshes for few draw calls
    this.toro = [];
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6a66, roughness: 0.95 });
    this.toroGlowMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    const stoneParts = [], glowParts = [];
    const place = (geo, x, y, z, ry = 0) => { const g = geo.clone(); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (edge + 1.3 + rand() * 0.8), z = -30 + i * 6.2, y0 = 0.1;
      const k = 1.1;
      const parts = [
        [new THREE.CylinderGeometry(0.28 * k, 0.34 * k, 0.2 * k, 8), 0.1],
        [new THREE.CylinderGeometry(0.1 * k, 0.13 * k, 0.7 * k, 8), 0.45],
        [new THREE.BoxGeometry(0.42 * k, 0.34 * k, 0.42 * k), 0.97],
        [new THREE.ConeGeometry(0.46 * k, 0.3 * k, 4), 1.3, Math.PI / 4],
        [new THREE.SphereGeometry(0.07 * k, 8, 6), 1.5],
      ];
      for (const [geo, yy, ry] of parts) stoneParts.push(place(geo.toNonIndexed ? geo.toNonIndexed() : geo, x, y0 + yy * k, z, ry || 0));
      glowParts.push(place(new THREE.BoxGeometry(0.44 * k, 0.16 * k, 0.2 * k).toNonIndexed(), x, y0 + 0.97 * k, z));
      glowParts.push(place(new THREE.BoxGeometry(0.2 * k, 0.16 * k, 0.44 * k).toNonIndexed(), x, y0 + 0.97 * k, z));
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.world.glowTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      sprite.scale.set(1.9, 1.9, 1);
      sprite.position.set(x, y0 + 0.97 * k, z);
      this.group.add(sprite);
      this.toro.push({ sprite, z });
    }
    const stripUV = (g) => { g.deleteAttribute('uv'); return g; };
    this.group.add(new THREE.Mesh(mergeGeometries(stoneParts.map(stripUV)), stoneMat));
    this.group.add(new THREE.Mesh(mergeGeometries(glowParts.map(stripUV)), this.toroGlowMat));

    // distant trees (billboard clusters)
    this.trees = [];
    const leafTex = this.makeFoliageTexture();
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const mat = new THREE.SpriteMaterial({ map: leafTex, color: 0x2a3a2a, transparent: true, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(mat);
      const sz = 3.2 + rand() * 3;
      sp.scale.set(sz * 1.2, sz, 1);
      sp.position.set(side * (edge + 5 + rand() * 7), sz * 0.42, -38 + rand() * 26);
      this.group.add(sp);
      this.trees.push(sp);
    }
  }

  makeFoliageTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(122, 150, 12, 106);
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2, r = rand() * 80;
      const x = 128 + Math.cos(a) * r * 1.1, y = 110 + Math.sin(a) * r * 0.75;
      g.beginPath();
      g.arc(x, y, 14 + rand() * 20, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  // ---------------------------------------------------------------- koi (submerged sprites)
  buildKoi() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    const body = (col) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(64, 20);
      g.bezierCurveTo(100, 50, 96, 150, 64, 200);
      g.bezierCurveTo(32, 150, 28, 50, 64, 20);
      g.fill();
    };
    body('#f4efe6');
    g.fillStyle = '#e0561f';
    g.beginPath(); g.ellipse(64, 70, 22, 30, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(58, 140, 14, 22, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4efe6';
    g.beginPath(); g.moveTo(64, 190); g.quadraticCurveTo(30, 240, 40, 250); g.quadraticCurveTo(64, 225, 88, 250); g.quadraticCurveTo(98, 240, 64, 190); g.fill();
    g.beginPath(); g.ellipse(34, 100, 16, 8, -0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(94, 100, 16, 8, 0.6, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.koi = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.012;
      m.visible = false;
      this.group.add(m);
      this.koi.push({ m, px: 0, pz: 0 });
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt, cur, koiState, time) {
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(cur.skyTop);
    u.uHorizon.value.copy(cur.sky);
    u.uFog.value.copy(cur.fog);
    u.uSun.value.copy(cur.sun);
    u.uSunDir.value.set(...cur.sunDir);
    u.uStars.value = cur.stars;
    u.uTime.value = time;
    for (const m of this.mountains) {
      m.mesh.material.color.copy(cur.bank).lerp(cur.fog, m.fog).lerp(cur.sky, m.fog * 0.25);
    }
    const bu = this.bankMat.uniforms;
    bu.uBank.value.copy(cur.bank);
    bu.uTop.value.copy(cur.bankTop);
    bu.uFog.value.copy(cur.fog);
    const wu = this.world.water.uniforms;
    bu.uFogNear.value = wu.uFogNear.value;
    bu.uFogFar.value = wu.uFogFar.value;
    this.rockMat.color.copy(cur.bank).lerp(new THREE.Color(0x777777), 0.35);
    this.reedMat.color.copy(cur.bankTop).multiplyScalar(0.9);
    const overhead = this.world.view * this.world.view * (3 - 2 * this.world.view);
    for (const t of this.trees) { t.material.color.copy(cur.bank).lerp(cur.fog, 0.35); t.material.opacity = 1 - overhead; t.visible = overhead < 0.97; }
    for (const t of this.toro) t.sprite.material.opacity = (0.55 + 0.1 * Math.sin(time * 5 + t.z)) * Math.min(1.2, cur.glow);
    this.toroGlowMat.color.copy(cur.lantern);
    // reeds sway
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    this.reedData.forEach((d, i) => {
      p.set(d.x, 0, d.z);
      e.set(Math.sin(time * 1.3 + d.ph) * 0.08 + d.lean, d.r, Math.cos(time * 1.1 + d.ph) * 0.06);
      q.setFromEuler(e);
      s.set(1, d.h, 1);
      mtx.compose(p, q, s);
      this.reeds.setMatrixAt(i, mtx);
    });
    this.reeds.instanceMatrix.needsUpdate = true;
    // koi
    this.koi.forEach((k, i) => {
      const src = koiState && koiState[i];
      k.m.visible = !!src;
      if (!src) return;
      const dx = src.x - k.px, dz = src.z - k.pz;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) k.m.rotation.z = Math.atan2(dx, -dz) + Math.PI;
      k.px = src.x; k.pz = src.z;
      k.m.position.x = src.x; k.m.position.z = src.z;
      k.m.scale.x = 1 + Math.sin(time * 8 + i) * 0.08;
    });
  }
}
