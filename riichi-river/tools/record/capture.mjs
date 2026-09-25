// Deterministic A/V capture of a real play session.
// node tools/record/capture.mjs <outdir> <width> <height> [maxSeconds]
// Requires `npx vite preview --port 4173` serving the production build.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { step } from '../autoplay.mjs';

const [outDir = 'tools/record/cap', W = '960', H = '540', maxSec = '80'] = process.argv.slice(2);
const FPS = 30;
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(`${outDir}/frames`, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const seed = process.env.SEED || '101';
await page.goto(`http://localhost:4173/?manual=1&rec=1&dt=${1 / FPS}&seed=${seed}&dpr=${process.env.DPR || 1}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rr && window.__rr.world && document.getElementById('boot').classList.contains('gone'), null, { timeout: 30000 });

let n = 0;
const shot = async () => { await page.screenshot({ path: `${outDir}/frames/${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 }); };
const adv = async (k = 1) => { await page.evaluate((k) => window.__rr.advance(k), k); };

// title
for (let i = 0; i < FPS * 2.5; i++) { await adv(); await shot(); }
await page.click('text=Set sail');
let scoringSince = -1, wins = 0, doneAt = -1, clearSeen = false;
const total = FPS * Number(maxSec);
for (let i = 0; i < total; i++) {
  if (i % 3 === 0) {
    const s = await step(page);
    if (s.phase === 'scoring') {
      if (scoringSince < 0) { scoringSince = i; wins++; }
      if (i - scoringSince > FPS * 4.2) { await page.mouse.click(+W / 2, +H * 0.6); scoringSince = -1e9; }
    } else if (scoringSince < -1) scoringSince = -1;
    if (s.phase === 'clear' && !clearSeen) { clearSeen = true; doneAt = i + FPS * 3; }
    if (s.click && s.phase === 'play') await page.mouse.click(s.click.x, s.click.y);
    if (wins >= 1 && s.phase === 'play' && doneAt < 0 && scoringSince === -1) doneAt = i + FPS * 4;
  }
  await adv();
  await shot();
  if (doneAt > 0 && i >= doneAt) break;
  if (i % 150 === 0) console.log('frame', i, 'wins', wins);
}
const log = await page.evaluate(() => ({ log: window.__rr.audio.log, volumes: window.__rr.audio.vol }));
fs.writeFileSync(`${outDir}/events.json`, JSON.stringify(log));
fs.writeFileSync(`${outDir}/meta.json`, JSON.stringify({ frames: n, fps: FPS, seconds: n / FPS, wins, errors }));
console.log('captured', n, 'frames', (n / FPS).toFixed(1), 's; wins', wins, 'errors', errors.length);
await browser.close();
