import { autoplay, frames } from './autoplay.mjs';
export default async (page) => {
  await page.click('text=Set sail');
  let shot = 0;
  const seen = new Set();
  await autoplay(page, {
    maxFrames: Number(process.env.MAXF || 1600),
    onState: async (s, f) => {
      const key = s.phase + '|' + (s.screen || '').slice(0, 12);
      if (!seen.has(key)) {
        seen.add(key);
        console.log('frame', f, 'phase', s.phase, 'screen:', JSON.stringify(s.screen.slice(0, 60)));
        await page.screenshot({ path: `tools/shots/flow_${String(shot++).padStart(2, '0')}_${s.phase}.png` });
      }
      // advance UI screens
      if (s.phase === 'scoring' && s.screen) { await frames(page, 30); await page.mouse.click(200, 400); await frames(page, 4); await page.mouse.click(200, 400); }
      if (s.phase === 'clear' && s.screen) {
        const btn = await page.$('#screens .btn');
        if (btn) { await btn.click({ force: true }); await frames(page, 6); }
        const card = await page.$('.charm-card');
        if (card) { await frames(page, 10); await page.screenshot({ path: `tools/shots/flow_${String(shot++).padStart(2, '0')}_shrine.png` }); await card.click({ force: true }); await frames(page, 4); const go = await page.$$('#screens .btn-row .btn'); if (go[1]) await go[1].click({ force: true }); await frames(page, 6); }
      }
      if (s.phase === 'fail' && s.screen) { await frames(page, 10); const btn = await page.$('#screens .btn'); if (btn) await btn.click({ force: true }); }
      return false;
    },
  });
};
