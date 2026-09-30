export interface ArenaConfig {
  readonly width: number
  readonly height: number
  readonly islands: readonly IslandShape[]
  readonly playerSpawn: { readonly x: number; readonly y: number; readonly angle: number }
}

export type IslandShape =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly radius: number }
  | {
      readonly kind: 'rect'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    }

export interface ProjectileConfig {
  readonly speed: number
  readonly damage: number
  readonly radius: number
  readonly lifetime: number
}

export interface WeaponConfig {
  readonly cooldown: number
  readonly muzzleOffset: number
  readonly projectile: ProjectileConfig
}

export interface SideWeaponConfig extends WeaponConfig {
  readonly barrelSpacing: number
  readonly barrelCount: number
}

export interface PlayerConfig {
  readonly maxHp: number
  readonly radius: number
  readonly speed: number
  readonly acceleration: number
  readonly turnRate: number
  readonly frontWeapon: WeaponConfig
  readonly sideWeapon: SideWeaponConfig
}

export interface ChaserConfig {
  readonly maxHp: number
  readonly radius: number
  readonly speed: number
  readonly turnRate: number
  readonly contactDamage: number
}

export interface ShooterConfig {
  readonly maxHp: number
  readonly radius: number
  readonly speed: number
  readonly turnRate: number
  readonly attackRange: number
  readonly preferredRange: number
  readonly weapon: WeaponConfig
}

export interface SpawnConfig {
  readonly intervalSeconds: number
  readonly firstSpawnDelay: number
  readonly maxAliveEnemies: number
  readonly minDistanceFromPlayer: number
  readonly minDistanceFromIslands: number
  readonly placementAttempts: number
  readonly weights: { readonly chaser: number; readonly shooter: number }
}

/**
 * Drag while a hull scrapes an island, as the fraction of tangential speed lost per second.
 * Each contact step keeps `1 - hullFriction * dt` of the sliding motion, and of the stored
 * speed. 0 slides freely; 60 stops the ship on contact at the fixed 1/60 s step.
 */
export interface HullFrictionConfig {
  readonly player: number
  readonly enemy: number
}

/** Enemy obstacle avoidance by context steering; see `systems/obstacleAvoidance.ts`. */
export interface AvoidanceConfig {
  /** Headings sampled around the ship. More slots, finer detours, more ray casts per step. */
  readonly slots: number
  /** How far ahead islands and walls are seen, in px. */
  readonly lookahead: number
  /** Clearance kept beyond the hull radius, in px. */
  readonly margin: number
  /** Extra interest toward the current heading (0–1), so detours do not flip side. */
  readonly headingBias: number
  /** Headings within this much of the safest heading's danger (0–1) stay eligible. */
  readonly dangerTolerance: number
  /** Share of throttle given up at full danger (0–1), so ships turn tighter near islands. */
  readonly slowdown: number
}

export interface GameConfig {
  readonly sessionSeconds: number
  readonly arena: ArenaConfig
  readonly player: PlayerConfig
  readonly chaser: ChaserConfig
  readonly shooter: ShooterConfig
  readonly spawn: SpawnConfig
  readonly hullFriction: HullFrictionConfig
  readonly avoidance: AvoidanceConfig
}

export const DEFAULT_ARENA: ArenaConfig = {
  width: 1600,
  height: 900,
  islands: [
    { kind: 'circle', x: 420, y: 250, radius: 105 },
    { kind: 'circle', x: 1220, y: 640, radius: 125 },
    { kind: 'circle', x: 800, y: 450, radius: 80 },
    { kind: 'rect', x: 180, y: 640, width: 260, height: 140 },
    { kind: 'rect', x: 1180, y: 160, width: 220, height: 120 },
  ],
  playerSpawn: { x: 260, y: 470, angle: -Math.PI / 4 },
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  sessionSeconds: 120,
  arena: DEFAULT_ARENA,
  player: {
    maxHp: 100,
    radius: 26,
    speed: 190,
    acceleration: 480,
    turnRate: 2.3,
    frontWeapon: {
      cooldown: 0.45,
      muzzleOffset: 30,
      projectile: { speed: 540, damage: 25, radius: 6, lifetime: 1.6 },
    },
    sideWeapon: {
      cooldown: 0.95,
      muzzleOffset: 18,
      barrelSpacing: 20,
      barrelCount: 3,
      projectile: { speed: 470, damage: 20, radius: 6, lifetime: 1.3 },
    },
  },
  chaser: {
    maxHp: 40,
    radius: 22,
    speed: 155,
    turnRate: 2.7,
    contactDamage: 20,
  },
  shooter: {
    maxHp: 65,
    radius: 24,
    speed: 115,
    turnRate: 1.8,
    attackRange: 390,
    preferredRange: 300,
    weapon: {
      cooldown: 1.7,
      muzzleOffset: 26,
      projectile: { speed: 390, damage: 10, radius: 6, lifetime: 1.4 },
    },
  },
  spawn: {
    intervalSeconds: 3,
    firstSpawnDelay: 1.5,
    maxAliveEnemies: 18,
    minDistanceFromPlayer: 420,
    minDistanceFromIslands: 40,
    placementAttempts: 40,
    weights: { chaser: 0.5, shooter: 0.5 },
  },
  hullFriction: {
    // Scraping costs the player about 2.5 % of speed per step: the hull noticeably grinds,
    // but with the throttle held the ship keeps about 97 % of cruise speed along the shore.
    player: 1.5,
    // Enemies scrape a little harder, so a pursuer rounding an island visibly loses ground
    // and the player can use islands to break contact.
    enemy: 2.5,
  },
  avoidance: {
    // 16 headings (22.5° apart), refined between slots, are plenty at these turn rates.
    slots: 16,
    // About one second of Chaser travel: enough warning to turn at 2.7 rad/s, short enough
    // that islands far behind the player do not bend the chase.
    lookahead: 170,
    margin: 10,
    headingBias: 0.2,
    dangerTolerance: 0.1,
    slowdown: 0.4,
  },
}

export interface TunableOptions {
  readonly sessionSeconds: number
  readonly spawnIntervalSeconds: number
}

export function buildConfig(options: TunableOptions, base: GameConfig = DEFAULT_GAME_CONFIG): GameConfig {
  return {
    ...base,
    sessionSeconds: options.sessionSeconds,
    spawn: { ...base.spawn, intervalSeconds: options.spawnIntervalSeconds },
  }
}

export function configFingerprint(config: GameConfig): string {
  const parts = [
    config.sessionSeconds,
    config.spawn.intervalSeconds,
    config.spawn.weights.chaser,
    config.player.maxHp,
    config.player.speed,
    config.chaser.maxHp,
    config.shooter.maxHp,
    config.arena.width,
    config.arena.height,
    config.hullFriction.player,
    config.hullFriction.enemy,
    config.avoidance.lookahead,
    config.avoidance.slots,
  ]
  let hash = 2166136261
  const source = parts.join(':')
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
