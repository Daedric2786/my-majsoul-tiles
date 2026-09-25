// Persistent storage with graceful failure (private mode, blocked storage, quota).
const KEY = 'riichi-river:v1';

const DEFAULTS = {
  settings: { music: 0.7, sfx: 0.85, hints: true, shake: true, index: true, reducedMotion: false, lang: null },
  best: { total: 0, stations: 0, hand: null },
  daily: {}, // date -> best total
  yakuSeen: {},
  tutorialDone: false,
  runs: 0,
  run: null, // snapshot at station boundaries
};

let data = structuredClone(DEFAULTS);
let available = true;

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
      const base = structuredClone(DEFAULTS);
      if (obj(parsed)) {
        if (obj(parsed.settings)) {
          for (const [k, v] of Object.entries(parsed.settings)) if (k in base.settings && (typeof v === typeof base.settings[k] || (k === 'lang' && (v === null || typeof v === 'string')))) base.settings[k] = v;
        }
        if (obj(parsed.best)) {
          if (Number.isFinite(parsed.best.total)) base.best.total = parsed.best.total;
          if (Number.isFinite(parsed.best.stations)) base.best.stations = parsed.best.stations;
          if (obj(parsed.best.hand)) base.best.hand = parsed.best.hand;
        }
        if (obj(parsed.daily)) base.daily = parsed.daily;
        if (obj(parsed.yakuSeen)) base.yakuSeen = parsed.yakuSeen;
        if (typeof parsed.tutorialDone === 'boolean') base.tutorialDone = parsed.tutorialDone;
        if (Number.isFinite(parsed.runs)) base.runs = parsed.runs;
        const r = parsed.run;
        if (obj(r) && Number.isFinite(r.stationIndex) && Number.isFinite(r.lives) && r.lives > 0 && Array.isArray(r.charms)) base.run = r;
      }
      data = base;
    }
  } catch (e) {
    available = false;
    data = structuredClone(DEFAULTS);
  }
  return data;
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}

export const save = () => data;
export const storageAvailable = () => available;

export function mergeYaku(seen) {
  for (const [k, v] of Object.entries(seen)) data.yakuSeen[k] = (data.yakuSeen[k] || 0) + v;
}

export function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
