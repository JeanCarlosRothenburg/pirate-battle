# Asset sources

Everything in this directory, except this file, is the unmodified `assets/` folder of the
challenge repository `game-developer-challenge-main`, which the challenge organisers provided.

| Field | Value |
| --- | --- |
| Source | `game-developer-challenge-main.zip`, the challenge repository's `main` branch |
| Retrieved | 2026-09-30 |
| Archive SHA-256 | `a63d539935d64554e9813a6af0339e9260a7ec86ea02fc14eba6f6f74ef8896b` |
| Modifications | none; macOS `.DS_Store` files excluded |

## Contents

| Path | What it is |
| --- | --- |
| `spritesheet/ui_sheet(.json/.png)`, `ui_sheet_retina(.json/.png)` | UI atlas, 1× and 2×, meta `app: "Pirate Battle UI asset pack"` |
| `spritesheet/ships_miscellaneous_sheet(_retina)(.png/.xml)` | Ships, ship parts, projectiles and effects atlas (XML TextureAtlas) |
| `tilesheet/tiles_sheet(_retina).png` | Water and island tiles, 64 × 64 px, no margin |
| `png/default`, `png/retina` | The same sprites as individual PNGs (ui, ships, ship_parts, tiles, effects) |
| `vector/` | SVG and SWF vector sources of the ships and tiles |
| `sounds/` | WAV sound effects and ambience loops |
| `sample*.png`, `preview.png` | Reference screenshots supplied with the brief; not used at runtime |
| `ui_scene_background.png` | Menu background scene |
| `logo_jungle_gaming.svg` | Challenge organiser's logo; not used at runtime |

## Licence

The archive contains no licence file, and the atlases and vectors carry no licence
metadata. The assets are used under the terms of the challenge, which directs candidates to
use them as the visual base of the solution. Confirm the licence with the organisers before
any use outside this challenge.

## Conversions and derived use

No file here is modified. Conversions happen at load time in code:

| Source | Conversion | Where |
| --- | --- | --- |
| `spritesheet/ships_miscellaneous_sheet.xml` | Starling XML parsed into Pixi spritesheet data | `src/game/assets/textureAtlasXml.ts` |
| `tilesheet/tiles_sheet(_retina).png` | Sliced into 64 × 64 tiles by grid (`tilesheets.txt`) | `src/game/assets/gameAssets.ts` |
| `enemy_health_fill_*` (UI atlas) | Clipped into 20 precomputed widths for partial health | `src/game/assets/gameAssets.ts` |
| `png/*/tiles/tile_73`, `tile_18`, `tile_40` | Seamless water, sand and grass tiles repeated as patterns over the sea and the island shapes | `src/game/assets/manifest.ts`, `src/game/render/arenaBackground.ts` |
| `png/*/ui/hud`, `png/*/ui/controls` | CSS backgrounds for the HUD and the touch buttons (`button_round_*`, `icon_*`), 1× / 2× via `image-set` | `src/ui/styles.css` |
| `png/*/ui/menu` | Menu panel, primary and secondary buttons and the title, drawn as CSS nine-slices | `src/ui/styles.css` |
| `ui_scene_background.png` | Background of the menus and loading screen | `src/ui/styles.css` |
| `png/default/ships/ship_2.png` | Ship illustration on the main menu | `src/ui/screens/MainMenu.tsx` |
| `sounds/*.wav` | Game sounds loaded with the first match; `ui_*` sounds for menu buttons | `src/game/assets/manifest.ts`, `src/game/bridge/gameAudio.ts`, `src/ui/uiSounds.ts` |
| `png/default/ships/ship_5.png` | Page favicon | `index.html` |

The "retina" ships atlas has the same pixel size as the default one, so only the default is
used. No third-party assets have been added.
