import { useEffect } from 'react'
import { useAppStore } from './appStore'
import { GameScreen } from './screens/GameScreen'
import { MainMenu } from './screens/MainMenu'
import { OptionsScreen } from './screens/OptionsScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { ResultScreen } from './screens/ResultScreen'
import { SubmissionManager } from './SubmissionManager'
import { preloadUiSounds } from './uiSounds'

export function App() {
  const screen = useAppStore((s) => s.screen)
  const match = useAppStore((s) => s.match)

  useEffect(preloadUiSounds, [])

  return (
    <>
      {/* Registers finished matches in the background, whatever screen is showing. */}
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
        // Keyed by match so every match mounts a fresh game and the last one is torn down.
        return match === null ? <MainMenu /> : <GameScreen key={match.matchId} match={match} />
    }
  }
}
