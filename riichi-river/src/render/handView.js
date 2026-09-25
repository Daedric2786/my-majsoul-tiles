import * as THREE from 'three';
import { TILE_W, TILE_L, TILE_T } from './tileMesh.js';

const D = 3.0; // rack distance in front of the camera
const TILT = 0.2;
const qTmp = new THREE.Quaternion();
const vTmp = new THREE.Vector3();
const HAND_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - TILT, 0, 0));

export class HandView {
  constructor(world, factory) {
    this.world = world;
    this.factory = factory;
    this.root = new THREE.Group();
    world.camera.add(this.root);
    this.tiles = new Map(); // tile id -> item
    this.slots = [];
    this.rects = new Map(); // tile id -> screen rect (tray only)
    this.cap = 6;
    this.locked = false;
    this.layoutInfo = null;
    this.buildRack();
  }

  buildRack() {
    // lacquered wooden rack behind the hand
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(20,12,10,0)');
    grd.addColorStop(0.16, 'rgba(26,14,12,0.78)');
    grd.addColorStop(0.3, 'rgba(34,18,14,0.94)');
    grd.addColorStop(1, 'rgba(14,8,8,0.98)');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 256);
    // wood grain
    g.globalAlpha = 0.08;
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = i % 2 ? '#c08050' : '#000';
      g.beginPath();
      const y = 50 + Math.random() * 206;
      g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
    // gold trim
    const gold = g.createLinearGradient(0, 0, 1024, 0);
    gold.addColorStop(0, 'rgba(200,150,70,0)'); gold.addColorStop(0.5, 'rgba(236,190,110,0.9)'); gold.addColorStop(1, 'rgba(200,150,70,0)');
    g.fillStyle = gold; g.fillRect(0, 40, 1024, 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.rack = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.rack.renderOrder = -1;
    this.root.add(this.rack);

    // slot markers
    const sc = document.createElement('canvas');
    sc.width = 128; sc.height = 172;
    const sg = sc.getContext('2d');
    sg.strokeStyle = 'rgba(240,200,140,0.35)';
    sg.lineWidth = 5;
    sg.setLineDash([14, 10]);
    roundRect(sg, 8, 8, 112, 156, 16);
    sg.stroke();
    sg.fillStyle = 'rgba(0,0,0,0.25)';
    sg.fill();
    this.slotTex = new THREE.CanvasTexture(sc);
    this.slotTex.colorSpace = THREE.SRGBColorSpace;
    this.slotMat = new THREE.MeshBasicMaterial({ map: this.slotTex, transparent: true, depthWrite: false, toneMapped: false });
    this.slotGeo = new THREE.PlaneGeometry(1, 1);

    // riichi stick
    const rc = document.createElement('canvas');
    rc.width = 512; rc.height = 32;
    const rg = rc.getContext('2d');
    rg.fillStyle = '#f7f2e6'; rg.fillRect(0, 0, 512, 32);
    rg.fillStyle = '#c42f2a'; rg.beginPath(); rg.arc(256, 16, 11, 0, Math.PI * 2); rg.fill();
    const rtex = new THREE.CanvasTexture(rc);
    rtex.colorSpace = THREE.SRGBColorSpace;
    this.stick = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.06), [
      new THREE.MeshStandardMaterial({ color: 0xf7f2e6 }), new THREE.MeshStandardMaterial({ color: 0xf7f2e6 }),
      new THREE.MeshStandardMaterial({ map: rtex, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0xf7f2e6 }),
      new THREE.MeshStandardMaterial({ map: rtex }), new THREE.MeshStandardMaterial({ map: rtex }),
    ]);
    this.stick.visible = false;
    this.stickAnim = 0;
    this.root.add(this.stick);
  }

  pxToLocal(px, py, depth = D) {
    const L = this.layoutInfo;
    const wpp = (2 * depth * Math.tan(THREE.MathUtils.degToRad(this.world.camera.fov) / 2)) / L.h;
    return new THREE.Vector3((px - L.w / 2) * wpp, -(py - L.h / 2) * wpp, -depth);
  }

  // Compute pixel layout for the rack.
  computeLayout(w, h, cap, safeBottom = 0) {
    const portrait = w / h < 0.9;
    const pad = 14, gap = portrait ? 6 : 8;
    const trayW = Math.max(38, Math.min(portrait ? 70 : Math.min(66, h * 0.09), (Math.min(w, 900) - pad * 2 - gap * (cap - 1)) / cap));
    const trayH = trayW * (TILE_L / TILE_W);
    const bottom = Math.max(10, safeBottom + 8);
    const trayY = h - bottom - trayH / 2 - 4;
    const mW = Math.max(18, Math.min(portrait ? 34 : Math.min(38, h * 0.052), (Math.min(w, 900) - pad * 2 - 3 * 12) / 12.4));
    const mH = mW * (TILE_L / TILE_W);
    const meldY = trayY - trayH / 2 - 12 - mH / 2;
    const top = meldY - mH / 2 - 14;
    return { w, h, portrait, pad, gap, trayW, trayH, trayY, mW, mH, meldY, top, cap };
  }

  rackTopPx() { return this.layoutInfo ? this.layoutInfo.top : 0; }

  resize(w, h, cap, safeBottom) {
    this.cap = cap;
    this.layoutInfo = this.computeLayout(w, h, cap, safeBottom);
    const L = this.layoutInfo;
    // rack panel covers from `top - 40` to bottom
    const topLocal = this.pxToLocal(w / 2, L.top - 44, D + 0.6);
    const botLocal = this.pxToLocal(w / 2, h + 4, D + 0.6);
    const leftLocal = this.pxToLocal(-4, h, D + 0.6);
    this.rack.position.set(0, (topLocal.y + botLocal.y) / 2, -(D + 0.6));
    this.rack.scale.set(Math.abs(leftLocal.x) * 2.02, topLocal.y - botLocal.y, 1);
    this.rebuildSlots();
    if (this.lastHand) this.layout(this.lastHand, true);
  }

  rebuildSlots() {
    for (const s of this.slots) this.root.remove(s);
    this.slots = [];
    const L = this.layoutInfo;
    for (let i = 0; i < L.cap; i++) {
      const m = new THREE.Mesh(this.slotGeo, this.slotMat);
      const { x } = this.traySlotPx(i, L.cap);
      const p = this.pxToLocal(x, L.trayY, D + 0.25);
      const wpp = this.wpp(D + 0.25);
      m.position.copy(p);
      m.scale.set(L.trayW * wpp * 1.02, L.trayH * wpp * 1.0, 1);
      this.root.add(m);
      this.slots.push(m);
    }
  }

  wpp(depth = D) {
    return (2 * depth * Math.tan(THREE.MathUtils.degToRad(this.world.camera.fov) / 2)) / this.layoutInfo.h;
  }

  traySlotPx(i, n) {
    const L = this.layoutInfo;
    const total = n * L.trayW + (n - 1) * L.gap;
    const x0 = L.w / 2 - total / 2 + L.trayW / 2;
    return { x: x0 + i * (L.trayW + L.gap), y: L.trayY };
  }

  // Assign targets for every tile in the hand.
  layout(hand, snap = false) {
    this.lastHand = hand;
    const L = this.layoutInfo;
    if (!L) return;
    const wppT = this.wpp(D);
    this.rects.clear();
    // melds
    const groups = hand.melds.map((m) => m.tiles);
    const mgap = L.mW * 0.35;
    const widths = [0, 1, 2, 3].map((i) => (groups[i] ? groups[i].length : 3) * L.mW);
    const total = widths.reduce((s, x) => s + x, 0) + mgap * 3;
    let x = L.w / 2 - total / 2;
    const seen = new Set();
    for (let gi = 0; gi < 4; gi++) {
      const tiles = groups[gi] || [];
      tiles.forEach((t, i) => {
        const px = x + L.mW * (i + 0.5);
        this.setTarget(t, px, L.meldY, L.mW, 'meld', snap);
        seen.add(t.id);
      });
      x += widths[gi] + mgap;
    }
    // tray
    hand.tray.forEach((t, i) => {
      const { x: px, y: py } = this.traySlotPx(i, L.cap);
      this.setTarget(t, px, py, L.trayW, 'tray', snap);
      this.rects.set(t.id, { x: px - L.trayW / 2, y: py - L.trayH / 2, w: L.trayW, h: L.trayH });
      seen.add(t.id);
    });
    // slot highlight for empty
    this.slots.forEach((s, i) => { s.visible = i >= hand.tray.length; });
    this.wppT = wppT;
  }

  setTarget(tile, px, py, pw, row, snap) {
    let it = this.tiles.get(tile.id);
    if (!it) {
      // appears directly (e.g. snap re-layout before the flight is registered)
      it = this.createItem(tile);
      snap = true;
    }
    // the face sits TILE_T/2 in front of the tile centre: push the centre back so the face lands on the slot
    const scale0 = (pw * this.wpp(D)) / TILE_W * 0.9;
    const pos = this.pxToLocal(px, py, D + (TILE_T / 2) * scale0);
    const scale = (pw * this.wpp(D + (TILE_T / 2) * scale0)) / TILE_W * 0.9;
    it.target.copy(pos);
    it.targetScale = scale;
    if (it.row !== row && it.row && row === 'meld') it.slam = 1;
    it.row = row;
    if (snap && !it.flight) {
      it.group.position.copy(pos);
      it.group.scale.setScalar(scale);
      it.group.quaternion.copy(HAND_Q);
    }
  }

  createItem(tile, group = null) {
    const g = group || this.factory.make(tile);
    this.root.add(g);
    const it = {
      tile, group: g, target: new THREE.Vector3(), targetScale: 1, vel: new THREE.Vector3(),
      flight: null, row: null, slam: 0, hop: 0, hopDelay: 0, dim: 0,
    };
    this.tiles.set(tile.id, it);
    return it;
  }

  // Take a mesh from the world (river) and fly it into the hand.
  flyIn(tile, worldGroup, delay = 0, dur = 0.34) {
    const cam = this.world.camera;
    cam.updateMatrixWorld(true);
    worldGroup.updateMatrixWorld(true);
    const wpos = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    worldGroup.matrixWorld.decompose(wpos, wq, ws);
    worldGroup.parent?.remove(worldGroup);
    const g = worldGroup;
    const it = this.tiles.get(tile.id) || this.createItem(tile, g);
    if (it.group !== g) { this.root.remove(it.group); it.group = g; this.root.add(g); }
    const local = this.root.worldToLocal(wpos.clone());
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const lq = camQ.invert().multiply(wq);
    g.position.copy(local);
    g.quaternion.copy(lq);
    g.scale.copy(ws);
    it.flight = { from: local.clone(), fromQ: lq.clone(), fromS: ws.x, t: -delay, dur };
    return it;
  }

  // Remove a tile from the hand and return its mesh in world space (for discards).
  takeOut(tileId) {
    const it = this.tiles.get(tileId);
    if (!it) return null;
    this.tiles.delete(tileId);
    const g = it.group;
    g.updateMatrixWorld(true);
    const wpos = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    g.matrixWorld.decompose(wpos, wq, ws);
    this.root.remove(g);
    g.position.copy(wpos); g.quaternion.copy(wq); g.scale.set(1, 1, 1);
    return { group: g, wpos };
  }

  clearAll() {
    for (const it of this.tiles.values()) this.root.remove(it.group);
    this.tiles.clear();
    this.rects.clear();
  }

  hopWave() {
    let i = 0;
    const order = [...this.tiles.values()].sort((a, b) => a.target.x - b.target.x);
    for (const it of order) { it.hop = 1; it.hopDelay = i++ * 0.045; }
  }

  setLocked(locked) {
    this.locked = locked;
    if (locked) { this.stick.visible = true; this.stickAnim = 0; }
    else this.stick.visible = false;
  }

  pick(px, py) {
    for (const [id, r] of this.rects) {
      if (px >= r.x - 3 && px <= r.x + r.w + 3 && py >= r.y - 6 && py <= r.y + r.h + 6) return id;
    }
    return null;
  }

  // Screen position (px) of a tile's current location (for FX).
  screenOf(tileId) {
    const it = this.tiles.get(tileId);
    if (!it) return null;
    it.group.getWorldPosition(vTmp);
    vTmp.project(this.world.camera);
    const L = this.layoutInfo;
    return { x: (vTmp.x * 0.5 + 0.5) * L.w, y: (-vTmp.y * 0.5 + 0.5) * L.h };
  }

  update(dt) {
    const t = this.world.time;
    for (const it of this.tiles.values()) {
      const g = it.group;
      if (it.flight) {
        const F = it.flight;
        F.t += dt;
        if (F.t < 0) continue;
        const u = Math.min(1, F.t / F.dur);
        const e = 1 - Math.pow(1 - u, 3);
        // arc: lift up (toward the camera) then drop into the slot
        vTmp.copy(F.from).lerp(it.target, e);
        const lift = Math.sin(u * Math.PI) * 0.35;
        vTmp.y += lift;
        vTmp.z += Math.sin(u * Math.PI) * 0.25;
        g.position.copy(vTmp);
        g.quaternion.copy(F.fromQ).slerp(HAND_Q, Math.min(1, e * 1.15));
        const s = F.fromS + (it.targetScale - F.fromS) * e;
        g.scale.setScalar(s * (1 + Math.sin(u * Math.PI) * 0.12));
        if (u >= 1) {
          it.flight = null;
          it.vel.set(0, -0.6, 0);
          it.landed = 1;
          this.onLand?.(it);
        }
        continue;
      }
      // spring towards target (sub-stepped semi-implicit Euler: stable for any frame time)
      const k = 260, c = 24;
      let rem = dt;
      while (rem > 1e-6) {
        const h = Math.min(rem, 1 / 240);
        vTmp.copy(it.target).sub(g.position).multiplyScalar(k);
        vTmp.addScaledVector(it.vel, -c);
        it.vel.addScaledVector(vTmp, h);
        g.position.addScaledVector(it.vel, h);
        rem -= h;
      }
      // hop (win wave)
      if (it.hop > 0) {
        if (it.hopDelay > 0) it.hopDelay -= dt;
        else {
          it.hop = Math.max(0, it.hop - dt * 2.4);
          g.position.y += Math.sin((1 - it.hop) * Math.PI) * 0.05;
        }
      }
      const sl = it.slam;
      it.slam = Math.max(0, it.slam - dt * 3.5);
      const s = it.targetScale * (1 + Math.sin(sl * Math.PI) * 0.14);
      g.scale.setScalar(g.scale.x + (s - g.scale.x) * Math.min(1, dt * 18));
      qTmp.copy(HAND_Q);
      if (this.locked && it.row === 'tray') {
        qTmp.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 2 + it.tile.id) * 0.02, 0, 0)));
      }
      g.quaternion.slerp(qTmp, Math.min(1, dt * 14));
    }
    // riichi stick drop
    if (this.stick.visible && this.layoutInfo) {
      const L = this.layoutInfo;
      this.stickAnim = Math.min(1, this.stickAnim + dt * 2.5);
      const p = this.pxToLocal(L.w / 2, L.top - 6, D);
      const e = 1 - Math.pow(1 - this.stickAnim, 3);
      this.stick.position.set(p.x, p.y + (1 - e) * 0.5, p.z + 0.1);
      const width = Math.min(L.w * 0.5, 260) * this.wpp(D);
      this.stick.scale.set(width, 1.5, 1);
      this.stick.rotation.set(0.9, 0, (1 - e) * 0.4);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export { TILE_T };
