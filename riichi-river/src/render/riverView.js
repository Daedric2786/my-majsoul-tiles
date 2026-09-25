import * as THREE from 'three';
import { TILE_T, TILE_W, TILE_L } from './tileMesh.js';
import { MAX_WATER_TILES } from './water.js';

const FLOAT_Y = TILE_T / 2 - 0.3; // how deep tiles sit in the water
const tmp = new THREE.Vector3();

export class RiverView {
  constructor(world, factory) {
    this.world = world;
    this.factory = factory;
    this.items = new Map(); // float id -> { group, float, ... }
    this.drifters = []; // purely visual tiles (discards) drifting away
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.hintKinds = new Map(); // kind -> 'meld' | 'win'
    this.hintsOn = true;
    this.riichiWaits = null;
    this.hover = null;

    // raft + lantern shared resources
    this.raftMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.8 });
    this.raftGeo = new THREE.CylinderGeometry(0.05, 0.05, TILE_W * 2.3, 8);
    this.raftGeo.rotateZ(Math.PI / 2);
    this.ropeMat = new THREE.MeshStandardMaterial({ color: 0xc0302a, roughness: 0.6 });
    this.ropeGeo = new THREE.TorusGeometry(0.2, 0.025, 6, 16);
    this.lanternMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    this.lanternGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.5, 12, 1, false);
    this.goldGlow = world.glowTex;
  }

  add(f) {
    let g;
    if (f.lantern) g = this.makeGoldLantern();
    else if (f.tiles.length > 1) g = this.makeRaft(f);
    else g = this.factory.make(f.tile);
    g.userData.floatId = f.id;
    this.group.add(g);
    const it = { group: g, f, appear: 0, hidden: false, glowT: 0, reject: 0 };
    this.items.set(f.id, it);
    this.sync(it, 0);
    return it;
  }

  makeRaft(f) {
    const g = new THREE.Group();
    const tiles = f.tiles.map((t, i) => {
      const m = this.factory.make(t);
      m.position.x = (i - 0.5) * (TILE_W + 0.06);
      g.add(m);
      return m;
    });
    for (const z of [-0.26, 0.26]) {
      const log = new THREE.Mesh(this.raftGeo, this.raftMat);
      log.position.set(0, -0.12, z);
      g.add(log);
    }
    const rope = new THREE.Mesh(this.ropeGeo, this.ropeMat);
    rope.rotation.x = Math.PI / 2;
    rope.scale.set(1.2, 2.3, 1);
    rope.position.y = 0.02;
    g.add(rope);
    g.userData.raftTiles = tiles;
    return g;
  }

  makeGoldLantern() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.lanternGeo, this.lanternMat);
    body.position.y = 0.2;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.goldGlow, color: 0xffc050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.scale.set(2.4, 2.4, 1);
    sprite.position.y = 0.3;
    g.add(body, sprite);
    g.userData.sprite = sprite;
    return g;
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return null;
    this.items.delete(id);
    this.group.remove(it.group);
    this.disposeExtras(it);
    return it;
  }

  disposeExtras(it) {
    if (it.halo) { it.group.remove(it.halo); it.halo.material.dispose(); it.halo = null; }
    if (it.f && it.f.lantern) it.group.userData.sprite.material.dispose();
  }

  // Remove from the river but hand the mesh over (for catch animations).
  detach(id) {
    const it = this.items.get(id);
    if (!it) return null;
    this.items.delete(id);
    this.disposeExtras(it);
    it.group.updateMatrixWorld(true);
    return it;
  }

  // Visual-only drifting tile (discard or released tile) that floats away.
  addDrifter(group, x, z) {
    group.position.set(x, FLOAT_Y + 0.8, z);
    group.rotation.set(0, (Math.random() - 0.5) * 0.8, 0);
    this.group.add(group);
    this.drifters.push({ group, x, z, vy: 1.5, y: FLOAT_Y + 0.8, seed: Math.random(), spin: (Math.random() - 0.5) * 3, landed: false });
  }

  setHints(useful, waits, riichi, hintsOn, noGlow) {
    this.hintKinds = new Map();
    if (hintsOn) for (const [k, a] of useful) { if (a === 'win' && noGlow) continue; this.hintKinds.set(k, a === 'win' ? 'win' : 'meld'); }
    if (!noGlow) for (const k of waits) if (riichi || hintsOn) this.hintKinds.set(k, 'win');
    if (riichi && !noGlow) {
      this.hintKinds = new Map(waits.map((k) => [k, 'win']));
    }
  }

  hintFor(f) {
    if (f.lantern) return 0;
    if (f.hidden) return 0;
    let best = 0;
    for (const t of f.tiles) {
      const h = this.hintKinds.get(t.kind);
      if (h === 'win') best = 2;
      else if (h === 'meld' && best < 1) best = 1;
    }
    return best;
  }

  sync(it, dt) {
    const f = it.f;
    const g = it.group;
    const t = this.world.time;
    it.appear = Math.min(1, it.appear + dt * 2.2);
    const a = it.appear;
    const bob = Math.sin(t * 1.9 + f.seed * 20) * 0.025;
    const pop = (1 - a) * -0.35;
    g.position.set(f.x, FLOAT_Y + bob + pop, f.z);
    g.rotation.set(Math.sin(t * 1.3 + f.seed * 7) * 0.05, f.yaw, Math.cos(t * 1.1 + f.seed * 5) * 0.05, 'YXZ');
    it.reject = Math.max(0, it.reject - dt * 3);
    if (it.reject > 0) g.rotation.z += Math.sin(it.reject * 30) * 0.12 * it.reject;
    const hover = this.hover === f.id ? 1.08 : 1;
    const s = (0.6 + 0.4 * easeOutBack(a)) * hover;
    g.scale.setScalar(s);
    if (!f.lantern && f.tiles.length === 1 && it.hidden !== !!f.hidden) {
      it.hidden = !!f.hidden;
      this.factory.setHidden(g, it.hidden);
    }
    if (f.lantern) {
      g.userData.sprite.material.opacity = 0.7 + 0.3 * Math.sin(t * 6 + f.seed * 10);
    }
    // winning tiles (riichi / tenpai) get a golden halo floating above them
    const want = it.hint === 2 ? 1 : 0;
    it.glowT += (want - it.glowT) * Math.min(1, dt * 6);
    if (it.glowT > 0.01) {
      if (!it.halo) {
        it.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.goldGlow, color: 0xffc860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        it.halo.position.y = -0.02; // inside the tile: the tile body hides the centre -> a golden rim
        g.add(it.halo);
      }
      it.halo.visible = true;
      const pulse = 0.75 + 0.25 * Math.sin(t * 7 + f.seed * 5);
      it.halo.material.opacity = it.glowT * (0.55 + 0.45 * pulse);
      const hs = (1.35 + 0.2 * pulse) / Math.max(0.3, g.scale.x);
      it.halo.scale.set(hs, hs, 1);
    } else if (it.halo) it.halo.visible = false;
  }

  update(dt, floats) {
    for (const f of floats) {
      const it = this.items.get(f.id);
      if (it) this.sync(it, dt);
    }
    // drifters
    for (const d of this.drifters) {
      if (!d.landed) {
        d.vy -= 12 * dt;
        d.y += d.vy * dt;
        if (d.y <= FLOAT_Y) { d.y = FLOAT_Y; d.landed = true; this.world.water.ripple(d.x, d.z, 0.8); this.onSplash?.(d.x, d.z, 0.6); }
      } else {
        d.y = FLOAT_Y + Math.sin(this.world.time * 2 + d.seed * 9) * 0.02;
      }
      d.z += dt * 1.4;
      d.group.rotation.y += d.spin * dt * 0.3;
      d.group.position.set(d.x, d.y, d.z);
      if (d.z > 6) { this.group.remove(d.group); d.dead = true; }
    }
    this.drifters = this.drifters.filter((d) => !d.dead);

    // push tile data to the water shader
    const u = this.world.water.uniforms;
    let n = 0;
    const extra = [];
    for (const f of floats) {
      if (n >= MAX_WATER_TILES) break;
      const it = this.items.get(f.id);
      const hint = this.hintFor(f);
      u.uTiles.value[n++].set(f.x, f.z, f.lantern ? 0.5 : f.tiles.length > 1 ? 1.4 : 1, hint);
      if (f.lantern) extra.push([f.x, f.z, 1.1, 0.7]);
      if (it) it.hint = hint;
    }
    for (const d of this.drifters) {
      if (n >= MAX_WATER_TILES) break;
      if (d.landed) u.uTiles.value[n++].set(d.x, d.z, 0.8, 0);
    }
    u.uTileCount.value = n;
    this.world.extraGlows = extra;
  }

  // Screen-space picking with generous radius (touch friendly). Returns float id.
  pick(px, py, floats, w, h) {
    const cam = this.world.camera;
    let best = null, bestD = Infinity;
    for (const f of floats) {
      tmp.set(f.x, FLOAT_Y + 0.2, f.z).project(cam);
      const sx = (tmp.x * 0.5 + 0.5) * w, sy = (-tmp.y * 0.5 + 0.5) * h;
      // projected size of the tile at that depth
      const s2 = tmp.clone().set(f.x + TILE_L * 0.5, FLOAT_Y + 0.2, f.z).project(cam);
      const rad = Math.abs((s2.x - tmp.x) * 0.5 * w);
      const R = Math.max(26, rad * (f.tiles.length > 1 ? 2.2 : 1.45) + 8);
      const d = Math.hypot(px - sx, py - sy);
      if (d < R && d / R < bestD) { bestD = d / R; best = f.id; }
    }
    return best;
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
    for (const d of this.drifters) this.group.remove(d.group);
    this.drifters = [];
  }
}

export function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export { FLOAT_Y };
