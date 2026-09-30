import type { ArenaConfig, AvoidanceConfig, IslandShape } from '../config/gameConfig'
import { DEFAULT_GAME_CONFIG } from '../config/gameConfig'
import { angleDelta } from '../sim/mathUtils'
import { ContextSteering, rayDanger, rayToIsland } from './obstacleAvoidance'

const circle: IslandShape = { kind: 'circle', x: 500, y: 500, radius: 50 }
const rect: IslandShape = { kind: 'rect', x: 400, y: 400, width: 200, height: 100 }
const avoidance: AvoidanceConfig = DEFAULT_GAME_CONFIG.avoidance

function arenaWith(...islands: IslandShape[]): ArenaConfig {
  return { width: 1000, height: 1000, islands, playerSpawn: { x: 0, y: 0, angle: 0 } }
}

describe('rayToIsland', () => {
  it('measures the distance to a circle grown by the reach', () => {
    expect(rayToIsland(300, 500, 1, 0, 10, circle)).toBeCloseTo(140)
    expect(rayToIsland(300, 500, -1, 0, 10, circle)).toBe(Number.POSITIVE_INFINITY)
    expect(rayToIsland(300, 600, 1, 0, 10, circle)).toBe(Number.POSITIVE_INFINITY)
  })

  it('measures the distance to a rectangle grown by the reach', () => {
    expect(rayToIsland(300, 450, 1, 0, 10, rect)).toBeCloseTo(90)
    expect(rayToIsland(500, 300, 0, 1, 10, rect)).toBeCloseTo(90)
    expect(rayToIsland(300, 300, 1, 0, 10, rect)).toBe(Number.POSITIVE_INFINITY)
    expect(rayToIsland(450, 450, 1, 0, 10, rect)).toBe(0)
  })
})

describe('rayDanger', () => {
  it('is 0 beyond the lookahead and grows as obstacles get closer', () => {
    const arena = arenaWith(circle)
    expect(rayDanger(100, 500, 1, 0, 10, 170, arena)).toBe(0)
    const far = rayDanger(300, 500, 1, 0, 10, 170, arena)
    const near = rayDanger(400, 500, 1, 0, 10, 170, arena)
    expect(far).toBeGreaterThan(0)
    expect(near).toBeGreaterThan(far)
  })
})

describe('ContextSteering', () => {
  it('keeps the desired heading exactly when the way is clear', () => {
    const steering = new ContextSteering(avoidance)
    const result = steering.steer(100, 100, 0, 20, 0.3217, 300, arenaWith(circle))
    expect(result.angle).toBe(0.3217)
    expect(result.danger).toBe(0)
  })

  it('ignores obstacles beyond the goal', () => {
    const steering = new ContextSteering(avoidance)
    // The goal is 60 px ahead; the island starts about 110 px ahead.
    const result = steering.steer(360, 500, 0, 20, 0, 60, arenaWith(circle))
    expect(result.angle).toBe(0)
  })

  it('detours around an island toward the side the ship already leans to', () => {
    const arena = arenaWith(circle)
    const up = new ContextSteering(avoidance).steer(370, 500, -0.1, 20, 0, 400, arena)
    const upAngle = up.angle
    const down = new ContextSteering(avoidance).steer(370, 500, 0.1, 20, 0, 400, arena)
    expect(angleDelta(0, upAngle)).toBeLessThan(0)
    expect(angleDelta(0, down.angle)).toBeGreaterThan(0)
    expect(angleDelta(0, upAngle)).toBeCloseTo(-angleDelta(0, down.angle), 6)
  })
})
