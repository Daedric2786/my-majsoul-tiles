// Tile kinds 0..33:
//   0-8  man (characters) 1-9
//   9-17 pin (dots) 1-9
//   18-26 sou (bamboo) 1-9
//   27-30 winds E S W N
//   31-33 dragons  haku(white) hatsu(green) chun(red)

export const SUITS = ['m', 'p', 's'];
export const KIND_COUNT = 34;

export const suitOf = (k) => (k < 27 ? Math.floor(k / 9) : 3); // 3 = honor
export const numOf = (k) => (k < 27 ? (k % 9) + 1 : 0);
export const isHonor = (k) => k >= 27;
export const isWind = (k) => k >= 27 && k <= 30;
export const isDragon = (k) => k >= 31;
export const isTerminal = (k) => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isTermOrHonor = (k) => isHonor(k) || isTerminal(k);
export const isSimple = (k) => !isTermOrHonor(k);
export const kindOf = (suit, num) => SUITS.indexOf(suit) * 9 + (num - 1);

export const WIND_KINDS = [27, 28, 29, 30];
export const DRAGON_KINDS = [31, 32, 33];
// All-green: 2 3 4 6 8 sou + hatsu
export const GREEN_KINDS = new Set([19, 20, 21, 23, 25, 32]);

const HONOR_CODES = ['E', 'S', 'W', 'N', 'Wh', 'G', 'R'];
export function kindCode(k) {
  if (k < 27) return `${numOf(k)}${SUITS[suitOf(k)]}`;
  return HONOR_CODES[k - 27];
}

export function parseKinds(str) {
  // "123m 55p E" -> kinds
  const out = [];
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    const hi = HONOR_CODES.indexOf(tok);
    if (hi >= 0) { out.push(27 + hi); continue; }
    const suit = tok[tok.length - 1];
    for (const ch of tok.slice(0, -1)) out.push(kindOf(suit, Number(ch)));
  }
  return out;
}

// Dora indicator -> dora kind (next in sequence, wrapping within suit / winds / dragons)
export function doraFromIndicator(k) {
  if (k < 27) return Math.floor(k / 9) * 9 + ((k % 9) + 1) % 9;
  if (k <= 30) return 27 + ((k - 27 + 1) % 4);
  return 31 + ((k - 31 + 1) % 3);
}

let nextId = 1;
export function makeTile(kind, red = false) {
  return { id: nextId++, kind, red };
}

// Build a full set of tile instances for the given kinds (4 copies each).
// redFives: number of 5s per suit that are red (0 or 1).
export function buildSet(kinds, redFives = 0) {
  const tiles = [];
  for (const k of kinds) {
    for (let c = 0; c < 4; c++) {
      const red = redFives > 0 && k < 27 && numOf(k) === 5 && c < redFives;
      tiles.push(makeTile(k, red));
    }
  }
  return tiles;
}

export const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
export const KINDS_MAN = range(0, 9);
export const KINDS_PIN = range(9, 18);
export const KINDS_SOU = range(18, 27);
export const KINDS_HONOR = range(27, 34);
