// Headless balance simulation: plays whole rivers with a bot and reports score
// distributions per station. Usage: node tools/sim.js [runs] [skill]
import { Game, RIVER } from '../src/game/game.js';
import { STATIONS } from '../src/game/content.js';
const OV = JSON.parse(process.env.OV || '{}');
for (const s of STATIONS) {
  if (OV.wallMul) s.wall = Math.round(s.wall * OV.wallMul);
  if (OV.spacing) s.spacing = OV.spacing;
  if (OV.kind != null) s.kindness = OV.kind;
  if (OV.rafts != null) s.rafts = OV.rafts;
}
import { trayValue, MELDS_TO_WIN, resolveCatch, cloneHand } from '../src/game/rules.js';

const RUNS = Number(process.argv[2] || 200);
const SKILL = process.argv[3] || 'expert';
const CHARMS = (process.argv[4] || '').split(',').filter(Boolean);

const skill = {
  expert: { miss: 0.02, decideZ: -11, lateZ: 0.5, riichiMinLeft: 6, greed: 0.2 },
  casual: { miss: 0.15, decideZ: -5, lateZ: -2, riichiMinLeft: 12, greed: 0.6 },
}[SKILL];

function botDecide(game, f, rnd) {
  const st = game.st;
  if (f.lantern) return rnd() > skill.miss;
  if (f.hidden) return false;
  const h = st.hand;
  if (f.tiles.length > 1) {
    if (st.riichi) return f.tiles.some((t) => st.tenpaiWaits.includes(t.kind));
    const need = MELDS_TO_WIN - h.melds.length;
    const cur = trayValue(h.tray.map((t) => t.kind), need);
    if (h.tray.length + 2 <= h.cap) return rnd() > skill.miss;
    // make room if the raft is worth more than the two worst tiles
    const withRaft = (tray) => trayValue([...tray.map((t) => t.kind), ...f.tiles.map((t) => t.kind)], need);
    let tray = h.tray.slice();
    const drops = [];
    while (tray.length + 2 > h.cap) {
      let bestV = -Infinity, worst = null;
      for (const t of tray) { const v = trayValue(tray.filter((x) => x !== t).map((x) => x.kind), need); if (v > bestV) { bestV = v; worst = t; } }
      drops.push(worst); tray = tray.filter((x) => x !== worst);
    }
    if (withRaft(tray) > cur + 0.5 && rnd() > skill.miss) { for (const d of drops) game.tryDiscard(d.id); return true; }
    return false;
  }
  const act = st.useful.get(f.tile.kind);
  if (act) return rnd() > skill.miss;
  if (st.riichi) return false;
  const need = MELDS_TO_WIN - h.melds.length;
  const cur = trayValue(h.tray.map((t) => t.kind), need);
  const withT = (tray) => trayValue([...tray.map((t) => t.kind), f.tile.kind], need);
  if (h.tray.length < h.cap) {
    // with room: take anything that is not worse than an isolated tile; keep the last slot for connectors
    const d = withT(h.tray) - cur;
    const lastSlot = h.tray.length === h.cap - 1;
    return d > (lastSlot ? skill.greed : -0.3) && rnd() > skill.miss;
  }
  // full: discard the worst if it improves
  let bestV = -Infinity, worst = null;
  for (const t of h.tray) {
    const rest = h.tray.filter((x) => x !== t);
    const v = withT(rest);
    if (v > bestV) { bestV = v; worst = t; }
  }
  if (bestV > cur + skill.greed + 0.3 && rnd() > skill.miss) {
    game.tryDiscard(worst.id);
    return true;
  }
  return false;
}

const results = STATIONS.map(() => ({ scores: [], wins: [], limits: 0, riichi: 0, cleared: 0 }));
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

for (let r = 0; r < RUNS; r++) {
  for (let si = 0; si < STATIONS.length; si++) {
    const decided = new Set();
    let wins = 0;
    const g = new Game({
      onEvent: (type, d) => {
        if (type === 'win') { wins++; if (d.result.limit) results[si].limits++; }
      },
    });
    g.newRun({ seed: (r * 7919 + si * 104729) >>> 0, charms: CHARMS });
    g.run.stationIndex = si;
    if (OV.cap) g.mods.trayCap = OV.cap;
    g.startStation();
    // play the whole river; don't stop at target (we want the distribution)
    g.st.target = Infinity;
    let t = 0;
    while (t < 400) {
      const dt = 1 / 30;
      t += dt;
      g.update(dt);
      if (g.phase === 'scoring') { g.confirmWin(); continue; }
      if (g.phase === 'intro') continue;
      if (g.phase !== 'play') break;
      for (const f of g.st.floats.slice()) {
        if (decided.has(f.id) || f.z < skill.decideZ) continue;
        if (f.hidden) continue;
        const useful = f.lantern || f.tiles.some((t) => g.st.useful.has(t.kind));
        // useful tiles are grabbed on sight; others are judged late (patient play)
        if (!useful && f.z < (skill.lateZ ?? skill.decideZ)) continue;
        decided.add(f.id);
        if (botDecide(g, f, rnd)) g.tryCatch(f.id);
      }
      if (g.canRiichi() && g.tilesLeft() > skill.riichiMinLeft) { g.declareRiichi(); results[si].riichi++; }
    }
    results[si].scores.push(g.st.score);
    results[si].wins.push(wins);
    if (g.st.score >= STATIONS[si].target) results[si].cleared++;
  }
}

const pct = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor((a.length - 1) * p)]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log(`skill=${SKILL} runs=${RUNS} charms=${CHARMS.join(',') || '-'}`);
console.log('station     target   p25    p50    p75    mean   wins/river  clear%  limits/river riichi/river');
STATIONS.forEach((s, i) => {
  const R = results[i];
  console.log(
    `${s.id.padEnd(10)} ${String(s.target).padStart(6)} ${String(pct(R.scores, 0.25)).padStart(6)} ${String(pct(R.scores, 0.5)).padStart(6)} ${String(pct(R.scores, 0.75)).padStart(6)} ${String(Math.round(mean(R.scores))).padStart(6)}   ${mean(R.wins).toFixed(2).padStart(5)}      ${String(Math.round((100 * R.cleared) / RUNS)).padStart(3)}%    ${(R.limits / RUNS).toFixed(2)}        ${(R.riichi / RUNS).toFixed(2)}`,
  );
});
