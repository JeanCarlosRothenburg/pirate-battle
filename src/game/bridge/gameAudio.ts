import type { GameSound } from '../assets/manifest'
import type { SoundBank } from '../audio/soundBank'
import type { Simulation } from '../sim/simulation'
import type { MatchPhase, SimEvent } from '../sim/types'

const LOW_HEALTH_RATIO = 0.3
/** Countdown ticks in the last seconds of the match. */
const WARNING_SECONDS = [10, 5, 4, 3, 2, 1] as const
const CANNON: readonly GameSound[] = ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3']
const WOOD_HIT: readonly GameSound[] = ['ship_wood_hit_1', 'ship_wood_hit_2']
const ISLAND_HIT: readonly GameSound[] = ['cannonball_water_hit_1', 'cannonball_water_hit_2']
const EXPLOSION: readonly GameSound[] = ['ship_explosion_1', 'ship_explosion_2']

/**
 * Maps simulation events and phase changes to sounds. It only reads the simulation, and
 * variations rotate in a fixed order rather than at random.
 */
export class GameAudio {
  private phase: MatchPhase = 'idle'
  private lowHealth = false
  private lastWholeSecond = Number.POSITIVE_INFINITY
  private variant = 0

  constructor(private readonly bank: SoundBank) {}

  onStep(sim: Simulation): void {
    for (const event of sim.events) this.onEvent(event)

    const lowHealth = sim.player.alive && sim.player.hp / sim.player.maxHp <= LOW_HEALTH_RATIO
    if (lowHealth && !this.lowHealth) this.bank.play('health_low', 0.8)
    this.lowHealth = lowHealth

    const whole = Math.ceil(sim.timeLeftSeconds)
    if (whole < this.lastWholeSecond && (WARNING_SECONDS as readonly number[]).includes(whole)) {
      this.bank.play('time_warning', 0.7)
    }
    this.lastWholeSecond = whole
  }

  /** Call once per frame; starts and stops loops as the match changes phase. */
  onFrame(sim: Simulation): void {
    if (sim.phase !== this.phase) this.onPhaseChange(this.phase, sim.phase)
    this.phase = sim.phase
    if (sim.phase === 'running') {
      const speed = Math.abs(sim.player.speed) / sim.config.player.speed
      this.bank.loop('ship_sailing_loop', 0.1 + 0.3 * speed)
    }
  }

  toggleMute(): boolean {
    this.bank.setMuted(!this.bank.isMuted)
    return this.bank.isMuted
  }

  private onPhaseChange(from: MatchPhase, to: MatchPhase): void {
    if (to === 'running') {
      this.bank.loop('ocean_ambience_loop', 0.35)
      if (from === 'paused') this.bank.play('game_resume', 0.8)
      else {
        this.lowHealth = false
        this.lastWholeSecond = Number.POSITIVE_INFINITY
        this.bank.play('game_start', 0.8)
      }
      return
    }
    this.bank.stopLoop('ship_sailing_loop')
    if (to === 'paused') {
      this.bank.stopLoop('ocean_ambience_loop')
      this.bank.play('game_pause', 0.8)
    }
    if (to === 'idle') this.bank.stopLoop('ocean_ambience_loop')
  }

  private onEvent(event: SimEvent): void {
    switch (event.type) {
      case 'shot':
        if (event.faction === 'enemy') this.bank.play(this.pick(CANNON), 0.35)
        else if (event.weapon === 'side') this.bank.play('cannon_broadside', 0.75)
        else this.bank.play(this.pick(CANNON), 0.6)
        return
      case 'hit':
        this.bank.play(this.pick(event.surface === 'ship' ? WOOD_HIT : ISLAND_HIT), event.faction === 'enemy' ? 0.8 : 0.5)
        return
      case 'explosion':
        this.bank.play(this.pick(EXPLOSION), 0.8)
        if (event.kind === 'player') this.bank.play('ship_sinking', 0.8)
        return
      case 'enemyKilled':
        if (event.scored) this.bank.play('score_point', 0.7)
        else if (event.cause === 'selfDestruct') this.bank.play('ship_collision', 0.9)
        return
      case 'matchEnded':
        this.bank.play(event.reason === 'death' ? 'game_over' : 'game_complete', 0.9)
        return
      case 'playerDamaged':
        return
    }
  }

  private pick(options: readonly GameSound[]): GameSound {
    const sound = options[this.variant++ % options.length]
    if (sound === undefined) throw new Error('No sound variants')
    return sound
  }
}
