import * as THREE from 'three';
import { World } from './render/world.js';
import { drawAtlas } from './render/faces.js';
import { TileFactory } from './render/tileMesh.js';
import { RiverView, FLOAT_Y } from './render/riverView.js';
import { HandView } from './render/handView.js';
import { FX } from './render/fx.js';
import { Game, RIVER } from './game/game.js';
import { STATIONS, CHARM_BY_ID } from './game/content.js';
import { dailySeed, hashString } from './game/rng.js';
import { UI } from './ui/ui.js';
import { t, setLang, detectLang, tr } from './i18n.js';
import { audio } from './audio/audio.js';
import { loadSave, save, persist, mergeYaku, todayKey } from './save.js';
import { platform } from './platform.js';

const canvas = document.getElementById('gl');
const QS = new URLSearchParams(location.search);
const ui = new UI();
loadSave();
const S = save();
setLang(S.settings.lang || detectLang());
document.getElementById('boot-text').textContent = t('loading');

let world, factory, river, hand, fx, atlasTex;
let game = null;
let mode = 'boot'; // boot | title | play
let paused = false;
let timeScale = 1, hitStop = 0;
let W = 0, H = 0;
let tut = null;
const TMP = new THREE.Vector3();

// ------------------------------------------------------------------ boot
async function boot() {
  await platform.init();
  platform.loadingStart();
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('800 64px "RR Mincho"', '萬東發中一'),
        document.fonts.load('900 40px "RR Round"', '123'),
        document.fonts.load('400 20px "RR Hangul"', '가'),
      ]),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
  } catch (e) { /* fonts are progressive enhancement */ }

  world = new World(canvas);
  if (QS.get('dpr')) world.dpr = Number(QS.get('dpr'));
  world.shakeEnabled = S.settings.shake;
  buildAtlas();
  factory = new TileFactory(atlasTex);
  river = new RiverView(world, factory);
  hand = new HandView(world, factory);
  fx = new FX(world);
  river.onSplash = (x, z, s) => fx.splash(x, z, s);
  hand.onLand = () => audio.play('clack', { vol: 0.8, rate: 0.96 + Math.random() * 0.08 });
  applySettings();
  onResize();
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  bindInput();

  startAmbient();
  showTitle();
  requestAnimationFrame(frame);
  document.getElementById('boot').classList.add('gone');
  platform.loadingStop();
}

function buildAtlas() {
  const c = drawAtlas({ index: S.settings.index });
  if (!atlasTex) {
    atlasTex = new THREE.CanvasTexture(c);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.anisotropy = world.renderer.capabilities.getMaxAnisotropy();
    atlasTex.generateMipmaps = true;
    atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  } else {
    atlasTex.image = c;
    atlasTex.needsUpdate = true;
  }
  ui.resetFaces(c);
}

function applySettings() {
  audio.setVolumes(S.settings.music, S.settings.sfx);
  if (world) world.shakeEnabled = S.settings.shake && !S.settings.reducedMotion;
  document.body.classList.toggle('reduced', !!S.settings.reducedMotion);
  if (game && game.st) river.setHints(game.st.useful, game.st.tenpaiWaits, !!game.st.riichi, S.settings.hints, game.mods.riichiNoGlow);
}

// ------------------------------------------------------------------ layout
function onResize() {
  const vv = window.visualViewport;
  W = Math.round(vv ? vv.width : window.innerWidth);
  H = Math.round(vv ? vv.height : window.innerHeight);
  const cap = game && game.st ? game.st.hand.cap : 6;
  const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
  const L = hand.computeLayout(W, H, cap, safeBottom);
  const rackFrac = mode === 'play' ? (H - L.top) / H : 0.06;
  const hudFrac = mode === 'play' ? Math.min(0.2, 96 / H) : 0.02;
  world.resize(W, H, rackFrac, hudFrac);
  hand.resize(W, H, cap, safeBottom);
  positionOverlays();
}

function positionOverlays() {
  const L = hand.layoutInfo;
  if (!L) return;
  const bottom = H - L.top + 8;
  ui.setRiichiButton(game && mode === 'play' && game.canRiichi() && !paused, bottom);
  if (game && game.st) ui.setWaits(game.st.riichi ? game.st.riichi.waits : null, bottom, !!game.st.riichi);
}

// ------------------------------------------------------------------ ambient title river
function startAmbient() {
  mode = 'title';
  river.clear();
  hand.clearAll();
  game = new Game({ onEvent: onAmbientEvent });
  game.newRun({ seed: 7 });
  game.st.target = Infinity;
  game.phase = 'play';
  world.setPalette('dusk');
  setWaterFeatures([]);
  hand.root.visible = false;
  world.setView(0);
  ui.showHud(false);
  audio.setMusicState('title');
  onResize();
}

function onAmbientEvent(type, d) {
  if (type === 'spawn') river.add(d.float);
  else if (type === 'lost') river.remove(d.float.id);
}

function showTitle() {
  const canContinue = !!S.run;
  ui.title({
    best: S.best,
    canContinue,
    dailyBest: S.daily[todayKey()] || 0,
    needsTap: false,
    onPlay: () => startRun({}),
    onContinue: () => startRun({ resume: S.run }),
    onDaily: () => startRun({ daily: true }),
    onHow: () => ui.howTo({ onBack: showTitle }),
    onBook: () => ui.book(S.yakuSeen, { onBack: showTitle }),
    onSettings: () => showSettings(showTitle),
    onTap: () => {},
  });
}

function showSettings(back) {
  ui.settings(S.settings, {
    onChange: (key) => {
      if (key === 'lang') { setLang(S.settings.lang); persist(); showSettings(back); if (game && game.st && mode === 'play') refreshHud(); return; }
      if (key === 'index') buildAtlas();
      applySettings();
      persist();
    },
    onBack: back,
  });
}

// ------------------------------------------------------------------ run
function startRun({ daily = false, resume = null }) {
  audio.unlock();
  ui.clearScreens();
  river.clear();
  hand.clearAll();
  hand.root.visible = true;
  world.setView(1);
  mode = 'play';
  paused = false;
  const tutorial = !S.tutorialDone && !resume && !daily;
  game = new Game({ onEvent, tutorial });
  tut = tutorial ? { step: 0, t: 0 } : null;
  let seed = daily ? dailySeed() : QS.get('seed') ? Number(QS.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
  if (resume) seed = hashString(`${resume.seed}:${resume.stationIndex}:${resume.total}`);
  game.newRun({ seed, daily, charms: resume ? resume.charms : [] });
  if (resume) {
    Object.assign(game.run, {
      stationIndex: resume.stationIndex, lives: resume.lives, coins: resume.coins, total: resume.total,
      hands: resume.hands, best: resume.best, daily: resume.daily, victoryShown: resume.victoryShown,
    });
    game.refreshMods();
    game.startStation();
  }
  S.runs++;
  S.run = null;
  persist();
  ui.showHud(true);
  platform.gameplayStart();
  onResize();
}

function snapshotRun() {
  const r = game.run;
  S.run = {
    seed: r.seed, stationIndex: r.stationIndex, lives: r.lives, coins: r.coins, charms: r.charms.slice(),
    total: r.total, hands: r.hands, best: r.best, daily: r.daily, victoryShown: !!r.victoryShown,
  };
  persist();
}

function refreshHud() {
  const st = game.st;
  ui.setStation(st.def, game.run.stationIndex, 0);
  ui.setScore(st.score, st.target);
  ui.setLives(game.run.lives);
  ui.setDora(st.indicators);
  ui.setWall(game.tilesLeft(), st.wall.length);
  ui.setBlessing(st.blessing);
}

function setWaterFeatures(features) {
  const u = world.water.uniforms;
  u.uEddy.value.set(RIVER.eddy.x, RIVER.eddy.z, RIVER.eddy.r, features.includes('eddy') ? 1 : 0);
  u.uRapids.value.set(RIVER.rapidsZ[0], RIVER.rapidsZ[1], features.includes('rapids') ? 1 : 0);
  u.uMist.value = features.includes('mist') ? RIVER.mistZ : -999;
}

// ------------------------------------------------------------------ game events
let lastToast = {};
function toastOnce(key, msg, gap = 2.5) {
  const now = performance.now() / 1000;
  if (lastToast[key] && now - lastToast[key] < gap) return;
  lastToast[key] = now;
  ui.toast(msg);
}

function screenOfWorld(x, y, z) {
  TMP.set(x, y, z).project(world.camera);
  return { x: (TMP.x * 0.5 + 0.5) * W, y: (-TMP.y * 0.5 + 0.5) * H };
}

function onEvent(type, d) {
  switch (type) {
    case 'stationStart': {
      // debug knobs for automated flow tests (never set in normal play)
      if (QS.get('kind')) game.st.def = { ...game.st.def, kindness: Number(QS.get('kind')) };
      if (QS.get('target')) { game.st.target = Number(QS.get('target')); d.target = game.st.target; }
      river.clear();
      hand.clearAll();
      world.setPalette(d.def.palette);
      setWaterFeatures(d.def.features);
      onResize();
      hand.layout(game.hand, true);
      refreshHud();
      ui.introBanner(d.def, d.index, d.target);
      audio.play('gong', { vol: 0.8 });
      audio.setMusicState('play');
      document.body.classList.remove('in-riichi');
      hand.setLocked(false);
      break;
    }
    case 'play':
      if (tut && tut.step === 0) tut.t = 0;
      break;
    case 'spawn': river.add(d.float); break;
    case 'hop': fx.splash(d.float.x, d.float.z, 0.8); break;
    case 'lost': river.remove(d.float.id); break;
    case 'catch': onCatch(d); break;
    case 'reject': {
      const it = river.items.get(d.float.id);
      if (it) it.reject = 1;
      audio.play('thud', { vol: 0.7 });
      if (d.reason === 'full') toastOnce('full', t('trayFull'));
      if (d.reason === 'riichi') toastOnce('riichi', t('onlyWinners'));
      if (tut && d.reason === 'full' && tut.step < 4) { ui.tutorial(t('tut4'), { top: hand.rackTopPx() - 90 }); tut.step = Math.max(tut.step, 3); }
      break;
    }
    case 'release': {
      const out = hand.takeOut(d.tile.id);
      if (out) river.addDrifter(out.group, out.wpos.x * 0 + (Math.random() - 0.5) * 3, 1.0);
      break;
    }
    case 'meld': {
      const tile = d.tiles[1];
      setTimeout(() => {
        const p = hand.screenOf(tile.id);
        const n = game.st ? game.hand.melds.length : 1;
        const kan = d.meldType === 'chi' ? ['吃', t('chi')] : ['碰', t('pon')];
        if (p) ui.callStamp(kan[0], kan[1].toUpperCase(), p.x, p.y - 30);
        const rates = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5];
        audio.play('meld', { rate: rates[Math.min(n - 1, 4)], vol: 0.9 });
        world.addShake(0.12);
        if (tut && tut.step <= 1) { tut.step = 2; tut.t = 0; ui.tutorial(t('tut3'), { top: H * 0.2 }); ui.clearFinger(); }
      }, 300);
      break;
    }
    case 'kan': {
      setTimeout(() => {
        const p = hand.screenOf(d.tile.id);
        if (p) ui.callStamp('槓', t('kan').toUpperCase(), p.x, p.y - 30);
        audio.play('kan', { vol: 1 });
        world.addShake(0.25);
        ui.setDora(game.st.indicators, true);
        toastOnce('kan', t('kanDora'));
      }, 300);
      break;
    }
    case 'handChanged': {
      const wasTenpai = river.lastTenpai;
      river.setHints(d.useful, d.waits, d.riichi, S.settings.hints, game.mods.riichiNoGlow);
      hand.layout(d.hand);
      river.lastTenpai = d.waits.length > 0;
      if (!wasTenpai && d.waits.length && !d.riichi && mode === 'play') {
        audio.play('tenpai', { vol: 0.7 });
        if (tut && tut.step < 5) { tut.step = 5; ui.tutorial(t('tut5'), { top: hand.rackTopPx() - 150 }); }
      }
      positionOverlays();
      break;
    }
    case 'discard': {
      const out = hand.takeOut(d.tile.id);
      audio.play('toss', { vol: 0.8 });
      if (out) {
        const sx = (hand.rects.get(d.tile.id)?.x ?? W / 2);
        const lx = ((out.wpos.x - world.camera.position.x) / 1) * 2.2;
        river.addDrifter(out.group, Math.max(-2.6, Math.min(2.6, lx + (Math.random() - 0.5))), 1.0);
      }
      if (tut && tut.step === 3) { ui.tutorial(null); tut.step = 4; }
      break;
    }
    case 'discardLocked': toastOnce('locked', t('locked')); break;
    case 'riichi': {
      audio.play('riichi', { vol: 1 });
      audio.duck(0.4, 0.4, 0.8);
      audio.setMusicState('riichi', 0.8);
      ui.bigStamp('立直', t('riichi').toUpperCase());
      document.body.classList.add('in-riichi');
      hand.setLocked(true);
      world.addShake(0.35);
      world.punch(0.6);
      if (tut && tut.step === 5) { ui.tutorial(null); tut.step = 6; }
      positionOverlays();
      break;
    }
    case 'lantern': {
      const f = d.float;
      fx.sparkle(new THREE.Vector3(f.x, 0.4, f.z), 30, [1, 0.8, 0.35], 2.2);
      audio.play('bless', { vol: 0.9 });
      const p = screenOfWorld(f.x, 0.4, f.z);
      ui.floatText(t('blessing', d.blessing), p.x, p.y);
      river.remove(f.id);
      ui.setBlessing(d.blessing);
      break;
    }
    case 'win': onWin(d); break;
    case 'handReset': {
      // tiles in the rack sink away
      for (const [id] of hand.tiles) {
        const out = hand.takeOut(id);
        if (out) river.addDrifter(out.group, (Math.random() - 0.5) * 5, 0.2 + Math.random() * 1.6);
      }
      hand.layout(game.hand, true);
      hand.setLocked(false);
      document.body.classList.remove('in-riichi');
      ui.setScore(d.score, d.target);
      ui.setBlessing(0);
      audio.setMusicState('play');
      break;
    }
    case 'stationClear': {
      audio.play('clear', { vol: 1 });
      audio.setMusicState('shrine', 2);
      S.tutorialDone = true;
      if (tut) { ui.tutorial(null); tut = null; }
      mergeYaku(game.run.yakuSeen); game.run.yakuSeen = {};
      persist();
      setTimeout(() => ui.stationClear({ ...d, onNext: showShrine }), 700);
      break;
    }
    case 'stationFail': {
      audio.play('fail', { vol: 0.9 });
      audio.setMusicState('fail', 1.5);
      ui.setLives(game.run.lives);
      platform.gameplayStop();
      mergeYaku(game.run.yakuSeen); game.run.yakuSeen = {};
      persist();
      setTimeout(() => ui.stationFail({
        ...d,
        onRetry: () => { ui.clearScreens(); platform.commercialBreak(audio).then(() => { platform.gameplayStart(); game.retryStation(); }); },
        onEnd: () => endRun(false),
      }), 900);
      break;
    }
    case 'victory': endRun(true); break;
    default: break;
  }
}

function onCatch(d) {
  const f = d.float;
  const it = river.detach(f.id);
  audio.play('catch', { vol: 0.9, pan: f.x / 5, rate: 0.95 + Math.random() * 0.1 });
  world.water.ripple(f.x, f.z, 1);
  fx.splash(f.x, f.z, 1);
  if (!it) return;
  if (f.tiles.length > 1) {
    const tiles = it.group.userData.raftTiles;
    f.tiles.forEach((tile, i) => hand.flyIn(tile, tiles[i], i * 0.06));
    river.group.add(it.group); // the empty raft keeps floating a moment
    it.group.userData.raftTiles = [];
    setTimeout(() => river.group.remove(it.group), 400);
  } else {
    hand.flyIn(f.tile, it.group);
  }
  hand.layout(game.hand);
  if (tut && tut.step === 0) { tut.step = 1; ui.clearFinger(); ui.tutorial(t('tut2'), { top: H * 0.2 }); }
}

function onWin(d) {
  hitStop = 0.4;
  world.punch(1.4);
  world.addShake(0.6);
  audio.play('tsumo', { vol: 1 });
  audio.duck(0.25, 1.0, 1.2);
  const big = d.result.limit && d.result.limit !== 'mangan';
  ui.bigStamp('自摸', t('tsumo').toUpperCase(), !!d.result.limit);
  hand.hopWave();
  // celebratory sparks from the rack
  const L = hand.layoutInfo;
  for (let i = 0; i < 5; i++) {
    const p = hand.pxToLocal(L.w * (0.2 + i * 0.15), L.meldY - 20, 3.4);
    world.camera.localToWorld(p);
    fx.sparkle(p, big ? 14 : 8, [1, 0.8, 0.4], 0.5, 9);
  }
  if (tut) { ui.tutorial(null); }
  setTimeout(() => {
    audio.setMusicState('score', 0.6);
    ui.scoring({
      result: d.result, hand: d.hand, uraIndicators: d.uraIndicators, audio,
      onDone: () => { audio.play('ui', { vol: 0.6 }); game.confirmWin(); },
    });
  }, 1150);
}

function kindName(k) {
  if (k < 27) return `${(k % 9) + 1}${'mps'[Math.floor(k / 9)]}`;
  return ['E', 'S', 'W', 'N', 'Wh', 'G', 'R'][k - 27];
}

// ------------------------------------------------------------------ shrine
function showShrine() {
  platform.gameplayStop();
  const run = game.run;
  const offers = game.shrineOffers().map((id, i) => ({ id, cost: i === 0 && !run.freeTaken ? 0 : CHARM_BY_ID[id].cost, taken: false }));
  let freeLeft = true;
  const rerollCost = 3;
  const render = () => ui.shrine({
    run, offers, rerollCost,
    onTake: (i) => {
      const o = offers[i];
      const cost = freeLeft ? 0 : CHARM_BY_ID[o.id].cost;
      if (!game.canTakeCharm(o.id)) { toastOnce('full', t('full')); audio.play('thud'); return; }
      if (run.coins < cost) { audio.play('thud'); return; }
      game.takeCharm(o.id, cost);
      o.taken = true;
      freeLeft = false;
      for (const x of offers) if (!x.taken) x.cost = CHARM_BY_ID[x.id].cost;
      audio.play('charm', { vol: 0.9 });
      render();
    },
    onReroll: () => {
      if (run.coins < rerollCost) return;
      run.coins -= rerollCost;
      const ids = game.shrineOffers();
      offers.splice(0, 3, ...ids.map((id) => ({ id, cost: freeLeft ? 0 : CHARM_BY_ID[id].cost, taken: false })));
      if (freeLeft) offers.forEach((o, i) => { o.cost = i === 0 ? 0 : CHARM_BY_ID[o.id].cost; });
      audio.play('ui');
      render();
    },
    onRelease: (id) => { game.removeCharm(id); audio.play('toss'); render(); },
    onLeave: () => {
      ui.clearScreens();
      platform.commercialBreak(audio).then(() => {
        game.nextStation();
        if (game.phase !== 'victory') { snapshotRun(); platform.gameplayStart(); }
      });
    },
  });
  // First offer is free: mark visually
  offers.forEach((o, i) => { o.cost = i === 0 ? 0 : CHARM_BY_ID[o.id].cost; });
  // any card can be the free one: show costs as 0 until one is taken
  offers.forEach((o) => { o.cost = 0; });
  render();
}

function endRun(victory) {
  platform.gameplayStop();
  const run = game.run;
  mergeYaku(run.yakuSeen); run.yakuSeen = {};
  let record = false;
  if (run.total > (S.best.total || 0)) { S.best.total = run.total; record = true; }
  S.best.stations = Math.max(S.best.stations || 0, run.stationIndex);
  if (run.best && (!S.best.hand || run.best.points > S.best.hand.points)) S.best.hand = run.best;
  if (run.daily) { const k = todayKey(); S.daily[k] = Math.max(S.daily[k] || 0, run.total); }
  S.run = null;
  persist();
  audio.setMusicState(victory ? 'shrine' : 'fail', 2);
  audio.play(victory ? 'clear' : 'fail', { vol: 0.8 });
  ui.results({
    run, victory, record,
    onNew: () => startRun({ daily: false }),
    onTitle: () => { startAmbient(); showTitle(); },
    onEndless: victory ? () => { ui.clearScreens(); platform.gameplayStart(); game.continueEndless(); } : null,
  });
}

// ------------------------------------------------------------------ pause
function pause() {
  if (mode !== 'play' || paused) return;
  if (!['play', 'intro'].includes(game.phase)) return;
  paused = true;
  platform.gameplayStop();
  audio.setMusicState('paused', 0.5);
  positionOverlays();
  ui.pause({
    onResume: resume,
    onSettings: () => showSettings(() => { ui.clearScreens(); pause2(); }),
    onQuit: () => { paused = false; snapshotIfMidRun(); startAmbient(); showTitle(); },
  });
}
function pause2() { paused = false; pause(); }
function resume() {
  paused = false;
  ui.clearScreens();
  audio.setMusicState(game.st && game.st.riichi ? 'riichi' : 'play', 0.5);
  platform.gameplayStart();
  positionOverlays();
}
function snapshotIfMidRun() {
  // Leaving mid-river forfeits the river but keeps the journey (charms, lives -1).
  if (game && game.run && game.run.lives > 0) {
    const r = game.run;
    S.run = { seed: r.seed, stationIndex: r.stationIndex, lives: Math.max(1, r.lives - 1), coins: r.coins, charms: r.charms.slice(), total: r.total, hands: r.hands, best: r.best, daily: r.daily, victoryShown: !!r.victoryShown };
    persist();
  }
}

// ------------------------------------------------------------------ input
function bindInput() {
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.unlock();
    if (mode !== 'play' || paused || !game.st) return;
    const { x, y } = pos(e);
    if (y > hand.rackTopPx() - 4) {
      const id = hand.pick(x, y);
      if (id != null) game.tryDiscard(id);
      return;
    }
    const fid = river.pick(x, y, game.st.floats, W, H);
    if (fid != null) game.tryCatch(fid);
  }, { passive: false });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'play' || !game.st || e.pointerType !== 'mouse') return;
    const { x, y } = pos(e);
    let id = null;
    if (y < hand.rackTopPx() - 4) id = river.pick(x, y, game.st.floats, W, H);
    river.hover = id;
    const overHand = y > hand.rackTopPx() - 4 && hand.pick(x, y) != null;
    canvas.style.cursor = id != null || overHand ? 'pointer' : 'default';
  });
  document.getElementById('btn-riichi').addEventListener('click', (e) => { e.stopPropagation(); game.declareRiichi(); positionOverlays(); });
  document.getElementById('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); audio.play('ui'); pause(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') { if (paused) resume(); else pause(); }
    if ((e.code === 'Space' || e.code === 'KeyR') && mode === 'play' && !paused) { game.declareRiichi(); positionOverlays(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); audio.suspend(); } else audio.resume();
  });
  window.addEventListener('blur', () => pause());
  ui.onButton = () => { audio.unlock(); audio.play('ui', { vol: 0.6 }); };
  document.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let acc = 0;
let hudT = 0;
const STEP = 1 / 120;
const FIXED_DT = QS.get('dt') ? Number(QS.get('dt')) : 0; // debug: deterministic time-lapse capture

function frame(now) {
  requestAnimationFrame(frame);
  let dt = FIXED_DT || Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (hitStop > 0) {
    hitStop -= dt;
    timeScale = hitStop > 0.25 ? 0.04 : 0.3;
    if (hitStop <= 0) timeScale = 1;
  }
  const running = !paused && game;
  if (running) {
    acc += dt * timeScale;
    let n = 0;
    while (acc >= STEP && n < 8) {
      game.update(STEP);
      acc -= STEP; n++;
      if (mode === 'title' && game.wallLeft() <= 0) { game.st.spawned = 0; game.st.wall.reverse(); }
    }
    if (n >= 8) acc = 0;
  }
  world.koiState = game && game.st && game.st.koi.length ? game.st.koi : null;
  const sim = game && (game.phase === 'play' || game.phase === 'intro') && !paused;
  const flowSpeed = sim ? game.speedNow() * timeScale : game ? 0.35 : 0.5;
  world.update(dt, flowSpeed);
  if (game && game.st) river.update(dt * (paused ? 0 : 1), game.st.floats);
  hand.update(dt);
  fx.update(dt);
  world.render();

  if (mode === 'play' && game.st) {
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      ui.setWall(game.tilesLeft(), game.st.wall.length);
    }
    updateTutorial(dt);
  }
}

function updateTutorial(dt) {
  if (!tut) return;
  tut.t += dt;
  if (tut.step === 0 && game.phase === 'play') {
    // point at the most catchable tile
    const f = game.st.floats.filter((x) => x.tile && x.z > -9).sort((a, b) => b.z - a.z)[0];
    if (f) {
      const p = screenOfWorld(f.x, FLOAT_Y + 0.2, f.z);
      if (!document.getElementById('finger')) { ui.finger(p.x, p.y); ui.tutorial(t('tut1'), { top: Math.max(90, p.y - 120) }); }
      else ui.moveFinger(p.x, p.y);
    }
  }
  if (tut.step === 2 && tut.t > 5) { ui.tutorial(null); tut.step = 3; }
}

// test hook for automated checks (read-only state + safe actions)
window.__rr = {
  get game() { return game; },
  get mode() { return mode; },
  catchAt: (fid) => game.tryCatch(fid),
  screenOfFloat: (f) => screenOfWorld(f.x, FLOAT_Y + 0.2, f.z),
  handRect: (id) => hand.rects.get(id),
  world: () => world,
  hand: () => hand,
  river: () => river,
  pick: (x, y) => river.pick(x, y, game.st.floats, W, H),
  get paused() { return paused; },
  three: THREE,
  audio,
};

boot();
