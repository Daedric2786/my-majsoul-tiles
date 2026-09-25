export default async (page) => {
  await page.click('text=Set sail');
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const g = window.__rr.game;
    return { phase: g.phase, spawned: g.st.spawned, floats: g.st.floats.slice(0,5).map(f => [f.x.toFixed(2), f.z.toFixed(2), f.tile && f.tile.kind]), cam: window.__rr.world().camera.position.toArray().map(v=>v.toFixed(2)), fit: window.__rr.world().camFit };
  });
  console.log(JSON.stringify(info));
};
