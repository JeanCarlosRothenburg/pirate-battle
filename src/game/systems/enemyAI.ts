import type { ChaserConfig, ShooterConfig } from '../config/gameConfig'
import { distance } from '../sim/mathUtils'
import type { Ship } from '../sim/types'

export interface EnemyDecision {
  readonly targetAngle: number
  /** 0 (hold) to 1 (full ahead). */
  readonly throttle: number
  readonly wantsToFire: boolean
}

export function decideChaser(enemy: Ship, player: Ship, _config: ChaserConfig): EnemyDecision {
  const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x)
  return { targetAngle, throttle: 1, wantsToFire: false }
}

export function decideShooter(enemy: Ship, player: Ship, config: ShooterConfig): EnemyDecision {
  const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x)
  const gap = distance(enemy.x, enemy.y, player.x, player.y)

  // Ships only sail forward: close in until the preferred range, then hold and keep aiming.
  const throttle = gap > config.preferredRange ? 1 : 0

  return { targetAngle, throttle, wantsToFire: gap <= config.attackRange }
}
