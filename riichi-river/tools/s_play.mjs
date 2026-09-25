export default async (page) => {
  await page.click('text=Set sail');
  const frames = Number(process.env.FRAMES || 120);
  await page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), frames);
};
