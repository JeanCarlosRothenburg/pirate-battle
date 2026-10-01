import { fitLetterbox, screenToArena } from './letterbox'

describe('letterbox', () => {
  it('fits the arena by its limiting side and centres the other', () => {
    const box = fitLetterbox(1000, 1000, 1600, 900)
    expect(box.scale).toBeCloseTo(0.625)
    expect(box.offsetX).toBeCloseTo(0)
    expect(box.offsetY).toBeCloseTo((1000 - 900 * 0.625) / 2)
  })

  it('maps screen points back to arena coordinates', () => {
    const box = fitLetterbox(1000, 1000, 1600, 900)
    const point = screenToArena(box, 500, 500, { x: 0, y: 0 })
    expect(point.x).toBeCloseTo(800)
    expect(point.y).toBeCloseTo(450)
  })
})
