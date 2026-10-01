import { Suspense, lazy, useEffect } from 'react'
import { useAppStore } from './appStore'
import { MainMenu } from './screens/MainMenu'
import { OptionsScreen } from './screens/OptionsScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { ResultScreen } from './screens/ResultScreen'
import { SubmissionManager } from './SubmissionManager'
import { preloadUiSounds } from './uiSounds'

const GameScreen = lazy(() => import('./screens/GameScreen').then((module) => ({ default: module.GameScreen })))

/**
 * The app shell: background match registration plus the current screen. The match screen,
 * which pulls in PixiJS, loads on demand, so the menus never wait for the renderer.
 */
export function App() {
  const screen = useAppStore((s) => s.screen)
  const match = useAppStore((s) => s.match)

  useEffect(preloadUiSounds, [])

  return (
    <>
      <SubmissionManager />
      {renderScreen()}
    </>
  )

  function renderScreen() {
    switch (screen) {
      case 'menu':
        return <MainMenu />
      case 'options':
        return <OptionsScreen />
      case 'records':
        return <RecordsScreen />
      case 'result':
        return <ResultScreen />
      case 'game':
        return match === null ? (
          <MainMenu />
        ) : (
          <Suspense fallback={<LoadingScreen />}>
            <GameScreen key={match.matchId} match={match} />
          </Suspense>
        )
    }
  }
}

function LoadingScreen() {
  return (
    <div className="loading" role="status">
      <div className="loading-panel">
        <p className="loading-title">Loading the game…</p>
      </div>
    </div>
  )
}
