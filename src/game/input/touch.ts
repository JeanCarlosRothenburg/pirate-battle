import type { MutableIntent } from '../sim/types'

export type TouchAction = 'forward' | 'left' | 'right' | 'fireFront' | 'fireLeft' | 'fireRight'

/**
 * On-screen buttons for touch screens. Each button holds its action while a finger is on it,
 * and several can be held at once (multi-touch), so the ship can sail, turn and fire
 * together. Buttons combine with the keyboard rather than replace it.
 *
 * Like the keyboard, presses only count while `enabled` (a match is running).
 */
export class TouchButtons {
  private readonly held = new Set<TouchAction>()
  private active = false

  get enabled(): boolean {
    return this.active
  }

  set enabled(value: boolean) {
    this.active = value
    if (!value) this.held.clear()
  }

  press(action: TouchAction): void {
    if (this.active) this.held.add(action)
  }

  release(action: TouchAction): void {
    this.held.delete(action)
  }

  releaseAll(): void {
    this.held.clear()
  }

  /** Merges held buttons into an intent the keyboard already filled. */
  apply(intent: MutableIntent): void {
    const held = this.held
    if (held.has('forward')) intent.throttle = 1
    if (intent.turn === 0) intent.turn = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    intent.fireFront ||= held.has('fireFront')
    intent.fireLeft ||= held.has('fireLeft')
    intent.fireRight ||= held.has('fireRight')
  }
}
