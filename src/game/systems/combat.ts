import type { ProjectileConfig, SideWeaponConfig, WeaponConfig } from '../config/gameConfig'
import type { Faction, Projectile, Ship } from '../sim/types'

export interface ProjectileSpawn {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly faction: Faction
  readonly config: ProjectileConfig
}

export function initProjectile(projectile: Projectile, id: number, spawn: ProjectileSpawn): void {
  projectile.id = id
  projectile.faction = spawn.faction
  projectile.x = spawn.x
  projectile.y = spawn.y
  projectile.prevX = spawn.x
  projectile.prevY = spawn.y
  projectile.vx = Math.cos(spawn.angle) * spawn.config.speed
  projectile.vy = Math.sin(spawn.angle) * spawn.config.speed
  projectile.radius = spawn.config.radius
  projectile.damage = spawn.config.damage
  projectile.remainingLife = spawn.config.lifetime
  projectile.alive = true
}

export function frontShots(ship: Ship, weapon: WeaponConfig, out: ProjectileSpawn[]): void {
  out.length = 0
  out.push({
    x: ship.x + Math.cos(ship.angle) * weapon.muzzleOffset,
    y: ship.y + Math.sin(ship.angle) * weapon.muzzleOffset,
    angle: ship.angle,
    faction: ship.faction,
    config: weapon.projectile,
  })
}

/**
 * Parallel broadside: barrels are spread along the hull, all firing perpendicular
 * to the ship heading.
 */
export function sideShots(
  ship: Ship,
  weapon: SideWeaponConfig,
  side: 'left' | 'right',
  out: ProjectileSpawn[],
): void {
  out.length = 0
  const fireAngle = ship.angle + (side === 'left' ? -Math.PI / 2 : Math.PI / 2)
  const alongX = Math.cos(ship.angle)
  const alongY = Math.sin(ship.angle)
  const outX = Math.cos(fireAngle)
  const outY = Math.sin(fireAngle)
  const first = -((weapon.barrelCount - 1) / 2)
  for (let i = 0; i < weapon.barrelCount; i++) {
    const offset = (first + i) * weapon.barrelSpacing
    out.push({
      x: ship.x + alongX * offset + outX * weapon.muzzleOffset,
      y: ship.y + alongY * offset + outY * weapon.muzzleOffset,
      angle: fireAngle,
      faction: ship.faction,
      config: weapon.projectile,
    })
  }
}

export function applyDamage(ship: Ship, amount: number): boolean {
  if (!ship.alive) return false
  ship.hp = Math.max(0, ship.hp - amount)
  ship.hitFlash = 0.15
  if (ship.hp === 0) {
    ship.alive = false
    return true
  }
  return false
}
