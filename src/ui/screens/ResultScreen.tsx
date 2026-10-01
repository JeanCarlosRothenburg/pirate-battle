import { useAppStore } from '../appStore'
import { MenuButton } from '../components/MenuButton'
import { SubmissionStatus } from '../components/SubmissionStatus'
import { formatClockPadded } from '../format'
import { useFocusOnMount } from '../useFocusOnMount'

/**
 * The result screen, laid out like `assets/sample_result.png`: the score up front, then
 * "points · time played · end reason". The brief also requires the registration state of
 * the match, which the sample does not show; it sits on a discreet line below.
 */
export function ResultScreen() {
  const result = useAppStore((s) => s.lastResult)
  const play = useAppStore((s) => s.play)
  const goToMenu = useAppStore((s) => s.goToMenu)
  const heading = useFocusOnMount<HTMLHeadingElement>()

  if (result === null) return null

  const reason = result.endReason === 'death' ? 'Defeated' : 'Time up'

  return (
    <main className="menu-screen">
      <section className="panel result-panel" aria-labelledby="result-title">
        <h1 id="result-title" ref={heading} tabIndex={-1} className="result-title">
          Battle complete
        </h1>
        {/* One sentence for screen readers: "24 points · played for 02:00 · Time up". */}
        <p className="result-summary">
          <span className="result-score">{result.score}</span>
          <span className="result-details">
            {result.score === 1 ? 'Point' : 'Points'} · <span className="visually-hidden">played for </span>
            {formatClockPadded(result.durationSeconds)} · {reason}
          </span>
        </p>
        <p className="result-record">
          <span className="visually-hidden">Match record: </span>
          <SubmissionStatus matchId={result.matchId} />
        </p>
        <div className="result-actions">
          <MenuButton className="menu-button-large" sound="ui_open" onClick={play}>
            Play Again
          </MenuButton>
          <MenuButton className="menu-button-large" sound="ui_back" onClick={goToMenu}>
            Main Menu
          </MenuButton>
        </div>
      </section>
    </main>
  )
}
