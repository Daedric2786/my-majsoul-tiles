// Portal SDK adapter. The game only talks to this object, so the same build runs
// standalone, on Poki (window.PokiSDK) or on CrazyGames (window.CrazyGames.SDK).
// SDK scripts are NOT bundled: the portal wrapper (or a portal-specific index.html)
// loads them. Without an SDK every call is a safe no-op.

const noop = () => {};

function makeAdapter() {
  const poki = () => window.PokiSDK;
  const cg = () => window.CrazyGames && window.CrazyGames.SDK;
  let inGameplay = false;
  let lastBreak = 0;

  return {
    name: 'standalone',
    async init() {
      try {
        if (poki()) { await poki().init(); this.name = 'poki'; }
        else if (cg()) { await cg().init(); this.name = 'crazygames'; }
      } catch (e) {
        console.warn('Platform SDK init failed; continuing standalone', e);
        this.name = 'standalone';
      }
    },
    loadingStart() { try { if (this.name === 'crazygames') cg().game.loadingStart(); } catch (e) { noop(); } },
    loadingStop() {
      try {
        if (this.name === 'poki') poki().gameLoadingFinished();
        if (this.name === 'crazygames') cg().game.loadingStop();
      } catch (e) { noop(); }
    },
    gameplayStart() {
      if (inGameplay) return;
      inGameplay = true;
      try {
        if (this.name === 'poki') poki().gameplayStart();
        if (this.name === 'crazygames') cg().game.gameplayStart();
      } catch (e) { noop(); }
    },
    gameplayStop() {
      if (!inGameplay) return;
      inGameplay = false;
      try {
        if (this.name === 'poki') poki().gameplayStop();
        if (this.name === 'crazygames') cg().game.gameplayStop();
      } catch (e) { noop(); }
    },
    // Natural break (between rivers / before a retry). Always resolves; audio is muted meanwhile.
    commercialBreak(audio) {
      const now = Date.now();
      if (this.name === 'standalone' || now - lastBreak < 60000) return Promise.resolve();
      lastBreak = now;
      this.gameplayStop();
      const mute = () => audio && audio.setMuted(true);
      const unmute = () => audio && audio.setMuted(false);
      return new Promise((resolve) => {
        const done = () => { unmute(); resolve(); };
        try {
          if (this.name === 'poki') {
            mute();
            poki().commercialBreak(() => mute()).then(done, done);
          } else if (this.name === 'crazygames') {
            cg().ad.requestAd('midgame', { adStarted: mute, adFinished: done, adError: done });
          } else done();
        } catch (e) { done(); }
        setTimeout(done, 45000); // never block the game forever
      });
    },
  };
}

export const platform = makeAdapter();
