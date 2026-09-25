// Drives the real UI (mouse clicks at on-screen positions) with a simple policy.
// Usage from a scenario: await autoplay(page, { until: (state) => bool, maxFrames, shots: {...} })
export const frames = (page, n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);

export async function step(page) {
  return page.evaluate(() => {
    const rr = window.__rr; const g = rr.game;
    const out = { phase: g && g.phase, screen: document.querySelector('#screens .screen') ? document.querySelector('#screens .screen').innerText.slice(0, 80) : '' };
    if (!g || !g.st || g.phase !== 'play') return out;
    const st = g.st, h = st.hand;
    // riichi button visible?
    const rb = document.getElementById('btn-riichi');
    if (!rb.classList.contains('hidden') && g.tilesLeft() > 8) { const r = rb.getBoundingClientRect(); out.click = { x: r.x + r.width / 2, y: r.y + r.height / 2, why: 'riichi' }; return out; }
    const vis = st.floats.filter((f) => f.z > -9.5 && f.z < 1.4 && !f.hidden);
    const useful = vis.filter((f) => f.lantern || f.tiles.some((t) => st.useful.has(t.kind)));
    let target = useful.sort((a, b) => b.z - a.z)[0];
    if (!target && !st.riichi) {
      const connects = (k) => h.tray.some((o) => o.kind === k || (k < 27 && Math.floor(o.kind / 9) === Math.floor(k / 9) && Math.abs(o.kind - k) <= 2));
      const cand = vis.filter((f) => f.tiles.length === 1 && f.z > -3);
      if (h.tray.length < 2) target = cand.sort((a, b) => b.z - a.z)[0];
      else if (h.tray.length < h.cap) target = cand.filter((f) => connects(f.tile.kind)).sort((a, b) => b.z - a.z)[0];
      else if (h.tray.length >= h.cap) {
        // release the loneliest tray tile (no neighbour within 2 in suit, no pair)
        const lonely = h.tray.find((t) => !h.tray.some((o) => o !== t && (o.kind === t.kind || (t.kind < 27 && Math.floor(o.kind / 9) === Math.floor(t.kind / 9) && Math.abs(o.kind - t.kind) <= 2))));
        if (lonely) { const r = rr.handRect(lonely.id); if (r) { out.click = { x: r.x + r.w / 2, y: r.y + r.h / 2, why: 'discard' }; return out; } }
      }
    }
    if (target) { const p = rr.screenOfFloat(target); out.click = { x: p.x, y: p.y, why: 'catch' }; }
    return out;
  });
}

export async function autoplay(page, { maxFrames = 3000, every = 2, onState } = {}) {
  let f = 0;
  while (f < maxFrames) {
    const s = await step(page);
    if (onState) { const stop = await onState(s, f); if (stop) return s; }
    if (s.click) await page.mouse.click(s.click.x, s.click.y);
    await frames(page, every);
    f += every;
  }
}
