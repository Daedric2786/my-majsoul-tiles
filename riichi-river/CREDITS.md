# Credits & licenses

| Asset | Source | License |
|---|---|---|
| Game code | Written for this project | Owner's choice — no license file added yet (see note) |
| Tile faces, scenery, water, UI art | Procedurally drawn in code (`src/render/faces.js`, `scenery.js`, `water.js`, CSS) — original designs, no Mahjong Soul or other third-party artwork | Owner's choice |
| Music (`music_calm`, `music_tense`), SFX, ambience | Synthesized from scratch in `tools/audio/*.py`; composition original | Owner's choice |
| three.js 0.186.1 | https://threejs.org | MIT |
| Shippori Mincho ExtraBold (subset) | Google Fonts, `ofl/shipporimincho` | SIL OFL 1.1 (`public/fonts/OFL-ShipporiMincho.txt`) |
| Zen Maru Gothic Bold/Black (subset) | Google Fonts, `ofl/zenmarugothic` | SIL OFL 1.1 (`public/fonts/OFL-ZenMaruGothic.txt`) |
| Gowun Dodum (subset) | Google Fonts, `ofl/gowundodum` | SIL OFL 1.1 (`public/fonts/OFL-GowunDodum.txt`) |

None of the three fonts declares a Reserved Font Name, so the subsets keep their original internal names; the CSS refers to them as "RR Mincho", "RR Round" and "RR Hangul". The OFL texts ship next to the font files.
Dev-only tools (Vite, Playwright, numpy/scipy, fonttools, ffmpeg via imageio-ffmpeg) are not shipped.

The sibling folder `../my-majsoul-tiles` is an unrelated Mahjong Soul resource pack; none of its images are used here.

Note: the only LICENSE file in this repository (`../my-majsoul-tiles/LICENSE`, MIT, © Luvie) belongs to the resource pack. Pick and add a license for `riichi-river/` before publishing it anywhere; all first-party code, art and audio here is original and can take any license.
