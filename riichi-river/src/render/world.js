import * as THREE from 'three';
import { makeWater, MAX_GLOWS } from './water.js';
import { PALETTES } from './palettes.js';
import { RIVER } from '../game/game.js';

const tmpV = new THREE.Vector3();

export function glowTexture(size = 128, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,220,160,0.35)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, mid);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = this.maxDpr;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-3, 8, -6);
    this.scene.add(this.hemi, this.sun);
    // a soft key light that travels with the camera so the hand rack always reads well
    this.key = new THREE.DirectionalLight(0xfff2e0, 0.7);
    this.key.position.set(0.3, 1.2, 1);
    this.camera.add(this.key);
    this.key.target.position.set(0, 0, -3);
    this.camera.add(this.key.target);

    this.water = makeWater();
    this.water.uniforms.uHalfWidth.value = RIVER.halfWidth + 0.55;
    this.scene.add(this.water.mesh);

    this.glowTex = glowTexture();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.palette = null;
    this.paletteFrom = null;
    this.paletteT = 1;
    this.cur = {};
    this.flow = 0;
    this.time = 0;
    this.shake = 0;
    this.shakeEnabled = true;
    this.camPunch = 0;
    this.camBase = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    this.camOffset = new THREE.Vector3();
    this.glows = []; // world glow sources for water reflections

    this.buildDecor();
    this.setPalette('dusk', true);
  }

  // ------------------------------------------------------------------ palette
  setPalette(name, instant = false) {
    const p = PALETTES[name] || PALETTES.dusk;
    const toCol = (h) => new THREE.Color(h);
    const target = {};
    for (const [k, v] of Object.entries(p)) target[k] = typeof v === 'number' && k !== 'glow' && k !== 'stars' ? toCol(v) : v;
    if (instant || !this.palette) {
      this.paletteFrom = target;
      this.palette = target;
      this.paletteT = 1;
      this.applyPalette(1);
      this.rebuildEnv();
    } else {
      this.paletteFrom = this.snapshotPalette();
      this.palette = target;
      this.paletteT = 0;
    }
    this.paletteName = name;
  }

  snapshotPalette() {
    const out = {};
    for (const [k, v] of Object.entries(this.cur)) out[k] = v && v.isColor ? v.clone() : v;
    return out;
  }

  applyPalette(t) {
    const A = this.paletteFrom, B = this.palette;
    const cur = this.cur;
    for (const k of Object.keys(B)) {
      const b = B[k], a = A[k] ?? b;
      if (b && b.isColor) { cur[k] = (cur[k] || new THREE.Color()).copy(a).lerp(b, t); }
      else if (Array.isArray(b)) cur[k] = b.map((x, i) => (a[i] ?? x) + (x - (a[i] ?? x)) * t);
      else if (typeof b === 'number') cur[k] = a + (b - a) * t;
    }
    const u = this.water.uniforms;
    u.uDeep.value.copy(cur.deep);
    u.uShallow.value.copy(cur.shallow);
    u.uSky.value.copy(cur.sky);
    u.uSkyTop.value.copy(cur.skyTop);
    u.uFoam.value.copy(cur.foam);
    u.uFog.value.copy(cur.fog);
    u.uBank.value.copy(cur.bank);
    u.uBankTop.value.copy(cur.bankTop);
    u.uSun.value.copy(cur.sun);
    u.uSunDir.value.set(...cur.sunDir).normalize();
    u.uLantern.value.copy(cur.lantern).multiplyScalar(cur.glow);
    this.scene.background = cur.fog;
    this.hemi.color.copy(cur.ambient);
    this.hemi.groundColor.copy(cur.ground);
    this.sun.color.copy(cur.sun);
    this.sun.position.set(...cur.sunDir).multiplyScalar(10);
    if (this.petals) this.petals.material.uniforms.uColor.value.copy(cur.petals);
    if (this.petals) this.petals.material.uniforms.uFirefly.value = cur.stars;
    for (const l of this.lanterns || []) l.sprite.material.color.copy(cur.lantern);
  }

  rebuildEnv() {
    const p = this.cur;
    const envScene = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(10, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { a: { value: p.sky.clone() }, b: { value: p.skyTop.clone() }, c: { value: p.deep.clone() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 a; uniform vec3 b; uniform vec3 c; varying vec3 vP; void main(){ float y = normalize(vP).y; vec3 col = y > 0.0 ? mix(a, b, pow(y, 0.6)) : mix(a*0.6, c, clamp(-y*2.0,0.0,1.0)); gl_FragColor = vec4(col*1.2, 1.0);}',
    });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));
    // warm lantern panels give the ivory and lacquer something to reflect
    const lm = new THREE.MeshBasicMaterial({ color: p.lantern.clone().multiplyScalar(3 * p.glow) });
    for (let i = 0; i < 5; i++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), lm);
      const a = (i / 5) * Math.PI * 2;
      q.position.set(Math.cos(a) * 6, 1.5 + (i % 2), Math.sin(a) * 6);
      q.lookAt(0, 0, 0);
      envScene.add(q);
    }
    const sunQ = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.MeshBasicMaterial({ color: p.sun.clone().multiplyScalar(2.5) }));
    sunQ.position.set(...p.sunDir).normalize().multiplyScalar(8);
    sunQ.lookAt(0, 0, 0);
    envScene.add(sunQ);
    const rt = this.pmrem.fromScene(envScene, 0.035);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    skyGeo.dispose(); skyMat.dispose();
  }

  // ------------------------------------------------------------------ decor
  buildDecor() {
    // Floating paper lanterns (toro nagashi): decorative, drift slower than the tiles.
    this.lanterns = [];
    const paperTex = this.makePaperTexture();
    const paperMat = new THREE.MeshBasicMaterial({ map: paperTex, color: 0xffffff });
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.7 });
    const paperGeo = new THREE.BoxGeometry(0.42, 0.4, 0.42);
    const baseGeo = new THREE.BoxGeometry(0.56, 0.07, 0.56);
    const railGeo = new THREE.BoxGeometry(0.46, 0.035, 0.035);
    const innerGeo = new THREE.PlaneGeometry(0.38, 0.38);
    innerGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(baseGeo, woodMat);
      const paper = new THREE.Mesh(paperGeo, [paperMat, paperMat, innerMat, innerMat, paperMat, paperMat]);
      paper.position.y = 0.24;
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.y = 0.445;
      g.add(base, paper, inner);
      for (let r = 0; r < 4; r++) {
        const rail = new THREE.Mesh(railGeo, woodMat);
        const a = (r * Math.PI) / 2;
        rail.position.set(Math.sin(a) * 0.215, 0.45, Math.cos(a) * 0.215);
        rail.rotation.y = a;
        g.add(rail);
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffb45c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sprite.scale.set(2.0, 2.0, 1);
      sprite.position.y = 0.4;
      g.add(sprite);
      g.scale.setScalar(0.8);
      this.scene.add(g);
      this.lanterns.push({ g, sprite, x: 0, z: 0, seed: Math.random(), speed: 0.6 + Math.random() * 0.2 });
      this.respawnLantern(this.lanterns[i], -16 + i * 5.2);
    }

    // Petals / fireflies drifting through the air.
    const N = 140;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = 0.3 + Math.random() * 3.5;
      pos[i * 3 + 2] = -18 + Math.random() * 22;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffc0d0) }, uFirefly: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime; uniform float uScale; varying float vSeed; varying float vFade;
        void main(){
          vec3 p = position;
          float t = uTime * (0.25 + seed * 0.2);
          p.x += sin(t + seed * 30.0) * 1.2 + t * 0.4;
          p.z += mod(t * 1.3 + seed * 22.0, 22.0) - 11.0;
          p.x = mod(p.x + 8.0, 16.0) - 8.0;
          p.y += sin(t * 1.7 + seed * 10.0) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * (22.0 + seed * 16.0) / -mv.z;
          vSeed = seed; vFade = smoothstep(26.0, 12.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uFirefly; uniform float uTime; varying float vSeed; varying float vFade;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float petal = smoothstep(0.5, 0.2, length(c * vec2(1.0, 1.8)));
          float fly = smoothstep(0.5, 0.0, length(c)) * (0.5 + 0.5 * sin(uTime * 3.0 + vSeed * 40.0));
          float a = mix(petal * 0.8, fly, uFirefly);
          vec3 col = mix(uColor, vec3(1.0, 0.9, 0.5) * 1.6, uFirefly);
          gl_FragColor = vec4(col, a * vFade);
          #include <colorspace_fragment>
        }`,
    });
    this.petals = new THREE.Points(geo, mat);
    this.petals.frustumCulled = false;
    this.scene.add(this.petals);
  }

  makePaperTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 70, 10, 64, 64, 90);
    grd.addColorStop(0, '#fff6dc'); grd.addColorStop(0.6, '#ffc877'); grd.addColorStop(1, '#e0843a');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(90,40,10,0.35)'; g.lineWidth = 3;
    g.strokeRect(6, 6, 116, 116);
    g.fillStyle = 'rgba(150,40,20,0.55)';
    g.font = '800 64px "RR Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('灯', 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  respawnLantern(l, z) {
    l.z = z;
    l.x = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.2);
  }

  // ------------------------------------------------------------------ camera
  resize(w, h, rackFrac, hudFrac = 0.1) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera(w / h, rackFrac, hudFrac);
  }

  fitCamera(aspect, rackFrac, hudFrac = 0.1) {
    const cam = this.camera;
    const portrait = aspect < 0.9;
    const pitch = THREE.MathUtils.degToRad(portrait ? 62 : 54);
    const zTop = RIVER.zSpawn + 1.2, zBot = RIVER.zLose - 0.2;
    const yTopWant = 1 - 2 * hudFrac, yBotWant = -1 + 2 * rackFrac;
    const halfW = RIVER.halfWidth + 0.5;
    const proj = new THREE.Vector3();
    const evalP = (fov, d, zT) => {
      cam.fov = fov;
      cam.aspect = aspect;
      cam.position.set(0, Math.sin(pitch) * d, zT + Math.cos(pitch) * d);
      cam.lookAt(0, 0, zT);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const yT = proj.set(0, 0, zTop).project(cam).y;
      const yB = proj.set(0, 0, zBot).project(cam).y;
      const xW = Math.abs(proj.set(halfW, 0, zBot - 0.8).project(cam).x);
      let err = (yT - yTopWant) ** 2 + (yB - yBotWant) ** 2 * 1.5;
      if (xW > 0.985) err += (xW - 0.985) ** 2 * 40;
      err += ((fov - (portrait ? 50 : 38)) / 60) ** 2 * 0.02;
      return err;
    };
    let best = { err: Infinity };
    for (let fov = 28; fov <= 78; fov += 2) {
      for (let d = 8; d <= 34; d += 1) {
        for (let zT = -12; zT <= 2; zT += 1) {
          const err = evalP(fov, d, zT);
          if (err < best.err) best = { err, fov, d, zT };
        }
      }
    }
    // refine
    let step = { fov: 1, d: 0.5, zT: 0.5 };
    for (let it = 0; it < 40; it++) {
      for (const k of ['fov', 'd', 'zT']) {
        for (const s of [-1, 1]) {
          const c = { ...best, [k]: best[k] + s * step[k] };
          const err = evalP(c.fov, c.d, c.zT);
          if (err < best.err) best = { ...c, err };
        }
      }
      if (it % 10 === 9) step = { fov: step.fov / 2, d: step.d / 2, zT: step.zT / 2 };
    }
    evalP(best.fov, best.d, best.zT);
    this.camBase.pos.copy(cam.position);
    this.camBase.target.set(0, 0, best.zT);
    this.camFit = best;
    const u = this.water.uniforms;
    u.uFogNear.value = best.d + 4;
    u.uFogFar.value = best.d + 16;
  }

  // ------------------------------------------------------------------ frame
  update(dt, flowSpeed) {
    this.time += dt;
    this.flow += flowSpeed * dt;
    if (this.paletteT < 1) {
      this.paletteT = Math.min(1, this.paletteT + dt / 2.2);
      const e = this.paletteT * this.paletteT * (3 - 2 * this.paletteT);
      this.applyPalette(e);
      if (this.paletteT >= 1) this.rebuildEnv();
    }
    const u = this.water.uniforms;
    u.uTime.value = this.time;
    u.uFlow.value = this.flow;

    // lanterns drift
    this.glows.length = 0;
    for (const l of this.lanterns) {
      l.z += flowSpeed * l.speed * dt;
      l.x += Math.sin(this.time * 0.3 + l.seed * 9) * 0.05 * dt;
      if (l.z > RIVER.zLose + 2) this.respawnLantern(l, -17);
      const bob = Math.sin(this.time * 1.4 + l.seed * 6) * 0.03;
      l.g.position.set(l.x, -0.02 + bob, l.z);
      l.g.rotation.y = Math.sin(this.time * 0.2 + l.seed * 5) * 0.4;
      l.g.rotation.z = Math.sin(this.time * 1.1 + l.seed) * 0.04;
      l.sprite.material.opacity = 0.55 + 0.1 * Math.sin(this.time * 7 + l.seed * 20) * Math.sin(this.time * 3.1);
      this.glows.push([l.x, l.z, 0.55, 0.55]);
    }
    if (this.extraGlows) for (const g of this.extraGlows) this.glows.push(g);
    for (let i = 0; i < MAX_GLOWS; i++) {
      const g = this.glows[i];
      if (g) u.uGlows.value[i].set(g[0], g[1], g[2], g[3]);
      else u.uGlows.value[i].z = 0;
    }
    this.petals.material.uniforms.uTime.value = this.time;
    this.petals.material.uniforms.uScale.value = this.h ? this.h / 720 * this.dpr : 1;

    // camera: base + gentle breathing + shake + punch
    const cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shakeEnabled ? this.shake * this.shake : 0;
    const bx = Math.sin(this.time * 0.23) * 0.06 + (Math.random() - 0.5) * s * 0.25;
    const by = Math.sin(this.time * 0.31) * 0.04 + (Math.random() - 0.5) * s * 0.25;
    this.camPunch *= Math.exp(-dt * 6);
    tmpV.copy(this.camBase.target).sub(this.camBase.pos).normalize().multiplyScalar(this.camPunch);
    cam.position.copy(this.camBase.pos).add(this.camOffset).add(tmpV);
    cam.position.x += bx; cam.position.y += by;
    cam.lookAt(this.camBase.target.x + bx * 0.5, this.camBase.target.y, this.camBase.target.z);
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }
  punch(a) { this.camPunch += a; }

  render() { this.renderer.render(this.scene, this.camera); }
}
