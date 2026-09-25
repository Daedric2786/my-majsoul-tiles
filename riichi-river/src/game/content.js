import { KINDS_MAN, KINDS_PIN, KINDS_SOU, WIND_KINDS, DRAGON_KINDS } from './tiles.js';

// River stations. `kinds` = tile kinds carried by this river (4 copies each; the
// wall is a shuffled draw of `wall` tiles from that set).
// speed = world units / second at the river centre. spacing = distance between spawns.
export const STATIONS = [
  {
    id: 'spring', kanji: '源流', wind: 27,
    kinds: [...KINDS_SOU, ...KINDS_PIN, ...DRAGON_KINDS],
    wall: 70, speed: 1.4, spacing: 0.98, target: 8000, kindness: 0.3, rafts: 0,
    features: [], palette: 'dusk',
  },
  {
    id: 'bamboo', kanji: '竹林', wind: 27,
    kinds: [...KINDS_SOU, ...KINDS_PIN, ...DRAGON_KINDS],
    wall: 78, speed: 1.5, spacing: 0.94, target: 12000, kindness: 0.2,
    features: ['gusts'], palette: 'bamboo',
  },
  {
    id: 'village', kanji: '里', wind: 28,
    kinds: [...KINDS_MAN, ...KINDS_PIN, ...KINDS_SOU],
    wall: 86, speed: 1.6, spacing: 0.9, target: 13000, kindness: 0.14,
    features: ['eddy'], palette: 'village',
  },
  {
    id: 'festival', kanji: '祭', wind: 28,
    kinds: [...KINDS_MAN, ...KINDS_SOU, ...WIND_KINDS, ...DRAGON_KINDS],
    wall: 90, speed: 1.65, spacing: 0.88, target: 20000, kindness: 0.1, redFives: 1,
    features: ['lanterns'], palette: 'festival',
  },
  {
    id: 'rapids', kanji: '夜瀬', wind: 29,
    kinds: [...KINDS_MAN, ...KINDS_PIN, ...KINDS_SOU, ...DRAGON_KINDS],
    wall: 96, speed: 1.75, spacing: 0.86, target: 24000, kindness: 0.06, redFives: 1,
    features: ['rapids', 'lanterns'], palette: 'night',
  },
  {
    id: 'mist', kanji: '霧', wind: 29,
    kinds: [...KINDS_MAN, ...KINDS_PIN, ...KINDS_SOU, ...WIND_KINDS, ...DRAGON_KINDS],
    wall: 100, speed: 1.7, spacing: 0.85, target: 18000, kindness: 0.05, redFives: 1,
    features: ['mist', 'eddy'], palette: 'mist',
  },
  {
    id: 'falls', kanji: '滝', wind: 30,
    kinds: [...KINDS_MAN, ...KINDS_PIN, ...KINDS_SOU, ...WIND_KINDS, ...DRAGON_KINDS],
    wall: 104, speed: 1.85, spacing: 0.84, target: 22000, kindness: 0.04, redFives: 1,
    features: ['rapids', 'gusts', 'koi'], palette: 'falls',
  },
  {
    id: 'sea', kanji: '暁の海', wind: 30,
    kinds: [...KINDS_MAN, ...KINDS_PIN, ...KINDS_SOU, ...WIND_KINDS, ...DRAGON_KINDS],
    wall: 110, speed: 1.9, spacing: 0.84, target: 30000, kindness: 0.03, redFives: 1,
    features: ['mist', 'koi', 'lanterns', 'eddy'], palette: 'dawn',
  },
];

// Endless river after the sea: scales with loop count.
export function endlessStation(loop) {
  const base = STATIONS[STATIONS.length - 1];
  const feats = [['gusts', 'eddy', 'lanterns'], ['rapids', 'mist', 'koi'], ['eddy', 'koi', 'lanterns', 'gusts']];
  return {
    ...base,
    id: 'endless', kanji: '彼岸', wind: 27 + (loop % 4),
    target: Math.round(36000 * Math.pow(1.35, loop + 1) / 1000) * 1000,
    speed: Math.min(2.9, base.speed + 0.1 * (loop + 1)),
    features: feats[loop % feats.length], palette: ['night', 'dusk', 'mist', 'dawn'][loop % 4],
  };
}

// Omamori charms. `apply` mutates the modifier object used by the game.
export const CHARMS = [
  { id: 'kago', icon: '籠', cost: 12, apply: (m) => { m.trayCap += 1; } },
  { id: 'koi', icon: '鯉', cost: 8, apply: (m) => { m.speedMul *= 0.88; } },
  { id: 'maneki', icon: '招', cost: 10, apply: (m) => { m.extraDora += 1; } },
  { id: 'furin', icon: '鈴', cost: 7, apply: (m) => { m.windsAreValue = true; } },
  { id: 'akaito', icon: '糸', cost: 8, apply: (m) => { m.forceRed = true; m.akaHan = 2; } },
  { id: 'tsuru', icon: '鶴', cost: 9, apply: (m) => { m.autoRelease = true; } },
  { id: 'kitsune', icon: '狐', cost: 9, apply: (m) => { m.riichiHan += 2; m.riichiNoGlow = true; } },
  { id: 'kaeru', icon: '蛙', cost: 8, apply: (m) => { m.hopBack += 0.3; } },
  { id: 'tsuki', icon: '月', cost: 7, apply: (m) => { m.haiteiWindow = 12; m.hanBonus.haitei = (m.hanBonus.haitei || 0) + 2; } },
  { id: 'sakura', icon: '桜', cost: 6, apply: (m) => { m.hanBonus.pinfu = (m.hanBonus.pinfu || 0) + 2; } },
  { id: 'tengu', icon: '天', cost: 7, apply: (m) => { m.hanBonus.toitoi = (m.hanBonus.toitoi || 0) + 2; } },
  { id: 'sumi', icon: '墨', cost: 8, apply: (m) => { m.hanBonus.honitsu = (m.hanBonus.honitsu || 0) + 2; m.hanBonus.chinitsu = (m.hanBonus.chinitsu || 0) + 2; } },
  { id: 'taiko', icon: '鼓', cost: 9, apply: (m) => { m.renchanHan += 1; } },
  { id: 'ougi', icon: '扇', cost: 6, apply: (m) => { m.hanBonus.tanyao = (m.hanBonus.tanyao || 0) + 2; } },
  { id: 'seisui', icon: '静', cost: 8, apply: (m) => { m.tenpaiSlow = 0.6; } },
  { id: 'zeni', icon: '銭', cost: 5, apply: (m) => { m.coinMul += 0.5; } },
  { id: 'daruma', icon: '達', cost: 10, apply: (m) => { m.darumaShield += 1; }, consumable: true },
  { id: 'hebi', icon: '蛇', cost: 7, apply: (m) => { m.hanBonus.iipeikou = (m.hanBonus.iipeikou || 0) + 2; m.hanBonus.sanshoku = (m.hanBonus.sanshoku || 0) + 2; } },
  { id: 'ryu', icon: '龍', cost: 8, apply: (m) => { m.dragonBonus += 1; } },
  { id: 'chouchin', icon: '灯', cost: 6, instant: true },
];

export const CHARM_BY_ID = Object.fromEntries(CHARMS.map((c) => [c.id, c]));
export const MAX_CHARMS = 5;

export function baseMods() {
  return {
    trayCap: 6,
    speedMul: 1,
    extraDora: 0,
    windsAreValue: false,
    forceRed: false,
    akaHan: 1,
    autoRelease: false,
    riichiHan: 1,
    riichiNoGlow: false,
    hopBack: 0,
    haiteiWindow: 5,
    hanBonus: {},
    renchanHan: 0,
    tenpaiSlow: 1,
    coinMul: 1,
    darumaShield: 0,
    dragonBonus: 0,
  };
}

export function modsFromCharms(ids) {
  const m = baseMods();
  for (const id of ids) {
    const c = CHARM_BY_ID[id];
    if (c && c.apply) c.apply(m);
  }
  return m;
}
