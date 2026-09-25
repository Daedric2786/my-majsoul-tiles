// Game controller: river simulation + run/station flow. No rendering here, so the
// same code drives the browser build and the headless balance simulator.

import { buildSet, doraFromIndicator, makeTile, parseKinds, isDragon } from './tiles.js';
import {
  newHand, resolveCatch, discard as discardTile, winningKinds, usefulKinds, scoreWin,
  cloneHand, trayValue, MELDS_TO_WIN,
} from './rules.js';
import { STATIONS, endlessStation, CHARMS, CHARM_BY_ID, modsFromCharms, MAX_CHARMS } from './content.js';
import { makeRng } from './rng.js';

export const RIVER = {
  halfWidth: 2.2, // tiles stay within [-halfWidth, halfWidth]
  zSpawn: -13.8,
  zLose: 2.2,
  mistZ: -5.0,
  rapidsZ: [-8.5, -3.6],
  eddy: { x: 0.5, z: -7.4, r: 1.25 },
};

const START_LIVES = 3;
const IPPATSU_WINDOW = 8;

export class Game {
  constructor({ onEvent = () => {}, tutorial = false } = {}) {
    this.onEvent = onEvent;
    this.tutorial = tutorial;
    this.run = null;
    this.st = null; // current station state
    this.phase = 'idle';
    this.floatSeq = 1;
  }

  emit(type, data = {}) { this.onEvent(type, data); }

  // ------------------------------------------------------------------ run
  newRun({ seed = (Math.random() * 2 ** 32) >>> 0, daily = false, charms = [] } = {}) {
    this.run = {
      seed, daily,
      rng: makeRng(seed),
      stationIndex: 0,
      loop: 0,
      lives: START_LIVES,
      coins: 0,
      charms: charms.slice(),
      total: 0,
      hands: 0,
      best: null, // best single hand
      yakuSeen: {},
      stats: { catches: 0, discards: 0, riichi: 0, wins: 0, limits: 0 },
    };
    this.refreshMods();
    this.startStation();
  }

  refreshMods() {
    this.mods = modsFromCharms(this.run.charms);
  }

  stationDef() {
    const i = this.run.stationIndex;
    return i < STATIONS.length ? STATIONS[i] : endlessStation(i - STATIONS.length);
  }

  startStation() {
    const def = this.stationDef();
    const rng = this.run.rng.fork();
    const redFives = def.redFives || (this.mods.forceRed ? 1 : 0);
    const set = rng.shuffle(buildSet(def.kinds, redFives));
    let wall = set.slice(0, def.wall);
    if (this.tutorial && this.run.stationIndex === 0) wall = this.tutorialWall(set, def.wall);

    const kindsSet = new Set(def.kinds);
    const pickIndicator = () => {
      for (let tries = 0; tries < 50; tries++) {
        const k = rng.pick(def.kinds);
        if (kindsSet.has(doraFromIndicator(k))) return k;
      }
      return def.kinds[0];
    };
    const doraCount = 1 + this.mods.extraDora;
    const indicators = Array.from({ length: doraCount }, pickIndicator);
    const ura = Array.from({ length: 4 }, pickIndicator);

    this.st = {
      def, rng,
      kindsSet,
      wall, spawned: 0,
      floats: [],
      score: 0,
      target: def.target,
      indicators, ura,
      hand: newHand(this.mods.trayCap),
      riichi: null,
      renchan: 0,
      blessing: 0,
      time: 0,
      distSinceSpawn: 999,
      tenpaiWaits: [],
      useful: new Map(),
      introT: this.run.stationIndex === 0 && this.run.hands === 0 ? 1.2 : 2.4,
      koi: def.features.includes('koi') ? [0, 1].map((i) => ({ a: i * Math.PI, x: 0, z: -6, vx: 0, vz: 0 })) : [],
      nextLanternAt: 8 + rng.int(6),
      lastX: 0,
      cleared: false,
    };
    this.phase = 'intro';
    this.recompute();
    this.emit('stationStart', { def, index: this.run.stationIndex, target: def.target, indicators, run: this.run });
  }

  tutorialWall(set, n) {
    // First catches are guaranteed to teach: a run, then a triplet, then a pair.
    const script = parseKinds('3s 4s 9p 5s 7p 2p 7p 7p 6s 8s 6p 6s 1p 8s 4p 5p 3p 9s 9s 2s');
    const pool = set.slice();
    const out = [];
    for (const k of script) {
      const i = pool.findIndex((t) => t.kind === k);
      if (i >= 0) out.push(pool.splice(i, 1)[0]);
      else out.push(makeTile(k));
    }
    while (out.length < n && pool.length) out.push(pool.shift());
    return out;
  }

  get hand() { return this.st.hand; }

  // ------------------------------------------------------------------ derived state
  recompute() {
    const st = this.st;
    const ctx = { allowedKinds: st.kindsSet };
    st.tenpaiWaits = winningKinds(st.hand, ctx);
    st.useful = usefulKinds(st.hand, { ...ctx, riichi: !!st.riichi });
    this.emit('handChanged', { hand: st.hand, waits: st.tenpaiWaits, useful: st.useful, riichi: !!st.riichi });
  }

  canRiichi() {
    const st = this.st;
    return this.phase === 'play' && !st.riichi && st.tenpaiWaits.length > 0;
  }

  wallLeft() { return this.st.wall.length - this.st.spawned; }
  tilesLeft() { return this.wallLeft() + this.st.floats.filter((f) => f.tile && f.state === 'float').length; }

  speedNow() {
    const st = this.st;
    let v = st.def.speed * this.mods.speedMul;
    if (st.def.features.includes('gusts')) v *= 1 + 0.32 * Math.sin(st.time * 0.55) * Math.sin(st.time * 0.21 + 1);
    if (st.tenpaiWaits.length && !st.riichi) v *= this.mods.tenpaiSlow;
    if (st.riichi) v *= 1.12;
    return v;
  }

  // ------------------------------------------------------------------ simulation
  update(dt) {
    if (!this.st) return;
    const st = this.st;
    if (this.phase === 'intro') {
      st.introT -= dt;
      this.stepRiver(dt, false);
      if (st.introT <= 0) { this.phase = 'play'; this.emit('play', {}); }
      return;
    }
    if (this.phase !== 'play') return;
    st.time += dt;
    this.stepRiver(dt, true);

    // end of river
    if (this.wallLeft() <= 0 && !st.floats.some((f) => f.tile && f.state === 'float')) {
      this.endStation();
    }
  }

  stepRiver(dt, spawning) {
    const st = this.st;
    const v = this.speedNow();
    const feats = st.def.features;
    const H = RIVER.halfWidth;

    if (spawning && st.spawned < st.wall.length) {
      st.distSinceSpawn += v * dt;
      if (st.distSinceSpawn >= st.def.spacing) {
        st.distSinceSpawn = 0;
        this.spawnTile();
        if (feats.includes('lanterns') && st.spawned >= st.nextLanternAt) {
          st.nextLanternAt = st.spawned + 9 + st.rng.int(8);
          this.spawnLantern();
        }
      }
    }

    // koi wander
    for (const k of st.koi) {
      k.a += dt * 0.5;
      k.x = Math.sin(k.a * 1.3) * 2.2;
      k.z = -7 + Math.sin(k.a * 0.7) * 5.5;
    }

    for (const f of st.floats) {
      if (f.state !== 'float') continue;
      f.age += dt;
      if (f.eddy) {
        const E = RIVER.eddy;
        f.eddy.a += dt * (1.7 / Math.max(0.6, f.eddy.r));
        f.eddy.left -= dt;
        const nx = E.x + Math.cos(f.eddy.a) * f.eddy.r;
        const nz = E.z + Math.sin(f.eddy.a) * f.eddy.r * 0.8;
        f.vx = (nx - f.x) / dt; f.vz = (nz - f.z) / dt;
        f.x = nx; f.z = nz;
        f.yaw += dt * 1.8;
        if (f.eddy.left <= 0 && Math.sin(f.eddy.a) > 0.3) f.eddy = null;
        continue;
      }
      // cross-profile: centre flows faster than banks
      const prof = 1 - 0.38 * Math.pow(f.x / (H + 0.6), 2);
      let fv = v * prof;
      if (feats.includes('rapids') && f.z > RIVER.rapidsZ[0] && f.z < RIVER.rapidsZ[1]) fv *= 1.85;
      // lateral wander + separation
      let ax = Math.sin(f.age * 0.9 + f.seed * 6.28) * 0.12;
      for (const g of st.floats) {
        if (g === f || g.state !== 'float') continue;
        const dx = f.x - g.x, dz = f.z - g.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.1 && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          ax += (dx / d) * (1.05 - d) * 3.2;
          fv += (dz / d) * (1.05 - d) * 0.6;
        }
      }
      for (const k of st.koi) {
        const dx = f.x - k.x, dz = f.z - k.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.2) { ax += (dx / Math.sqrt(d2 + 0.01)) * 3.5; f.spin += dt * 2 * Math.sign(dx || 1); }
      }
      f.vx += (ax - f.vx * 0.9) * dt * 2.5;
      f.vz += (fv - f.vz) * Math.min(1, dt * 2.2);
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      if (f.x > H) { f.x = H; f.vx = -Math.abs(f.vx) * 0.4; }
      if (f.x < -H) { f.x = -H; f.vx = Math.abs(f.vx) * 0.4; }
      f.spin *= Math.exp(-dt * 0.8);
      f.yaw += (f.spin + Math.sin(f.age * 0.5 + f.seed * 3) * 0.08) * dt;

      if (feats.includes('eddy') && !f.eddyDone) {
        const E = RIVER.eddy;
        const dx = f.x - E.x, dz = f.z - E.z;
        if (dx * dx + dz * dz < E.r * E.r * 0.9) {
          f.eddyDone = true;
          f.eddy = { a: Math.atan2(dz / 0.8, dx), r: Math.max(0.7, Math.sqrt(dx * dx + dz * dz)), left: 2.6 };
        }
      }
      f.hidden = feats.includes('mist') && f.z < RIVER.mistZ && f.tile;

      if (f.z > RIVER.zLose) this.loseFloat(f);
    }
    st.floats = st.floats.filter((f) => f.state === 'float');
  }

  spawnTile() {
    const st = this.st;
    // A gentle, station-dependent nudge towards tiles that help the current hand, so
    // early rivers flow; later rivers are honest shuffles.
    if (st.def.kindness > 0 && st.rng.next() < st.def.kindness && st.useful.size) {
      const look = Math.min(st.wall.length, st.spawned + 14);
      for (let i = st.spawned; i < look; i++) {
        if (st.useful.has(st.wall[i].kind)) {
          [st.wall[st.spawned], st.wall[i]] = [st.wall[i], st.wall[st.spawned]];
          break;
        }
      }
    }
    const tile = st.wall[st.spawned++];
    // Rafts: two tiles that already belong together (pair or neighbours) float lashed together.
    const raftChance = st.def.rafts ?? 0;
    if (raftChance > 0 && st.rng.next() < raftChance && st.spawned < st.wall.length) {
      const look = Math.min(st.wall.length, st.spawned + 10);
      for (let i = st.spawned; i < look; i++) {
        const o = st.wall[i];
        if (fitsRaft(tile.kind, o.kind)) {
          [st.wall[st.spawned], st.wall[i]] = [st.wall[i], st.wall[st.spawned]];
          st.spawned++;
          this.addFloat(tile, false, RIVER.zSpawn, o);
          return;
        }
      }
    }
    this.addFloat(tile, false);
  }

  spawnLantern() { this.addFloat(null, true); }

  addFloat(tile, lantern, z = RIVER.zSpawn, second = null) {
    const st = this.st;
    const H = RIVER.halfWidth - 0.3;
    let x;
    for (let tries = 0; tries < 6; tries++) {
      x = st.rng.range(-H, H);
      if (Math.abs(x - st.lastX) > 1.0) break;
    }
    st.lastX = x;
    if (second && tile.kind > second.kind) [tile, second] = [second, tile];
    const f = {
      id: this.floatSeq++, tile, tiles: tile ? (second ? [tile, second].sort((a, b) => a.kind - b.kind) : [tile]) : [], lantern, x, z, vx: 0, vz: this.speedNow() * 0.8,
      yaw: st.rng.range(-0.35, 0.35), spin: 0, seed: st.rng.next(), age: 0, state: 'float',
      hidden: false, eddy: null, eddyDone: false, index: st.spawned - 1,
    };
    st.floats.push(f);
    this.emit('spawn', { float: f });
    return f;
  }

  loseFloat(f) {
    f.state = 'gone';
    if (f.tile && this.mods.hopBack > 0 && !f.hopped && this.st.rng.next() < this.mods.hopBack) {
      // frog charm: the tile hops back upstream
      f.state = 'float';
      f.hopped = true;
      f.z = RIVER.zSpawn + 1.5;
      f.x = this.st.rng.range(-2, 2);
      this.emit('hop', { float: f });
      return;
    }
    this.emit('lost', { float: f });
  }

  findFloat(id) { return this.st.floats.find((f) => f.id === id && f.state === 'float'); }

  // ------------------------------------------------------------------ player actions
  tryCatch(floatId) {
    if (this.phase !== 'play' && this.phase !== 'intro') return { ok: false, reason: 'phase' };
    const st = this.st;
    const f = this.findFloat(floatId);
    if (!f) return { ok: false, reason: 'gone' };

    if (f.lantern) {
      f.state = 'caught';
      st.floats = st.floats.filter((g) => g !== f);
      st.blessing = Math.min(3, st.blessing + 1);
      this.emit('lantern', { float: f, blessing: st.blessing });
      return { ok: true, action: 'lantern' };
    }

    if (f.tiles.length > 1) return this.catchRaft(f);

    let res = resolveCatch(st.hand, f.tile, { riichi: !!st.riichi });
    let released = null;
    if (!res.ok && res.reason === 'full' && this.mods.autoRelease) {
      released = this.pickRelease();
      discardTile(st.hand, released.id);
      res = resolveCatch(st.hand, f.tile, { riichi: false });
    }
    if (!res.ok) {
      f.spin += (st.rng.next() < 0.5 ? -1 : 1) * 2.5;
      f.vz -= 0.6;
      this.emit('reject', { float: f, reason: res.reason });
      return res;
    }
    f.state = 'caught';
    st.floats = st.floats.filter((g) => g !== f);
    this.run.stats.catches++;
    if (released) this.emit('release', { tile: released });

    const winEv = res.events.find((e) => e.type === 'win');
    this.emit('catch', { float: f, tile: f.tile, result: res });
    for (const e of res.events) {
      if (e.type === 'kan') {
        // a kan reveals a new dora indicator
        const k = st.rng.pick(st.def.kinds);
        st.indicators.push(k);
        this.emit('kan', { ...e, indicator: k });
      }
      if (e.type === 'meld') this.emit('meld', e);
    }
    if (winEv) this.win(f);
    else this.recompute();
    return res;
  }

  catchRaft(f) {
    const st = this.st;
    const reject = (reason) => {
      f.spin += 2.5; f.vz -= 0.6;
      this.emit('reject', { float: f, reason });
      return { ok: false, reason };
    };
    if (st.riichi) {
      // in riichi a raft is only accepted if one of its tiles wins outright
      const winner = f.tiles.find((t) => st.tenpaiWaits.includes(t.kind));
      if (!winner) return reject('riichi');
    }
    // simulate both tiles in order (try both orders, keep the one that works best)
    const orders = [f.tiles, f.tiles.slice().reverse()];
    let plan = null;
    for (const ord of orders) {
      const h = cloneHand(st.hand);
      const evs = [];
      let ok = true, won = false;
      for (const t of ord) {
        if (won) break;
        const r = resolveCatch(h, t, { riichi: !!st.riichi });
        if (!r.ok) { ok = false; break; }
        evs.push({ tile: t, res: r });
        if (r.action === 'win') won = true;
      }
      if (ok && (!plan || (won && !plan.won) || h.melds.length > plan.h.melds.length)) plan = { ord, won, h, evs };
    }
    if (!plan) return reject('full');
    f.state = 'caught';
    st.floats = st.floats.filter((g) => g !== f);
    this.run.stats.catches += 2;
    // replay on the real hand
    let winEv = false;
    const all = [];
    for (const t of plan.ord) {
      if (winEv) break;
      const r = resolveCatch(st.hand, t, { riichi: !!st.riichi });
      all.push({ tile: t, result: r });
      if (r.action === 'win') winEv = true;
    }
    this.emit('catch', { float: f, tile: f.tile, raft: all });
    for (const { result } of all) {
      for (const e of result.events) {
        if (e.type === 'kan') {
          const k = st.rng.pick(st.def.kinds);
          st.indicators.push(k);
          this.emit('kan', { ...e, indicator: k });
        }
        if (e.type === 'meld') this.emit('meld', e);
      }
    }
    if (winEv) this.win(f);
    else this.recompute();
    return { ok: true, action: winEv ? 'win' : 'raft' };
  }

  pickRelease() {
    const tray = this.st.hand.tray;
    let best = tray[0], bestV = -Infinity;
    const need = MELDS_TO_WIN - this.st.hand.melds.length;
    for (const t of tray) {
      const rest = tray.filter((x) => x !== t).map((x) => x.kind);
      const v = trayValue(rest, need);
      if (v > bestV) { bestV = v; best = t; }
    }
    return best;
  }

  tryDiscard(tileId) {
    if (this.phase !== 'play' && this.phase !== 'intro') return null;
    if (this.st.riichi) { this.emit('discardLocked', {}); return null; }
    const t = discardTile(this.st.hand, tileId);
    if (!t) return null;
    this.run.stats.discards++;
    this.emit('discard', { tile: t });
    this.recompute();
    return t;
  }

  declareRiichi() {
    if (!this.canRiichi()) return false;
    const st = this.st;
    st.riichi = { at: st.spawned, waits: st.tenpaiWaits.slice() };
    this.run.stats.riichi++;
    this.emit('riichi', { waits: st.riichi.waits });
    this.recompute();
    return true;
  }

  win(f) {
    const st = this.st;
    const ctx = this.scoreCtx(f);
    const result = scoreWin(st.hand, ctx);
    this.phase = 'scoring';
    this.run.stats.wins++;
    if (result.limit) this.run.stats.limits++;
    for (const y of result.yaku) this.run.yakuSeen[y.id] = (this.run.yakuSeen[y.id] || 0) + 1;
    if (result.limit) this.run.yakuSeen['limit_' + result.limit] = 1;
    st.pendingWin = result;
    this.emit('win', { result, hand: cloneHand(st.hand), riichi: !!st.riichi, uraIndicators: st.riichi ? st.ura.slice(0, st.indicators.length) : [] });
  }

  scoreCtx(f) {
    const st = this.st;
    const extraYaku = [];
    if (this.mods.renchanHan && st.renchan > 0) extraYaku.push({ id: 'renchan', han: this.mods.renchanHan * st.renchan });
    if (st.blessing > 0) extraYaku.push({ id: 'blessing', han: st.blessing });
    const idx = f.index ?? st.spawned;
    return {
      roundWind: st.def.wind,
      doraKinds: st.indicators.map(doraFromIndicator),
      uraKinds: st.ura.slice(0, st.indicators.length).map(doraFromIndicator),
      riichi: !!st.riichi,
      riichiHan: this.mods.riichiHan,
      ippatsu: !!st.riichi && st.spawned - st.riichi.at <= IPPATSU_WINDOW,
      haitei: idx >= st.wall.length - this.mods.haiteiWindow,
      hanBonus: this.mods.hanBonus,
      windsAreValue: this.mods.windsAreValue,
      akaHan: this.mods.akaHan,
      dragonBonus: this.mods.dragonBonus,
      extraYaku,
    };
  }

  // Called by UI once the score tally finished.
  confirmWin() {
    const st = this.st;
    if (this.phase !== 'scoring' || !st.pendingWin) return;
    const r = st.pendingWin;
    st.pendingWin = null;
    st.score += r.points;
    this.run.total += r.points;
    this.run.hands++;
    if (!this.run.best || r.points > this.run.best.points) {
      this.run.best = { points: r.points, han: r.han, fu: r.fu, limit: r.limit, yaku: r.yaku.map((y) => y.id) };
    }
    const limitCoins = { mangan: 1, haneman: 2, baiman: 3, sanbaiman: 4, kazoe: 5, yakuman: 6, doubleYakuman: 10 };
    st.limitCoins = (st.limitCoins || 0) + (limitCoins[r.limit] || 0);
    st.renchan++;
    st.blessing = 0;
    const oldTray = st.hand.tray.slice();
    st.hand = newHand(this.mods.trayCap);
    st.riichi = null;
    this.emit('handReset', { released: oldTray, score: st.score, target: st.target });
    if (st.score >= st.target) {
      this.clearStation();
    } else {
      this.phase = 'play';
      this.recompute();
    }
  }

  clearStation() {
    const st = this.st;
    st.cleared = true;
    this.phase = 'clear';
    const left = this.tilesLeft();
    const riverCoins = Math.floor((left / 3) * this.mods.coinMul);
    const coins = 3 + riverCoins + (st.limitCoins || 0);
    this.run.coins += coins;
    this.emit('stationClear', { score: st.score, target: st.target, tilesLeft: left, coins, riverCoins, limitCoins: st.limitCoins || 0, index: this.run.stationIndex });
  }

  endStation() {
    const st = this.st;
    if (st.score >= st.target) { this.clearStation(); return; }
    this.phase = 'fail';
    let shield = false;
    if (this.mods.darumaShield > 0) {
      shield = true;
      const i = this.run.charms.indexOf('daruma');
      if (i >= 0) this.run.charms.splice(i, 1);
      this.refreshMods();
    } else {
      this.run.lives--;
    }
    const over = this.run.lives <= 0;
    this.emit('stationFail', { score: st.score, target: st.target, lives: this.run.lives, shield, over });
  }

  // after fail UI
  retryStation() {
    if (this.run.lives <= 0) { this.phase = 'over'; this.emit('runOver', { run: this.run }); return; }
    this.startStation();
  }

  // ------------------------------------------------------------------ shrine (between stations)
  shrineOffers() {
    const rng = this.run.rng;
    const owned = new Set(this.run.charms);
    const pool = CHARMS.filter((c) => !owned.has(c.id) || c.instant);
    rng.shuffle(pool);
    return pool.slice(0, 3).map((c) => c.id);
  }

  canTakeCharm(id) {
    const c = CHARM_BY_ID[id];
    if (!c) return false;
    if (c.instant) return true;
    return this.run.charms.length < MAX_CHARMS && !this.run.charms.includes(id);
  }

  takeCharm(id, cost = 0) {
    if (!this.canTakeCharm(id) || this.run.coins < cost) return false;
    this.run.coins -= cost;
    const c = CHARM_BY_ID[id];
    if (c.instant) {
      if (id === 'chouchin') this.run.lives = Math.min(5, this.run.lives + 1);
    } else {
      this.run.charms.push(id);
    }
    this.refreshMods();
    this.emit('charmTaken', { id, run: this.run });
    return true;
  }

  removeCharm(id) {
    const i = this.run.charms.indexOf(id);
    if (i >= 0) { this.run.charms.splice(i, 1); this.refreshMods(); }
  }

  nextStation() {
    this.run.stationIndex++;
    if (this.run.stationIndex === STATIONS.length && !this.run.victoryShown) {
      this.run.victoryShown = true;
      this.phase = 'victory';
      this.emit('victory', { run: this.run });
      return;
    }
    this.startStation();
  }

  continueEndless() { this.startStation(); }
}

export { isDragon };

function fitsRaft(a, b) {
  if (a === b) return true;
  if (a >= 27 || b >= 27) return false;
  if (Math.floor(a / 9) !== Math.floor(b / 9)) return false;
  return Math.abs(a - b) === 1 || Math.abs(a - b) === 2;
}
