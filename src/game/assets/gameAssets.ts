import { Assets, Rectangle, Spritesheet, Texture } from 'pixi.js'
import type { SpritesheetData, UnresolvedAsset } from 'pixi.js'
import { getAudioContext } from '../audio/soundBank'
import type { SoundBuffers } from '../audio/soundBank'
import {
  GAME_SOUNDS,
  SHIPS_ATLAS,
  TILE_COLUMNS,
  TILE_ROWS,
  TILE_SIZE,
  soundUrl,
  tileArt,
  uiAtlas,
} from './manifest'
import type { AssetDensity, GameSound } from './manifest'
import { parseTextureAtlasXml } from './textureAtlasXml'

export const HEALTH_FILL_STEPS = 20

export interface HealthBarArt {
  readonly frame: Texture
  readonly fillOffsetX: number
  readonly player: readonly Texture[]
  readonly enemy: readonly Texture[]
}

export interface GameTextures {
  readonly ships: Readonly<Record<string, Texture>>
  readonly ui: Readonly<Record<string, Texture>>
  /** Tile `n` of the tile sheet, 1-based, numbered like `assets/png/<density>/tiles/tile_<n>.png`. */
  tile(index: number): Texture
  readonly water: Texture
  readonly sand: Texture
  readonly grass: Texture
  readonly healthBar: HealthBarArt
}

export interface GameAssets {
  readonly density: AssetDensity
  readonly textures: GameTextures
  readonly sounds: SoundBuffers
}

export type ProgressListener = (fraction: number) => void

const HEALTH_FILL_BOUNDS = { x: 21, w: 118 } as const

let pending: Promise<GameAssets> | null = null
const listeners = new Set<ProgressListener>()
let lastProgress = 0

/**
 * Loads every asset a match needs, once per page. Later calls share the same promise, so
 * restarts and remounts reuse the same textures and audio buffers. A failed load clears
 * the cache, so calling again retries. `onProgress` receives values from 0 to 1.
 */
export function loadGameAssets(onProgress?: ProgressListener): {
  readonly promise: Promise<GameAssets>
  readonly unsubscribe: () => void
} {
  if (onProgress !== undefined) {
    listeners.add(onProgress)
    onProgress(lastProgress)
  }
  if (pending === null) {
    lastProgress = 0
    pending = loadAll().catch((error: unknown) => {
      pending = null
      throw error
    })
  }
  return {
    promise: pending,
    unsubscribe: () => {
      if (onProgress !== undefined) listeners.delete(onProgress)
    },
  }
}

function report(fraction: number): void {
  lastProgress = fraction
  for (const listener of listeners) listener(fraction)
}

async function loadAll(): Promise<GameAssets> {
  const density: AssetDensity = (globalThis.devicePixelRatio ?? 1) > 1 ? 2 : 1
  const tiles = tileArt(density)
  const ui = uiAtlas(density)
  const resolution = { resolution: density }

  const textureRequests: UnresolvedAsset[] = [
    { src: SHIPS_ATLAS.url },
    { src: ui.url },
    { src: tiles.sheet, data: resolution },
    { src: tiles.water, data: resolution },
    { src: tiles.sand, data: resolution },
    { src: tiles.grass, data: resolution },
  ]

  const totalUnits = textureRequests.length + GAME_SOUNDS.length
  let textureFraction = 0
  let soundsDone = 0
  const update = (): void =>
    report((textureFraction * textureRequests.length + soundsDone) / totalUnits)

  const [loaded, sounds] = await Promise.all([
    Assets.load<Texture>(textureRequests, (fraction) => {
      textureFraction = fraction
      update()
    }),
    loadSounds(() => {
      soundsDone++
      update()
    }),
  ])

  const texture = (src: string): Texture => {
    const found = loaded[src]
    if (found === undefined) throw new Error(`Texture failed to load: ${src}`)
    return found
  }

  const ships = await parseSheet(texture(SHIPS_ATLAS.url), parseTextureAtlasXml(SHIPS_ATLAS.xml))
  const uiTextures = await parseSheet(texture(ui.url), ui.data as SpritesheetData)
  const tileTextures = sliceTiles(texture(tiles.sheet))

  report(1)
  return {
    density,
    sounds,
    textures: {
      ships,
      ui: uiTextures,
      tile: (index) => {
        const tile = tileTextures[index - 1]
        if (tile === undefined) throw new Error(`No tile ${index}`)
        return tile
      },
      water: texture(tiles.water),
      sand: texture(tiles.sand),
      grass: texture(tiles.grass),
      healthBar: buildHealthBarArt(uiTextures),
    },
  }
}

async function parseSheet(texture: Texture, data: SpritesheetData): Promise<Record<string, Texture>> {
  const sheet = new Spritesheet(texture, data)
  return sheet.parse()
}

function sliceTiles(sheet: Texture): Texture[] {
  const tiles: Texture[] = []
  for (let row = 0; row < TILE_ROWS; row++) {
    for (let column = 0; column < TILE_COLUMNS; column++) {
      tiles.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(column * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE),
        }),
      )
    }
  }
  return tiles
}

/**
 * The health bar frame and its fills, clipped once into twenty widths so partial health
 * never allocates a texture per frame. The fill art spans x 21 to 139 of its 160 × 40 frame
 * (from ui_sheet.json); index `k` is clipped to `k / 20`, and index 0 is unused.
 */
function buildHealthBarArt(ui: Record<string, Texture>): HealthBarArt {
  const need = (name: string): Texture => {
    const found = ui[name]
    if (found === undefined) throw new Error(`UI atlas has no frame "${name}"`)
    return found
  }
  const clipped = (fill: Texture): Texture[] => {
    const steps: Texture[] = [Texture.EMPTY]
    for (let k = 1; k <= HEALTH_FILL_STEPS; k++) {
      const width = (HEALTH_FILL_BOUNDS.w * k) / HEALTH_FILL_STEPS
      steps.push(
        new Texture({
          source: fill.source,
          frame: new Rectangle(fill.frame.x + HEALTH_FILL_BOUNDS.x, fill.frame.y, width, fill.frame.height),
        }),
      )
    }
    return steps
  }
  return {
    frame: need('enemy_health_frame'),
    fillOffsetX: HEALTH_FILL_BOUNDS.x,
    player: clipped(need('enemy_health_fill_green')),
    enemy: clipped(need('enemy_health_fill_red')),
  }
}

async function loadSounds(onEach: () => void): Promise<SoundBuffers> {
  const context = getAudioContext()
  const buffers = new Map<GameSound, AudioBuffer>()
  await Promise.all(
    GAME_SOUNDS.map(async (name) => {
      const response = await fetch(soundUrl(name))
      if (!response.ok) throw new Error(`Sound failed to load: ${name} (HTTP ${response.status})`)
      const data = await response.arrayBuffer()
      if (context !== null) buffers.set(name, await context.decodeAudioData(data))
      onEach()
    }),
  )
  return buffers
}
