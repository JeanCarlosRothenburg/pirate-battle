import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { playUiSound } from '../uiSounds'

export interface TabSpec {
  readonly id: string
  readonly label: string
  readonly content: ReactNode
}

/**
 * WAI-ARIA tabs: one tab stop for the tab list, arrow keys and Home/End to move between
 * tabs, and activation follows focus.
 */
interface TabsProps {
  readonly label: string
  readonly tabs: readonly TabSpec[]
  /** Index of the tab shown first. */
  readonly initialIndex?: number
}

export function Tabs({ label, tabs, initialIndex = 0 }: TabsProps) {
  const [active, setActive] = useState(initialIndex)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const baseId = useId()

  const select = (index: number): void => {
    const count = tabs.length
    const next = ((index % count) + count) % count
    setActive(next)
    buttons.current[next]?.focus()
    playUiSound('ui_click', 0.3)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    // Move from the focused tab (the pattern's reference point), falling back to the active one.
    const focused = buttons.current.findIndex((button) => button === event.target)
    const from = focused >= 0 ? focused : active
    const moves: Record<string, number> = {
      ArrowRight: from + 1,
      ArrowLeft: from - 1,
      Home: 0,
      End: tabs.length - 1,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    select(target)
  }

  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tab-list" onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[index] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-${tab.id}-tab`}
            aria-selected={index === active}
            aria-controls={`${baseId}-${tab.id}-panel`}
            tabIndex={index === active ? 0 : -1}
            className="tab"
            onClick={() => select(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-${tab.id}-panel`}
          aria-labelledby={`${baseId}-${tab.id}-tab`}
          tabIndex={0}
          hidden={index !== active}
          className="tab-panel"
        >
          {/* Mounted only while shown, so a panel's data refreshes each time it reappears. */}
          {index === active && tab.content}
        </div>
      ))}
    </div>
  )
}
