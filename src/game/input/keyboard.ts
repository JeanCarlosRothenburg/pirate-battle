import { NEUTRAL_INTENT } from '../sim/types'
import type { MutableIntent } from '../sim/types'

type HeldAction = 'forward' | 'left' | 'right' | 'fireFront' | 'fireLeft' | 'fireRight'
export type InputCommand = 'pause' | 'toggleMute'

/** Bound by physical key position (`KeyboardEvent.code`), so WASD works on any layout. */
const HELD_BINDINGS: Readonly<Record<string, HeldAction>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
}

const COMMAND_BINDINGS: Readonly<Record<string, InputCommand>> = {
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'toggleMute',
}

/**
 * Tracks held keys and folds them into an `InputIntent`. `read()` reuses one object,
 * so polling it every frame allocates nothing.
 *
 * Game keys are only captured while `enabled`: while a match is paused, over or not yet
 * started, every key reaches the page untouched, so menus and dialogs work normally.
 */
export class KeyboardInput {
  onCommand: ((command: InputCommand) => void) | null = null

  private active = false

  private readonly held = new Set<HeldAction>()
  private readonly intent: MutableIntent = { ...NEUTRAL_INTENT }

  constructor(
    private readonly keyTarget: EventTarget,
    private readonly focusTarget: EventTarget = keyTarget,
  ) {
    keyTarget.addEventListener('keydown', this.handleKeyDown)
    keyTarget.addEventListener('keyup', this.handleKeyUp)
    focusTarget.addEventListener('blur', this.clear)
  }

  /**
   * Refreshes the keyboard fields of the shared intent and returns it. Steering fields are
   * left for the pointer source to fill in.
   */
  read(): MutableIntent {
    const held = this.held
    this.intent.throttle = held.has('forward') ? 1 : 0
    this.intent.turn = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    this.intent.fireFront = held.has('fireFront')
    this.intent.fireLeft = held.has('fireLeft')
    this.intent.fireRight = held.has('fireRight')
    return this.intent
  }

  get enabled(): boolean {
    return this.active
  }

  set enabled(value: boolean) {
    this.active = value
    if (!value) this.held.clear()
  }

  /** Releases every held key, e.g. when the window loses focus mid-press. */
  readonly clear = (): void => {
    this.held.clear()
  }

  dispose(): void {
    this.keyTarget.removeEventListener('keydown', this.handleKeyDown)
    this.keyTarget.removeEventListener('keyup', this.handleKeyUp)
    this.focusTarget.removeEventListener('blur', this.clear)
    this.held.clear()
    this.onCommand = null
  }

  private readonly handleKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent
    if (!this.active || isEditableTarget(key.target)) return

    const action = HELD_BINDINGS[key.code]
    if (action !== undefined) {
      key.preventDefault()
      this.held.add(action)
      return
    }

    const command = COMMAND_BINDINGS[key.code]
    if (command !== undefined) {
      key.preventDefault()
      if (!key.repeat) this.onCommand?.(command)
    }
  }

  private readonly handleKeyUp = (event: Event): void => {
    const action = HELD_BINDINGS[(event as KeyboardEvent).code]
    if (action !== undefined) this.held.delete(action)
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}
