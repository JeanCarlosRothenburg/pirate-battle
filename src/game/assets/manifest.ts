import shipsSheetUrl from '../../../assets/spritesheet/ships_miscellaneous_sheet.png?url'
import shipsSheetXml from '../../../assets/spritesheet/ships_miscellaneous_sheet.xml?raw'
import uiSheetData from '../../../assets/spritesheet/ui_sheet.json'
import uiSheetUrl from '../../../assets/spritesheet/ui_sheet.png?url'
import uiSheetRetinaData from '../../../assets/spritesheet/ui_sheet_retina.json'
import uiSheetRetinaUrl from '../../../assets/spritesheet/ui_sheet_retina.png?url'
import tilesSheetUrl from '../../../assets/tilesheet/tiles_sheet.png?url'
import tilesSheetRetinaUrl from '../../../assets/tilesheet/tiles_sheet_retina.png?url'
import sandTileUrl from '../../../assets/png/default/tiles/tile_18.png?url'
import grassTileUrl from '../../../assets/png/default/tiles/tile_40.png?url'
import waterTileUrl from '../../../assets/png/default/tiles/tile_73.png?url'
import sandTileRetinaUrl from '../../../assets/png/retina/tiles/tile_18.png?url'
import grassTileRetinaUrl from '../../../assets/png/retina/tiles/tile_40.png?url'
import waterTileRetinaUrl from '../../../assets/png/retina/tiles/tile_73.png?url'

export type AssetDensity = 1 | 2

export const TILE_SIZE = 64
export const TILE_COLUMNS = 16
export const TILE_ROWS = 6

export const SHIPS_ATLAS = { url: shipsSheetUrl, xml: shipsSheetXml } as const

/**
 * The UI atlas for a pixel density. Every asset is imported through Vite, which
 * fingerprints it into the build for long-lived caching. UI and tile art have real 2×
 * variants; the ships atlas's "retina" file has the default's dimensions, so only the
 * default ships atlas is used.
 */
export function uiAtlas(density: AssetDensity) {
  return density === 2
    ? { url: uiSheetRetinaUrl, data: uiSheetRetinaData }
    : { url: uiSheetUrl, data: uiSheetData }
}

/** The tile sheet (64 × 64 tiles, no margin) and the seamless tiles, for a pixel density. */
export function tileArt(density: AssetDensity) {
  return density === 2
    ? { sheet: tilesSheetRetinaUrl, water: waterTileRetinaUrl, sand: sandTileRetinaUrl, grass: grassTileRetinaUrl }
    : { sheet: tilesSheetUrl, water: waterTileUrl, sand: sandTileUrl, grass: grassTileUrl }
}

export const GAME_SOUNDS = [
  'cannon_broadside',
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'game_complete',
  'game_over',
  'game_pause',
  'game_resume',
  'game_start',
  'health_low',
  'ocean_ambience_loop',
  'score_point',
  'ship_collision',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_sailing_loop',
  'ship_sinking',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'time_warning',
] as const

export type GameSound = (typeof GAME_SOUNDS)[number]

const soundUrls = import.meta.glob<string>('../../../assets/sounds/*.wav', {
  query: '?url',
  import: 'default',
  eager: true,
})

export function soundUrl(name: GameSound): string {
  const url = soundUrls[`../../../assets/sounds/${name}.wav`]
  if (url === undefined) throw new Error(`Missing sound asset: ${name}.wav`)
  return url
}

export const UI_SOUNDS = ['ui_back', 'ui_click', 'ui_close', 'ui_hover', 'ui_open'] as const

export type UiSound = (typeof UI_SOUNDS)[number]

export function uiSoundUrl(name: UiSound): string {
  const url = soundUrls[`../../../assets/sounds/${name}.wav`]
  if (url === undefined) throw new Error(`Missing sound asset: ${name}.wav`)
  return url
}
