import type { ChaserConfig, GameConfig, ShooterConfig } from '../config/gameConfig'
import { angleDelta, distance } from '../sim/mathUtils'
import type { Ship, ShipKind } from '../sim/types'

export type EnemyKind = Exclude<ShipKind, 'player'>

export interface EnemyDecision {
  readonly targetAngle: number
  readonly throttle: number
  readonly wantsToFire: boolean
}

type Behaviour = (enemy: Ship, player: Ship, config: GameConfig) => EnemyDecision

const BEHAVIOURS: Readonly<Record<EnemyKind, Behaviour>> = {
  chaser: (enemy, player) => ({ targetAngle: bearing(enemy, player), throttle: 1, wantsToFire: false }),
  shooter: (enemy, player, { shooter }) => {
    const targetAngle = bearing(enemy, player)
    const gap = distance(enemy.x, enemy.y, player.x, player.y)
    const aimed = Math.abs(angleDelta(enemy.angle, targetAngle)) <= shooter.aimTolerance
    return {
      targetAngle,
      throttle: gap > shooter.preferredRange ? 1 : 0,
      wantsToFire: gap <= shooter.attackRange && aimed,
    }
  },
}

/**
 * Decides an enemy's next move with the behaviour of its kind (Strategy): the heading it
 * wants, a throttle from 0 (hold) to 1 (full ahead), and whether it fires. Ships only sail
 * forward.
 *
 * - Chaser: heads straight for the player at full speed; it damages by ramming, never fires.
 * - Shooter: closes in until its preferred range, then holds and keeps turning to aim. It
 *   fires only within attack range and while its bow points at the player (within
 *   `aimTolerance`), since its gun fires along the bow.
 */
export function decideEnemy(enemy: Ship, player: Ship, config: GameConfig): EnemyDecision {
  return BEHAVIOURS[enemy.kind === 'shooter' ? 'shooter' : 'chaser'](enemy, player, config)
}

/** The stats block of an enemy kind. */
export function enemyStats(kind: EnemyKind, config: GameConfig): ChaserConfig | ShooterConfig {
  return kind === 'chaser' ? config.chaser : config.shooter
}

function bearing(from: Ship, to: Ship): number {
  return Math.atan2(to.y - from.y, to.x - from.x)
}
