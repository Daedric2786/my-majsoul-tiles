import { frames } from './autoplay.mjs';
export default async (page) => { await page.click('text=Set sail'); await frames(page, Number(process.env.FR || 110)); };
