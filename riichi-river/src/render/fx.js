import * as THREE from 'three';

// GPU-light particle system: one Points object, CPU-simulated (a few hundred max).
const MAX = 600;

export class FX {
  constructor(world) {
    this.world = world;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.parts = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale; varying float vA; varying vec3 vC;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * uScale / -mv.z;
          vA = alpha; vC = color;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying vec3 vC;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vC * a * vA, a * vA);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    world.scene.add(this.points);
    this.geo = geo;
    this.scaleU = mat.uniforms.uScale;
  }

  emit(n, fn) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX) this.parts.shift();
      const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, max: 1, size: 20, r: 1, g: 1, b: 1, grav: 9, drag: 0.5, a: 1 };
      fn(p, i);
      p.max = p.life;
      this.parts.push(p);
    }
  }

  splash(x, z, strength = 1, color = [0.85, 0.95, 1]) {
    this.emit(Math.round(14 * strength), (p) => {
      const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random() * 1.6) * strength;
      p.x = x + Math.cos(a) * 0.2; p.y = 0.05; p.z = z + Math.sin(a) * 0.2;
      p.vx = Math.cos(a) * s * 0.8; p.vz = Math.sin(a) * s * 0.8; p.vy = 2 + Math.random() * 2.5 * strength;
      p.life = 0.45 + Math.random() * 0.35; p.size = 26 + Math.random() * 30;
      [p.r, p.g, p.b] = color; p.a = 0.8;
    });
  }

  sparkle(pos, n = 24, color = [1, 0.8, 0.4], speed = 1.5, size = 34) {
    this.emit(n, (p) => {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random());
      p.x = pos.x; p.y = pos.y; p.z = pos.z;
      p.vx = Math.cos(a) * Math.cos(e) * s; p.vy = Math.sin(e) * s + 0.5; p.vz = Math.sin(a) * Math.cos(e) * s;
      p.life = 0.5 + Math.random() * 0.6; p.size = size * (0.5 + Math.random());
      [p.r, p.g, p.b] = color; p.grav = 1.5; p.drag = 1.8;
    });
  }

  update(dt) {
    const parts = this.parts;
    for (const p of parts) {
      p.life -= dt;
      p.vy -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    this.parts = parts.filter((p) => p.life > 0 && p.y > -0.2);
    const n = this.parts.length;
    for (let i = 0; i < MAX; i++) {
      if (i < n) {
        const p = this.parts[i];
        this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
        this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
        const t = p.life / p.max;
        this.size[i] = p.size * (0.4 + 0.6 * t);
        this.alpha[i] = p.a * Math.min(1, t * 2.5);
      } else this.alpha[i] = 0;
    }
    this.geo.setDrawRange(0, Math.max(1, n));
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
    this.scaleU.value = (this.world.h || 720) / 720 * this.world.dpr * 10;
  }
}
