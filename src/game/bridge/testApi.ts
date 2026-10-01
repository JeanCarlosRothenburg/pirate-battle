import type { ArenaConfig } from '../config/gameConfig'
import type { EndReason, MatchPhase, ShipKind } from '../sim/types'
import { EventTally } from './eventTally'
import type { EventCounts } from './eventTally'
import type { GameSession } from './gameSession'

export interface TestShip {
  readonly id: number
  readonly kind: ShipKind
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly speed: number
  readonly hp: number
  readonly maxHp: number
  readonly radius: number
}

export interface TestState {
  readonly phase: MatchPhase
  readonly endReason: EndReason | null
  readonly score: number
  readonly elapsedSeconds: number
  readonly timeLeftSeconds: number
  readonly player: TestShip
  readonly enemies: readonly TestShip[]
  readonly projectiles: number
  readonly cooldowns: { readonly front: number; readonly side: number }
  readonly arena: ArenaConfig
  readonly config: {
    readonly sessionSeconds: number
    readonly spawnIntervalSeconds: number
    readonly firstSpawnDelay: number
    readonly shooterAttackRange: number
    readonly playerTurnRate: number
  }
  readonly events: EventCounts
}

export interface PirateBattleTestApi {
  state(): TestState
  /** Stops real time: frames keep rendering, but only `step` advances the simulation. */
  freezeClock(): void
  resumeClock(): void
  /** Advances the frozen simulation by `seconds`, in fixed steps, with the live inputs. */
  step(seconds: number): void
  /** Converts an arena point to canvas CSS pixels, for pointer input in tests. */
  arenaToScreen(x: number, y: number): { x: number; y: number }
  /**
   * Profiling only: restores the player's health after every step, so a full-length match
   * can be measured under load. Every other system keeps running unchanged.
   */
  sustainPlayer(): void
}

declare global {
  interface Window {
    __pirateBattle?: PirateBattleTestApi
  }
}

/**
 * Installs the test instrumentation for one session (a Facade over it). It only observes
 * state and controls the clock; rules, inputs, collisions and rendering run unchanged.
 * Returns the function that uninstalls it.
 */
export function installTestApi(session: GameSession): () => void {
  const tally = new EventTally()
  session.observe((simulation) => tally.onStep(simulation))
  const sim = session.simulation

  const ship = (s: (typeof sim.enemies)[number]): TestShip => ({
    id: s.id,
    kind: s.kind,
    x: s.x,
    y: s.y,
    angle: s.angle,
    speed: s.speed,
    hp: s.hp,
    maxHp: s.maxHp,
    radius: s.radius,
  })

  const api: PirateBattleTestApi = {
    state: () => ({
      phase: sim.phase,
      endReason: sim.endReason,
      score: sim.score,
      elapsedSeconds: sim.elapsedSeconds,
      timeLeftSeconds: sim.timeLeftSeconds,
      player: ship(sim.player),
      enemies: sim.enemies.filter((e) => e.alive).map(ship),
      projectiles: sim.projectiles.length,
      cooldowns: { front: sim.player.frontCooldown, side: sim.player.sideCooldown },
      arena: sim.config.arena,
      config: {
        sessionSeconds: sim.config.sessionSeconds,
        spawnIntervalSeconds: sim.config.spawn.intervalSeconds,
        firstSpawnDelay: sim.config.spawn.firstSpawnDelay,
        shooterAttackRange: sim.config.shooter.attackRange,
        playerTurnRate: sim.config.player.turnRate,
      },
      events: { ...tally.counts },
    }),
    freezeClock: () => void session.useManualClock(),
    resumeClock: () => session.useRealTimeClock(),
    step: (seconds) => session.stepManually(seconds),
    sustainPlayer: () =>
      session.observe((simulation) => {
        simulation.player.hp = simulation.player.maxHp
      }),
    arenaToScreen: (x, y) => {
      const box = session.renderer.letterbox
      return { x: box.offsetX + x * box.scale, y: box.offsetY + y * box.scale }
    },
  }
  window.__pirateBattle = api
  return () => {
    if (window.__pirateBattle === api) delete window.__pirateBattle
  }
}
