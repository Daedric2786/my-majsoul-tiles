// WebAudio manager: SFX sprite + two synchronised music stems (calm / riichi).
// Music keeps playing across restarts so players don't hear the intro every retry.

const BASE = './audio/';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.sfx = new Map();
    this.musicBuffers = {};
    this.vol = { music: 0.7, sfx: 0.85 };
    this.state = 'title';
    this.ready = false;
    this.musicStarted = false;
    this.lastPlay = new Map();
    this.format = 'ogg';
    this.log = null; // capture mode: array of {t, type, ...}
    this.clock = () => 0;
  }

  rec(entry) { if (this.log) this.log.push({ t: +this.clock().toFixed(4), ...entry }); }

  // Create the context early (suspended until a gesture) so assets decode during boot.
  init() { this.unlock(true); }

  // Must be called from a user gesture to actually start sound.
  unlock(fromBoot = false) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -10; this.comp.knee.value = 8; this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
      this.master.connect(this.comp).connect(c.destination);
      this.sfxBus = c.createGain();
      this.musicBus = c.createGain();
      this.musicFilter = c.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 20000;
      this.musicFilter.Q.value = 0.5;
      this.duckGain = c.createGain();
      this.musicBus.connect(this.musicFilter).connect(this.duckGain).connect(this.master);
      this.sfxBus.connect(this.master);
      this.applyVolumes();
      const probe = document.createElement('audio');
      this.format = probe.canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'mp3';
      this.load();
    }
    if (!fromBoot && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  async fetchDecode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio ${url} ${res.status}`);
    const buf = await res.arrayBuffer();
    return await new Promise((resolve, reject) => this.ctx.decodeAudioData(buf, resolve, reject));
  }

  async loadWithFallback(name) {
    try { return await this.fetchDecode(`${BASE}${name}.${this.format}`); }
    catch (e) {
      if (this.format !== 'mp3') { this.format = 'mp3'; return await this.fetchDecode(`${BASE}${name}.mp3`); }
      throw e;
    }
  }

  async load() {
    try {
      const meta = await (await fetch(`${BASE}sfx.json`)).json();
      const buf = await this.loadWithFallback('sfx');
      for (const [name, s] of Object.entries(meta.sprites)) this.sfx.set(name, { buf, start: s[0], dur: s[1] });
      this.ready = true;
      this.onReady?.();
      // river ambience bed
      const amb = await this.loadWithFallback('ambience');
      const src = this.ctx.createBufferSource();
      src.buffer = amb;
      src.loop = true;
      src.loopStart = meta.ambience.loopStart;
      src.loopEnd = meta.ambience.loopEnd;
      this.ambGain = this.ctx.createGain();
      this.ambGain.gain.value = 0;
      src.connect(this.ambGain).connect(this.sfxBus);
      src.start();
      this.ambGain.gain.setTargetAtTime(0.55, this.ctx.currentTime, 1.5);
    } catch (e) {
      console.warn('SFX unavailable', e);
    }
    try {
      const mmeta = await (await fetch(`${BASE}music.json`)).json();
      this.musicMeta = mmeta;
      for (const stem of mmeta.stems) this.musicBuffers[stem] = await this.loadWithFallback(stem);
      this.startMusic();
    } catch (e) {
      console.warn('Music unavailable', e);
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.vol.music * this.vol.music * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * this.vol.sfx, t, 0.02);
  }

  setVolumes(music, sfx) {
    this.vol.music = music; this.vol.sfx = sfx;
    this.applyVolumes();
  }

  play(name, { vol = 1, rate = 1, pan = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.ready || this.muted) return;
    const s = this.sfx.get(name);
    if (!s) return;
    // avoid machine-gun stacking of the same sound
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(name) || 0;
    if (now + delay - last < 0.025) return;
    this.lastPlay.set(name, now + delay);
    this.rec({ type: 'sfx', name, vol, rate, pan, delay });
    const src = this.ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    let node = src.connect(g);
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(this.sfxBus);
    src.start(now + delay, s.start, s.dur);
  }

  startMusic() {
    if (this.musicStarted || !this.ctx) return;
    const m = this.musicMeta;
    if (!m) return;
    this.musicStarted = true;
    this.rec({ type: 'musicStart' });
    const c = this.ctx;
    const when = c.currentTime + 0.1;
    this.stemGains = {};
    for (const stem of m.stems) {
      const buf = this.musicBuffers[stem];
      if (!buf) continue;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = m.loopStart;
      src.loopEnd = m.loopEnd;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.musicBus);
      // start at the beginning of the loop region so the pad-in never plays twice
      src.start(when, m.loopStart);
      this.stemGains[stem] = g;
    }
    this.setMusicState(this.state, 2.5);
  }

  // title: calm stem, filtered   play: calm stem   riichi: tension stem   shrine: calm, soft   fail: filtered low
  setMusicState(state, fade = 1.2) {
    this.state = state;
    this.rec({ type: 'music', state, fade });
    if (!this.ctx || !this.stemGains) return;
    const t = this.ctx.currentTime;
    const mix = {
      title: { calm: 0.85, tense: 0, lp: 1400 },
      play: { calm: 1, tense: 0, lp: 20000 },
      riichi: { calm: 0.2, tense: 1, lp: 20000 },
      shrine: { calm: 0.7, tense: 0, lp: 2600 },
      score: { calm: 0.55, tense: 0, lp: 5000 },
      fail: { calm: 0.5, tense: 0, lp: 700 },
      paused: { calm: 0.4, tense: 0, lp: 900 },
    }[state] || { calm: 1, tense: 0, lp: 20000 };
    const set = (name, v) => { const g = this.stemGains[name]; if (g) g.gain.setTargetAtTime(v, t, fade / 3); };
    set('music_calm', mix.calm);
    set('music_tense', mix.tense);
    this.musicFilter.frequency.setTargetAtTime(mix.lp, t, fade / 3);
  }

  duck(amount = 0.35, hold = 0.6, release = 0.8) {
    if (!this.ctx) return;
    this.rec({ type: 'duck', amount, hold, release });
    const g = this.duckGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(amount, t, 0.03);
    g.setTargetAtTime(1, t + hold, release / 3);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05); }
}

export const audio = new AudioManager();
