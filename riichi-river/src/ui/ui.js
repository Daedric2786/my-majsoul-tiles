// DOM UI: HUD, stamps, and screens. Pure presentation; callbacks are passed in.
import { t, tr, LANG_NAMES } from '../i18n.js';
import { CHARM_BY_ID, CHARMS, MAX_CHARMS } from '../game/content.js';
import { YAKU } from '../game/rules.js';
import { faceDataURL } from '../render/faces.js';
import { later, cancel, nowMs, nextFrame } from '../util/clock.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const CHARM_COLORS = ['#a8262a', '#1f4f93', '#1d7650', '#7a3a8a', '#b8742a', '#2a6a8a'];
export const charmColor = (id) => CHARM_COLORS[CHARMS.findIndex((c) => c.id === id) % CHARM_COLORS.length];

export class UI {
  constructor() {
    this.faceCache = new Map();
    this.atlas = null;
    this.screens = $('screens');
    this.toastEl = $('toast');
    this.stamps = $('stamps');
    this.toastTimer = 0;
  }

  face(kind, red = false) {
    const key = `${kind}:${red}`;
    let u = this.faceCache.get(key);
    if (!u && this.atlas) { u = faceDataURL(this.atlas, kind, red); this.faceCache.set(key, u); }
    return u || '';
  }

  resetFaces(atlas) { this.atlas = atlas; this.faceCache.clear(); }

  // ------------------------------------------------------------------ HUD
  showHud(v) { $('hud').classList.toggle('hidden', !v); }

  setStation(def, index, loop) {
    const [name] = tr().stations[def.id] || [def.id];
    $('hud-seal').textContent = def.kanji;
    $('hud-name').textContent = name;
    const w = tr().winds[def.wind - 27];
    $('hud-wind').textContent = `${t('wind')}: ${w}  ·  ${index + 1}/8`;
    $('lbl-dora').textContent = t('dora');
    $('lbl-left').textContent = t('tilesLeft');
    $('riichi-label').textContent = t('riichi').toUpperCase();
  }

  setScore(score, target) {
    $('hud-score').textContent = fmt(score);
    $('hud-target').textContent = fmt(target);
    $('hud-bar').style.width = `${Math.min(100, (score / target) * 100)}%`;
    $('hud-bar').parentElement.classList.toggle('done', score >= target);
  }

  setWall(left, total) {
    $('hud-wall').textContent = left;
    $('hud-wall').parentElement.classList.toggle('low', left <= 12 && left > 0);
    $('wall-meter-fill').style.transform = `scaleX(${total ? left / total : 0})`;
  }

  setLives(n, max = 3) {
    const box = $('hud-lives');
    box.innerHTML = '';
    for (let i = 0; i < Math.max(max, n); i++) box.appendChild(el('div', `life${i < n ? '' : ' out'}`));
  }

  setDora(indicators, isNew = false) {
    const box = $('hud-dora-tiles');
    const prev = box.children.length;
    box.innerHTML = '';
    indicators.forEach((k, i) => {
      const img = el('img');
      img.src = this.face(k);
      img.alt = '';
      if (isNew && i >= prev) img.className = 'new';
      box.appendChild(img);
    });
  }

  setBlessing(n) {
    const b = $('hud-bless');
    b.classList.toggle('hidden', !n);
    b.textContent = n ? t('blessing', n) : '';
  }

  setRiichiButton(visible, bottomPx) {
    const b = $('btn-riichi');
    const was = !b.classList.contains('hidden');
    b.classList.toggle('hidden', !visible);
    b.style.bottom = `${bottomPx}px`;
    if (visible && !was) { b.classList.remove('enter'); void b.offsetWidth; b.classList.add('enter'); }
  }

  setWaits(kinds, bottomPx, riichi) {
    const w = $('waits');
    if (!kinds || !kinds.length || !riichi) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    w.style.bottom = `${bottomPx}px`;
    w.innerHTML = `<span>${t('waitingFor')}</span>`;
    for (const k of kinds.slice(0, 7)) { const i = el('img'); i.src = this.face(k); w.appendChild(i); }
  }

  toast(msg, ms = 1600) {
    const e = this.toastEl;
    e.textContent = msg;
    e.classList.add('show');
    cancel(this.toastTimer);
    this.toastTimer = later(() => e.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------------ stamps
  callStamp(kanji, label, x, y) {
    const s = el('div', 'stamp call', `<span class="k">${kanji}</span><span class="r">${label}</span>`);
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    this.stamps.appendChild(s);
    later(() => s.remove(), 950);
  }

  bigStamp(kanji, label, gold = false) {
    const s = el('div', `stamp big${gold ? ' gold' : ''}`, `<div class="seal-box"><span class="k">${kanji}</span></div><span class="r">${label}</span>`);
    this.stamps.appendChild(s);
    later(() => s.remove(), 1550);
  }

  floatText(text, x, y) {
    const s = el('div', 'float-text', text);
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    this.stamps.appendChild(s);
    later(() => s.remove(), 1150);
  }

  introBanner(def, index, target) {
    const [name, flavor] = tr().stations[def.id] || [def.id, ''];
    const feats = def.features.map((f) => `<span class="feat">${tr().features[f]}</span>`).join('');
    const b = el('div', 'intro-banner', `
      <div class="num">${def.id === 'endless' ? '∞' : `RIVER ${index + 1}`}</div>
      <div class="kan">${def.kanji}</div>
      <div class="nm">${name}</div>
      <div class="fl">${flavor}</div>
      <div class="goal">${t('target')} ${fmt(target)}</div>
      ${feats ? `<div class="feats">${feats}</div>` : ''}`);
    this.stamps.appendChild(b);
    later(() => b.remove(), 2450);
  }

  tutorial(msg, pos = null) {
    const e = $('tutorial');
    if (!msg) { e.classList.add('hidden'); this.clearFinger(); return; }
    e.classList.remove('hidden');
    e.textContent = msg;
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    if (pos && pos.top != null) e.style.top = `${pos.top}px`;
  }

  finger(x, y) {
    this.clearFinger();
    const f = el('div', 'finger');
    f.style.left = `${x}px`; f.style.top = `${y}px`;
    f.id = 'finger';
    this.stamps.appendChild(f);
  }
  moveFinger(x, y) { const f = $('finger'); if (f) { f.style.left = `${x}px`; f.style.top = `${y}px`; } }
  clearFinger() { const f = $('finger'); if (f) f.remove(); }

  // ------------------------------------------------------------------ screens
  clearScreens() { this.screens.innerHTML = ''; }

  screen(cls = 'dim') {
    this.clearScreens();
    const s = el('div', `screen ${cls}`);
    this.screens.appendChild(s);
    return s;
  }

  button(label, cls, onClick) {
    const b = el('button', `btn ${cls || ''}`, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); this.onButton?.(); onClick(); });
    return b;
  }

  title({ best, canContinue, dailyBest, needsTap, onPlay, onContinue, onDaily, onHow, onBook, onSettings, onTap }) {
    const s = this.screen('clear-bg');
    const wrap = el('div', 'title-wrap');
    wrap.innerHTML = `
      <div class="logo">
        <div class="kanji">立直川</div>
        <div class="latin">RIICHI RIVER</div>
        <div class="tag">${t('tagline')}</div>
      </div>`;
    const menu = el('div', 'title-menu');
    if (needsTap) {
      const tap = el('div', 'tap-start', t('tapToStart'));
      menu.appendChild(tap);
      s.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(); }, { once: true });
    } else {
      if (canContinue) menu.appendChild(this.button(t('continueRun'), 'play', onContinue));
      menu.appendChild(this.button(t('play'), canContinue ? 'secondary' : 'play', onPlay));
      menu.appendChild(this.button(`${t('daily')}${dailyBest ? ` · ${fmt(dailyBest)}` : ''}`, 'secondary', onDaily));
      const foot = el('div', 'title-foot');
      for (const [label, fn] of [[t('howTo'), onHow], [t('yakuBook'), onBook], [t('settings'), onSettings]]) {
        const p = el('button', 'pill', label);
        p.addEventListener('click', (e) => { e.stopPropagation(); this.onButton?.(); fn(); });
        foot.appendChild(p);
      }
      menu.appendChild(foot);
      if (best && best.total) menu.appendChild(el('div', 'best-line', `${t('best')}: ${fmt(best.total)} · ${t('riversCleared')} ${best.stations}`));
    }
    wrap.appendChild(menu);
    s.appendChild(wrap);
  }

  pause({ onResume, onSettings, onQuit }) {
    const s = this.screen();
    const p = el('div', 'panel', `<h2>${t('paused')}</h2>`);
    p.appendChild(this.button(t('resume'), '', onResume));
    p.appendChild(this.button(t('settings'), 'secondary', onSettings));
    p.appendChild(this.button(t('quit'), 'ghost', onQuit));
    s.appendChild(p);
  }

  settings(settings, { onChange, onBack }) {
    const s = this.screen();
    const p = el('div', 'panel', `<h2>${t('settings')}</h2>`);
    const slider = (key, label) => {
      const r = el('div', 'set-row', `<span>${label}</span>`);
      const inp = el('input');
      inp.type = 'range'; inp.min = 0; inp.max = 1; inp.step = 0.05; inp.value = settings[key];
      inp.addEventListener('input', () => { settings[key] = Number(inp.value); onChange(key); });
      r.appendChild(inp);
      p.appendChild(r);
    };
    const toggle = (key, label) => {
      const r = el('div', 'set-row', `<span>${label}</span>`);
      const b = el('button', `toggle${settings[key] ? ' on' : ''}`);
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => { settings[key] = !settings[key]; b.classList.toggle('on', settings[key]); onChange(key); });
      r.appendChild(b);
      p.appendChild(r);
    };
    slider('music', t('music'));
    slider('sfx', t('sfx'));
    toggle('hints', t('hints'));
    toggle('index', t('index'));
    toggle('shake', t('shake'));
    toggle('reducedMotion', t('reducedMotion'));
    const lr = el('div', 'set-row', `<span>${t('language')}</span>`);
    const lb = el('div', 'lang-btns');
    for (const [code, name] of Object.entries(LANG_NAMES)) {
      const b = el('button', settings.lang === code ? 'on' : '', name);
      b.addEventListener('click', () => { settings.lang = code; onChange('lang'); });
      lb.appendChild(b);
    }
    lr.appendChild(lb);
    p.appendChild(lr);
    p.appendChild(this.button(t('back'), '', onBack));
    s.appendChild(p);
  }

  howTo({ onBack }) {
    const s = this.screen();
    const p = el('div', 'panel', `<h2>${t('howTo')}</h2>`);
    const icons = ['捕', '面', '和', '捨', '立', '川'];
    tr().howToBody.forEach(([h, b], i) => {
      p.appendChild(el('div', 'howto-row', `<div class="ic">${icons[i]}</div><div class="tx"><b>${h}</b><span>${b}</span></div>`));
    });
    p.appendChild(this.button(t('back'), '', onBack));
    s.appendChild(p);
  }

  book(seen, { onBack }) {
    const s = this.screen();
    const ids = Object.keys(YAKU);
    const found = ids.filter((id) => seen[id]).length;
    const p = el('div', 'panel', `<h2>${t('yakuBook')}</h2><div class="sub">${t('bookSub', found, ids.length)}</div>`);
    const g = el('div', 'book-grid');
    for (const id of ids) {
      const has = !!seen[id];
      const han = YAKU[id].yakuman ? '★' : `${YAKU[id].han}${t('han')}`;
      g.appendChild(el('div', `book-item${has ? '' : ' locked'}`, `<span class="hn">${han}</span><b>${has ? yakuTitle(id) : '？？？'}</b><span>${has ? yakuGloss(id) : t('bookLocked')}</span>`));
    }
    p.appendChild(g);
    p.appendChild(this.button(t('back'), '', onBack));
    s.appendChild(p);
  }

  // Win tally. Resolves when finished (tap to fast-forward).
  scoring({ result, hand, uraIndicators, audio, onDone }) {
    const s = this.screen('dim');
    s.style.alignItems = 'flex-end';
    s.style.paddingBottom = '22vh';
    const p = el('div', 'panel score-panel');
    p.innerHTML = `<h2>${t('tsumo')}!</h2>`;
    const handRow = el('div', 'score-hand');
    hand.melds.forEach((m) => {
      for (const tl of m.tiles) { const i = el('img'); i.src = this.face(tl.kind, tl.red); handRow.appendChild(i); }
      handRow.appendChild(el('span', 'gap'));
    });
    for (const tl of result.pair) { const i = el('img'); i.src = this.face(tl.kind, tl.red); handRow.appendChild(i); }
    p.appendChild(handRow);
    if (uraIndicators && uraIndicators.length) {
      const ur = el('div', 'ura-row', `<span>${t('ura')}</span>`);
      for (const k of uraIndicators) { const i = el('img'); i.src = this.face(k); ur.appendChild(i); }
      p.appendChild(ur);
    }
    const list = el('div', 'yaku-list');
    p.appendChild(list);
    const total = el('div', 'score-total', `<span class="fh"></span><span class="pts">0</span>`);
    p.appendChild(total);
    const hint = el('div', 'tap-hint', '▼');
    p.appendChild(hint);
    s.appendChild(p);

    let i = 0;
    let finished = false;
    let fast = false;
    const rows = result.yaku.slice();
    let hanSoFar = 0;
    const step = () => {
      if (i < rows.length) {
        const y = rows[i++];
        hanSoFar += y.han;
        const row = el('div', `yaku-row${y.dora ? ' dora' : ''}`,
          `<span><span class="nm">${yakuTitle(y.id)}</span><span class="gl">${y.yakuman ? '' : yakuGloss(y.id)}</span></span><span class="hn">${y.yakuman ? t('limits').yakuman || 'Yakuman' : `${y.han} ${t('han')}`}</span>`);
        list.appendChild(row);
        audio.play('tally', { rate: Math.pow(2, Math.min(i, 12) / 12), vol: 0.8 });
        this.timer = later(step, fast ? 40 : 260);
      } else {
        // fu x han, then points count-up
        total.querySelector('.fh').textContent = result.yakuman ? tr().limits[result.limit] : `${result.fu}${t('fu')} · ${result.han}${t('han')}`;
        const ptsEl = total.querySelector('.pts');
        const start = nowMs();
        const dur = fast ? 150 : 700;
        audio.play('count', { vol: 0.8 });
        const tick = () => {
          const k = Math.min(1, (nowMs() - start) / dur);
          const e = 1 - Math.pow(1 - k, 3);
          ptsEl.textContent = fmt(result.points * e);
          if (k < 1) nextFrame(tick);
          else {
            if (result.limit) {
              const ls = el('div', 'limit-stamp', tr().limits[result.limit]);
              p.appendChild(ls);
              audio.play(result.yakuman || ['baiman', 'sanbaiman', 'kazoe'].includes(result.limit) ? 'limitBig' : 'limit', { vol: 1 });
            }
            finished = true;
            hint.textContent = '▼';
          }
        };
        nextFrame(tick);
      }
    };
    this.timer = later(step, 250);
    s.addEventListener('pointerdown', () => {
      if (finished) { cancel(this.timer); this.clearScreens(); onDone(); }
      else fast = true;
    });
  }

  stationClear({ score, target, tilesLeft, coins, riverCoins, limitCoins, onNext }) {
    const s = this.screen();
    const p = el('div', 'panel', `<h2>${t('stationClear')}</h2>`);
    const g = el('div', 'stat-grid');
    g.appendChild(el('div', 'stat', `<div class="v">${fmt(score)}</div><div class="l">${t('target')} ${fmt(target)}</div>`));
    g.appendChild(el('div', 'stat', `<div class="v">${tilesLeft}</div><div class="l">${t('tilesBonus', tilesLeft)}</div>`));
    p.appendChild(g);
    p.appendChild(el('div', 'coins-line', `<span class="coin"></span> ${t('coinsEarned', coins)}`));
    p.appendChild(this.button(t('nextRiver'), '', onNext));
    s.appendChild(p);
  }

  stationFail({ score, target, lives, shield, over, onRetry, onEnd }) {
    const s = this.screen();
    const p = el('div', 'panel', `<h2>${t('stationFail')}</h2><div class="sub">${fmt(score)} / ${fmt(target)}<br>${shield ? t('shieldUsed') : t('livesLeft', lives)}</div>`);
    if (over) p.appendChild(this.button(t('runOver'), '', onEnd));
    else p.appendChild(this.button(t('retry'), '', onRetry));
    s.appendChild(p);
  }

  shrine({ run, offers, onTake, onReroll, onLeave, onRelease, rerollCost }) {
    const s = this.screen();
    const p = el('div', 'panel', `<h2>${t('shrineTitle')}</h2><div class="sub">${t('shrineSub')}</div>`);
    p.appendChild(el('div', 'coins-line', `<span class="coin"></span> ${run.coins}`));
    const grid = el('div', 'charm-grid');
    offers.forEach((o, i) => {
      const c = CHARM_BY_ID[o.id];
      const [nm, ds] = tr().charms[o.id];
      const card = el('div', `charm-card${o.taken ? ' taken' : ''}`);
      card.style.animationDelay = `${i * 0.07}s`;
      card.innerHTML = `<div class="omamori" style="background:linear-gradient(170deg, ${charmColor(o.id)}, #1c1a2b 140%)">${c.icon}</div>
        <div class="nm">${nm}</div><div class="ds">${ds}</div>
        <div class="cost${o.cost === 0 ? ' free' : ''}">${o.cost === 0 ? t('free') : `<span class="coin"></span>${o.cost}`}</div>`;
      card.addEventListener('click', () => onTake(i));
      grid.appendChild(card);
    });
    p.appendChild(grid);
    if (run.charms.length) {
      p.appendChild(el('div', 'owned-lbl', `${t('owned')} (${run.charms.length}/${MAX_CHARMS}) · ${t('replace')}`));
      const row = el('div', 'owned-row');
      for (const id of run.charms) {
        const o = el('div', 'omamori clickable', CHARM_BY_ID[id].icon);
        o.style.background = `linear-gradient(170deg, ${charmColor(id)}, #1c1a2b 140%)`;
        o.title = tr().charms[id][0];
        o.addEventListener('click', () => onRelease(id));
        row.appendChild(o);
      }
      p.appendChild(row);
    }
    const br = el('div', 'btn-row');
    const rr = this.button(`${t('reroll')} · ${rerollCost}`, 'secondary', onReroll);
    if (run.coins < rerollCost) rr.disabled = true;
    br.appendChild(rr);
    br.appendChild(this.button(t('nextRiver'), '', onLeave));
    p.appendChild(br);
    s.appendChild(p);
  }

  results({ run, victory, record, onNew, onTitle, onEndless }) {
    const s = this.screen();
    const p = el('div', 'panel', `<h2>${victory ? t('victory') : t('runOver')}</h2>`);
    if (record) p.appendChild(el('div', 'record', t('newRecord')));
    const g = el('div', 'stat-grid');
    g.appendChild(el('div', 'stat', `<div class="v">${fmt(run.total)}</div><div class="l">${t('total')}</div>`));
    g.appendChild(el('div', 'stat', `<div class="v">${Math.min(run.stationIndex, 99)}</div><div class="l">${t('riversCleared')}</div>`));
    g.appendChild(el('div', 'stat', `<div class="v">${run.hands}</div><div class="l">${t('handsWon')}</div>`));
    const bh = run.best;
    g.appendChild(el('div', 'stat', `<div class="v">${bh ? fmt(bh.points) : '—'}</div><div class="l">${t('bestHand')}${bh && bh.limit ? ` · ${tr().limits[bh.limit]}` : ''}</div>`));
    p.appendChild(g);
    if (onEndless) p.appendChild(this.button(t('endless'), '', onEndless));
    p.appendChild(this.button(t('newRun'), onEndless ? 'secondary' : '', onNew));
    p.appendChild(this.button(t('back'), 'ghost', onTitle));
    s.appendChild(p);
  }
}

export function yakuTitle(id) {
  const lang = document.documentElement.dataset.lang;
  if (lang === 'en') return ROMAJI[id] || tr().yaku[id] || id;
  return tr().yaku[id] || id;
}
export function yakuGloss(id) {
  const lang = document.documentElement.dataset.lang;
  if (lang === 'en') return ROMAJI[id] ? tr().yaku[id] : '';
  return ROMAJI[id] || '';
}

const ROMAJI = {
  tsumo: 'Menzen Tsumo', riichi: 'Riichi', ippatsu: 'Ippatsu', haitei: 'Haitei', tanyao: 'Tanyao', pinfu: 'Pinfu',
  iipeikou: 'Iipeikou', yakuhai: 'Yakuhai', toitoi: 'Toitoi', sanshoku: 'Sanshoku', sanshokuDoukou: 'Sanshoku Doukou',
  ittsu: 'Ittsu', chanta: 'Chanta', junchan: 'Junchan', honroutou: 'Honroutou', shousangen: 'Shousangen',
  sankantsu: 'Sankantsu', ryanpeikou: 'Ryanpeikou', honitsu: 'Honitsu', chinitsu: 'Chinitsu', daisangen: 'Daisangen',
  tsuuiisou: 'Tsuuiisou', ryuuiisou: 'Ryuuiisou', chinroutou: 'Chinroutou', suukantsu: 'Suukantsu',
  shousuushii: 'Shousuushii', daisuushii: 'Daisuushii', dora: 'Dora', aka: 'Aka Dora', ura: 'Ura Dora',
};
