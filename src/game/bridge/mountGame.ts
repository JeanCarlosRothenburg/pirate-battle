import { Application } from 'pixi.js'
import type { Ticker } from 'pixi.js'
import { loadGameAssets } from '../assets/gameAssets'
import type { GameAssets } from '../assets/gameAssets'
import { SoundBank, getAudioContext } from '../audio/soundBank'
import { DEFAULT_GAME_CONFIG } from '../config/gameConfig'
import type { GameConfig } from '../config/gameConfig'
import { KeyboardInput } from '../input/keyboard'
import type { InputCommand } from '../input/keyboard'
import { PointerSteering } from '../input/pointer'
import type { TouchButtons } from '../input/touch'
import { ArenaRenderer } from '../render/arenaRenderer'
import { FixedStepRunner, MAX_FRAME_SECONDS } from '../sim/loop'
import { Simulation } from '../sim/simulation'
import type { EndReason, MatchPhase } from '../sim/types'
import { GameAudio } from './gameAudio'
import { HUD_PUBLISH_INTERVAL_MS, HudPublisher } from './hud'
import type { HudElements } from './hud'

export type LoadState =
  | { readonly status: 'loading'; readonly progress: number }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready' }

export interface MountGameOptions {
  readonly stage: HTMLElement
  readonly hud: HudElements
  readonly config?: GameConfig
  /** Seed for each new match. Defaults to a random seed per match. */
  readonly nextSeed?: () => number
  /** On-screen touch buttons, merged with the keyboard. */
  readonly touch?: TouchButtons
  /** Reports asset loading; the match starts as soon as it reports `ready`. */
  readonly onLoadState?: (state: LoadState) => void
  /** Called on every phase transition (never per frame). */
  readonly onPhaseChange?: (phase: MatchPhase) => void
  /** Called once when the match ends by time or death. Abandoned matches never call it. */
  readonly onMatchEnd?: (outcome: MatchOutcome) => void
}

export interface MatchOutcome {
  readonly score: number
  /** Seconds of active play; pauses do not count. */
  readonly durationSeconds: number
  readonly endReason: EndReason
}

export interface GameHandle {
  /** Idempotent. Safe to call at any point, including before initialisation finishes. */
  destroy(): void
  /** Retries asset loading after an `error` load state. */
  retry(): void
  /** Pauses a running match, e.g. from the on-screen button. */
  pause(): void
  /** Resumes a paused match. Resuming always takes an explicit player action. */
  resume(): void
  /** Toggles game sound; returns whether it is now muted. */
  toggleMute(): boolean
}

/**
 * Creates the Pixi application, loads the match assets and starts the game loop in `stage`.
 *
 * `Application.init` and asset loading are async, while React effect cleanup is sync. The
 * handle therefore returns immediately; if `destroy()` runs first (Strict Mode's
 * mount → unmount → mount), the late application is destroyed once init settles and never
 * attaches its canvas. Loaded assets stay cached for the next mount.
 */
export function mountGame(options: MountGameOptions): GameHandle {
  const app = new Application()
  let destroyed = false
  let game: RunningGame | null = null
  let stopProgress: (() => void) | null = null

  const report = (state: LoadState): void => {
    if (!destroyed) options.onLoadState?.(state)
  }

  const appReady = app.init({
    resizeTo: options.stage,
    background: 0x0b4f7a,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  })

  const load = (): void => {
    report({ status: 'loading', progress: 0 })
    const assets = loadGameAssets((progress) => report({ status: 'loading', progress }))
    stopProgress = assets.unsubscribe
    Promise.all([appReady, assets.promise])
      .then(([, loaded]) => {
        assets.unsubscribe()
        if (destroyed) return
        game = startGame(app, loaded, options)
        report({ status: 'ready' })
      })
      .catch((error: unknown) => {
        assets.unsubscribe()
        if (destroyed) return
        // Handled: the UI shows the failure and offers a retry.
        console.warn('Game assets failed to load', error)
        const message = error instanceof Error ? error.message : String(error)
        report({ status: 'error', message: message.split('\n')[0] ?? message })
      })
  }
  load()

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      stopProgress?.()
      if (game !== null) {
        game.teardown()
        game = null
        return
      }
      appReady.then(
        () => destroyApp(app),
        () => undefined,
      )
    },
    retry() {
      if (!destroyed && game === null) load()
    },
    pause() {
      game?.pause()
    },
    resume() {
      game?.resume()
    },
    toggleMute() {
      return game?.toggleMute() ?? false
    },
  }
}

interface RunningGame {
  teardown(): void
  pause(): void
  resume(): void
  toggleMute(): boolean
}

function startGame(app: Application, assets: GameAssets, options: MountGameOptions): RunningGame {
  const config = options.config ?? DEFAULT_GAME_CONFIG
  const nextSeed = options.nextSeed ?? randomSeed

  const sim = new Simulation({ config, seed: nextSeed() })
  const runner = new FixedStepRunner()
  const input = new KeyboardInput(window)
  const pointer = new PointerSteering(app.canvas)
  // Pixi writes the canvas cursor inline on every pointer move, so set it through Pixi.
  app.renderer.events.cursorStyles.default = 'crosshair'
  const hud = new HudPublisher(options.hud)
  const renderer = new ArenaRenderer(config, assets.textures)
  const sounds = new SoundBank(getAudioContext(), assets.sounds)
  const audio = new GameAudio(sounds)
  app.stage.addChild(renderer.root)

  const fit = (): void => renderer.fit(app.screen.width, app.screen.height)
  fit()
  app.renderer.on('resize', fit)

  const publishHud = (): void => hud.publish(sim.snapshot())
  const onStep = (s: Simulation): void => {
    renderer.onStep(s)
    audio.onStep(s)
  }

  // Every phase change goes through here: it gates keyboard capture and informs the UI.
  let phase: MatchPhase = sim.phase
  const syncPhase = (): void => {
    if (sim.phase === phase) return
    phase = sim.phase
    input.enabled = phase === 'running'
    if (options.touch) options.touch.enabled = phase === 'running'
    publishHud()
    options.onPhaseChange?.(phase)
    if (phase === 'ended' && sim.endReason !== null) {
      options.onMatchEnd?.({
        score: sim.score,
        durationSeconds: sim.elapsedSeconds,
        endReason: sim.endReason,
      })
    }
  }

  const pause = (): void => {
    if (!sim.isActive) return
    sim.pause()
    input.clear()
    options.touch?.releaseAll()
    syncPhase()
  }

  const resume = (): void => {
    if (sim.phase !== 'paused') return
    // Commands come from user gestures, the moment browsers allow audio to start.
    sounds.unlock()
    // Drop the accumulated time so the paused period is not replayed as movement.
    runner.clear()
    sim.resume()
    syncPhase()
  }

  const toggleMute = (): boolean => {
    sounds.unlock()
    return audio.toggleMute()
  }

  input.onCommand = (cmd: InputCommand): void => {
    if (cmd === 'pause') pause()
    else toggleMute()
  }

  // Losing focus or hiding the tab pauses the match; only an explicit player action resumes it.
  const autoPause = pause
  const onVisibilityChange = (): void => {
    if (document.hidden) autoPause()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', autoPause)

  let hudElapsedMs = 0
  const tick = (ticker: Ticker): void => {
    // elapsedMS is the raw frame time; the runner applies its own clamp.
    const frameMs = ticker.elapsedMS
    // Outside `running` the simulation does not step, so prev/current transforms are
    // stale relative to each other; render the current state rather than interpolating.
    const intent = input.read()
    options.touch?.apply(intent)
    pointer.apply(intent, renderer.letterbox)
    const alpha = sim.isActive ? runner.advance(sim, frameMs / 1000, intent, onStep) : 1
    // Effects keep playing after the match ends, but freeze with it while paused.
    renderer.update(Math.min(frameMs / 1000, MAX_FRAME_SECONDS), sim.phase !== 'paused')
    renderer.sync(sim, alpha)
    audio.onFrame(sim)
    syncPhase()

    hudElapsedMs += frameMs
    if (hudElapsedMs >= HUD_PUBLISH_INTERVAL_MS) {
      hudElapsedMs %= HUD_PUBLISH_INTERVAL_MS
      publishHud()
    }
  }
  app.ticker.add(tick)

  options.stage.appendChild(app.canvas)
  // The Play action that mounted this game is the start command: sail at once.
  sounds.unlock()
  sim.start()
  syncPhase()

  return {
    pause,
    resume,
    toggleMute,
    teardown() {
      app.ticker.remove(tick)
      app.renderer.off('resize', fit)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', autoPause)
      input.dispose()
      pointer.dispose()
      sounds.dispose()
      sim.destroy()
      app.stage.removeChild(renderer.root)
      renderer.destroy()
      destroyApp(app)
    },
  }
}

/** Destroys the display tree but not textures: those live in the shared asset cache. */
function destroyApp(app: Application): void {
  try {
    app.destroy({ removeView: true }, { children: true, context: true })
  } catch (error) {
    // An application whose init failed has nothing to release.
    console.warn('Pixi application teardown failed', error)
  }
}

function randomSeed(): number {
  return (Math.random() * 0x1_0000_0000) >>> 0
}
