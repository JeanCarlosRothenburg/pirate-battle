import { fitLetterbox } from '../render/letterbox'
import { NEUTRAL_INTENT } from '../sim/types'
import type { MutableIntent } from '../sim/types'
import { PointerSteering } from './pointer'

function move(x: number, y: number): Event {
  return Object.assign(new Event('pointermove'), { offsetX: x, offsetY: y })
}

describe('PointerSteering', () => {
  // 1:1 mapping between screen and arena keeps the numbers readable.
  const box = fitLetterbox(1600, 900, 1600, 900)
  let surface: EventTarget
  let pointer: PointerSteering
  let intent: MutableIntent

  beforeEach(() => {
    surface = new EventTarget()
    pointer = new PointerSteering(surface)
    intent = { ...NEUTRAL_INTENT }
  })

  afterEach(() => pointer.dispose())

  it('does not steer before the pointer has moved', () => {
    pointer.apply(intent, box)
    expect(intent.steerTo).toBe(false)
  })

  it('steers toward the pointer in arena coordinates', () => {
    surface.dispatchEvent(move(300, 200))
    pointer.apply(intent, box)
    expect(intent).toMatchObject({ steerTo: true, steerX: 300, steerY: 200 })
  })

  it('converts through the letterbox', () => {
    surface.dispatchEvent(move(500, 500))
    pointer.apply(intent, fitLetterbox(1000, 1000, 1600, 900))
    expect(intent.steerX).toBeCloseTo(800)
    expect(intent.steerY).toBeCloseTo(450)
  })

  it('yields to keyboard turning and resumes only when the pointer moves again', () => {
    surface.dispatchEvent(move(300, 200))
    intent.turn = 1
    pointer.apply(intent, box)
    expect(intent.steerTo).toBe(false)

    intent.turn = 0
    pointer.apply(intent, box)
    expect(intent.steerTo).toBe(false)

    surface.dispatchEvent(move(310, 210))
    pointer.apply(intent, box)
    expect(intent).toMatchObject({ steerTo: true, steerX: 310, steerY: 210 })
  })

  it('stops listening after dispose', () => {
    pointer.dispose()
    surface.dispatchEvent(move(300, 200))
    pointer.apply(intent, box)
    expect(intent.steerTo).toBe(false)
  })
})
