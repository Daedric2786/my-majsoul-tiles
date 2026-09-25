import { frames } from './autoplay.mjs';
export default async (page) => {
  await page.click('text=Set sail');
  await frames(page, 30);
  // put the hand in a known tenpai shape so hints and waits are visible
  await page.evaluate(() => {
    const g = window.__rr.game; const st = g.st;
    const mk = (k) => ({ id: 90000 + Math.floor(Math.random() * 1e6), kind: k, red: false });
    st.hand.melds = [{ type: 'chi', tiles: [mk(18), mk(19), mk(20)] }, { type: 'pon', tiles: [mk(13), mk(13), mk(13)] }, { type: 'chi', tiles: [mk(22), mk(23), mk(24)] }];
    st.hand.tray = [mk(10), mk(10), mk(15), mk(16)];
    g.recompute();
    // make sure some winning / useful tiles are floating in view
    const kinds = [14, 17, 10, 11, 21, 12];
    st.floats.forEach((f, i) => { if (f.tiles.length === 1 && i < kinds.length) f.tile.kind = f.tiles[0].kind = kinds[i]; });
    window.__rr.river().items.forEach((it) => { if (it.f.tile) window.__rr.river().factory.setHidden(it.group, false); });
  });
  await frames(page, 30);
};
