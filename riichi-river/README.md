# Riichi River

A browser game: mahjong tiles drift down a lantern-lit river. Tap them to catch them into a small tray; runs and triplets snap into sets on their own; four sets and a pair win the hand. Declare **Riichi** to lock your hand for more points — your winning tiles glow gold somewhere upstream, and you have to catch one before it floats past.

Eight rivers (plus an endless mode), each with its own tiles, current and hazards (gusts, a whirlpool, rapids, mist, koi, golden lanterns). Between rivers you choose omamori charms that change how you play.

## Run it

```bash
cd riichi-river
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (relative paths, host anywhere)
npm test           # rules / scoring unit tests
```

Single-file build for strict-CSP hosts (the claude.ai artifact uses this):

```bash
npm run build && node tools/build_artifact.mjs   # -> dist-artifact/index.html + audio/
```

## Controls

| | Desktop | Touch |
|---|---|---|
| Catch a tile | Click it in the river | Tap it |
| Release a tray tile | Click it in the tray | Tap it |
| Riichi | RIICHI button, Space or R | RIICHI button |
| Pause | Esc / P / pause button | pause button |

## Project layout

```
src/game/      rules.js (melds, waits, yaku, fu/han scoring) · game.js (river sim, run flow) · content.js (rivers, charms)
src/render/    world.js (renderer, camera fit, palettes) · water.js (river shader) · scenery.js · riverView.js · handView.js · faces.js (tile art) · fx.js
src/ui/        ui.js (HUD, stamps, screens)       src/i18n.js (en / ko / ja)
src/audio/     audio.js (WebAudio: SFX sprite, two synced music stems, ambience)
src/platform.js  Poki / CrazyGames SDK adapter (no-op standalone)
tools/audio/   music.py, sfx.py, synth.py — every sound is synthesized offline (numpy/scipy)
tools/sim.js   headless balance simulator (bots play whole rivers)
tools/record/  deterministic A/V capture (capture.mjs) + soundtrack rebuild from the event log (mix.py)
tools/build_fonts.py  font subsetting (sources go in tools/fonts_src/, see below)
```

## Debug URL parameters

`?seed=N` fixed run seed · `?dt=0.033` fixed timestep · `?dpr=0.5` render scale · `?manual=1&rec=1` capture mode (clock advanced by the recorder, audio events logged) · `?kind=0.9&target=3000` easy rivers for flow tests. None of these are used in normal play.

## Regenerating assets

- Audio: `pip install numpy scipy imageio-ffmpeg && cd tools/audio && python3 music.py && python3 sfx.py`
- Fonts: download the TTFs listed in CREDITS.md into `tools/fonts_src/`, then `pip install fonttools brotli && python3 tools/build_fonts.py`

See DESIGN.md for design rationale, balance data, verification notes and open issues.
