import { frames } from './autoplay.mjs';
export default async (page) => {
  await page.click('text=Set sail'); await frames(page, 80);
  console.log('CHECK', JSON.stringify(await page.evaluate(() => ({ mode: window.__rr.mode, sfx: window.__rr.audio.sfx.size, music: Object.keys(window.__rr.audio.musicBuffers).length, font: document.fonts.check('800 20px "RR Mincho"') }))));
};
