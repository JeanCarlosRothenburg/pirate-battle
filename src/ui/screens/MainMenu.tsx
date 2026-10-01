import shipUrl from '../../../assets/png/default/ships/ship_2.png'
import titleUrl from '../../../assets/png/default/ui/menu/title_pirate_battle.png'
import { useAppStore } from '../appStore'
import { ControlsHelp } from '../components/ControlsHelp'
import { MenuButton } from '../components/MenuButton'
import { PendingNotice } from '../components/SubmissionStatus'
import { useFocusOnMount } from '../useFocusOnMount'

/**
 * The main menu, laid out like `assets/sample_menu.png`: Play and Options up front, the
 * ranking and match history behind two buttons at the bottom. The control instructions the
 * brief requires on this screen sit in between.
 */
export function MainMenu() {
  const play = useAppStore((s) => s.play)
  const openOptions = useAppStore((s) => s.openOptions)
  const openRecords = useAppStore((s) => s.openRecords)
  const heading = useFocusOnMount<HTMLHeadingElement>()

  return (
    <main className="menu-screen">
      <section className="panel menu-main" aria-labelledby="menu-title">
        <h1 id="menu-title" ref={heading} tabIndex={-1} className="menu-title">
          <img src={titleUrl} alt="Pirate Battle" width={384} height={128} />
        </h1>
        <p className="menu-tagline">Set sail. Take command.</p>

        <div className="menu-actions">
          <MenuButton className="menu-button-large" sound="ui_open" onClick={play}>
            Play
          </MenuButton>
          <MenuButton className="menu-button-large" sound="ui_open" onClick={openOptions}>
            Options
          </MenuButton>
        </div>

        <img className="menu-ship" src={shipUrl} alt="" width={33} height={57} />
        <p className="menu-motto">Navigate the islands. Survive the battle.</p>

        <details className="menu-controls" open>
          <summary>How to play</summary>
          <ControlsHelp headingHidden />
        </details>

        <PendingNotice />

        <div className="menu-records-actions">
          <MenuButton variant="secondary" className="menu-button-small" sound="ui_open" onClick={() => openRecords('ranking')}>
            Ranking
          </MenuButton>
          <MenuButton variant="secondary" className="menu-button-small" sound="ui_open" onClick={() => openRecords('history')}>
            Match History
          </MenuButton>
        </div>
      </section>
    </main>
  )
}
