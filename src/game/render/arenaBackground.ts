import { Container, FillPattern, Graphics, Sprite, TilingSprite } from 'pixi.js'
import type { GameTextures } from '../assets/gameAssets'
import type { ArenaConfig, IslandShape } from '../config/gameConfig'

/** Tile numbers in the provided tile sheet. */
const TILE = { palm: 71, fern: 70, sprout: 72, rock: 50, mossyRock: 66, seedlings: 87 } as const
/** Share of the island's size covered by grass; the rest is beach. */
const GRASS_RATIO = 0.62
/** Small enough that the rounded art leaves only a few pixels of collision outside it. */
const RECT_CORNER = 14
const SAND_EDGE = 0xc49a5c
const GRASS_EDGE = 0x4d8a36
const SHALLOW_WIDTH = 22
const WATER_DRIFT = { x: 7, y: 4 } as const
/** The sea beyond the arena is dimmed slightly, so the sailing limit stays readable. */
const OUTSIDE_DIM = { color: 0x041c2c, alpha: 0.3 } as const
const LIMIT_LINE = { width: 3, color: 0xffffff, alpha: 0.35 } as const

/**
 * Water and islands. Everything here is static except the water, which drifts slowly while
 * the match runs. Island art is laid over the exact collision shapes from the arena config.
 *
 * The water is not limited to the arena: `cover` stretches it over the whole visible area,
 * letterbox included, so the sea always fills the screen. The arena itself keeps its size
 * and proportions; outside it the sea is dimmed and a line marks where ships must stay.
 */
export class ArenaBackground {
  readonly container = new Container()
  private readonly water: TilingSprite
  private readonly outside = new Graphics()
  private readonly drift = { x: 0, y: 0 }

  constructor(
    private readonly arena: ArenaConfig,
    textures: GameTextures,
  ) {
    this.water = new TilingSprite({ texture: textures.water, width: arena.width, height: arena.height })

    const shallows = new Graphics()
    for (const island of arena.islands) drawShallows(shallows, island)
    shallows.stroke({ width: SHALLOW_WIDTH, color: 0xffffff, alpha: 0.18 })

    const islands = new Container()
    const ground = new Graphics()
    const sand = new FillPattern(textures.sand, 'repeat')
    const grass = new FillPattern(textures.grass, 'repeat')
    for (const island of arena.islands) drawIsland(ground, island, sand, grass)
    islands.addChild(ground)
    arena.islands.forEach((island, index) => {
      for (const decoration of decorate(island, index, textures)) islands.addChild(decoration)
    })

    this.container.addChild(this.water, this.outside, shallows, islands)
    this.cover(0, 0, arena.width, arena.height)
  }

  /**
   * Extends the sea over the visible area, given in arena coordinates (it may start at
   * negative values and exceed the arena on any side).
   */
  cover(left: number, top: number, width: number, height: number): void {
    this.water.position.set(left, top)
    this.water.width = width
    this.water.height = height
    this.alignWater()

    const { width: w, height: h } = this.arena
    this.outside
      .clear()
      .rect(left, top, width, height)
      .fill(OUTSIDE_DIM)
      .rect(0, 0, w, h)
      .cut()
      .rect(0, 0, w, h)
      .stroke({ ...LIMIT_LINE, alignment: 0 })
  }

  update(dt: number): void {
    this.drift.x += WATER_DRIFT.x * dt
    this.drift.y += WATER_DRIFT.y * dt
    this.alignWater()
  }

  /** Anchors the tile pattern to the arena origin, so moving or resizing never shifts the waves. */
  private alignWater(): void {
    this.water.tilePosition.set(this.drift.x - this.water.x, this.drift.y - this.water.y)
  }
}

function drawShallows(g: Graphics, island: IslandShape): void {
  const pad = SHALLOW_WIDTH / 2
  if (island.kind === 'circle') {
    g.circle(island.x, island.y, island.radius + pad)
  } else {
    g.roundRect(island.x - pad, island.y - pad, island.width + pad * 2, island.height + pad * 2, 28)
  }
}

/**
 * Islands are drawn over their exact collision shape with the sand and grass tiles as
 * patterns: a sand beach and a grass interior. The tile sheet's prebuilt islands only fit
 * shapes that are multiples of 64 px, and stretching them tore the grass and showed seams.
 */
function drawIsland(g: Graphics, island: IslandShape, sand: FillPattern, grass: FillPattern): void {
  if (island.kind === 'circle') {
    g.circle(island.x, island.y, island.radius)
      .fill(sand)
      .stroke({ width: 3, color: SAND_EDGE, alignment: 1 })
      .circle(island.x, island.y, island.radius * GRASS_RATIO)
      .fill(grass)
      .stroke({ width: 3, color: GRASS_EDGE, alpha: 0.8 })
    return
  }
  const beach = Math.min(island.width, island.height) * ((1 - GRASS_RATIO) / 2)
  g.roundRect(island.x, island.y, island.width, island.height, RECT_CORNER)
    .fill(sand)
    .stroke({ width: 3, color: SAND_EDGE, alignment: 1 })
    .roundRect(
      island.x + beach,
      island.y + beach,
      island.width - beach * 2,
      island.height - beach * 2,
      RECT_CORNER,
    )
    .fill(grass)
    .stroke({ width: 3, color: GRASS_EDGE, alpha: 0.8 })
}

/** Fixed per-island decoration, kept well inside the island so it never reads as an obstacle. */
function decorate(island: IslandShape, index: number, textures: GameTextures): Sprite[] {
  const cx = island.kind === 'circle' ? island.x : island.x + island.width / 2
  const cy = island.kind === 'circle' ? island.y : island.y + island.height / 2
  const size = island.kind === 'circle' ? island.radius : Math.min(island.width, island.height) / 2
  if (size < 50) return []

  const sprite = (tile: number, dx: number, dy: number, scale: number, rotation = 0): Sprite => {
    const s = new Sprite(textures.tile(tile))
    s.anchor.set(0.5)
    s.position.set(cx + dx * size, cy + dy * size)
    s.scale.set(scale)
    s.rotation = rotation
    return s
  }

  const variant = index % 3
  if (variant === 0) return [sprite(TILE.palm, 0, 0, 1), sprite(TILE.seedlings, 0.3, 0.3, 0.7)]
  if (variant === 1) return [sprite(TILE.fern, -0.2, -0.1, 0.9, 0.6), sprite(TILE.mossyRock, 0.28, 0.2, 0.6)]
  return [sprite(TILE.sprout, 0, 0, 0.9), sprite(TILE.rock, -0.3, 0.25, 0.5)]
}
