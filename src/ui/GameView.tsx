import { memo, useEffect, useRef, useState } from 'react'
import { queryHudElements } from '../game/bridge/hud'
import { mountGame } from '../game/bridge/mountGame'
import type { GameHandle, LoadState } from '../game/bridge/mountGame'

/**
 * Renders the canvas host and HUD shell. Game state reaches the HUD through `HudPublisher`
 * writing to the `data-hud` slots, never through React state, so these slots are left empty
 * in JSX and React never owns their text. React state only tracks asset loading.
 */
export const GameView = memo(function GameView() {
  const stageRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<GameHandle | null>(null)
  const [load, setLoad] = useState<LoadState>({ status: 'loading', progress: 0 })

  useEffect(() => {
    const stage = stageRef.current
    const hud = hudRef.current
    if (stage === null || hud === null) return
    const game = mountGame({ stage, hud: queryHudElements(hud), onLoadState: setLoad })
    gameRef.current = game
    return () => {
      gameRef.current = null
      game.destroy()
    }
  }, [])

  return (
    <main className="game">
      <div ref={stageRef} className="game-stage" />

      <div ref={hudRef} className="hud" hidden={load.status !== 'ready'}>
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
              aria-label="Pause or resume"
              onClick={() => gameRef.current?.command('togglePause')}
            >
              <span className="hud-icon hud-icon-pause" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="hud-status" data-hud="status" role="status" aria-live="polite" hidden />
        <p className="hud-help">
          Mouse steer · W sail forward · A/D turn · Space bow gun · Q/E port/starboard broadside · P pause · M mute
        </p>
      </div>

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
            <button type="button" className="loading-retry" autoFocus onClick={() => gameRef.current?.retry()}>
              Retry
            </button>
          </div>
        </div>
      )}
    </main>
  )
})
