import { frames } from './autoplay.mjs';
export default async (page) => {
  await page.click('text=Set sail');
  await frames(page, 60);
  const r = await page.evaluate(() => {
    const w = window.__rr.world(); const info = w.renderer.info;
    return { calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, programs: info.programs.length, floats: window.__rr.game.st.floats.length };
  });
  console.log('PERF', JSON.stringify(r));
};
