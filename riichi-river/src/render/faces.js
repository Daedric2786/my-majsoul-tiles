// Procedurally painted tile faces (original artwork), packed into one atlas.
// Cells: 0..33 = kinds, 34..36 = red 5m/5p/5s, 37 = mist (hidden) face.
import { numOf, suitOf } from '../game/tiles.js';

export const CELL_W = 256;
export const CELL_H = 344;
export const COLS = 8;
export const ROWS = 5;
export const ATLAS_W = 2048;
export const ATLAS_H = 2048;

export const INK = '#1c1a2b';
export const RED = '#c42f2a';
export const GREEN = '#1d7650';
export const BLUE = '#1f4f93';
const IVORY_A = '#fbf7ec';
const IVORY_B = '#efe5cf';

export const cellOf = (kind, red) => (red ? 34 + suitOf(kind) : kind);
export const MIST_CELL = 37;

export function cellUV(cell) {
  const cx = cell % COLS, cy = Math.floor(cell / COLS);
  return {
    u0: (cx * CELL_W) / ATLAS_W,
    v0: 1 - ((cy + 1) * CELL_H) / ATLAS_H,
    u1: ((cx + 1) * CELL_W) / ATLAS_W,
    v1: 1 - (cy * CELL_H) / ATLAS_H,
  };
}

const MINCHO = '"RR Mincho", "Shippori Mincho", serif';
const ROUND = '"RR Round", "Zen Maru Gothic", sans-serif';

export function drawAtlas({ index = true } = {}) {
  const c = document.createElement('canvas');
  c.width = ATLAS_W; c.height = ATLAS_H;
  const ctx = c.getContext('2d');
  for (let cell = 0; cell < 38; cell++) {
    const x = (cell % COLS) * CELL_W, y = Math.floor(cell / COLS) * CELL_H;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.rect(0, 0, CELL_W, CELL_H); ctx.clip();
    if (cell === MIST_CELL) drawMist(ctx);
    else {
      drawBackground(ctx);
      const red = cell >= 34;
      const kind = red ? [4, 13, 22][cell - 34] : cell;
      drawKind(ctx, kind, red);
      if (index) drawIndex(ctx, kind, red);
    }
    ctx.restore();
  }
  return c;
}

// Standalone face (for DOM thumbnails)
export function faceDataURL(atlas, kind, red = false, scale = 0.35) {
  const cell = cellOf(kind, red);
  const c = document.createElement('canvas');
  c.width = Math.round(CELL_W * scale); c.height = Math.round(CELL_H * scale);
  const ctx = c.getContext('2d');
  ctx.drawImage(atlas, (cell % COLS) * CELL_W, Math.floor(cell / COLS) * CELL_H, CELL_W, CELL_H, 0, 0, c.width, c.height);
  return c.toDataURL();
}

function drawBackground(ctx) {
  const g = ctx.createRadialGradient(CELL_W * 0.45, CELL_H * 0.4, 20, CELL_W * 0.5, CELL_H * 0.5, CELL_H * 0.7);
  g.addColorStop(0, IVORY_A);
  g.addColorStop(1, IVORY_B);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  // faint grain
  const rnd = mulberry(1234);
  ctx.globalAlpha = 0.035;
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rnd() < 0.5 ? '#8a7a5a' : '#ffffff';
    ctx.fillRect(rnd() * CELL_W, rnd() * CELL_H, 1 + rnd() * 2, 1);
  }
  ctx.globalAlpha = 1;
  // soft edge falloff so the decal blends into the ivory body
  const e = ctx.createLinearGradient(0, 0, 0, CELL_H);
  e.addColorStop(0, 'rgba(255,255,255,0.35)');
  e.addColorStop(0.08, 'rgba(255,255,255,0)');
  e.addColorStop(0.92, 'rgba(120,100,70,0)');
  e.addColorStop(1, 'rgba(120,100,70,0.12)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, CELL_W, CELL_H);
}

function drawMist(ctx) {
  const g = ctx.createLinearGradient(0, 0, CELL_W, CELL_H);
  g.addColorStop(0, '#dfe6ea');
  g.addColorStop(1, '#b9c6ce');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const y = 100 + i * 70;
    ctx.moveTo(40, y);
    ctx.bezierCurveTo(90, y - 30, 150, y + 30, 216, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(40,60,80,0.5)';
  ctx.font = `800 120px ${MINCHO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', CELL_W / 2, CELL_H / 2 + 6);
}

// Engraved look: dark offset "cut" beneath the coloured fill.
function engrave(ctx, drawFn, depth = 2.2) {
  ctx.save();
  ctx.translate(depth * 0.5, depth);
  ctx.globalAlpha = 0.22;
  drawFn('#3a2c14');
  ctx.restore();
  ctx.save();
  ctx.translate(-0.8, -0.8);
  ctx.globalAlpha = 0.5;
  drawFn('#ffffff');
  ctx.restore();
  drawFn(null);
}

function drawIndex(ctx, kind, red) {
  let label, color;
  if (kind < 27) {
    label = String(numOf(kind));
    color = red ? RED : [RED, BLUE, GREEN][suitOf(kind)];
  } else if (kind <= 30) {
    label = 'ESWN'[kind - 27];
    color = INK;
  } else return;
  ctx.font = `900 40px ${ROUND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const x = CELL_W - 30, y = 32;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(label, x - 1, y - 1);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}

const MAN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function drawKind(ctx, kind, red) {
  const s = suitOf(kind);
  if (s === 0) return drawMan(ctx, numOf(kind), red);
  if (s === 1) return drawPin(ctx, numOf(kind), red);
  if (s === 2) return drawSou(ctx, numOf(kind), red);
  return drawHonor(ctx, kind);
}

function glyph(ctx, ch, x, y, size, color, weight = 800, stretchY = 1) {
  engrave(ctx, (c) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, stretchY);
    ctx.font = `${weight} ${size}px ${MINCHO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c || color;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
}

function drawMan(ctx, n, red) {
  glyph(ctx, MAN_NUM[n - 1], CELL_W / 2, 104, 120, red ? RED : INK, 800, 0.92);
  glyph(ctx, '萬', CELL_W / 2, 238, 132, RED, 800, 1.02);
}

function drawHonor(ctx, kind) {
  if (kind === 31) { // haku: framed blank
    engrave(ctx, (c) => {
      ctx.strokeStyle = c || BLUE;
      ctx.lineWidth = 9;
      roundRect(ctx, 52, 64, CELL_W - 104, CELL_H - 128, 14);
      ctx.stroke();
      ctx.lineWidth = 3.5;
      roundRect(ctx, 68, 80, CELL_W - 136, CELL_H - 160, 8);
      ctx.stroke();
    });
    return;
  }
  const map = { 27: ['東', INK], 28: ['南', INK], 29: ['西', INK], 30: ['北', INK], 32: ['發', GREEN], 33: ['中', RED] };
  const [ch, col] = map[kind];
  glyph(ctx, ch, CELL_W / 2, CELL_H / 2 + 6, kind === 33 ? 196 : 176, col, 800, kind === 33 ? 1.08 : 1.04);
}

// ---------------------------------------------------------------- pin (dots)
const AREA = { x: 34, y: 40, w: CELL_W - 68, h: CELL_H - 80 };
const ax = (u) => AREA.x + u * AREA.w;
const ay = (v) => AREA.y + v * AREA.h;
const aw = (r) => r * AREA.w;

function dot(ctx, u, v, r, color, big = false) {
  const x = ax(u), y = ay(v), R = aw(r);
  engrave(ctx, (c) => {
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = c || color; ctx.fill();
  }, 2);
  // inner rings
  ctx.beginPath(); ctx.arc(x, y, R * 0.74, 0, Math.PI * 2);
  ctx.fillStyle = IVORY_A; ctx.fill();
  if (big) {
    // petal rosette
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.5, R * 0.1, R * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? GREEN : BLUE;
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, R * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = RED; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, R * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = IVORY_A; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(x, y, R * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, R * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = IVORY_A; ctx.fill();
  }
  // gloss
  ctx.beginPath(); ctx.arc(x - R * 0.35, y - R * 0.4, R * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
}

function drawPin(ctx, n, red) {
  const B = BLUE, G = GREEN, R = RED;
  const col = (c) => (red ? RED : c);
  const L = {
    1: [[0.5, 0.5, 0.44, R, true]],
    2: [[0.5, 0.25, 0.22, G], [0.5, 0.75, 0.22, B]],
    3: [[0.2, 0.17, 0.17, B], [0.5, 0.5, 0.17, R], [0.8, 0.83, 0.17, G]],
    4: [[0.27, 0.25, 0.19, B], [0.73, 0.25, 0.19, G], [0.27, 0.75, 0.19, G], [0.73, 0.75, 0.19, B]],
    5: [[0.23, 0.2, 0.17, B], [0.77, 0.2, 0.17, G], [0.5, 0.5, 0.17, R], [0.23, 0.8, 0.17, G], [0.77, 0.8, 0.17, B]],
    6: [[0.27, 0.15, 0.15, G], [0.73, 0.15, 0.15, G], [0.27, 0.55, 0.15, R], [0.73, 0.55, 0.15, R], [0.27, 0.86, 0.15, R], [0.73, 0.86, 0.15, R]],
    7: [[0.2, 0.1, 0.13, G], [0.5, 0.22, 0.13, G], [0.8, 0.34, 0.13, G], [0.28, 0.62, 0.14, R], [0.72, 0.62, 0.14, R], [0.28, 0.88, 0.14, R], [0.72, 0.88, 0.14, R]],
    8: [0.11, 0.37, 0.63, 0.89].flatMap((v) => [[0.28, v, 0.13, B], [0.72, v, 0.13, B]]),
    9: [0.14, 0.5, 0.86].flatMap((v, i) => [0.18, 0.5, 0.82].map((u) => [u, v, 0.14, [B, R, G][i]])),
  }[n];
  for (const [u, v, r, c, big] of L) dot(ctx, u, v, r, big ? c : col(c), big);
}

// ---------------------------------------------------------------- sou (bamboo)
function stick(ctx, u, v, hFrac, color, angle = 0) {
  const x = ax(u), y = ay(v);
  const h = hFrac * AREA.h, w = AREA.w * 0.13;
  const dark = color === RED ? '#8e1c1a' : color === BLUE ? '#163a6e' : '#0f4a31';
  engrave(ctx, (c) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    roundRect(ctx, -w / 2, -h / 2, w, h, w / 2);
    if (c) { ctx.fillStyle = c; ctx.fill(); }
    else {
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, dark); g.addColorStop(0.45, color); g.addColorStop(1, dark);
      ctx.fillStyle = g; ctx.fill();
      // nodes
      ctx.fillStyle = IVORY_A;
      for (const t of [-0.5, 0, 0.5]) {
        ctx.fillRect(-w / 2 - 1, t * h * 0.62 - 2, w + 2, 3.5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      roundRect(ctx, -w * 0.28, -h / 2 + 6, w * 0.16, h - 12, 3);
      ctx.fill();
    }
    ctx.restore();
  }, 2);
}

function drawSou(ctx, n, red) {
  const G = red ? RED : GREEN, R = RED, B = red ? RED : BLUE;
  if (n === 1) return drawBird(ctx);
  const H2 = 0.4, H3 = 0.28;
  const L = {
    2: [[0.5, 0.25, H2, B], [0.5, 0.75, H2, G]],
    3: [[0.5, 0.25, H2, G], [0.3, 0.75, H2, B], [0.7, 0.75, H2, B]],
    4: [[0.3, 0.25, H2, B], [0.7, 0.25, H2, G], [0.3, 0.75, H2, G], [0.7, 0.75, H2, B]],
    5: [[0.2, 0.25, H2, G], [0.8, 0.25, H2, B], [0.5, 0.5, H2, R], [0.2, 0.75, H2, B], [0.8, 0.75, H2, G]],
    6: [0.25, 0.75].flatMap((v) => [0.2, 0.5, 0.8].map((u) => [u, v, H2, v < 0.5 ? B : G])),
    7: [[0.5, 0.14, H3, R], ...[0.5, 0.84].flatMap((v) => [0.2, 0.5, 0.8].map((u) => [u, v, H3, G]))],
    9: [0.16, 0.5, 0.84].flatMap((v) => [0.2, 0.5, 0.8].map((u) => [u, v, H3, u === 0.5 ? R : v === 0.5 ? B : G])),
  }[n];
  if (n === 8) {
    // M over W
    const a = 0.34;
    stick(ctx, 0.14, 0.25, H2, G); stick(ctx, 0.86, 0.25, H2, G);
    stick(ctx, 0.37, 0.25, H2, B, a); stick(ctx, 0.63, 0.25, H2, B, -a);
    stick(ctx, 0.14, 0.75, H2, G); stick(ctx, 0.86, 0.75, H2, G);
    stick(ctx, 0.37, 0.75, H2, B, -a); stick(ctx, 0.63, 0.75, H2, B, a);
    return;
  }
  for (const [u, v, h, c] of L) stick(ctx, u, v, h, c);
}

function drawBird(ctx) {
  // An original stylised river kingfisher perched on a reed.
  const cx = CELL_W / 2, cy = CELL_H / 2;
  ctx.save();
  ctx.translate(cx, cy + 6);
  // reed
  engrave(ctx, (c) => {
    ctx.strokeStyle = c || GREEN; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-70, 118); ctx.quadraticCurveTo(-10, 60, 74, 96); ctx.stroke();
  });
  // tail
  engrave(ctx, (c) => {
    ctx.fillStyle = c || BLUE;
    ctx.beginPath();
    ctx.moveTo(-8, 40); ctx.lineTo(-62, 118); ctx.lineTo(-30, 112); ctx.lineTo(12, 52); ctx.closePath(); ctx.fill();
  });
  // body
  engrave(ctx, (c) => {
    ctx.fillStyle = c || GREEN;
    ctx.beginPath();
    ctx.moveTo(-22, -40);
    ctx.bezierCurveTo(-58, 0, -40, 60, 8, 62);
    ctx.bezierCurveTo(48, 60, 54, 10, 34, -30);
    ctx.bezierCurveTo(20, -58, -8, -58, -22, -40);
    ctx.fill();
  });
  // belly
  ctx.fillStyle = '#e07b2c';
  ctx.beginPath();
  ctx.moveTo(-4, -12); ctx.bezierCurveTo(-24, 20, -12, 52, 10, 54); ctx.bezierCurveTo(30, 40, 30, 4, 18, -18); ctx.closePath(); ctx.fill();
  // wing
  engrave(ctx, (c) => {
    ctx.fillStyle = c || BLUE;
    ctx.beginPath();
    ctx.moveTo(-30, -18); ctx.bezierCurveTo(-60, 14, -44, 50, -14, 58); ctx.bezierCurveTo(-26, 26, -16, 0, -30, -18); ctx.fill();
  });
  // head
  engrave(ctx, (c) => {
    ctx.fillStyle = c || BLUE;
    ctx.beginPath(); ctx.arc(10, -66, 32, 0, Math.PI * 2); ctx.fill();
  });
  // beak
  engrave(ctx, (c) => {
    ctx.fillStyle = c || INK;
    ctx.beginPath(); ctx.moveTo(34, -74); ctx.lineTo(96, -60); ctx.lineTo(36, -56); ctx.closePath(); ctx.fill();
  });
  // cheek + eye + crest
  ctx.fillStyle = RED; ctx.beginPath(); ctx.ellipse(8, -52, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = IVORY_A; ctx.beginPath(); ctx.arc(18, -72, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(20, -72, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath(); ctx.moveTo(-12, -90); ctx.quadraticCurveTo(-30, -112, -4, -104); ctx.quadraticCurveTo(4, -120, 14, -98); ctx.closePath(); ctx.fill();
  ctx.restore();
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

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
