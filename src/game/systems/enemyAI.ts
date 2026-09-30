import type { ChaserConfig, ShooterConfig } from '../config/gameConfig'
import { distance } from '../sim/mathUtils'
import type { Ship } from '../sim/types'

export interface EnemyDecision {
  readonly targetAngle: number
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

  let throttle = 0
  if (gap > config.preferredRange) throttle = 1
  else if (gap < config.preferredRange * 0.6) throttle = -0.6

  return { targetAngle, throttle, wantsToFire: gap <= config.attackRange }
}
