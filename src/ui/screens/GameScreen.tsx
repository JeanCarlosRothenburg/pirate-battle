import { useEffect, useRef, useState } from 'react'
import { queryHudElements } from '../../game/bridge/hud'
import { mountGame } from '../../game/bridge/mountGame'
import type { GameHandle, LoadState } from '../../game/bridge/mountGame'
import type { MatchPhase } from '../../game/sim/types'
import { useAppStore } from '../appStore'
import type { MatchSetup } from '../appStore'
import { MenuButton } from '../components/MenuButton'
import { TouchControls } from '../components/TouchControls'
import { TouchButtons } from '../../game/input/touch'
import { PORTRAIT_TOUCH_QUERY, useMediaQuery } from '../useMediaQuery'
import { useSubmissionStore } from '../submissionStore'
import { PauseDialog } from './PauseDialog'

/** Time to watch the final explosion or sinking before the result screen appears. */
const RESULT_DELAY_MS = 1500

/**
 * One match. Mounted with a fresh key per match, so a new match always gets a new Pixi
 * application and simulation, and leaving the screen tears everything down.
 *
 * Game state reaches the HUD through `HudPublisher` writing to the `data-hud` slots, never
 * through React state, so those slots are left empty in JSX and React never owns their text.
 * React state only tracks asset loading and phase transitions.
 */
export function GameScreen({ match }: { readonly match: MatchSetup }) {
  const finishMatch = useAppStore((s) => s.finishMatch)
  const showResult = useAppStore((s) => s.showResult)
  const goToMenu = useAppStore((s) => s.goToMenu)
  const enqueue = useSubmissionStore((s) => s.enqueue)

  const stageRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<GameHandle | null>(null)
  const [load, setLoad] = useState<LoadState>({ status: 'loading', progress: 0 })
  const [phase, setPhase] = useState<MatchPhase>('idle')
  const [touch] = useState(() => new TouchButtons())
  const portrait = useMediaQuery(PORTRAIT_TOUCH_QUERY)

  // Matches are played in landscape on touch devices: turning upright pauses the match,
  // and it resumes, as any pause, only by the player's choice.
  useEffect(() => {
    if (portrait && phase === 'running') gameRef.current?.pause()
  }, [portrait, phase])

  useEffect(() => {
    const stage = stageRef.current
    const hud = hudRef.current
    if (stage === null || hud === null) return
    let resultTimer: ReturnType<typeof setTimeout> | undefined

    const game = mountGame({
      stage,
      hud: queryHudElements(hud),
      config: match.config,
      touch,
      onLoadState: setLoad,
      onPhaseChange: setPhase,
      onMatchEnd: (outcome) => {
        // Queued at once: it is sent in the background and survives failures and refreshes.
        const result = finishMatch(outcome)
        if (result !== null) enqueue(result)
        resultTimer = setTimeout(showResult, RESULT_DELAY_MS)
      },
    })
    gameRef.current = game
    return () => {
      clearTimeout(resultTimer)
      gameRef.current = null
      game.destroy()
    }
  }, [match, finishMatch, showResult, enqueue, touch])

  return (
    <main className="game">
      <div ref={stageRef} className="game-stage" />

      <div ref={hudRef} className="hud" hidden={load.status !== 'ready'}>
        <h1 className="visually-hidden">Pirate Battle match</h1>
        <div className="hud-top">
          <div className="hud-health">
            <span className="hud-heart" aria-hidden="true" />
            <div className="hud-health-bar">
              <span className="hud-health-fill" data-hud="hpFill" aria-hidden="true" />
              <span className="hud-health-text">
                <span className="visually-hidden">Hull </span>
                <span data-hud="hp" />
              </span>
            </div>
          </div>

          <div className="hud-counters">
            <div className="hud-counter">
              <span className="hud-icon hud-icon-score" aria-hidden="true" />
              <span className="visually-hidden">Score </span>
              <span className="hud-value" data-hud="score" />
            </div>
            <div className="hud-counter">
              <span className="hud-icon hud-icon-time" aria-hidden="true" />
              <span className="visually-hidden">Time left </span>
              <span className="hud-value" data-hud="time" />
            </div>
            <div className="hud-counter hud-counter-text">
              <span className="hud-label">Enemies</span>
              <span className="hud-value" data-hud="enemies" />
            </div>
            <button
              type="button"
              className="hud-round-button"
              aria-label="Pause"
              disabled={phase !== 'running'}
              onClick={() => gameRef.current?.pause()}
            >
              <span className="hud-icon hud-icon-pause" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Polite live region: announces phase changes only, never per-frame values. */}
        <p className="visually-hidden" data-hud="status" role="status" aria-live="polite" />
        <TouchControls touch={touch} />
        <p className="hud-help">
          Mouse steer · W sail forward · A/D turn · Space bow gun · Q/E port/starboard broadside · P/Esc pause · M mute
        </p>
      </div>

      <PauseDialog
        open={phase === 'paused'}
        rotateToResume={portrait}
        onResume={() => gameRef.current?.resume()}
        onMainMenu={goToMenu}
      />

      {load.status === 'loading' && (
        <div className="loading" role="status">
          <div className="loading-panel">
            <p className="loading-title">Loading assets</p>
            <div
              className="loading-bar"
              role="progressbar"
              aria-label="Loading game assets"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(load.progress * 100)}
            >
              <span style={{ transform: `scaleX(${load.progress})` }} />
            </div>
            <p className="loading-percent">{Math.round(load.progress * 100)}%</p>
          </div>
        </div>
      )}

      {load.status === 'error' && (
        <div className="loading" role="alert">
          <div className="loading-panel">
            <p className="loading-title">The game assets could not be loaded.</p>
            <p className="loading-detail">{load.message}</p>
            <div className="form-actions">
              <MenuButton autoFocus onClick={() => gameRef.current?.retry()}>
                Retry
              </MenuButton>
              <MenuButton variant="secondary" sound="ui_back" onClick={goToMenu}>
                Main Menu
              </MenuButton>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
