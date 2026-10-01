import type { Application, Ticker } from 'pixi.js'
import type { GameAssets } from '../assets/gameAssets'
import { SoundBank, getAudioContext } from '../audio/soundBank'
import type { GameConfig } from '../config/gameConfig'
import { KeyboardInput } from '../input/keyboard'
import type { InputCommand } from '../input/keyboard'
import { PointerSteering } from '../input/pointer'
import type { TouchButtons } from '../input/touch'
import { ArenaRenderer } from '../render/arenaRenderer'
import { MAX_FRAME_SECONDS } from '../sim/loop'
import { Simulation } from '../sim/simulation'
import type { EndReason, InputIntent, MatchPhase } from '../sim/types'
import { GameAudio } from './gameAudio'
import { HUD_PUBLISH_INTERVAL_MS, HudPublisher } from './hud'
import type { HudElements } from './hud'
import { ManualClock, RealTimeClock } from './matchClock'
import type { MatchClock, StepListener } from './matchClock'

export interface MatchOutcome {
  readonly score: number
  readonly durationSeconds: number
  readonly endReason: EndReason
}

export interface SessionCallbacks {
  readonly onPhaseChange?: (phase: MatchPhase) => void
  readonly onMatchEnd?: (outcome: MatchOutcome) => void
}

export interface SessionSetup extends SessionCallbacks {
  readonly app: Application
  readonly assets: GameAssets
  readonly config: GameConfig
  readonly seed: number
  readonly stage: HTMLElement
  readonly hud: HudElements
  readonly touch?: TouchButtons
}

/**
 * One running match: owns the simulation and everything that drives or shows it (inputs,
 * renderer, audio, HUD), and tears all of it down on `dispose`.
 *
 * - The clock is a strategy: real time by default, manual under test instrumentation.
 * - Every fixed step is broadcast to step observers (renderer, audio, test tally).
 * - Phase changes gate input capture and are reported once each, never per frame; the
 *   outcome is reported once when the match ends by time or death. Abandoned matches,
 *   disposed before ending, report nothing.
 * - Losing focus or hiding the tab pauses; only an explicit player action resumes, and
 *   resuming drops the paused time so it is never replayed as movement.
 */
export class GameSession {
  readonly simulation: Simulation
  readonly renderer: ArenaRenderer

  private readonly keyboard = new KeyboardInput(window)
  private readonly pointer: PointerSteering
  private readonly hud: HudPublisher
  private readonly sounds: SoundBank
  private readonly audio: GameAudio
  private readonly observers: StepListener[] = []
  private clock: MatchClock = new RealTimeClock()
  private phase: MatchPhase
  private hudElapsedMs = 0

  constructor(private readonly setup: SessionSetup) {
    this.simulation = new Simulation({ config: setup.config, seed: setup.seed })
    this.renderer = new ArenaRenderer(setup.config, setup.assets.textures)
    this.pointer = new PointerSteering(setup.app.canvas)
    this.hud = new HudPublisher(setup.hud)
    this.sounds = new SoundBank(getAudioContext(), setup.assets.sounds)
    this.audio = new GameAudio(this.sounds)
    this.phase = this.simulation.phase

    this.observe((simulation) => this.renderer.onStep(simulation))
    this.observe((simulation) => this.audio.onStep(simulation))
    this.keyboard.onCommand = this.onCommand

    setup.app.renderer.events.cursorStyles.default = 'crosshair'
    setup.app.stage.addChild(this.renderer.root)
    setup.app.renderer.on('resize', this.fit)
    setup.app.ticker.add(this.tick)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('blur', this.pause)
    this.fit()
    setup.stage.appendChild(setup.app.canvas)
  }

  /** Starts the match; called right after mounting, as the Play action that mounted it. */
  start(): void {
    this.sounds.unlock()
    this.simulation.start()
    this.syncPhase()
  }

  readonly pause = (): void => {
    if (!this.simulation.isActive) return
    this.simulation.pause()
    this.keyboard.clear()
    this.setup.touch?.releaseAll()
    this.syncPhase()
  }

  /** Resumes a paused match. Resuming always takes an explicit player action. */
  resume(): void {
    if (this.simulation.phase !== 'paused') return
    this.sounds.unlock()
    this.clock.clear()
    this.simulation.resume()
    this.syncPhase()
  }

  /** Toggles game sound and returns whether it is now muted. */
  toggleMute(): boolean {
    this.sounds.unlock()
    return this.audio.toggleMute()
  }

  /** Registers an observer that runs after every fixed simulation step. */
  observe(listener: StepListener): void {
    this.observers.push(listener)
  }

  /** Switches to test-controlled time and returns the manual clock. */
  useManualClock(): ManualClock {
    const clock = this.clock instanceof ManualClock ? this.clock : new ManualClock()
    this.clock = clock
    return clock
  }

  /** Returns to real time, without replaying the time spent on the manual clock. */
  useRealTimeClock(): void {
    this.clock = new RealTimeClock()
  }

  /** Runs `seconds` of simulation now on the manual clock, with the live inputs. */
  stepManually(seconds: number): void {
    const steps = this.useManualClock().step(seconds, this.simulation, this.readIntent, this.notifyStep)
    if (steps > 0) this.renderer.update(seconds, true)
    this.renderer.sync(this.simulation, 1)
    this.syncPhase()
    this.publishHud()
  }

  /** Stops the loop, releases every listener and resource, and destroys the display tree. */
  dispose(): void {
    const { app } = this.setup
    app.ticker.remove(this.tick)
    app.renderer.off('resize', this.fit)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('blur', this.pause)
    this.keyboard.dispose()
    this.pointer.dispose()
    this.sounds.dispose()
    this.simulation.destroy()
    app.stage.removeChild(this.renderer.root)
    this.renderer.destroy()
    this.observers.length = 0
  }

  private readonly tick = (ticker: Ticker): void => {
    const frameSeconds = ticker.elapsedMS / 1000
    const alpha = this.simulation.isActive
      ? this.clock.advance(this.simulation, frameSeconds, this.readIntent(), this.notifyStep)
      : 1
    if (this.clock.realTime) {
      this.renderer.update(Math.min(frameSeconds, MAX_FRAME_SECONDS), this.simulation.phase !== 'paused')
    }
    this.renderer.sync(this.simulation, alpha)
    this.audio.onFrame(this.simulation)
    this.syncPhase()

    this.hudElapsedMs += ticker.elapsedMS
    if (this.hudElapsedMs >= HUD_PUBLISH_INTERVAL_MS) {
      this.hudElapsedMs %= HUD_PUBLISH_INTERVAL_MS
      this.publishHud()
    }
  }

  private readonly readIntent = (): InputIntent => {
    const intent = this.keyboard.read()
    this.setup.touch?.apply(intent)
    this.pointer.apply(intent, this.renderer.letterbox)
    return intent
  }

  private readonly notifyStep: StepListener = (simulation) => {
    for (const observer of this.observers) observer(simulation)
  }

  private readonly fit = (): void => {
    this.renderer.fit(this.setup.app.screen.width, this.setup.app.screen.height)
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.pause()
  }

  private readonly onCommand = (command: InputCommand): void => {
    if (command === 'pause') this.pause()
    else this.toggleMute()
  }

  private publishHud(): void {
    this.hud.publish(this.simulation.snapshot())
  }

  private syncPhase(): void {
    const { simulation } = this
    if (simulation.phase === this.phase) return
    this.phase = simulation.phase
    const running = this.phase === 'running'
    this.keyboard.enabled = running
    if (this.setup.touch) this.setup.touch.enabled = running
    this.publishHud()
    this.setup.onPhaseChange?.(this.phase)
    if (this.phase === 'ended' && simulation.endReason !== null) {
      this.setup.onMatchEnd?.({
        score: simulation.score,
        durationSeconds: simulation.elapsedSeconds,
        endReason: simulation.endReason,
      })
    }
  }
}
