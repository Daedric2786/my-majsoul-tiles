// Screenshot helper: node tools/shot.mjs <name> <w> <h> [script.js]
import { chromium } from 'playwright';
const [name='shot', w='390', h='844', extra] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(process.env.URL || 'http://localhost:5173/?dt=0.05', { waitUntil: 'load' });
await page.waitForTimeout(2500);
if (extra) { const mod = await import(new URL(extra, 'file://' + process.cwd() + '/').href); await mod.default(page); }
await page.screenshot({ path: `tools/shots/${name}.png` });
console.log(logs.filter((l) => !l.includes('PD')).slice(-15).join('\n')); console.log(logs.filter((l) => l.includes('PD')).slice(-6).join('\n'));
await browser.close();
