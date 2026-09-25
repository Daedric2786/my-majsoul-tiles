import { frames } from './autoplay.mjs';
export default async (page) => {
  await page.click('text=Set sail');
  await frames(page, 30);
  await page.evaluate(() => {
    const g = window.__rr.game; const st = g.st;
    const mk = (k, red = false) => ({ id: 90000 + Math.floor(Math.random() * 1e6), kind: k, red });
    st.hand.melds = [{ type: 'chi', tiles: [mk(0), mk(1), mk(2)] }, { type: 'pon', tiles: [mk(33), mk(33), mk(33)] }, { type: 'chi', tiles: [mk(3), mk(4, true), mk(5)] }, { type: 'pon', tiles: [mk(27), mk(27), mk(27)] }];
    st.hand.tray = [mk(31), mk(32), mk(8), mk(18), mk(22, true), mk(13, true)];
    g.recompute();
  });
  await frames(page, 20);
  await page.screenshot({ path: 'tools/shots/faces_rack.png', clip: { x: 0, y: 690, width: 390, height: 154 } });
};
