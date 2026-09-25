export default async (page) => {
  await page.click('text=Set sail');
  await page.waitForTimeout(6000);
  const info = await page.evaluate(async () => {
    const audio = window.__rr.audio;
    return { state: audio.ctx && audio.ctx.state, ready: audio.ready, sfx: audio.sfx.size, music: Object.keys(audio.musicBuffers), started: audio.musicStarted, fmt: audio.format,
      dur: Object.fromEntries(Object.entries(audio.musicBuffers).map(([k, b]) => [k, b.duration.toFixed(3)])) };
  });
  console.log(JSON.stringify(info));
};
