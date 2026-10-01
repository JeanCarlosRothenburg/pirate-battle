export type ShipKind = 'player' | 'chaser' | 'shooter'
export type Faction = 'player' | 'enemy'
export type MatchPhase = 'idle' | 'running' | 'paused' | 'ended'
export type EndReason = 'time' | 'death'
export type DeathCause = 'projectile' | 'selfDestruct'

export interface Ship {
  id: number
  kind: ShipKind
  faction: Faction
  x: number
  y: number
  prevX: number
  prevY: number
  angle: number
  prevAngle: number
  speed: number
  hp: number
  maxHp: number
  radius: number
  alive: boolean
  frontCooldown: number
  sideCooldown: number
  hitFlash: number
}

export interface Projectile {
  id: number
  faction: Faction
  x: number
  y: number
  prevX: number
  prevY: number
  vx: number
  vy: number
  radius: number
  damage: number
  remainingLife: number
  alive: boolean
}

export interface InputIntent {
  readonly throttle: number
  readonly turn: number
  readonly steerTo: boolean
  readonly steerX: number
  readonly steerY: number
  readonly fireFront: boolean
  readonly fireLeft: boolean
  readonly fireRight: boolean
}

export type MutableIntent = { -readonly [K in keyof InputIntent]: InputIntent[K] }

export const NEUTRAL_INTENT: InputIntent = {
  throttle: 0,
  turn: 0,
  steerTo: false,
  steerX: 0,
  steerY: 0,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
}

export type Weapon = 'front' | 'side'

export type HitSurface = 'ship' | 'island'

export type SimEvent =
  | { type: 'shot'; faction: Faction; weapon: Weapon; x: number; y: number; angle: number }
  | { type: 'hit'; x: number; y: number; faction: Faction; surface: HitSurface }
  | { type: 'explosion'; x: number; y: number; angle: number; kind: ShipKind }
  | { type: 'scrape'; faction: Faction; x: number; y: number; strength: number }
  | { type: 'playerDamaged'; amount: number; hp: number }
  | { type: 'enemyKilled'; kind: ShipKind; cause: DeathCause; scored: boolean }
  | { type: 'matchEnded'; reason: EndReason }

export interface HudSnapshot {
  readonly phase: MatchPhase
  readonly score: number
  readonly timeLeftSeconds: number
  readonly elapsedSeconds: number
  readonly playerHp: number
  readonly playerMaxHp: number
  readonly enemyCount: number
  readonly projectileCount: number
  readonly endReason: EndReason | null
}
