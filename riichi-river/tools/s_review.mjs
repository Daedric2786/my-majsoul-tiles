import { frames } from './autoplay.mjs';
// Regression checks for the review findings, driven through the real game object.
export default async (page) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const C = (...a) => console.log('CHECK', ...a);
  await page.click('text=Set sail'); await frames(page, 40);
  // #9 overlays hidden after a win: force tenpai (no riichi), then win
  await page.evaluate(() => {
    const g = window.__rr.game, st = g.st; const mk = (k) => ({ id: 800000 + Math.floor(Math.random() * 1e6), kind: k, red: false });
    st.hand.melds = [{ type: 'chi', tiles: [mk(18), mk(19), mk(20)] }, { type: 'chi', tiles: [mk(9), mk(10), mk(11)] }, { type: 'pon', tiles: [mk(13), mk(13), mk(13)] }];
    st.hand.tray = [mk(24), mk(24), mk(21), mk(22)];
    g.recompute();
  });
  await frames(page, 3);
  C('riichi button visible in tenpai', await page.evaluate(() => !document.getElementById('btn-riichi').classList.contains('hidden')));
  await page.evaluate(() => { const g = window.__rr.game; const f = g.addFloat({ id: 999999, kind: 23, red: false }, false, -3); g.tryCatch(f.id); });
  await frames(page, 5);
  C('phase after win', await page.evaluate(() => window.__rr.game.phase), 'riichi button hidden', await page.evaluate(() => document.getElementById('btn-riichi').classList.contains('hidden')));
  // #2 quitting at last life clears the saved run
  await frames(page, 40);
  await page.mouse.click(195, 500); await frames(page, 10); await page.mouse.click(195, 500); await frames(page, 10);
  await page.evaluate(() => { window.__rr.game.run.lives = 1; });
  await page.keyboard.press('Escape'); await frames(page, 2);
  const leave = await page.$('text=Leave the river');
  if (leave) { await leave.click({ force: true }); await frames(page, 5); }
  C('saved run after quitting at 1 life', await page.evaluate(() => JSON.parse(localStorage.getItem('riichi-river:v1')).run));
  // #10 corrupt save does not block boot
  await page.evaluate(() => localStorage.setItem('riichi-river:v1', JSON.stringify({ daily: null, yakuSeen: null, settings: 5, run: { stationIndex: 'x' } })));
  await page.reload(); await page.waitForTimeout(2500);
  C('boot with corrupt save -> title buttons', await page.evaluate(() => [...document.querySelectorAll('#screens .btn')].length));
  C('errors', errors.length, errors.slice(0, 2).join(' | '));
};
