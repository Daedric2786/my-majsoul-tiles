# Riichi River — design & handoff

> Working doc. Newest status is at the bottom ("Status log"). Read this + `git log` before resuming.

## 1. Concept choice

Three candidates were compared (2026-09-25):

| | A. **Riichi River** (chosen) | B. Mahjong deck-builder roguelite | C. Tile-sling physics tower |
|---|---|---|---|
| Core action | Tap mahjong tiles floating down a lantern-lit river to catch them into a small tray; sets (runs/triplets) snap into melds; 4 melds + pair = win | Pick tiles from a hand, play sets, score with multipliers | Fling tiles to stack/knock sets in a physics tower |
| Differentiator | Real-time *reading + prioritising* of a flowing stream; the Riichi wait as an action climax (your winning tile glows somewhere upstream — you must catch it before it passes) | Balatro-style scoring | Physical chaos |
| Depth | Which tiles to take with a 5-slot tray, which hand to aim for (value vs speed — the river is finite), when to declare Riichi (locks hand for +han), charms that change strategy | Very deep, proven | Shallow; mahjong layer is decoration |
| Biggest risk | Real-time + mahjong reading may overwhelm newcomers → mitigated by auto-melding, glimmer hints, suit-limited early stations, corner numerals | Aotenjo (Steam, 2025) already *is* "Balatro × mahjong"; turn-based clicking gives little hand-feel | Mahjong adds nothing; physics feel is hard to tune for touch |
| Target player | Casual portal players who like tile-match (Zen Match / Triple Tile audience) + riichi fans (Mahjong Soul audience) | Roguelite fans on Steam | Casual physics players |

Why A: the tray/triple-match loop is already hugely popular and instantly understood, but no game we found makes it a *flowing* stream built on real mahjong hand structure. Mahjong adds real decisions (runs vs triplets, yaku, value vs speed), the river adds hand-feel and tension, and the Riichi wait gives a memorable, repeatable climax moment. Nod to this repo's origin: tiles carry corner Arabic numerals (like the Mahjong Soul EN-tile pack in `../my-majsoul-tiles`) — but all art is original; no Mahjong Soul assets are used.

Unverified hypotheses (need real players):
1. Newcomers understand "catch → sets snap → 4 sets + pair" within the first station without reading text.
2. Real-time pressure feels exciting rather than stressful at station 1–3 speeds.
3. Riichi (lock hand for value) is a decision players actually weigh, not always/never.
4. Runs are 2–5 minutes per station hand-cluster and players voluntarily restart after a failed run.

## 2. Target experience & quality bar

- **First 10 s**: title screen *is* the live river; one tap starts audio and glides the camera into play. First tiles are scripted so the first catch makes a set within ~8 s.
- **Core feel**: tile pops out of the water with splash + ripple, arcs into the rack, lands with a wooden clack, tray re-sorts with springs. Melds slam together with a tuned chime (notes climb the scale per meld).
- **Climax**: Riichi → stick drops, vignette, taiko layer enters, winning tiles glow gold upstream → catch → hit-stop, "TSUMO" brush stamp, yaku tally, limit stamp (MANGAN/HANEMAN/…/YAKUMAN).
- **Progression**: 8 river stations (spring → bamboo → village → festival → night rapids → mist → waterfall → dawn sea). Each adds a river feature and tile variety; between stations choose 1 of 3 omamori charms that change strategy.
- **Reference bar** (principles, not copied expression): Balatro (score tally juice, readable escalation), Mahjong Soul (tile tactility, call stamps), Zen Match / tile-match genre (instant readability, tray tension), Tetris Effect (music and visuals reacting to play), Okami / Ghost of Tsushima (painterly Japanese night palette, restraint).

Platform targets: Poki / CrazyGames style web portals. Desktop (mouse) + mobile portrait (touch) primary; landscape mobile supported. English default, KO/JA included. Initial download target < 5 MB, music lazy-loaded.

## 3. Tech

- Vite + three.js (single perspective scene; hand rack is parented to the camera so catches fly in world space).
- Rules engine (`src/game/rules.js`) is pure JS and unit-tested with `node --test`.
- Audio: authored offline in Python/numpy (`tools/audio/`) → Opus + MP3; music loops are rendered periodic with padding so loop points are decoder-offset safe.
- Fonts: Shippori Mincho (OFL), Zen Maru Gothic (OFL), subset with fonttools.

## 4. Rules as built

- Tray holds 6 loose tiles (charm: 7). A full tray still accepts a tile that completes a set, a kan or the win.
- Auto-meld: when a caught tile completes a run/triplet it snaps into a meld. If several sets are possible the engine keeps the tray shape with the best follow-ups (`trayValue`), prefers the set that completes the hand, and prefers triplets when all melds so far are triplets.
- 4th copy of a pon upgrades it to a kan (new dora indicator), unless the tile completes the hand.
- Riichi: available when tenpai; +1 han (+ura dora, ippatsu within 8 river tiles); only winning tiles can be caught; they glow gold.
- Scoring: real riichi fu/han table (menzen tsumo always counts as a yaku), mangan…yakuman limits, non-dealer values.
- A river ends when its wall has passed. Reaching the goal clears it; tiles left over become coins. Missing the goal costs a lantern (3 per journey) and the river is retried with a new shuffle.
- Rafts (two tiles lashed together) appear from river 2; golden lanterns (blessing: +1 han on the next win) from river 4.

## 5. Balance data (tools/sim.js, bots with perfect reaction; human numbers are unmeasured)

Clear rate per attempt, no charms → with Bamboo Basket + Lucky Cat + Still Water:

| River | Goal | Expert bot | Casual bot | Expert w/ charms | Casual w/ charms |
|---|---|---|---|---|---|
| 1 Spring | 8,000 | 78% | 66% | – | – |
| 2 Bamboo | 12,000 | 79% | 48% | – | – |
| 3 Village | 13,000 | 61% | 22% | – | – |
| 4 Festival | 20,000 | 76% | 32% | – | – |
| 5 Rapids | 24,000 | 60% | 20% | 78% | 28% |
| 6 Mist | 14,000 | ~10%* | ~1%* | 31% | 18% |
| 7 Falls | 18,000 | ~9%* | ~1%* | 28% | 8% |
| 8 Dawn sea | 26,000 | ~16%* | ~6%* | 46% | 16% |

\* measured before the late goals were lowered (18k/22k/30k → 14k/18k/26k). Bots never gamble on hidden mist tiles, so rivers 6 and 8 are pessimistic. Wins per river: ~2–2.5 (expert), ~1.2 (casual). The late game is intentionally hard; whether it feels fair needs human play.

## 6. Verification log (what was actually checked)

Environment: headless Chromium 141 (Playwright) with **SwiftShader CPU WebGL** — correct rendering but ~1–2 fps, so all captures use a fixed timestep. No real phone or GPU was available.

| Area | How | Result |
|---|---|---|
| Rules/scoring | `npm test` (20 tests: melds, kan, waits, riichi, fu/han, limits, dora/ura/aka, yaku detection, kan-vs-win) | pass |
| Core loop via real input | Playwright mouse clicks at projected tile positions (`tools/autoplay.mjs`) | catch → chi/pon → riichi → tsumo → tally → clear → shrine → next river; reached river 6 |
| Fail/retry/run over, pause, settings, language, resize, reload persistence | `tools/s_flows2.mjs` | all pass, 0 page errors |
| Review regressions (overlays after win, save after quit at 1 life, corrupt save boot) | `tools/s_review.mjs` | pass |
| Leaks | 10 play→quit cycles | geometries/textures/programs/heap flat after fixing a PMREM leak |
| Draw calls | `renderer.info` | 94 → 48 (static decor merged) + ~3 per tile |
| Strict-CSP single file | wrapped `dist-artifact` with a CSP meta | boots, audio + fonts load |
| Audio | decode in browser, loop metadata, pitch accuracy of synthesized koto (0 cents), stem harmony vs chord chart (chroma per bar), band energy, loop seam continuity | technical checks pass |
| Demo | `tools/record/capture.mjs` + `mix.py` → `media/riichi_river_demo.mp4` (38 s, real input path, audio rebuilt from the event log) | first win at ~30 s |
| Independent code review | separate agent, 11 defects reported | all 11 fixed and re-checked |

**Not verified** (needs a human / real device):
- How the music and SFX actually *sound*. I could only analyse them (spectra, chroma, levels); nobody has listened.
- Frame rate on real phones/GPUs. The water shader is the main cost; adaptive resolution (DPR 2 → 1 → 0.75, then cheaper water) is implemented but untested on hardware.
- Touch feel on a real phone (tap radius, thumb occlusion of the tray, iOS Safari audio unlock, Opus support → MP3 fallback path).
- Whether newcomers understand the rules without text, and whether the pacing is fun. No player has tried it.

## 7. Known issues / next steps
1. Human playtest (below) before adding content.
2. Real-device performance pass (mid Android + iPhone); consider InstancedMesh tiles if draw calls matter.
3. Listen-through of music/SFX; the synth instruments are the most likely weak spot (koto and FM piano are fine technically but may sound thin).
4. Gusts have no visual cue beyond speed changes.
5. Portal SDK wiring is in `src/platform.js` but untested against the real Poki/CrazyGames SDK; add the SDK script tag in a portal-specific index.html.
6. Add a license file for `riichi-river/` (see CREDITS.md).

## 8. Playtest plan (5 people, 10 minutes each, no instructions)
Watch, don't explain. Note timestamps.
1. Did they tap a tile within 10 s of pressing *Set sail*? What did they try first?
2. After the first set snapped, could they say what makes a set?
3. Did they notice the tray limit before it blocked them? Did they discover releasing tiles?
4. When the RIICHI button appeared, did they press it? Could they say why?
5. After a failed river, did they retry without being asked? What would they change?
6. Which river / moment did they mention afterwards? Did anything feel unfair?
Metrics to compare later (portal data): conversion to first catch, first win time, retry rate after the first failure, rivers reached per session.

## 9. Platforms
- Poki: initial download ≤ 5 MB, total ≤ 8 MB (ours: ~0.95 MB before music, ~2.9 MB total on the Opus path). Web-exclusive by default; submission form required.
- CrazyGames: non-exclusive, Basic Launch (≥ 7 days, ≥ 500 plays) before Full Launch; requires gameplay within one click (title → *Set sail* satisfies it).
- A Poki exclusive deal rules out CrazyGames; decide before submitting. Sources and details are summarised from the official docs in the session notes; re-check them at submission time.

## Status log
- 2026-09-25: concept chosen, project scaffolded.
- 2026-09-25: full vertical slice: 8 rivers + endless, charms, shrine, scoring tally, tutorial, 3 languages, synthesized soundtrack/SFX, scenery, title camera, adaptive quality, save/continue, portal adapter, demo video, playtest build published (private artifact). Current state: **external-test build**, not a release candidate (audio listening, device performance and human playtests are outstanding).
