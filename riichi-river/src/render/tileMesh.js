import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cellOf, cellUV, MIST_CELL } from './faces.js';

export const TILE_W = 0.62;
export const TILE_L = 0.83; // along the face's vertical
export const TILE_T = 0.46;

export const BACK_COLORS = {
  lacquer: 0xa82a2a,
  jade: 0x1f6b57,
  indigo: 0x243f78,
};

export class TileFactory {
  constructor(atlasTexture) {
    this.atlas = atlasTexture;
    const ivoryH = TILE_T * 0.64, backH = TILE_T * 0.4;
    this.ivoryGeo = new RoundedBoxGeometry(TILE_W, ivoryH, TILE_L, 3, 0.075);
    this.ivoryGeo.translate(0, TILE_T / 2 - ivoryH / 2, 0);
    this.backGeo = new RoundedBoxGeometry(TILE_W * 0.995, backH, TILE_L * 0.995, 3, 0.08);
    this.backGeo.translate(0, -TILE_T / 2 + backH / 2, 0);

    this.ivoryMat = new THREE.MeshStandardMaterial({ color: 0xf1e9d6, roughness: 0.33, metalness: 0.0, envMapIntensity: 0.9 });
    this.backMat = new THREE.MeshStandardMaterial({ color: BACK_COLORS.lacquer, roughness: 0.22, metalness: 0.05, envMapIntensity: 1.2 });
    this.faceMat = new THREE.MeshStandardMaterial({ map: atlasTexture, roughness: 0.36, metalness: 0.0, envMapIntensity: 0.8 });
    this.faceGeos = new Map();
    this.hoverMat = null;
  }

  setBackColor(hex) { this.backMat.color.setHex(hex); }

  faceGeo(cell) {
    let g = this.faceGeos.get(cell);
    if (g) return g;
    g = new THREE.PlaneGeometry(TILE_W * 0.9, TILE_L * 0.92);
    g.rotateX(-Math.PI / 2);
    g.translate(0, TILE_T / 2 + 0.0015, 0);
    const { u0, v0, u1, v1 } = cellUV(cell);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) < 0.5 ? u0 : u1, uv.getY(i) < 0.5 ? v0 : v1);
    }
    this.faceGeos.set(cell, g);
    return g;
  }

  // A tile lying face-up; local +y is the face normal, local -z is the top of the glyphs.
  make(tile) {
    const group = new THREE.Group();
    const ivory = new THREE.Mesh(this.ivoryGeo, this.ivoryMat);
    const back = new THREE.Mesh(this.backGeo, this.backMat);
    const face = new THREE.Mesh(this.faceGeo(tile ? cellOf(tile.kind, tile.red) : MIST_CELL), this.faceMat);
    group.add(ivory, back, face);
    group.userData = { tile, face };
    return group;
  }

  setHidden(group, hidden) {
    const t = group.userData.tile;
    const cell = hidden ? MIST_CELL : cellOf(t.kind, t.red);
    group.userData.face.geometry = this.faceGeo(cell);
  }
}
