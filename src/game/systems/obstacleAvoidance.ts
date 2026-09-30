import type { ArenaConfig, AvoidanceConfig, IslandShape } from '../config/gameConfig'
import { TAU } from '../sim/mathUtils'

export interface SteeringResult {
  /** Heading to steer toward, in radians. */
  angle: number
  /** Danger (0–1) along the chosen heading: 0 is clear, 1 is an obstacle at point blank. */
  danger: number
}

/**
 * Obstacle avoidance by context steering (Fray, "Context Steering", Game AI Pro 2, ch. 18).
 *
 * Each call projects two concerns onto a ring of `slots` headings around the ship:
 * - interest: how much each heading leads toward the desired heading (cosine falloff), plus
 *   a small bias toward the current heading so the choice does not flip between two equal
 *   detours from one step to the next;
 * - danger: for each heading, a ray the width of the hull (the ship radius plus a margin)
 *   is cast up to `lookahead`; the nearer an island or arena wall, the higher the danger.
 *
 * Headings whose danger exceeds the lowest danger (plus a tolerance) are masked out, and the
 * most interesting remaining heading wins, refined between slots by a parabolic fit. When
 * the desired heading itself is clear, it is returned unchanged, so an unobstructed enemy
 * steers exactly as before and a Shooter's aim stays precise.
 *
 * Buffers are allocated once per instance; `steer` allocates nothing.
 */
export class ContextSteering {
  private readonly interest: Float64Array
  private readonly danger: Float64Array
  private readonly dirX: Float64Array
  private readonly dirY: Float64Array
  private readonly result: SteeringResult = { angle: 0, danger: 0 }

  constructor(private readonly config: AvoidanceConfig) {
    const slots = config.slots
    this.interest = new Float64Array(slots)
    this.danger = new Float64Array(slots)
    this.dirX = new Float64Array(slots)
    this.dirY = new Float64Array(slots)
    for (let i = 0; i < slots; i++) {
      this.dirX[i] = Math.cos((i * TAU) / slots)
      this.dirY[i] = Math.sin((i * TAU) / slots)
    }
  }

  steer(
    x: number,
    y: number,
    heading: number,
    radius: number,
    desiredAngle: number,
    /** How far away the goal is; obstacles beyond it do not block the direct line. */
    goalDistance: number,
    arena: ArenaConfig,
  ): SteeringResult {
    const cfg = this.config
    const result = this.result
    const reach = radius + cfg.margin
    const wantX = Math.cos(desiredAngle)
    const wantY = Math.sin(desiredAngle)

    // Clear straight line: nothing to arbitrate.
    const direct = rayDanger(x, y, wantX, wantY, reach, Math.min(cfg.lookahead, goalDistance), arena)
    if (direct === 0) {
      result.angle = desiredAngle
      result.danger = 0
      return result
    }

    const slots = cfg.slots
    const headX = Math.cos(heading)
    const headY = Math.sin(heading)
    let lowest = Number.POSITIVE_INFINITY
    for (let i = 0; i < slots; i++) {
      const dx = this.dirX[i] ?? 0
      const dy = this.dirY[i] ?? 0
      this.interest[i] =
        Math.max(0, dx * wantX + dy * wantY) + cfg.headingBias * Math.max(0, dx * headX + dy * headY)
      const danger = rayDanger(x, y, dx, dy, reach, cfg.lookahead, arena)
      this.danger[i] = danger
      if (danger < lowest) lowest = danger
    }

    // Mask every heading noticeably more dangerous than the safest one.
    let best = -1
    let bestInterest = -1
    for (let i = 0; i < slots; i++) {
      if ((this.danger[i] ?? 1) > lowest + cfg.dangerTolerance) this.interest[i] = 0
      const value = this.interest[i] ?? 0
      if (value > bestInterest) {
        bestInterest = value
        best = i
      }
    }

    // Every safe heading points away from the goal: take the safest heading.
    if (bestInterest <= 0) {
      for (let i = 0; i < slots; i++) if ((this.danger[i] ?? 1) === lowest) best = i
    }

    result.angle = ((best + this.subSlotOffset(best)) * TAU) / slots
    result.danger = this.danger[best] ?? 0
    return result
  }

  /** Parabolic fit through a slot and its neighbours: where the interest peak really lies. */
  private subSlotOffset(slot: number): number {
    const slots = this.config.slots
    const left = this.interest[(slot - 1 + slots) % slots] ?? 0
    const centre = this.interest[slot] ?? 0
    const right = this.interest[(slot + 1) % slots] ?? 0
    const curvature = left - 2 * centre + right
    if (curvature >= 0) return 0
    return Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curvature))
  }
}

/**
 * Danger along one heading: 1 - (distance to the first obstacle / lookahead), or 0 when the
 * way is clear. The ray is thickened to `reach` by expanding every obstacle by it.
 */
export function rayDanger(
  x: number,
  y: number,
  dx: number,
  dy: number,
  reach: number,
  lookahead: number,
  arena: ArenaConfig,
): number {
  let nearest = lookahead
  for (const island of arena.islands) {
    const t = rayToIsland(x, y, dx, dy, reach, island)
    if (t < nearest) nearest = t
  }
  const wall = rayToWalls(x, y, dx, dy, reach, arena)
  if (wall < nearest) nearest = wall
  return nearest >= lookahead ? 0 : 1 - nearest / lookahead
}

/** Distance along a unit ray to an island grown by `reach`; 0 if already inside; Infinity if missed. */
export function rayToIsland(
  x: number,
  y: number,
  dx: number,
  dy: number,
  reach: number,
  island: IslandShape,
): number {
  if (island.kind === 'circle') {
    const r = island.radius + reach
    const ox = x - island.x
    const oy = y - island.y
    const c = ox * ox + oy * oy - r * r
    if (c <= 0) return 0
    const b = ox * dx + oy * dy
    const disc = b * b - c
    if (b >= 0 || disc < 0) return Number.POSITIVE_INFINITY
    return -b - Math.sqrt(disc)
  }
  // Slab test against the rectangle grown by `reach` (slightly conservative at the corners).
  const minX = island.x - reach
  const maxX = island.x + island.width + reach
  const minY = island.y - reach
  const maxY = island.y + island.height + reach
  if (x >= minX && x <= maxX && y >= minY && y <= maxY) return 0
  let near = 0
  let far = Number.POSITIVE_INFINITY
  if (Math.abs(dx) < 1e-12) {
    if (x < minX || x > maxX) return Number.POSITIVE_INFINITY
  } else {
    const t1 = (minX - x) / dx
    const t2 = (maxX - x) / dx
    near = Math.max(near, Math.min(t1, t2))
    far = Math.min(far, Math.max(t1, t2))
  }
  if (Math.abs(dy) < 1e-12) {
    if (y < minY || y > maxY) return Number.POSITIVE_INFINITY
  } else {
    const t1 = (minY - y) / dy
    const t2 = (maxY - y) / dy
    near = Math.max(near, Math.min(t1, t2))
    far = Math.min(far, Math.max(t1, t2))
  }
  return near <= far ? near : Number.POSITIVE_INFINITY
}

/** Distance along a unit ray until the ship's edge (radius `reach`) would meet an arena wall. */
function rayToWalls(x: number, y: number, dx: number, dy: number, reach: number, arena: ArenaConfig): number {
  let t = Number.POSITIVE_INFINITY
  if (dx > 0) t = Math.min(t, (arena.width - reach - x) / dx)
  else if (dx < 0) t = Math.min(t, (reach - x) / dx)
  if (dy > 0) t = Math.min(t, (arena.height - reach - y) / dy)
  else if (dy < 0) t = Math.min(t, (reach - y) / dy)
  return Math.max(0, t)
}
