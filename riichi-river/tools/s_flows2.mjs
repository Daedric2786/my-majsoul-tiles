import { frames } from './autoplay.mjs';
const log = (...a) => console.log('CHECK', ...a);
export default async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.click('text=Set sail');
  await frames(page, 30);
  // pause via keyboard
  await page.keyboard.press('Escape');
  await frames(page, 3);
  log('pause screen', await page.evaluate(() => !!document.querySelector('#screens .panel h2') && document.querySelector('#screens .panel h2').textContent), 'paused', await page.evaluate(() => window.__rr.paused));
  const t0 = await page.evaluate(() => window.__rr.game.st.time);
  await frames(page, 10);
  const t1 = await page.evaluate(() => window.__rr.game.st.time);
  log('time frozen while paused', t0 === t1);
  await page.click('text=Resume');
  await frames(page, 5);
  log('resumed', !(await page.evaluate(() => window.__rr.paused)));
  // force the river to run dry three times -> run over
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const g = window.__rr.game; g.st.spawned = g.st.wall.length; g.st.floats = []; });
    await frames(page, 25);
    const txt = await page.evaluate(() => document.querySelector('#screens .panel') && document.querySelector('#screens .panel').innerText.replace(/\n/g, ' | '));
    log('fail panel', i, txt);
    await page.click('#screens .btn', { force: true });
    await frames(page, 10);
  }
  const res = await page.evaluate(() => document.querySelector('#screens .panel') && document.querySelector('#screens .panel').innerText.replace(/\n/g, ' | '));
  log('results', res);
  await page.click('text=New journey', { force: true });
  await frames(page, 10);
  log('new run lives', await page.evaluate(() => window.__rr.game.run.lives), 'station', await page.evaluate(() => window.__rr.game.run.stationIndex));
  // settings: language -> ko, hints off
  await page.keyboard.press('Escape'); await frames(page, 3);
  await page.click('#screens .btn.secondary', { force: true }); await frames(page, 3);
  await page.click('text=한국어', { force: true }); await frames(page, 3);
  const toggles = await page.$$('.toggle');
  await toggles[0].click({ force: true }); // hints off
  await frames(page, 2);
  log('settings title after ko', await page.evaluate(() => document.querySelector('#screens h2').textContent));
  await page.click('#screens .btn', { force: true }); await frames(page, 3); // back -> pause
  await page.click('#screens .btn', { force: true }); await frames(page, 3); // resume
  log('hud name ko', await page.evaluate(() => document.getElementById('hud-name').textContent));
  // resize to landscape and back
  await page.setViewportSize({ width: 1280, height: 720 }); await frames(page, 5);
  await page.setViewportSize({ width: 390, height: 844 }); await frames(page, 5);
  log('fit ok', await page.evaluate(() => JSON.stringify(window.__rr.world().camFit && Math.round(window.__rr.world().camFit.fov))));
  // reload -> settings persisted
  await page.reload(); await page.waitForTimeout(2500);
  log('after reload lang', await page.evaluate(() => document.documentElement.lang), 'continue button', await page.evaluate(() => [...document.querySelectorAll('#screens .btn')].map((b) => b.textContent).join(' / ')));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('riichi-river:v1')));
  log('saved settings', JSON.stringify(saved.settings), 'runs', saved.runs, 'best', JSON.stringify(saved.best));
  log('errors', errors.length, errors.slice(0, 3).join(' || '));
};
