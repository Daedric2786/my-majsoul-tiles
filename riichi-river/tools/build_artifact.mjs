// Packs the Vite build into a single self-contained page (JS, CSS and fonts inlined)
// plus relative audio files, for hosting as a claude.ai Artifact or any static host
// with a strict CSP. Usage: npm run build && node tools/build_artifact.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'dist-artifact');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'audio'), { recursive: true });

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const cssFile = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
const jsFile = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
let css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
css = css.replace(/url\(\.\.\/fonts\/([^)]+\.woff2)\)/g, (_, f) => {
  const b64 = fs.readFileSync(path.join(dist, 'fonts', f)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});
const js = fs.readFileSync(path.join(dist, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');

const title = html.match(/<title>[^<]*<\/title>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
const page = `${title}
<meta name="description" content="Catch mahjong tiles from a lantern-lit river, build hands and wait for the one tile that wins.">
<style>${css}</style>
${body.trim()}
<script type="module">${js}</script>
`;
fs.writeFileSync(path.join(out, 'index.html'), page);
for (const f of fs.readdirSync(path.join(dist, 'audio'))) fs.copyFileSync(path.join(dist, 'audio', f), path.join(out, 'audio', f));
const kb = (p) => Math.round(fs.statSync(p).size / 1024);
console.log('index.html', kb(path.join(out, 'index.html')), 'KB; audio files', fs.readdirSync(path.join(out, 'audio')).length);
