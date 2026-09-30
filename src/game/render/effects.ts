import { Container, Sprite } from 'pixi.js'
import type { Texture } from 'pixi.js'

export interface EffectSpec {
  /** Played in order across the effect's life; a single texture stays for its whole life. */
  readonly frames: readonly Texture[]
  readonly x: number
  readonly y: number
  readonly life: number
  readonly rotation?: number
  readonly scaleFrom: number
  readonly scaleTo: number
  readonly alphaFrom?: number
  readonly alphaTo?: number
  readonly vx?: number
  readonly vy?: number
  readonly spin?: number
  readonly tint?: number
}

interface Slot {
  readonly sprite: Sprite
  frames: readonly Texture[]
  age: number
  life: number
  vx: number
  vy: number
  spin: number
  scaleFrom: number
  scaleTo: number
  alphaFrom: number
  alphaTo: number
}

/**
 * A fixed pool of short-lived sprites. Spawning never allocates; when the pool is full the
 * oldest effect is recycled, which keeps a burst of explosions from growing memory.
 */
export class EffectLayer {
  readonly container = new Container()
  private readonly slots: Slot[] = []
  private next = 0

  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite()
      sprite.anchor.set(0.5)
      sprite.visible = false
      this.container.addChild(sprite)
      this.slots.push({
        sprite,
        frames: [],
        age: 0,
        life: 0,
        vx: 0,
        vy: 0,
        spin: 0,
        scaleFrom: 1,
        scaleTo: 1,
        alphaFrom: 1,
        alphaTo: 1,
      })
    }
  }

  spawn(spec: EffectSpec): void {
    const slot = this.pickSlot()
    const first = spec.frames[0]
    if (slot === undefined || first === undefined) return

    slot.frames = spec.frames
    slot.age = 0
    slot.life = spec.life
    slot.vx = spec.vx ?? 0
    slot.vy = spec.vy ?? 0
    slot.spin = spec.spin ?? 0
    slot.scaleFrom = spec.scaleFrom
    slot.scaleTo = spec.scaleTo
    slot.alphaFrom = spec.alphaFrom ?? 1
    slot.alphaTo = spec.alphaTo ?? 0

    const sprite = slot.sprite
    sprite.texture = first
    sprite.position.set(spec.x, spec.y)
    sprite.rotation = spec.rotation ?? 0
    sprite.tint = spec.tint ?? 0xffffff
    sprite.scale.set(spec.scaleFrom)
    sprite.alpha = slot.alphaFrom
    sprite.visible = true
  }

  update(dt: number): void {
    for (const slot of this.slots) {
      const sprite = slot.sprite
      if (!sprite.visible) continue
      slot.age += dt
      if (slot.age >= slot.life) {
        sprite.visible = false
        continue
      }
      const t = slot.age / slot.life
      const frame = slot.frames[Math.min(slot.frames.length - 1, Math.floor(t * slot.frames.length))]
      if (frame !== undefined && sprite.texture !== frame) sprite.texture = frame
      sprite.x += slot.vx * dt
      sprite.y += slot.vy * dt
      sprite.rotation += slot.spin * dt
      sprite.scale.set(slot.scaleFrom + (slot.scaleTo - slot.scaleFrom) * t)
      sprite.alpha = slot.alphaFrom + (slot.alphaTo - slot.alphaFrom) * t
    }
  }

  clear(): void {
    for (const slot of this.slots) slot.sprite.visible = false
  }

  private pickSlot(): Slot | undefined {
    // Prefer a free slot; otherwise recycle round-robin, which is roughly the oldest.
    for (let i = 0; i < this.slots.length; i++) {
      const index = (this.next + i) % this.slots.length
      const slot = this.slots[index]
      if (slot !== undefined && !slot.sprite.visible) {
        this.next = (index + 1) % this.slots.length
        return slot
      }
    }
    const recycled = this.slots[this.next]
    this.next = (this.next + 1) % this.slots.length
    return recycled
  }
}
