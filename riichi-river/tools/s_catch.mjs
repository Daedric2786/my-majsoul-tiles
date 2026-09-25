const frames = (page, n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
export default async (page) => {
  await page.click('text=Set sail');
  await frames(page, 40);
  for (let i = 0; i < Number(process.env.ROUNDS || 12); i++) {
    // click on the nearest useful tile via the real input path (mouse click at its screen position)
    const pt = await page.evaluate(() => {
      const g = window.__rr.game; if (!g.st) return null;
      const fl = g.st.floats.filter((f) => f.tile && f.z > -9 && f.z < 1.2);
      fl.sort((a, b) => (g.st.useful.has(b.tile.kind) - g.st.useful.has(a.tile.kind)) || (b.z - a.z));
      const f = fl[0]; if (!f) return null;
      return window.__rr.screenOfFloat(f);
    });
    if (pt) await page.mouse.click(pt.x, pt.y);
    await frames(page, 8);
  }
  await frames(page, Number(process.env.TAIL || 10));
};
