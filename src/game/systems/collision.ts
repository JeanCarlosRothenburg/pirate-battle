import type { ArenaConfig, IslandShape } from '../config/gameConfig'
import { clamp, distanceSquared } from '../sim/mathUtils'

export function circleHitsIsland(x: number, y: number, radius: number, island: IslandShape): boolean {
  return penetrationDepth(x, y, radius, island) > 0
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

export interface SurfaceNormal {
  nx: number
  ny: number
}

/**
 * Unit normal of an island's surface facing the point (x, y), pointing out of the island.
 * Circles: from the centre to the point. Rectangles: from the nearest point on the
 * rectangle to the point, or, when the point is inside, along the axis of shallowest
 * penetration.
 */
export function surfaceNormal(
  x: number,
  y: number,
  island: IslandShape,
  out: SurfaceNormal = { nx: 0, ny: 0 },
): SurfaceNormal {
  if (island.kind === 'circle') return normalise(x - island.x, y - island.y, out)

  const right = island.x + island.width
  const bottom = island.y + island.height
  const inside = x >= island.x && x <= right && y >= island.y && y <= bottom
  if (!inside) return normalise(x - clamp(x, island.x, right), y - clamp(y, island.y, bottom), out)

  const toLeft = x - island.x
  const toRight = right - x
  const toTop = y - island.y
  const toBottom = bottom - y
  const shallowest = Math.min(toLeft, toRight, toTop, toBottom)
  out.nx = shallowest === toLeft ? -1 : shallowest === toRight ? 1 : 0
  out.ny = out.nx !== 0 ? 0 : shallowest === toTop ? -1 : 1
  return out
}

/** How deep a circle overlaps an island; zero or negative when it does not. */
export function penetrationDepth(x: number, y: number, radius: number, island: IslandShape): number {
  if (island.kind === 'circle') {
    return radius + island.radius - Math.sqrt(distanceSquared(x, y, island.x, island.y))
  }
  const right = island.x + island.width
  const bottom = island.y + island.height
  if (x >= island.x && x <= right && y >= island.y && y <= bottom) {
    return radius + Math.min(x - island.x, right - x, y - island.y, bottom - y)
  }
  const nearestX = clamp(x, island.x, island.x + island.width)
  const nearestY = clamp(y, island.y, island.y + island.height)
  return radius - Math.sqrt(distanceSquared(x, y, nearestX, nearestY))
}

export interface MoveResult {
  x: number
  y: number
  contact: boolean
  nx: number
  ny: number
  contactX: number
  contactY: number
  impact: number
}

export function createMoveResult(): MoveResult {
  return { x: 0, y: 0, contact: false, nx: 0, ny: 0, contactX: 0, contactY: 0, impact: 0 }
}

const SKIN = 1e-6
const DEPENETRATION_PASSES = 3
const ENTRY_SEARCH_STEPS = 14
const normalScratch: SurfaceNormal = { nx: 0, ny: 0 }

/**
 * Moves a circle by (dx, dy) and slides it along the first island it would enter. The result
 * holds the new position and, when the move touched an island, the surface normal (pointing
 * out of the island), the contact point on its surface, and the impact: the length of the
 * movement removed along the normal. Depenetration keeps a tiny skin of clearance so the
 * next overlap test starts in free water.
 *
 * 1. A circle that starts inside an island is pushed out along the surface normal.
 * 2. The move advances to the moment it would first enter an island.
 * 3. The rest of the move loses its component along the contact normal and keeps the
 *    tangential part, `slide = move - n * dot(move, n)`, scaled by `friction`
 *    (1 keeps it all). Because the tangent is taken from the move itself, a ship angled
 *    toward one side of an island scrapes toward that side, and a head-on move stops.
 * 4. If the slid position still collides (a concave pocket between islands), the circle
 *    stays where it started the step.
 *
 * Moves are a few pixels per step against radii of 20 px or more, so the swept test only
 * needs the end position to detect an entry; the entry time is then found by bisection.
 * Arena bounds clamp afterwards, which slides along the axis-aligned walls.
 */
export function resolveCircleMove(
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
  arena: ArenaConfig,
  friction = 1,
  out: MoveResult = createMoveResult(),
): MoveResult {
  let px = x
  let py = y
  for (let pass = 0; pass < DEPENETRATION_PASSES; pass++) {
    let pushed = false
    for (const island of arena.islands) {
      const depth = penetrationDepth(px, py, radius, island)
      if (depth <= 0) continue
      surfaceNormal(px, py, island, normalScratch)
      px += normalScratch.nx * (depth + SKIN)
      py += normalScratch.ny * (depth + SKIN)
      pushed = true
    }
    if (!pushed) break
  }

  out.contact = false
  out.nx = 0
  out.ny = 0
  out.impact = 0

  let entry = 1
  let hit: IslandShape | null = null
  for (const island of arena.islands) {
    if (penetrationDepth(px + dx, py + dy, radius, island) <= 0) continue
    const t = entryTime(px, py, dx, dy, radius, island)
    if (hit === null || t < entry) {
      entry = t
      hit = island
    }
  }

  if (hit === null) return finish(px + dx, py + dy, radius, arena, out)

  const cx = px + dx * entry
  const cy = py + dy * entry
  surfaceNormal(cx, cy, hit, normalScratch)
  const nx = normalScratch.nx
  const ny = normalScratch.ny
  const restX = dx * (1 - entry)
  const restY = dy * (1 - entry)
  const intoSurface = Math.min(0, restX * nx + restY * ny)

  out.contact = true
  out.nx = nx
  out.ny = ny
  out.contactX = cx - nx * radius
  out.contactY = cy - ny * radius
  out.impact = -intoSurface

  const slidX = cx + (restX - nx * intoSurface) * friction
  const slidY = cy + (restY - ny * intoSurface) * friction
  if (circleHitsAnyIsland(slidX, slidY, radius, arena)) return finish(px, py, radius, arena, out)
  return finish(slidX, slidY, radius, arena, out)
}

/** Latest fraction of the move that still leaves the circle outside `island`. */
function entryTime(px: number, py: number, dx: number, dy: number, radius: number, island: IslandShape): number {
  let free = 0
  let blocked = 1
  for (let i = 0; i < ENTRY_SEARCH_STEPS; i++) {
    const mid = (free + blocked) / 2
    if (penetrationDepth(px + dx * mid, py + dy * mid, radius, island) > 0) blocked = mid
    else free = mid
  }
  return free
}

function finish(x: number, y: number, radius: number, arena: ArenaConfig, out: MoveResult): MoveResult {
  out.x = clamp(x, radius, arena.width - radius)
  out.y = clamp(y, radius, arena.height - radius)
  return out
}

function normalise(dx: number, dy: number, out: SurfaceNormal): SurfaceNormal {
  const length = Math.hypot(dx, dy)
  if (length < 1e-9) {
    out.nx = 0
    out.ny = -1
    return out
  }
  out.nx = dx / length
  out.ny = dy / length
  return out
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
