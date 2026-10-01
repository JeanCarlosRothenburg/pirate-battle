import { Application } from 'pixi.js'
import { loadGameAssets } from '../assets/gameAssets'
import type { GameAssets } from '../assets/gameAssets'
import { DEFAULT_GAME_CONFIG } from '../config/gameConfig'
import type { GameConfig } from '../config/gameConfig'
import type { TouchButtons } from '../input/touch'
import { GameSession } from './gameSession'
import type { SessionCallbacks } from './gameSession'
import type { HudElements } from './hud'
import { installTestApi } from './testApi'

export type { MatchOutcome } from './gameSession'

export type LoadState =
  | { readonly status: 'loading'; readonly progress: number }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready' }

export interface MountGameOptions extends SessionCallbacks {
  readonly stage: HTMLElement
  readonly hud: HudElements
  readonly config?: GameConfig
  readonly seed?: number
  readonly touch?: TouchButtons
  readonly testHooks?: boolean
  readonly frozenClock?: boolean
  readonly onLoadState?: (state: LoadState) => void
}

export interface GameHandle {
  destroy(): void
  retry(): void
  pause(): void
  resume(): void
  toggleMute(): boolean
}

/**
 * Creates the Pixi application, loads the match assets, then starts one match in `stage`
 * and returns a handle to control it.
 *
 * `Application.init` and asset loading are async while React effect cleanup is sync, so the
 * handle returns immediately. `destroy` is idempotent and safe at any point: if it runs
 * before init settles (Strict Mode's mount, unmount, mount), the late application is
 * destroyed as soon as init finishes and never attaches its canvas. Loading failures are
 * reported through `onLoadState` and can be retried; loaded assets stay cached for the next
 * mount. With `testHooks`, the session's test instrumentation is installed, and with
 * `frozenClock` as well the match starts on the manual clock.
 */
export function mountGame(options: MountGameOptions): GameHandle {
  const app = new Application()
  let destroyed = false
  let session: GameSession | null = null
  let uninstallTestApi: (() => void) | null = null
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

  const start = (assets: GameAssets): void => {
    session = startSession(app, assets, options)
    if (options.testHooks) {
      uninstallTestApi = installTestApi(session)
      if (options.frozenClock) session.useManualClock()
    }
    session.start()
    report({ status: 'ready' })
  }

  const load = (): void => {
    report({ status: 'loading', progress: 0 })
    const assets = loadGameAssets((progress) => report({ status: 'loading', progress }))
    stopProgress = assets.unsubscribe
    Promise.all([appReady, assets.promise])
      .then(([, loaded]) => {
        assets.unsubscribe()
        if (!destroyed) start(loaded)
      })
      .catch((error: unknown) => {
        assets.unsubscribe()
        if (destroyed) return
        console.warn('Game assets failed to load', error)
        report({ status: 'error', message: firstLine(error) })
      })
  }
  load()

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      stopProgress?.()
      uninstallTestApi?.()
      if (session !== null) {
        session.dispose()
        session = null
        destroyApp(app)
        return
      }
      appReady.then(
        () => destroyApp(app),
        () => undefined,
      )
    },
    retry() {
      if (!destroyed && session === null) load()
    },
    pause() {
      session?.pause()
    },
    resume() {
      session?.resume()
    },
    toggleMute() {
      return session?.toggleMute() ?? false
    },
  }
}

function startSession(app: Application, assets: GameAssets, options: MountGameOptions): GameSession {
  return new GameSession({
    app,
    assets,
    config: options.config ?? DEFAULT_GAME_CONFIG,
    seed: options.seed ?? randomSeed(),
    stage: options.stage,
    hud: options.hud,
    ...(options.touch ? { touch: options.touch } : {}),
    ...(options.onPhaseChange ? { onPhaseChange: options.onPhaseChange } : {}),
    ...(options.onMatchEnd ? { onMatchEnd: options.onMatchEnd } : {}),
  })
}

/** Destroys the display tree but not textures, which live in the shared asset cache. */
function destroyApp(app: Application): void {
  try {
    app.destroy({ removeView: true }, { children: true, context: true })
  } catch (error) {
    console.warn('Pixi application teardown failed', error)
  }
}

/** The first line of an error message: the useful part, without a stack trace. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n')[0] ?? message
}

function randomSeed(): number {
  return (Math.random() * 0x1_0000_0000) >>> 0
}
