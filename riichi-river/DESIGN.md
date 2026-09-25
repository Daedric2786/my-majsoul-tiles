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

## Status log
- 2026-09-25: concept chosen, project scaffolded.
