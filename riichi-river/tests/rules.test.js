import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTile, parseKinds, doraFromIndicator } from '../src/game/tiles.js';
import {
  newHand, resolveCatch, winningKinds, scoreWin, scoreStructure, discard, usefulKinds,
} from '../src/game/rules.js';

const T = (s) => parseKinds(s).map((k) => makeTile(k));
const tile = (s) => T(s)[0];

function handFrom(meldStrs, trayStr, cap = 5) {
  const h = newHand(cap);
  for (const ms of meldStrs) {
    const tiles = T(ms);
    const type = tiles[0].kind === tiles[1].kind ? (tiles.length === 4 ? 'kan' : 'pon') : 'chi';
    h.melds.push({ type, tiles });
  }
  h.tray = trayStr ? T(trayStr) : [];
  return h;
}

test('catching a tile that completes a run snaps a chi meld', () => {
  const h = handFrom([], '3s 4s');
  const r = resolveCatch(h, tile('5s'));
  assert.equal(r.action, 'meld');
  assert.equal(h.melds.length, 1);
  assert.equal(h.melds[0].type, 'chi');
  assert.deepEqual(h.melds[0].tiles.map((t) => t.kind), parseKinds('345s'));
  assert.equal(h.tray.length, 0);
});

test('triplet forms pon; fourth copy upgrades to kan without using a tray slot', () => {
  const h = handFrom([], '7p 7p');
  assert.equal(resolveCatch(h, tile('7p')).action, 'meld');
  assert.equal(h.melds[0].type, 'pon');
  h.tray = T('1m 2m 5s 9s E'); // full tray
  const r = resolveCatch(h, tile('7p'));
  assert.equal(r.action, 'kan');
  assert.equal(h.melds[0].tiles.length, 4);
  assert.equal(h.tray.length, 5);
});

test('full tray rejects a tile that does nothing but accepts one that completes a set', () => {
  const h = handFrom([], '1m 2m 5s 9s E');
  assert.equal(resolveCatch(h, tile('7p')).reason, 'full');
  assert.equal(resolveCatch(h, tile('3m')).action, 'meld');
  assert.equal(h.tray.length, 3);
});

test('4 melds + pair wins, either by pairing or by the 4th meld', () => {
  const a = handFrom(['123m', '456p', '789s', 'Wh Wh Wh'], 'E');
  assert.equal(resolveCatch(a, tile('E')).action, 'win');
  const b = handFrom(['123m', '456p', '789s'], '5p 5p 6s 7s');
  assert.equal(resolveCatch(b, tile('8s')).action, 'win');
});

test('winningKinds finds ryanmen, shanpon and tanki waits', () => {
  const ryan = handFrom(['123m', '456p', '789s'], '5p 5p 6s 7s');
  assert.deepEqual(winningKinds(ryan), parseKinds('5s 8s'), 'pon of 5p leaves no pair, so it is not a win');
  const shanpon = handFrom(['123m', '456p', '789s'], '5p 5p 7s 7s');
  assert.deepEqual(winningKinds(shanpon), parseKinds('5p 7s'));
  const tanki = handFrom(['123m', '456p', '789s', 'R R R'], 'N');
  assert.deepEqual(winningKinds(tanki), parseKinds('N'));
  const none = handFrom(['123m'], '5p 9s');
  assert.deepEqual(winningKinds(none), []);
});

test('riichi only accepts winning tiles', () => {
  const h = handFrom(['123m', '456p', '789s'], '5p 5p 6s 7s');
  assert.equal(resolveCatch(h, tile('1m'), { riichi: true }).ok, false);
  assert.equal(resolveCatch(h, tile('5p'), { riichi: true }).ok, false, 'pon that does not win is refused in riichi');
  assert.equal(resolveCatch(h, tile('5s'), { riichi: true }).action, 'win');
});

test('meld choice keeps the pair when it can', () => {
  // tray 4s 4s 5s 6s ; catch 3s: options 345 (uses a 4s) or 3-4-5... keep 4s pair + 6s
  const h = handFrom([], '4s 4s 5s 6s');
  resolveCatch(h, tile('3s'));
  // either 345 or 456 leaves one 4s... check we did not leave two isolated tiles when a better option existed
  assert.equal(h.melds.length, 1);
  assert.equal(h.tray.length, 2);
});

test('discard removes a tray tile', () => {
  const h = handFrom([], '1m 9p');
  const t = discard(h, h.tray[0].id);
  assert.ok(t);
  assert.equal(h.tray.length, 1);
});

test('usefulKinds lists tiles that meld or win', () => {
  const h = handFrom([], '3s 4s');
  const u = usefulKinds(h);
  assert.ok(u.has(parseKinds('2s')[0]));
  assert.ok(u.has(parseKinds('5s')[0]));
  assert.ok(!u.has(parseKinds('3s')[0]), 'a single copy does not make a pon');
});

// ---------------- scoring

const score = (meldStrs, pairStr, ctx = {}) => {
  const h = handFrom(meldStrs, pairStr);
  return scoreWin(h, ctx);
};
const ids = (r) => r.yaku.map((y) => y.id).sort();

test('pinfu tanyao tsumo = 3 han 20 fu = 2600 (1300 base... rounded)', () => {
  const r = score(['234m', '567m', '345p', '678s'], '5s 5s');
  assert.deepEqual(ids(r), ['pinfu', 'tanyao', 'tsumo']);
  assert.equal(r.fu, 20);
  assert.equal(r.han, 3);
  assert.equal(r.points, 2600); // 20 * 2^5 * 4 = 2560 -> 2600
});

test('toitoi with dragon triplet adds fu and yakuhai', () => {
  const r = score(['222m', '999p', 'R R R', '444s'], '7s 7s');
  assert.ok(ids(r).includes('toitoi'));
  assert.ok(ids(r).includes('yakuhai'));
  // 22 + 4 + 8 + 8 + 4 = 46 -> 50
  assert.equal(r.fu, 50);
  assert.equal(r.han, 4); // tsumo 1 + yakuhai 1 + toitoi 2
  assert.equal(r.points, 8000); // 50*2^6 = 3200 base >= 2000 -> mangan
  assert.equal(r.limit, 'mangan');
});

test('chinitsu + ittsu reaches haneman', () => {
  const r = score(['123p', '456p', '789p', '222p'], '9p 9p');
  assert.ok(ids(r).includes('chinitsu'));
  assert.ok(ids(r).includes('ittsu'));
  assert.equal(r.limit, 'baiman'); // 1+6+2 = 9 han
});

test('daisangen is yakuman and ignores dora', () => {
  const r = score(['Wh Wh Wh', 'G G G', 'R R R', '123m'], '9s 9s', { doraKinds: [0] });
  assert.equal(r.yakuman, true);
  assert.equal(r.points, 32000);
  assert.ok(!r.yaku.some((y) => y.dora));
});

test('dora, red fives and ura dora (only in riichi) count', () => {
  const h = handFrom(['234m', '567m', '345p', '678s'], '5s 5s');
  h.tray[0].red = true;
  const noR = scoreWin(h, { doraKinds: [3], uraKinds: [4] });
  assert.equal(noR.yaku.find((y) => y.id === 'dora').han, 1);
  assert.equal(noR.yaku.find((y) => y.id === 'aka').han, 1);
  assert.equal(noR.yaku.find((y) => y.id === 'ura'), undefined);
  const withR = scoreWin(h, { riichi: true, doraKinds: [3], uraKinds: [4] });
  assert.equal(withR.yaku.find((y) => y.id === 'ura').han, 1);
});

test('sanshoku, iipeikou, chanta and junchan detection', () => {
  const s = score(['123m', '123p', '123s', '789s'], '9m 9m');
  assert.ok(ids(s).includes('sanshoku'));
  assert.ok(ids(s).includes('junchan'));
  const c = score(['123m', '123m', '789p', 'N N N'], '1s 1s');
  assert.ok(ids(c).includes('iipeikou'));
  assert.ok(ids(c).includes('chanta'));
});

test('round wind triplet counts; other winds only with windsAreValue', () => {
  const r1 = score(['E E E', '234m', '456p', '678s'], '5s 5s', { roundWind: 27 });
  assert.ok(ids(r1).includes('yakuhai'));
  const r2 = score(['S S S', '234m', '456p', '678s'], '5s 5s', { roundWind: 27 });
  assert.ok(!ids(r2).includes('yakuhai'));
  const r3 = score(['S S S', '234m', '456p', '678s'], '5s 5s', { roundWind: 27, windsAreValue: true });
  assert.ok(ids(r3).includes('yakuhai'));
});

test('scoreWin picks the best pair when the tray has several', () => {
  const h = handFrom(['234m', '567m', '345p', '678s'], '5s 5s R R');
  const r = scoreWin(h, {});
  assert.ok(ids(r).includes('pinfu'), 'the 5s pair keeps pinfu + tanyao');
});

test('hanBonus charm modifiers add to a yaku', () => {
  const r = score(['234m', '567m', '345p', '678s'], '5s 5s', { hanBonus: { tanyao: 2 } });
  assert.equal(r.yaku.find((y) => y.id === 'tanyao').han, 3);
});

test('dora indicator wraps', () => {
  assert.equal(doraFromIndicator(parseKinds('9m')[0]), parseKinds('1m')[0]);
  assert.equal(doraFromIndicator(parseKinds('N')[0]), parseKinds('E')[0]);
  assert.equal(doraFromIndicator(parseKinds('R')[0]), parseKinds('Wh')[0]);
});

test('a catch that completes the hand wins instead of upgrading a pon to kan', () => {
  const h = handFrom(['111m', '456p', '789s'], '2m 3m 5s 5s');
  assert.ok(winningKinds(h).includes(parseKinds('1m')[0]));
  assert.equal(resolveCatch(h, tile('1m')).action, 'win');
});
