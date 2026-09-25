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
      data = { ...structuredClone(DEFAULTS), ...parsed, settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) }, best: { ...DEFAULTS.best, ...(parsed.best || {}) } };
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
