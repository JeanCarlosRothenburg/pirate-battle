import type { Letterbox } from '../render/letterbox'
import { screenToArena } from '../render/letterbox'
import type { MutableIntent } from '../sim/types'

/**
 * slither.io-style steering: the ship turns toward wherever the pointer is over the arena.
 *
 * The pointer is tracked in the canvas's CSS pixels and converted to arena coordinates each
 * frame, so a resize or letterbox change between events is still mapped correctly.
 *
 * Keyboard turning wins: while A/D (or ←/→) is held, the pointer is suspended, and it only
 * takes over again on its next movement. Otherwise, releasing the key would swing the ship
 * back toward a stale pointer position.
 */
export class PointerSteering {
  private hasPoint = false
  private active = false
  private screenX = 0
  private screenY = 0
  private readonly arenaPoint = { x: 0, y: 0 }

  constructor(private readonly surface: EventTarget) {
    surface.addEventListener('pointermove', this.handleMove)
    surface.addEventListener('pointerdown', this.handleMove)
  }

  /** Fills the steering fields of `intent` from the latest pointer position. */
  apply(intent: MutableIntent, box: Letterbox): void {
    if (intent.turn !== 0) this.active = false
    intent.steerTo = this.active && this.hasPoint
    if (!intent.steerTo) return
    screenToArena(box, this.screenX, this.screenY, this.arenaPoint)
    intent.steerX = this.arenaPoint.x
    intent.steerY = this.arenaPoint.y
  }

  dispose(): void {
    this.surface.removeEventListener('pointermove', this.handleMove)
    this.surface.removeEventListener('pointerdown', this.handleMove)
  }

  private readonly handleMove = (event: Event): void => {
    const pointer = event as PointerEvent
    this.screenX = pointer.offsetX
    this.screenY = pointer.offsetY
    this.hasPoint = true
    this.active = true
  }
}
