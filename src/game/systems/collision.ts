import type { ArenaConfig, IslandShape } from '../config/gameConfig'
import { clamp, distanceSquared } from '../sim/mathUtils'

export function circleHitsIsland(x: number, y: number, radius: number, island: IslandShape): boolean {
  if (island.kind === 'circle') {
    const reach = radius + island.radius
    return distanceSquared(x, y, island.x, island.y) < reach * reach
  }
  const nearestX = clamp(x, island.x, island.x + island.width)
  const nearestY = clamp(y, island.y, island.y + island.height)
  return distanceSquared(x, y, nearestX, nearestY) < radius * radius
}

export function circleHitsAnyIsland(
  x: number,
  y: number,
  radius: number,
  arena: ArenaConfig,
): boolean {
  for (const island of arena.islands) {
    if (circleHitsIsland(x, y, radius, island)) return true
  }
  return false
}

export function isInsideArena(x: number, y: number, radius: number, arena: ArenaConfig): boolean {
  return x >= radius && y >= radius && x <= arena.width - radius && y <= arena.height - radius
}

export function isFreeWater(x: number, y: number, radius: number, arena: ArenaConfig): boolean {
  return isInsideArena(x, y, radius, arena) && !circleHitsAnyIsland(x, y, radius, arena)
}

export interface MoveResult {
  readonly x: number
  readonly y: number
  readonly blocked: boolean
}

/**
 * Moves a circle from its current position by (dx, dy). Blocked axes are dropped
 * individually so ships slide along island edges instead of sticking to them.
 */
export function resolveCircleMove(
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
  arena: ArenaConfig,
): MoveResult {
  const targetX = clamp(x + dx, radius, arena.width - radius)
  const targetY = clamp(y + dy, radius, arena.height - radius)

  if (!circleHitsAnyIsland(targetX, targetY, radius, arena)) {
    const blocked = targetX !== x + dx || targetY !== y + dy
    return { x: targetX, y: targetY, blocked }
  }
  if (!circleHitsAnyIsland(targetX, y, radius, arena)) {
    return { x: targetX, y, blocked: true }
  }
  if (!circleHitsAnyIsland(x, targetY, radius, arena)) {
    return { x, y: targetY, blocked: true }
  }
  return { x, y, blocked: true }
}

/**
 * Swept test between the segment travelled during one step and a circle.
 * A point test would tunnel through small targets at projectile speed.
 */
export function segmentHitsCircle(
  px: number,
  py: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  const fx = px - cx
  const fy = py - cy
  const a = dx * dx + dy * dy
  if (a === 0) return fx * fx + fy * fy <= radius * radius
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - radius * radius
  let disc = b * b - 4 * a * c
  if (disc < 0) return false
  disc = Math.sqrt(disc)
  const t1 = (-b - disc) / (2 * a)
  const t2 = (-b + disc) / (2 * a)
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1)
}

export function segmentHitsAnyIsland(
  px: number,
  py: number,
  dx: number,
  dy: number,
  radius: number,
  arena: ArenaConfig,
  samples = 4,
): boolean {
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    if (circleHitsAnyIsland(px + dx * t, py + dy * t, radius, arena)) return true
  }
  return false
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const reach = ar + br
  return distanceSquared(ax, ay, bx, by) < reach * reach
}
