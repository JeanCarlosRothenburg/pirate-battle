import type { ArenaConfig, IslandShape } from '../config/gameConfig'
import { penetrationDepth, resolveCircleMove, surfaceNormal } from './collision'

const circle: IslandShape = { kind: 'circle', x: 100, y: 100, radius: 50 }
const rect: IslandShape = { kind: 'rect', x: 100, y: 100, width: 200, height: 100 }

function arenaWith(...islands: IslandShape[]): ArenaConfig {
  return { width: 1000, height: 1000, islands, playerSpawn: { x: 0, y: 0, angle: 0 } }
}

describe('surfaceNormal', () => {
  it('points from a circle centre to the point', () => {
    const n = surfaceNormal(100, 30, circle)
    expect(n.nx).toBeCloseTo(0)
    expect(n.ny).toBeCloseTo(-1)
  })

  it('points from the nearest point of a rectangle, including around corners', () => {
    expect(surfaceNormal(200, 80, rect)).toEqual({ nx: 0, ny: -1 })
    const corner = surfaceNormal(90, 90, rect)
    expect(corner.nx).toBeCloseTo(-Math.SQRT1_2)
    expect(corner.ny).toBeCloseTo(-Math.SQRT1_2)
  })

  it('uses the axis of shallowest penetration inside a rectangle', () => {
    expect(surfaceNormal(110, 150, rect)).toEqual({ nx: -1, ny: 0 })
    expect(surfaceNormal(200, 195, rect)).toEqual({ nx: 0, ny: 1 })
  })
})

describe('resolveCircleMove', () => {
  it('moves freely in open water', () => {
    const move = resolveCircleMove(500, 500, 3, 4, 10, arenaWith(circle))
    expect(move).toMatchObject({ x: 503, y: 504, contact: false, impact: 0 })
  })

  it('keeps only the tangential part of a move into a flat face', () => {
    // Touching the rectangle's top face (y = 100) from above, moving down and right.
    const move = resolveCircleMove(200, 90, 3, 4, 10, arenaWith(rect))
    expect(move.contact).toBe(true)
    expect(move.nx).toBeCloseTo(0)
    expect(move.ny).toBeCloseTo(-1)
    expect(move.x).toBeCloseTo(203, 6)
    expect(move.y).toBeCloseTo(90, 6)
    expect(move.impact).toBeCloseTo(4, 3)
  })

  it('scales the slide by the friction factor', () => {
    const move = resolveCircleMove(200, 90, 3, 4, 10, arenaWith(rect), 0.5)
    expect(move.x).toBeCloseTo(201.5, 6)
  })

  it('stays put when the slide would enter a second island', () => {
    // A notch between two rectangles: sliding right along the floor runs into the wall.
    const floor: IslandShape = { kind: 'rect', x: 0, y: 100, width: 300, height: 50 }
    const wall: IslandShape = { kind: 'rect', x: 210, y: 0, width: 50, height: 100 }
    const move = resolveCircleMove(199.5, 89.5, 3, 3, 10, arenaWith(floor, wall))
    expect(move.x).toBeCloseTo(199.5, 6)
    expect(move.y).toBeCloseTo(89.5, 6)
    expect(penetrationDepth(move.x, move.y, 10, floor)).toBeLessThanOrEqual(0)
    expect(penetrationDepth(move.x, move.y, 10, wall)).toBeLessThanOrEqual(0)
  })
})
