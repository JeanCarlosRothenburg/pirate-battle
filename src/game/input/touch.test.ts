import { NEUTRAL_INTENT } from '../sim/types'
import type { MutableIntent } from '../sim/types'
import { TouchButtons } from './touch'

describe('TouchButtons', () => {
  let touch: TouchButtons
  let intent: MutableIntent

  beforeEach(() => {
    touch = new TouchButtons()
    touch.enabled = true
    intent = { ...NEUTRAL_INTENT }
  })

  it('holds several actions at once, so the ship can move and fire together', () => {
    touch.press('forward')
    touch.press('left')
    touch.press('fireFront')
    touch.apply(intent)
    expect(intent).toMatchObject({ throttle: 1, turn: -1, fireFront: true })
  })

  it('releases one action without affecting the others', () => {
    touch.press('forward')
    touch.press('fireRight')
    touch.release('forward')
    touch.apply(intent)
    expect(intent).toMatchObject({ throttle: 0, fireRight: true })
  })

  it('leaves keyboard turning in charge when both are used', () => {
    intent.turn = 1
    touch.press('left')
    touch.apply(intent)
    expect(intent.turn).toBe(1)
  })

  it('ignores presses outside a running match and drops held buttons when disabled', () => {
    touch.press('forward')
    touch.enabled = false
    touch.apply(intent)
    expect(intent.throttle).toBe(0)
    touch.press('fireFront')
    touch.apply(intent)
    expect(intent.fireFront).toBe(false)
  })
})
