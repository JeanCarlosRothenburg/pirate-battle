import type { GameConfig } from '../config/gameConfig'
import { applyDamage, frontShots, initProjectile, sideShots } from '../systems/combat'
import type { ProjectileSpawn } from '../systems/combat'
import {
  circlesOverlap,
  resolveCircleMove,
  segmentHitsAnyIsland,
  segmentHitsCircle,
} from '../systems/collision'
import { decideChaser, decideShooter } from '../systems/enemyAI'
import { findSpawnPoint, pickEnemyKind } from '../systems/spawner'
import { clamp, moveToward, turnToward } from './mathUtils'
import { Pool, compactInPlace } from './pool'
import { createRng } from './rng'
import type { Rng } from './rng'
import { SpatialHash } from './spatialHash'
import { NEUTRAL_INTENT } from './types'
import type {
  DeathCause,
  EndReason,
  HudSnapshot,
  InputIntent,
  MatchPhase,
  Projectile,
  ShipKind,
  Ship,
  SimEvent,
} from './types'

export interface SimulationOptions {
  readonly config: GameConfig
  readonly seed: number
}

const PROJECTILE_POOL_SIZE = 256
const SHIP_POOL_SIZE = 64

export class Simulation {
  readonly config: GameConfig

  readonly player: Ship
  readonly enemies: Ship[] = []
  readonly projectiles: Projectile[] = []
  readonly events: SimEvent[] = []

  phase: MatchPhase = 'idle'
  score = 0
  elapsedSeconds = 0
  endReason: EndReason | null = null

  private rng: Rng
  private seed: number
  private nextId = 1
  private spawnTimer = 0
  private readonly shipPool: Pool<Ship>
  private readonly projectilePool: Pool<Projectile>
  private readonly broadphase: SpatialHash
  private readonly candidates: number[] = []
  private readonly pendingShots: ProjectileSpawn[] = []

  constructor(options: SimulationOptions) {
    this.config = options.config
    this.seed = options.seed
    this.rng = createRng(options.seed)
    this.shipPool = new Pool<Ship>(createShip, resetShip, SHIP_POOL_SIZE)
    this.projectilePool = new Pool<Projectile>(createProjectile, resetProjectile, PROJECTILE_POOL_SIZE)
    this.broadphase = new SpatialHash(this.config.arena.width, this.config.arena.height, 128)
    this.player = createShip()
    this.initPlayer()
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    this.reset(this.seed)
    this.phase = 'running'
  }

  pause(): void {
    if (this.phase === 'running') this.phase = 'paused'
  }

  resume(): void {
    if (this.phase === 'paused') this.phase = 'running'
  }

  reset(seed: number = this.seed): void {
    this.seed = seed
    this.rng = createRng(seed)
    this.nextId = 1
    this.score = 0
    this.elapsedSeconds = 0
    this.endReason = null
    this.spawnTimer = this.config.spawn.firstSpawnDelay
    this.events.length = 0

    for (const enemy of this.enemies) this.shipPool.release(enemy)
    this.enemies.length = 0
    for (const projectile of this.projectiles) this.projectilePool.release(projectile)
    this.projectiles.length = 0

    this.initPlayer()
    this.phase = 'idle'
  }

  destroy(): void {
    this.reset(this.seed)
    this.events.length = 0
  }

  get isActive(): boolean {
    return this.phase === 'running'
  }

  get timeLeftSeconds(): number {
    return Math.max(0, this.config.sessionSeconds - this.elapsedSeconds)
  }

  snapshot(): HudSnapshot {
    return {
      phase: this.phase,
      score: this.score,
      timeLeftSeconds: this.timeLeftSeconds,
      elapsedSeconds: this.elapsedSeconds,
      playerHp: this.player.hp,
      playerMaxHp: this.player.maxHp,
      enemyCount: this.enemies.length,
      projectileCount: this.projectiles.length,
      endReason: this.endReason,
    }
  }

  // --------------------------------------------------------------------- step

  step(dt: number, intent: InputIntent = NEUTRAL_INTENT): void {
    if (this.phase !== 'running' || dt <= 0) return

    const remaining = this.config.sessionSeconds - this.elapsedSeconds
    if (remaining <= 0) {
      this.endMatch('time')
      return
    }
    const stepSeconds = Math.min(dt, remaining)

    this.events.length = 0
    this.storePreviousTransforms()

    this.tickCooldowns(stepSeconds)
    this.updatePlayer(stepSeconds, intent)
    this.updateEnemies(stepSeconds)
    this.updateProjectiles(stepSeconds)
    this.resolveChaserContacts()
    this.collectDead()
    this.updateSpawning(stepSeconds)

    this.elapsedSeconds += stepSeconds

    if (!this.player.alive) {
      this.endMatch('death')
      return
    }
    if (this.elapsedSeconds >= this.config.sessionSeconds) {
      this.endMatch('time')
    }
  }

  // ------------------------------------------------------------------ private

  private initPlayer(): void {
    const { player, arena } = this.config
    resetShip(this.player)
    this.player.id = 0
    this.player.kind = 'player'
    this.player.faction = 'player'
    this.player.x = arena.playerSpawn.x
    this.player.y = arena.playerSpawn.y
    this.player.prevX = this.player.x
    this.player.prevY = this.player.y
    this.player.angle = arena.playerSpawn.angle
    this.player.prevAngle = this.player.angle
    this.player.hp = player.maxHp
    this.player.maxHp = player.maxHp
    this.player.radius = player.radius
    this.player.alive = true
  }

  private storePreviousTransforms(): void {
    this.player.prevX = this.player.x
    this.player.prevY = this.player.y
    this.player.prevAngle = this.player.angle
    for (const enemy of this.enemies) {
      enemy.prevX = enemy.x
      enemy.prevY = enemy.y
      enemy.prevAngle = enemy.angle
    }
    for (const projectile of this.projectiles) {
      projectile.prevX = projectile.x
      projectile.prevY = projectile.y
    }
  }

  private tickCooldowns(dt: number): void {
    decayTimers(this.player, dt)
    for (const enemy of this.enemies) decayTimers(enemy, dt)
  }

  private updatePlayer(dt: number, intent: InputIntent): void {
    const cfg = this.config.player
    const ship = this.player
    if (!ship.alive) return

    ship.angle = turnToward(ship.angle, ship.angle + intent.turn * cfg.turnRate * dt, Math.PI)

    const targetSpeed =
      intent.throttle >= 0 ? intent.throttle * cfg.speed : intent.throttle * cfg.reverseSpeed
    ship.speed = moveToward(ship.speed, targetSpeed, cfg.acceleration * dt)

    const move = resolveCircleMove(
      ship.x,
      ship.y,
      Math.cos(ship.angle) * ship.speed * dt,
      Math.sin(ship.angle) * ship.speed * dt,
      ship.radius,
      this.config.arena,
    )
    ship.x = move.x
    ship.y = move.y
    if (move.blocked) ship.speed = 0

    if (intent.fireFront && ship.frontCooldown <= 0) {
      frontShots(ship, cfg.frontWeapon, this.pendingShots)
      this.emitShots(this.pendingShots, ship)
      ship.frontCooldown = cfg.frontWeapon.cooldown
    }
    if (ship.sideCooldown <= 0 && (intent.fireLeft || intent.fireRight)) {
      const side = intent.fireLeft ? 'left' : 'right'
      sideShots(ship, cfg.sideWeapon, side, this.pendingShots)
      this.emitShots(this.pendingShots, ship)
      ship.sideCooldown = cfg.sideWeapon.cooldown
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const isChaser = enemy.kind === 'chaser'
      const stats = isChaser ? this.config.chaser : this.config.shooter
      const decision = isChaser
        ? decideChaser(enemy, this.player, this.config.chaser)
        : decideShooter(enemy, this.player, this.config.shooter)

      enemy.angle = turnToward(enemy.angle, decision.targetAngle, stats.turnRate * dt)
      enemy.speed = decision.throttle * stats.speed

      const move = resolveCircleMove(
        enemy.x,
        enemy.y,
        Math.cos(enemy.angle) * enemy.speed * dt,
        Math.sin(enemy.angle) * enemy.speed * dt,
        enemy.radius,
        this.config.arena,
      )
      enemy.x = move.x
      enemy.y = move.y

      if (!isChaser && decision.wantsToFire && enemy.frontCooldown <= 0) {
        frontShots(enemy, this.config.shooter.weapon, this.pendingShots)
        this.emitShots(this.pendingShots, enemy)
        enemy.frontCooldown = this.config.shooter.weapon.cooldown
      }
    }
  }

  private emitShots(shots: readonly ProjectileSpawn[], shooter: Ship): void {
    for (const shot of shots) {
      const projectile = this.projectilePool.acquire()
      initProjectile(projectile, this.nextId++, shot)
      this.projectiles.push(projectile)
    }
    const first = shots[0]
    if (first !== undefined) {
      this.events.push({
        type: 'shot',
        faction: shooter.faction,
        x: first.x,
        y: first.y,
        angle: first.angle,
      })
    }
  }

  private updateProjectiles(dt: number): void {
    this.rebuildBroadphase()
    const arena = this.config.arena

    for (const projectile of this.projectiles) {
      if (!projectile.alive) continue

      const dx = projectile.vx * dt
      const dy = projectile.vy * dt

      if (this.resolveProjectileHit(projectile, dx, dy)) continue

      if (segmentHitsAnyIsland(projectile.x, projectile.y, dx, dy, projectile.radius, arena)) {
        projectile.alive = false
        this.events.push({ type: 'hit', x: projectile.x, y: projectile.y, faction: projectile.faction })
        continue
      }

      projectile.x += dx
      projectile.y += dy
      projectile.remainingLife -= dt

      const outOfArena =
        projectile.x < -projectile.radius ||
        projectile.y < -projectile.radius ||
        projectile.x > arena.width + projectile.radius ||
        projectile.y > arena.height + projectile.radius

      if (projectile.remainingLife <= 0 || outOfArena) projectile.alive = false
    }
  }

  private rebuildBroadphase(): void {
    this.broadphase.clear()
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i]
      if (enemy === undefined || !enemy.alive) continue
      this.broadphase.insert(i, enemy.x, enemy.y, enemy.radius)
    }
  }

  /** Returns true when the projectile was consumed by a target this step. */
  private resolveProjectileHit(projectile: Projectile, dx: number, dy: number): boolean {
    if (projectile.faction === 'player') {
      const reach = projectile.radius + Math.max(this.config.chaser.radius, this.config.shooter.radius)
      const found = this.broadphase.query(
        projectile.x + dx * 0.5,
        projectile.y + dy * 0.5,
        Math.hypot(dx, dy) * 0.5 + reach,
        this.candidates,
      )
      for (let i = 0; i < found; i++) {
        const index = this.candidates[i]
        if (index === undefined) continue
        const enemy = this.enemies[index]
        if (enemy === undefined || !enemy.alive) continue
        if (
          !segmentHitsCircle(
            projectile.x,
            projectile.y,
            dx,
            dy,
            enemy.x,
            enemy.y,
            enemy.radius + projectile.radius,
          )
        ) {
          continue
        }
        projectile.alive = false
        const killed = applyDamage(enemy, projectile.damage)
        this.events.push({ type: 'hit', x: enemy.x, y: enemy.y, faction: 'player' })
        if (killed) this.killEnemy(enemy, 'projectile')
        return true
      }
      return false
    }

    if (!this.player.alive) return false
    if (
      !segmentHitsCircle(
        projectile.x,
        projectile.y,
        dx,
        dy,
        this.player.x,
        this.player.y,
        this.player.radius + projectile.radius,
      )
    ) {
      return false
    }
    projectile.alive = false
    applyDamage(this.player, projectile.damage)
    this.events.push({ type: 'hit', x: this.player.x, y: this.player.y, faction: 'enemy' })
    this.events.push({ type: 'playerDamaged', amount: projectile.damage, hp: this.player.hp })
    if (!this.player.alive) {
      this.events.push({ type: 'explosion', x: this.player.x, y: this.player.y, kind: 'player' })
    }
    return true
  }

  private resolveChaserContacts(): void {
    if (!this.player.alive) return
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind !== 'chaser') continue
      if (
        !circlesOverlap(
          enemy.x,
          enemy.y,
          enemy.radius,
          this.player.x,
          this.player.y,
          this.player.radius,
        )
      ) {
        continue
      }
      enemy.alive = false
      const damage = this.config.chaser.contactDamage
      applyDamage(this.player, damage)
      this.events.push({ type: 'playerDamaged', amount: damage, hp: this.player.hp })
      this.killEnemy(enemy, 'selfDestruct')
      if (!this.player.alive) {
        this.events.push({ type: 'explosion', x: this.player.x, y: this.player.y, kind: 'player' })
        return
      }
    }
  }

  /** A Chaser that destroys itself against the player does not award a point. */
  private killEnemy(enemy: Ship, cause: DeathCause): void {
    enemy.alive = false
    const scored = cause === 'projectile'
    if (scored) this.score += 1
    this.events.push({ type: 'explosion', x: enemy.x, y: enemy.y, kind: enemy.kind })
    this.events.push({ type: 'enemyKilled', kind: enemy.kind, cause, scored })
  }

  private collectDead(): void {
    compactInPlace(this.enemies, (enemy) => this.shipPool.release(enemy))
    compactInPlace(this.projectiles, (projectile) => this.projectilePool.release(projectile))
  }

  private updateSpawning(dt: number): void {
    this.spawnTimer -= dt
    if (this.spawnTimer > 0) return
    this.spawnTimer += this.config.spawn.intervalSeconds
    if (this.enemies.length >= this.config.spawn.maxAliveEnemies) return

    const kind = pickEnemyKind(this.rng, this.config.spawn)
    const stats = kind === 'chaser' ? this.config.chaser : this.config.shooter
    const point = findSpawnPoint(
      this.rng,
      this.config.arena,
      this.config.spawn,
      stats.radius,
      this.player.x,
      this.player.y,
    )
    if (point === null) return

    const enemy = this.shipPool.acquire()
    enemy.id = this.nextId++
    enemy.kind = kind
    enemy.faction = 'enemy'
    enemy.x = point.x
    enemy.y = point.y
    enemy.prevX = point.x
    enemy.prevY = point.y
    enemy.angle = point.angle
    enemy.prevAngle = point.angle
    enemy.hp = stats.maxHp
    enemy.maxHp = stats.maxHp
    enemy.radius = stats.radius
    enemy.alive = true
    this.enemies.push(enemy)
  }

  private endMatch(reason: EndReason): void {
    if (this.phase === 'ended') return
    this.phase = 'ended'
    this.endReason = reason
    this.elapsedSeconds = clamp(this.elapsedSeconds, 0, this.config.sessionSeconds)
    this.events.push({ type: 'matchEnded', reason })
  }
}

// -------------------------------------------------------------------- factories

function createShip(): Ship {
  return {
    id: -1,
    kind: 'chaser' as ShipKind,
    faction: 'enemy',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    angle: 0,
    prevAngle: 0,
    speed: 0,
    hp: 0,
    maxHp: 0,
    radius: 0,
    alive: false,
    frontCooldown: 0,
    sideCooldown: 0,
    hitFlash: 0,
  }
}

function resetShip(ship: Ship): void {
  ship.id = -1
  ship.speed = 0
  ship.hp = 0
  ship.alive = false
  ship.frontCooldown = 0
  ship.sideCooldown = 0
  ship.hitFlash = 0
}

function createProjectile(): Projectile {
  return {
    id: -1,
    faction: 'player',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    radius: 0,
    damage: 0,
    remainingLife: 0,
    alive: false,
  }
}

function resetProjectile(projectile: Projectile): void {
  projectile.id = -1
  projectile.alive = false
  projectile.remainingLife = 0
  projectile.vx = 0
  projectile.vy = 0
}

function decayTimers(ship: Ship, dt: number): void {
  if (ship.frontCooldown > 0) ship.frontCooldown = Math.max(0, ship.frontCooldown - dt)
  if (ship.sideCooldown > 0) ship.sideCooldown = Math.max(0, ship.sideCooldown - dt)
  if (ship.hitFlash > 0) ship.hitFlash = Math.max(0, ship.hitFlash - dt)
}
