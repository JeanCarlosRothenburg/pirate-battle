import type { ArenaConfig, SpawnConfig } from '../config/gameConfig'
import { distanceSquared } from '../sim/mathUtils'
import type { Rng } from '../sim/rng'
import type { ShipKind } from '../sim/types'
import { isFreeWater } from './collision'

export interface SpawnPoint {
  readonly x: number
  readonly y: number
  readonly angle: number
}

export function pickEnemyKind(rng: Rng, spawn: SpawnConfig): Exclude<ShipKind, 'player'> {
  const total = spawn.weights.chaser + spawn.weights.shooter
  if (total <= 0) return 'chaser'
  return rng.next() * total < spawn.weights.chaser ? 'chaser' : 'shooter'
}

/**
 * Rejection sampling: a spawn point must sit in open water, clear of islands by a
 * margin, and far enough from the player that the spawn cannot deal unavoidable damage.
 */
export function findSpawnPoint(
  rng: Rng,
  arena: ArenaConfig,
  spawn: SpawnConfig,
  radius: number,
  playerX: number,
  playerY: number,
): SpawnPoint | null {
  const clearance = radius + spawn.minDistanceFromIslands
  const minDistanceSq = spawn.minDistanceFromPlayer * spawn.minDistanceFromPlayer

  for (let attempt = 0; attempt < spawn.placementAttempts; attempt++) {
    const x = rng.range(clearance, arena.width - clearance)
    const y = rng.range(clearance, arena.height - clearance)
    if (distanceSquared(x, y, playerX, playerY) < minDistanceSq) continue
    if (!isFreeWater(x, y, clearance, arena)) continue
    return { x, y, angle: Math.atan2(playerY - y, playerX - x) }
  }
  return null
}
