// Riichi River rules engine. Pure logic, no rendering.
//
// A hand is { melds: Meld[], tray: Tile[], cap: number }
//   Meld = { type: 'chi'|'pon'|'kan', tiles: Tile[] }  (tiles sorted by kind)
// Catching a tile puts it in the tray; if it completes a set with tray tiles,
// the set snaps into a meld automatically (the river version of chi/pon).
// Win = 4 melds + a pair anywhere in the tray.

import {
  suitOf, numOf, isHonor, isDragon, isWind, isTerminal, isTermOrHonor, isSimple,
  GREEN_KINDS, KIND_COUNT, makeTile,
} from './tiles.js';

export const MELDS_TO_WIN = 4;

export function newHand(cap = 5) {
  return { melds: [], tray: [], cap };
}

export function cloneHand(h) {
  return {
    cap: h.cap,
    melds: h.melds.map((m) => ({ type: m.type, tiles: m.tiles.slice() })),
    tray: h.tray.slice(),
  };
}

const byKind = (a, b) => a.kind - b.kind || a.id - b.id;

export function sortTray(tray) {
  return tray.sort(byKind);
}

function countKind(tiles, k) {
  let n = 0;
  for (const t of tiles) if (t.kind === k) n++;
  return n;
}

export function findPairs(tray) {
  const seen = new Map();
  const pairs = [];
  for (const t of tray) {
    if (seen.has(t.kind)) {
      const other = seen.get(t.kind);
      if (other) { pairs.push([other, t]); seen.set(t.kind, null); }
    } else seen.set(t.kind, t);
  }
  return pairs;
}

export const hasPair = (tray) => findPairs(tray).length > 0;
export const isComplete = (h) => h.melds.length >= MELDS_TO_WIN && hasPair(h.tray);

// All ways the given tile can complete a set with tiles already in the tray.
export function meldOptions(tray, tile) {
  const k = tile.kind;
  const opts = [];
  const same = tray.filter((t) => t.kind === k);
  if (same.length >= 2) {
    // prefer non-red partners so red fives stay visible in the tray only if it doesn't matter
    opts.push({ type: 'pon', tiles: [same[0], same[1], tile] });
  }
  if (!isHonor(k)) {
    const n = numOf(k);
    const pick = (kk) => tray.find((t) => t.kind === kk);
    const shapes = [[-2, -1], [-1, 1], [1, 2]];
    for (const [a, b] of shapes) {
      const na = n + a, nb = n + b;
      if (na < 1 || nb > 9) continue;
      const ta = pick(k + a), tb = pick(k + b);
      if (ta && tb) opts.push({ type: 'chi', tiles: [ta, tb, tile].sort(byKind) });
    }
  }
  return opts;
}

// Heuristic value of a loose tray: how close it is to producing more sets and a pair.
// Small tray (<= 7 tiles) so brute force decomposition is cheap.
export function trayValue(kinds, meldsNeeded) {
  const counts = new Array(KIND_COUNT).fill(0);
  for (const k of kinds) counts[k]++;
  let best = -Infinity;
  const rec = (i, pairs, ryan, kan, singles) => {
    while (i < KIND_COUNT && counts[i] === 0) i++;
    if (i >= KIND_COUNT) {
      const needPair = 1;
      const usefulPairs = Math.min(pairs, needPair + meldsNeeded);
      let v = 0;
      if (pairs > 0) v += 3.2; // a pair is always needed
      v += Math.max(0, usefulPairs - 1) * 1.8; // extra pairs can become triplets
      v += Math.min(ryan, meldsNeeded) * 2.2 + Math.min(kan, meldsNeeded) * 1.4;
      v -= singles * 0.25;
      if (v > best) best = v;
      return;
    }
    // pair
    if (counts[i] >= 2) { counts[i] -= 2; rec(i, pairs + 1, ryan, kan, singles); counts[i] += 2; }
    if (i < 27) {
      const n = i % 9;
      // adjacent (ryanmen / penchan)
      if (n <= 7 && counts[i + 1] > 0) {
        counts[i]--; counts[i + 1]--;
        const edge = n === 0 || n === 7;
        rec(i, pairs, ryan + (edge ? 0 : 1), kan + (edge ? 1 : 0), singles);
        counts[i]++; counts[i + 1]++;
      }
      // gap (kanchan)
      if (n <= 6 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 2]--;
        rec(i, pairs, ryan, kan + 1, singles);
        counts[i]++; counts[i + 2]++;
      }
    }
    counts[i]--; rec(i, pairs, ryan, kan, singles + 1); counts[i]++;
  };
  rec(0, 0, 0, 0, 0);
  return best;
}

function chooseMeld(hand, opts, tile) {
  if (opts.length === 1) return opts[0];
  const meldsNeeded = MELDS_TO_WIN - hand.melds.length - 1;
  const allPon = hand.melds.length > 0 && hand.melds.every((m) => m.type !== 'chi');
  let best = null, bestV = -Infinity;
  for (const o of opts) {
    const rest = hand.tray.filter((t) => !o.tiles.includes(t)).map((t) => t.kind);
    let v = trayValue(rest, meldsNeeded);
    // stay consistent with an obvious plan
    if (allPon && o.type === 'pon') v += 1.5;
    // completing the hand beats everything
    if (meldsNeeded <= 0 && hasPairKinds(rest)) v += 100;
    // keep red fives in melds (they score either way, slight preference to lock them)
    v += o.tiles.filter((t) => t.red).length * 0.01;
    if (v > bestV) { bestV = v; best = o; }
  }
  return best;
}

function hasPairKinds(kinds) {
  const s = new Set();
  for (const k of kinds) { if (s.has(k)) return true; s.add(k); }
  return false;
}

// What would happen if this tile were caught right now (without mutating).
// Returns { ok, reason, action: 'win'|'kan'|'meld'|'hold' }
export function previewCatch(hand, tile, ctx = {}) {
  const h = cloneHand(hand);
  const res = resolveCatch(h, tile, { ...ctx, dryRun: true });
  return res;
}

// Mutates hand. ctx.riichi -> only winning tiles are accepted.
// Returns { ok, reason?, events: [...] }
export function resolveCatch(hand, tile, ctx = {}) {
  const events = [];
  const k = tile.kind;

  // 1) Tile completes the pair of a 4-meld hand
  if (hand.melds.length >= MELDS_TO_WIN && hand.tray.some((t) => t.kind === k)) {
    hand.tray.push(tile); sortTray(hand.tray);
    events.push({ type: 'win' });
    return { ok: true, action: 'win', events };
  }

  // 2) Upgrade a pon to kan
  const ponIdx = hand.melds.findIndex((m) => m.type === 'pon' && m.tiles[0].kind === k);
  if (ponIdx >= 0 && !ctx.riichi && !ctx.noKan) {
    hand.melds[ponIdx].type = 'kan';
    hand.melds[ponIdx].tiles.push(tile);
    events.push({ type: 'kan', meldIndex: ponIdx, tile });
    return { ok: true, action: 'kan', events };
  }

  // 3) Form a meld
  if (hand.melds.length < MELDS_TO_WIN) {
    const opts = meldOptions(hand.tray, tile);
    if (opts.length) {
      const o = chooseMeld(hand, opts, tile);
      if (ctx.riichi) {
        // in riichi, only accept if it wins
        const h2 = cloneHand(hand);
        applyMeld(h2, o);
        if (!isComplete(h2)) return { ok: false, reason: 'riichi', events };
      }
      applyMeld(hand, o);
      events.push({ type: 'meld', meldIndex: hand.melds.length - 1, meldType: o.type, tiles: o.tiles, caught: tile });
      if (isComplete(hand)) {
        events.push({ type: 'win' });
        return { ok: true, action: 'win', events };
      }
      return { ok: true, action: 'meld', events };
    }
  }

  // 4) Just hold it
  if (ctx.riichi) return { ok: false, reason: 'riichi', events };
  if (hand.tray.length >= hand.cap) return { ok: false, reason: 'full', events };
  hand.tray.push(tile); sortTray(hand.tray);
  events.push({ type: 'hold', tile });
  return { ok: true, action: 'hold', events };
}

function applyMeld(hand, o) {
  hand.tray = hand.tray.filter((t) => !o.tiles.includes(t) || false);
  // the caught tile was never in the tray, so the filter removes only the two partners
  hand.melds.push({ type: o.type, tiles: o.tiles.slice().sort(byKind) });
}

export function discard(hand, tileId) {
  const i = hand.tray.findIndex((t) => t.id === tileId);
  if (i < 0) return null;
  return hand.tray.splice(i, 1)[0];
}

// Kinds that would immediately win. `visible` = counts of kinds that can no longer appear.
export function winningKinds(hand, ctx = {}) {
  const out = [];
  const inHand = new Array(KIND_COUNT).fill(0);
  for (const m of hand.melds) for (const t of m.tiles) inHand[t.kind]++;
  for (const t of hand.tray) inHand[t.kind]++;
  for (let k = 0; k < KIND_COUNT; k++) {
    if (inHand[k] >= 4) continue;
    if (ctx.allowedKinds && !ctx.allowedKinds.has(k)) continue;
    const h = cloneHand(hand);
    const r = resolveCatch(h, makeProbe(k), { riichi: false });
    if (r.action === 'win') out.push(k);
  }
  return out;
}

// Kinds that would do *something* useful right now (form a meld / kan / win).
export function usefulKinds(hand, ctx = {}) {
  const out = new Map();
  for (let k = 0; k < KIND_COUNT; k++) {
    if (ctx.allowedKinds && !ctx.allowedKinds.has(k)) continue;
    const h = cloneHand(hand);
    const r = resolveCatch(h, makeProbe(k), { riichi: !!ctx.riichi });
    if (r.ok && r.action !== 'hold') out.set(k, r.action);
  }
  return out;
}

const makeProbe = (k) => ({ id: -1 - k, kind: k, red: false });

export const isTenpai = (hand, ctx) => winningKinds(hand, ctx).length > 0;

// ---------------------------------------------------------------------------
// Scoring

export const YAKU = {
  tsumo: { han: 1 },
  riichi: { han: 1 },
  ippatsu: { han: 1 },
  haitei: { han: 1 },
  tanyao: { han: 1 },
  pinfu: { han: 1 },
  iipeikou: { han: 1 },
  yakuhai: { han: 1 }, // per triplet
  toitoi: { han: 2 },
  sanshoku: { han: 2 },
  sanshokuDoukou: { han: 2 },
  ittsu: { han: 2 },
  chanta: { han: 2 },
  junchan: { han: 3 },
  honroutou: { han: 2 },
  shousangen: { han: 2 },
  sankantsu: { han: 2 },
  ryanpeikou: { han: 3 },
  honitsu: { han: 3 },
  chinitsu: { han: 6 },
  // yakuman (13 han each)
  daisangen: { han: 13, yakuman: true },
  tsuuiisou: { han: 13, yakuman: true },
  ryuuiisou: { han: 13, yakuman: true },
  chinroutou: { han: 13, yakuman: true },
  suukantsu: { han: 13, yakuman: true },
  shousuushii: { han: 13, yakuman: true },
  daisuushii: { han: 26, yakuman: true },
};

export const LIMITS = [
  { id: 'kazoe', minHan: 13, points: 32000 },
  { id: 'sanbaiman', minHan: 11, points: 24000 },
  { id: 'baiman', minHan: 8, points: 16000 },
  { id: 'haneman', minHan: 6, points: 12000 },
  { id: 'mangan', minHan: 5, points: 8000 },
];

// Pick the best pair from the tray for scoring.
export function scoreWin(hand, ctx = {}) {
  const pairs = findPairs(hand.tray);
  let best = null;
  for (const p of pairs) {
    const r = scoreStructure(hand.melds, p, ctx);
    if (!best || r.points > best.points || (r.points === best.points && r.han > best.han)) best = r;
  }
  return best;
}

export function scoreStructure(melds, pair, ctx = {}) {
  const roundWind = ctx.roundWind ?? 27;
  const mods = ctx.hanBonus || {};
  const yaku = [];
  const add = (id, han, extra = {}) => {
    const bonus = mods[id] || 0;
    yaku.push({ id, han: han + bonus, ...extra });
  };

  const allTiles = [...melds.flatMap((m) => m.tiles), ...pair];
  const kinds = allTiles.map((t) => t.kind);
  const pairKind = pair[0].kind;
  const chis = melds.filter((m) => m.type === 'chi');
  const trips = melds.filter((m) => m.type !== 'chi');
  const kans = melds.filter((m) => m.type === 'kan');
  const mk = (m) => m.tiles[0].kind; // lowest kind in the meld

  const isYakuhaiKind = (k) => isDragon(k) || k === roundWind || (ctx.windsAreValue && isWind(k));

  // --- yakuman
  const dragonTrips = trips.filter((m) => isDragon(mk(m))).length;
  const windTrips = trips.filter((m) => isWind(mk(m))).length;
  const yakuman = [];
  if (dragonTrips === 3) yakuman.push('daisangen');
  if (kinds.every(isHonor)) yakuman.push('tsuuiisou');
  if (kinds.every((k) => GREEN_KINDS.has(k))) yakuman.push('ryuuiisou');
  if (kinds.every(isTerminal)) yakuman.push('chinroutou');
  if (kans.length === 4) yakuman.push('suukantsu');
  if (windTrips === 4) yakuman.push('daisuushii');
  else if (windTrips === 3 && isWind(pairKind)) yakuman.push('shousuushii');

  if (yakuman.length) {
    for (const id of yakuman) add(id, YAKU[id].han, { yakuman: true });
  } else {
    add('tsumo', 1);
    if (ctx.riichi) add('riichi', ctx.riichiHan ?? 1);
    if (ctx.riichi && ctx.ippatsu) add('ippatsu', 1);
    if (ctx.haitei) add('haitei', 1);
    if (kinds.every(isSimple)) add('tanyao', 1);
    const pinfu = chis.length === 4 && !isYakuhaiKind(pairKind);
    if (pinfu) add('pinfu', 1);

    // peikou
    const chiKeys = chis.map((m) => `${mk(m)}`);
    const counts = {};
    for (const c of chiKeys) counts[c] = (counts[c] || 0) + 1;
    const dupPairs = Object.values(counts).reduce((s, n) => s + Math.floor(n / 2), 0);
    if (dupPairs >= 2) add('ryanpeikou', 3);
    else if (dupPairs === 1) add('iipeikou', 1);

    for (const m of trips) {
      const k = mk(m);
      if (isDragon(k)) add('yakuhai', 1 + (ctx.dragonBonus || 0), { kind: k });
      else if (isWind(k)) {
        if (k === roundWind || ctx.windsAreValue) add('yakuhai', 1, { kind: k });
      }
    }
    if (trips.length === 4) add('toitoi', 2);

    // sanshoku
    const chiStarts = new Set(chis.map(mk));
    for (let n = 0; n < 7; n++) {
      if (chiStarts.has(n) && chiStarts.has(9 + n) && chiStarts.has(18 + n)) { add('sanshoku', 2); break; }
    }
    const tripKinds = new Set(trips.map(mk));
    for (let n = 0; n < 9; n++) {
      if (tripKinds.has(n) && tripKinds.has(9 + n) && tripKinds.has(18 + n)) { add('sanshokuDoukou', 2); break; }
    }
    // ittsu
    for (let s = 0; s < 3; s++) {
      if (chiStarts.has(s * 9) && chiStarts.has(s * 9 + 3) && chiStarts.has(s * 9 + 6)) { add('ittsu', 2); break; }
    }
    // chanta / junchan / honroutou
    const groupHasTH = (tiles) => tiles.some((t) => isTermOrHonor(t.kind));
    const allGroupsTH = melds.every((m) => groupHasTH(m.tiles)) && isTermOrHonor(pairKind);
    if (kinds.every(isTermOrHonor)) add('honroutou', 2);
    else if (allGroupsTH && chis.length > 0) {
      if (kinds.some(isHonor)) add('chanta', 2);
      else add('junchan', 3);
    }
    if (dragonTrips === 2 && isDragon(pairKind)) add('shousangen', 2);
    if (kans.length === 3) add('sankantsu', 2);

    // flushes
    const suits = new Set(kinds.filter((k) => !isHonor(k)).map(suitOf));
    if (suits.size === 1) {
      if (kinds.some(isHonor)) add('honitsu', 3);
      else add('chinitsu', 6);
    }

    // charm-provided yaku
    for (const e of ctx.extraYaku || []) {
      if (!e.when || e.when({ melds, pair, kinds, yaku })) add(e.id, e.han);
    }
  }

  // dora
  let dora = 0, aka = 0, ura = 0;
  const doraKinds = ctx.doraKinds || [];
  const uraKinds = ctx.riichi ? ctx.uraKinds || [] : [];
  for (const t of allTiles) {
    for (const d of doraKinds) if (t.kind === d) dora++;
    for (const d of uraKinds) if (t.kind === d) ura++;
    if (t.red) aka++;
  }
  const isYakuman = yakuman.length > 0;
  if (!isYakuman) {
    if (dora) yaku.push({ id: 'dora', han: dora, dora: true });
    if (aka) yaku.push({ id: 'aka', han: aka * (ctx.akaHan ?? 1), dora: true });
    if (ura) yaku.push({ id: 'ura', han: ura, dora: true });
  }

  const han = yaku.reduce((s, y) => s + y.han, 0);

  // fu
  let fu;
  const pinfu = yaku.some((y) => y.id === 'pinfu');
  if (pinfu) fu = 20;
  else {
    fu = 22; // base 20 + tsumo 2
    for (const m of trips) {
      const th = isTermOrHonor(mk(m));
      let f = th ? 8 : 4;
      if (m.type === 'kan') f *= 4;
      fu += f;
    }
    if (isYakuhaiKind(pairKind)) fu += 2;
    fu = Math.ceil(fu / 10) * 10;
  }

  let points, limit = null;
  if (isYakuman) {
    const mult = Math.max(1, Math.floor(han / 13));
    points = 32000 * mult;
    limit = mult >= 2 ? 'doubleYakuman' : 'yakuman';
  } else {
    const base = fu * Math.pow(2, han + 2);
    for (const L of LIMITS) {
      if (han >= L.minHan) { points = L.points; limit = L.id; break; }
    }
    if (!limit) {
      if (base >= 2000) { points = 8000; limit = 'mangan'; }
      else points = Math.ceil((base * 4) / 100) * 100;
    }
  }
  return { yaku, han, fu, points, limit, pair, melds, yakuman: isYakuman };
}
