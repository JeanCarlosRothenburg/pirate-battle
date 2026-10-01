import { Container, Graphics, Sprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { HEALTH_FILL_STEPS } from '../assets/gameAssets'
import type { GameTextures } from '../assets/gameAssets'
import type { GameConfig } from '../config/gameConfig'
import { angleDelta } from '../sim/mathUtils'
import { createRng } from '../sim/rng'
import type { Rng } from '../sim/rng'
import type { Simulation } from '../sim/simulation'
import type { Ship, ShipKind, SimEvent } from '../sim/types'
import { ArenaBackground } from './arenaBackground'
import { EffectLayer } from './effects'
import { fitLetterbox } from './letterbox'
import type { Letterbox } from './letterbox'

/**
 * Ship sprites come in six colours and four states: `ship_1..6` intact, `ship_7..12`
 * damaged, `ship_13..18` heavily damaged, `ship_19..24` wrecked. Colour order: white,
 * black, red, green, blue, yellow.
 */
const SHIP_COLOUR: Readonly<Record<ShipKind, number>> = { player: 4, chaser: 2, shooter: 1 }
const WRECK_STAGE = 3
/** The art points its bow along +y; the simulation's angle 0 points along +x. */
const ART_ROTATION = -Math.PI / 2
const SHIP_ART_LENGTH = 113
/**
 * Hull length relative to the collision radius. Ships are long and the collision shape is
 * a circle, so the bow and stern overhang it slightly while the beam sits inside it.
 */
const SHIP_LENGTH_PER_RADIUS = 2.8
const BALL_ART_SIZE = 10
const HEALTH_BAR_ART_WIDTH = 160
const HEALTH_BAR_WIDTH_PER_RADIUS = 2.4
const HEALTH_BAR_GAP = 6
const TRAIL_SECONDS = 0.07
const FIRE_FLICKER_SECONDS = 0.12
const HIT_TINT = 0xff9a8a

interface ShipView {
  readonly kind: ShipKind
  readonly root: Container
  readonly hull: Sprite
  readonly fire: Sprite
  readonly bar: Container
  readonly barFill: Sprite
  stage: number
  fillStep: number
  seenFrame: number
}

/**
 * PixiJS views driven by simulation state. The renderer never mutates the simulation: it
 * reads positions each frame, interpolating between the last two fixed steps, and turns
 * simulation events into short-lived effects.
 */
export class ArenaRenderer {
  readonly root = new Container()
  /** Current screen-to-arena mapping, shared with pointer input. */
  readonly letterbox: Letterbox = { scale: 1, offsetX: 0, offsetY: 0 }

  private readonly world = new Container()
  private readonly background: ArenaBackground
  private readonly wrecks = new EffectLayer(24)
  private readonly shipLayer = new Container()
  private readonly trails = new Graphics()
  private readonly projectileLayer = new Container()
  private readonly effects = new EffectLayer(160)
  private readonly barLayer = new Container()

  private readonly views = new Map<number, ShipView>()
  private readonly free: Record<ShipKind, ShipView[]> = { player: [], chaser: [], shooter: [] }
  private readonly balls: Sprite[] = []
  private readonly explosionFrames: readonly Texture[]
  private readonly impactFrames: readonly Texture[]
  private readonly flashFrames: readonly Texture[]
  private readonly debris: readonly Texture[]
  private readonly flames: readonly Texture[]
  /** Visual-only randomness, seeded so screenshots of the same match are reproducible. */
  private rng: Rng = createRng(1)
  private frame = 0
  private time = 0
  private lastProjectileId = 0

  constructor(
    private readonly config: GameConfig,
    private readonly textures: GameTextures,
  ) {
    const ship = (name: string): Texture => need(textures.ships, name)
    this.explosionFrames = [ship('explosion_3'), ship('explosion_2'), ship('explosion_1')]
    this.impactFrames = [ship('explosion_3'), ship('explosion_2')]
    this.flashFrames = [ship('explosion_3')]
    this.debris = [ship('wood_1'), ship('wood_2'), ship('wood_3'), ship('wood_4')]
    this.flames = [ship('fire_1'), ship('fire_2')]

    this.background = new ArenaBackground(config.arena, textures)
    this.world.addChild(
      this.background.container,
      this.wrecks.container,
      this.shipLayer,
      this.trails,
      this.projectileLayer,
      this.effects.container,
      this.barLayer,
    )
    this.root.addChild(this.world)
  }

  /** Letterboxes the arena into the screen, preserving aspect ratio. */
  fit(screenWidth: number, screenHeight: number): void {
    const { width, height } = this.config.arena
    const box = fitLetterbox(screenWidth, screenHeight, width, height, this.letterbox)
    this.world.scale.set(box.scale)
    this.world.position.set(box.offsetX, box.offsetY)
    // The whole screen in arena coordinates, plus a pixel of overlap against rounding seams.
    const bleed = 1 / box.scale
    this.background.cover(
      -box.offsetX / box.scale - bleed,
      -box.offsetY / box.scale - bleed,
      screenWidth / box.scale + bleed * 2,
      screenHeight / box.scale + bleed * 2,
    )
  }

  /** Clears effects left over from the previous match. */
  reset(): void {
    this.effects.clear()
    this.wrecks.clear()
    this.lastProjectileId = 0
    this.rng = createRng(1)
  }

  /** Runs after every fixed step, while that step's events are still available. */
  onStep(sim: Simulation): void {
    for (const event of sim.events) this.spawnEventEffects(event)

    // New projectiles still hold their muzzle position in prevX/prevY.
    for (const p of sim.projectiles) {
      if (p.id <= this.lastProjectileId) continue
      this.lastProjectileId = p.id
      this.effects.spawn({
        frames: this.flashFrames,
        x: p.prevX,
        y: p.prevY,
        rotation: Math.atan2(p.vy, p.vx),
        life: 0.14,
        scaleFrom: 0.22,
        scaleTo: 0.45,
      })
    }
  }

  /** Advances animations. Pass `animate = false` while paused so effects freeze with the match. */
  update(dt: number, animate: boolean): void {
    if (!animate) return
    this.time += dt
    this.background.update(dt)
    this.effects.update(dt)
    this.wrecks.update(dt)
  }

  /** `alpha` blends each entity between its previous and current fixed-step transform. */
  sync(sim: Simulation, alpha: number): void {
    this.frame++

    if (sim.player.alive) this.syncShip(sim.player, alpha)
    for (const enemy of sim.enemies) {
      if (enemy.alive) this.syncShip(enemy, alpha)
    }
    for (const [id, view] of this.views) {
      if (view.seenFrame !== this.frame) this.release(id, view)
    }

    this.syncProjectiles(sim, alpha)
  }

  destroy(): void {
    this.views.clear()
    for (const kind of Object.keys(this.free) as ShipKind[]) this.free[kind].length = 0
    this.balls.length = 0
    // Textures belong to the shared asset cache and are reused by the next match.
    this.root.destroy({ children: true, context: true })
  }

  // ------------------------------------------------------------------- ships

  private syncShip(ship: Ship, alpha: number): void {
    let view = this.views.get(ship.id)
    // Ids restart at every match, so a surviving id may now belong to another kind.
    if (view !== undefined && view.kind !== ship.kind) {
      this.release(ship.id, view)
      view = undefined
    }
    if (view === undefined) {
      view = this.acquire(ship.kind)
      this.views.set(ship.id, view)
    }
    view.seenFrame = this.frame

    const x = lerp(ship.prevX, ship.x, alpha)
    const y = lerp(ship.prevY, ship.y, alpha)
    view.root.position.set(x, y)
    view.root.rotation = ship.prevAngle + angleDelta(ship.prevAngle, ship.angle) * alpha + ART_ROTATION

    const ratio = ship.maxHp > 0 ? ship.hp / ship.maxHp : 0
    const stage = ratio > 2 / 3 ? 0 : ratio > 1 / 3 ? 1 : 2
    if (stage !== view.stage) {
      view.stage = stage
      view.hull.texture = this.shipTexture(ship.kind, stage)
      view.fire.visible = stage === 2
    }
    if (view.fire.visible) {
      const flame = this.flames[Math.floor(this.time / FIRE_FLICKER_SECONDS) % this.flames.length]
      if (flame !== undefined) view.fire.texture = flame
    }
    view.hull.tint = ship.hitFlash > 0 ? HIT_TINT : 0xffffff

    const step = Math.max(0, Math.min(HEALTH_FILL_STEPS, Math.ceil(ratio * HEALTH_FILL_STEPS)))
    if (step !== view.fillStep) {
      view.fillStep = step
      const fills = ship.kind === 'player' ? this.textures.healthBar.player : this.textures.healthBar.enemy
      const fill = fills[step]
      view.barFill.visible = step > 0 && fill !== undefined
      if (fill !== undefined) view.barFill.texture = fill
    }
    view.bar.position.set(x, y - ship.radius * (SHIP_LENGTH_PER_RADIUS / 2) - HEALTH_BAR_GAP)
  }

  private acquire(kind: ShipKind): ShipView {
    const pooled = this.free[kind].pop()
    if (pooled !== undefined) {
      pooled.root.visible = true
      pooled.bar.visible = true
      return pooled
    }

    const radius = this.radiusOf(kind)
    const scale = (radius * SHIP_LENGTH_PER_RADIUS) / SHIP_ART_LENGTH

    const root = new Container()
    const hull = new Sprite(this.shipTexture(kind, 0))
    hull.anchor.set(0.5)
    hull.scale.set(scale)
    const fire = new Sprite(this.flames[0])
    fire.anchor.set(0.5, 0.85)
    fire.scale.set(scale * 1.1)
    fire.position.set(8 * scale, 6 * scale)
    fire.visible = false
    root.addChild(hull, fire)
    this.shipLayer.addChild(root)

    const art = this.textures.healthBar
    const barScale = (radius * HEALTH_BAR_WIDTH_PER_RADIUS) / HEALTH_BAR_ART_WIDTH
    const bar = new Container()
    bar.scale.set(barScale)
    const frame = new Sprite(art.frame)
    frame.anchor.set(0.5)
    const barFill = new Sprite()
    barFill.anchor.set(0, 0.5)
    barFill.x = -HEALTH_BAR_ART_WIDTH / 2 + art.fillOffsetX
    bar.addChild(frame, barFill)
    this.barLayer.addChild(bar)

    return { kind, root, hull, fire, bar, barFill, stage: 0, fillStep: -1, seenFrame: 0 }
  }

  private release(id: number, view: ShipView): void {
    view.root.visible = false
    view.bar.visible = false
    view.fillStep = -1
    this.free[view.kind].push(view)
    this.views.delete(id)
  }

  private shipTexture(kind: ShipKind, stage: number): Texture {
    return need(this.textures.ships, `ship_${SHIP_COLOUR[kind] + 1 + stage * 6}`)
  }

  private radiusOf(kind: ShipKind): number {
    if (kind === 'player') return this.config.player.radius
    return kind === 'chaser' ? this.config.chaser.radius : this.config.shooter.radius
  }

  // ------------------------------------------------------------- projectiles

  private syncProjectiles(sim: Simulation, alpha: number): void {
    const trails = this.trails.clear()
    let used = 0
    // Trails are grouped by faction into two strokes for the whole frame.
    for (const faction of ['player', 'enemy'] as const) {
      let any = false
      for (const p of sim.projectiles) {
        if (!p.alive || p.faction !== faction) continue
        const x = lerp(p.prevX, p.x, alpha)
        const y = lerp(p.prevY, p.y, alpha)
        trails.moveTo(x - p.vx * TRAIL_SECONDS, y - p.vy * TRAIL_SECONDS).lineTo(x, y)
        any = true

        const ball = this.ball(used++)
        ball.position.set(x, y)
        ball.scale.set((p.radius * 2) / BALL_ART_SIZE)
      }
      if (any) {
        trails.stroke({ width: 3, color: faction === 'player' ? 0xffffff : 0xffc9b8, alpha: 0.55, cap: 'round' })
      }
    }
    for (let i = used; i < this.balls.length; i++) {
      const ball = this.balls[i]
      if (ball !== undefined) ball.visible = false
    }
  }

  private ball(index: number): Sprite {
    let ball = this.balls[index]
    if (ball === undefined) {
      ball = new Sprite(need(this.textures.ships, 'cannon_ball'))
      ball.anchor.set(0.5)
      this.projectileLayer.addChild(ball)
      this.balls.push(ball)
    }
    ball.visible = true
    return ball
  }

  // ----------------------------------------------------------------- effects

  private spawnEventEffects(event: SimEvent): void {
    switch (event.type) {
      case 'hit':
        if (event.surface === 'ship') {
          this.effects.spawn({ frames: this.impactFrames, x: event.x, y: event.y, life: 0.3, scaleFrom: 0.35, scaleTo: 0.6 })
          this.spawnDebris(event.x, event.y, 3)
        } else {
          this.effects.spawn({
            frames: this.flashFrames,
            x: event.x,
            y: event.y,
            life: 0.25,
            scaleFrom: 0.25,
            scaleTo: 0.45,
            alphaFrom: 0.8,
            tint: 0xf3e3b5,
          })
        }
        return
      case 'explosion': {
        const radius = this.radiusOf(event.kind)
        const scale = (radius * SHIP_LENGTH_PER_RADIUS) / SHIP_ART_LENGTH
        this.wrecks.spawn({
          frames: [this.shipTexture(event.kind, WRECK_STAGE)],
          x: event.x,
          y: event.y,
          rotation: event.angle + ART_ROTATION,
          life: 1.8,
          scaleFrom: scale,
          scaleTo: scale * 0.85,
          spin: 0.15,
        })
        this.effects.spawn({ frames: this.explosionFrames, x: event.x, y: event.y, life: 0.7, scaleFrom: 0.6, scaleTo: 1.3 })
        this.spawnDebris(event.x, event.y, 6)
        return
      }
      default:
        return
    }
  }

  private spawnDebris(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const direction = this.rng.next() * Math.PI * 2
      const speed = 50 + this.rng.next() * 80
      const texture = this.debris[i % this.debris.length]
      if (texture === undefined) continue
      this.effects.spawn({
        frames: [texture],
        x,
        y,
        rotation: direction,
        life: 0.7,
        scaleFrom: 0.9,
        scaleTo: 0.5,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        spin: (this.rng.next() - 0.5) * 12,
      })
    }
  }
}

function need(textures: Readonly<Record<string, Texture>>, name: string): Texture {
  const texture = textures[name]
  if (texture === undefined) throw new Error(`Missing texture "${name}"`)
  return texture
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
