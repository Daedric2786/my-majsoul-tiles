import { autoplay, frames } from './autoplay.mjs';
export default async (page) => {
  await page.click('text=Set sail');
  await frames(page, 2);
  await page.evaluate(() => {
    const g = window.__rr.game; window.__log = [];
    const orig = g.tryCatch.bind(g);
    g.tryCatch = (id) => { const f = g.st.floats.find((x) => x.id === id); const r = orig(id); window.__log.push({ t: g.st.time.toFixed(1), kinds: f && f.tiles.map((t) => t.kind), ok: r.ok, action: r.action, reason: r.reason, riichi: !!g.st.riichi, waits: g.st.tenpaiWaits.slice(), left: g.tilesLeft() }); return r; };
    window.__trace = 1; window.__pd = 0; document.getElementById('gl').addEventListener('pointerdown', () => { window.__pd++; });
    const os_ = g.spawnTile.bind(g);
    g.spawnTile = () => { os_(); if (g.st.riichi) { const f = g.st.floats[g.st.floats.length - 1]; window.__log.push({ spawn: f.tiles.map((t) => t.kind), useful: [...g.st.useful.keys()], kindness: g.st.def.kindness }); } };
    const od = g.declareRiichi.bind(g);
    g.declareRiichi = () => { const r = od(); window.__log.push({ riichiDeclared: r, waits: g.st.tenpaiWaits.slice(), left: g.tilesLeft() }); return r; };
  });
  let clicks = 0;
  await autoplay(page, { maxFrames: Number(process.env.MAXF || 900), onState: async (s) => {
    if (s.click) {
      clicks++;
      const info = await page.evaluate((c) => { const g = window.__rr.game; if (!g.st.riichi) return null; const id = window.__rr.pick(c.x, c.y); const f = g.st.floats.find((x) => x.id === id); const el = document.elementFromPoint(c.x, c.y); return { el: el && (el.tagName + '#' + el.id + '.' + el.className), why: c.why, x: Math.round(c.x), y: Math.round(c.y), picked: f ? f.tiles.map((t) => t.kind) : null, paused: window.__rr.paused, pd: window.__pd, mode: window.__rr.mode, phase: g.phase, rackTop: window.__rr.hand().rackTopPx() }; }, s.click);
      if (info) console.log('RIICHI CLICK', JSON.stringify(info));
    }
    return s.phase !== 'play' && s.phase !== 'intro'; } });
  const log = await page.evaluate(() => window.__log);
  console.log('clicks', clicks, 'catch attempts', log.length);
  for (const l of log.slice(-40)) console.log(JSON.stringify(l));
};
