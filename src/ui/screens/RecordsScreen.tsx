import { useAppStore } from '../appStore'
import { HistoryPanel } from '../components/HistoryPanel'
import { MenuButton } from '../components/MenuButton'
import { NetworkPanel } from '../components/NetworkPanel'
import { RankingPanel } from '../components/RankingPanel'
import { PendingNotice } from '../components/SubmissionStatus'
import { Tabs } from '../components/Tabs'
import { useFocusOnMount } from '../useFocusOnMount'

/**
 * The Captain's Log (`assets/sample_ranking.png`, `sample_history.png`): the ranking and the
 * match history as two tabs, opened from the main menu on either one.
 */
export function RecordsScreen() {
  const tab = useAppStore((s) => s.recordsTab)
  const goToMenu = useAppStore((s) => s.goToMenu)
  const heading = useFocusOnMount<HTMLHeadingElement>()

  return (
    <main className="menu-screen">
      <section className="panel records-panel" aria-labelledby="records-title">
        <h1 id="records-title" ref={heading} tabIndex={-1} className="panel-title">
          Captain&apos;s Log
        </h1>
        <PendingNotice />
        <Tabs
          label="Captain's Log"
          initialIndex={tab === 'history' ? 1 : 0}
          tabs={[
            { id: 'ranking', label: 'Ranking', content: <RankingPanel /> },
            { id: 'history', label: 'Match History', content: <HistoryPanel /> },
          ]}
        />
        <div className="form-actions">
          <MenuButton sound="ui_back" onClick={goToMenu}>
            Main Menu
          </MenuButton>
        </div>
        <NetworkPanel />
      </section>
    </main>
  )
}
