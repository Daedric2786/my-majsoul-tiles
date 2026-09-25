import { frames } from './autoplay.mjs';
export default async (page) => {
  const snap = async (label) => {
    const r = await page.evaluate(() => { const w = window.__rr.world(); const i = w.renderer.info; return { faces: window.__rr.river().factory.faceGeos.size, geos: i.memory.geometries, tex: i.memory.textures, prog: i.programs.length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, children: w.scene.children.length, dom: document.getElementsByTagName('*').length }; });
    console.log('LEAK', label, JSON.stringify(r));
  };
  await snap('boot');
  for (let i = 0; i < 5; i++) {
    await page.click('text=Set sail', { force: true });
    await frames(page, 60);
    // catch a few things and quit to title
    await page.evaluate(() => { const g = window.__rr.game; for (const f of g.st.floats.slice(0, 4)) g.tryCatch(f.id); });
    await frames(page, 20);
    await page.keyboard.press('Escape'); await frames(page, 2);
    await page.click('text=Leave the river', { force: true }); await frames(page, 20);
    await snap('cycle' + i);
  }
};
