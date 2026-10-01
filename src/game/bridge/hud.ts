import type { HudSnapshot } from '../sim/types'

export const HUD_PUBLISH_INTERVAL_MS = 100

export interface HudElements {
  readonly score: HTMLElement
  readonly time: HTMLElement
  readonly hp: HTMLElement
  readonly hpFill: HTMLElement
  readonly enemies: HTMLElement
  readonly status: HTMLElement
}

const HUD_KEYS = ['score', 'time', 'hp', 'hpFill', 'enemies', 'status'] as const

/** Collects the `[data-hud="…"]` slots rendered by the React HUD markup. */
export function queryHudElements(root: ParentNode): HudElements {
  const found: Partial<Record<(typeof HUD_KEYS)[number], HTMLElement>> = {}
  for (const key of HUD_KEYS) {
    const el = root.querySelector<HTMLElement>(`[data-hud="${key}"]`)
    if (el === null) throw new Error(`HUD element [data-hud="${key}"] is missing`)
    found[key] = el
  }
  return found as HudElements
}

/**
 * Writes snapshots straight into the DOM, touching a node only when its text changes.
 * React renders the HUD shell once and never re-renders for game state.
 */
export class HudPublisher {
  private score = -1
  private seconds = -1
  private hp = -1
  private maxHp = -1
  private enemies = -1
  private status: string | null = null

  constructor(private readonly el: HudElements) {}

  publish(s: HudSnapshot): void {
    if (s.score !== this.score) {
      this.score = s.score
      this.el.score.textContent = String(s.score)
    }

    const seconds = Math.ceil(s.timeLeftSeconds)
    if (seconds !== this.seconds) {
      this.seconds = seconds
      this.el.time.textContent = formatClock(seconds)
    }

    if (s.playerHp !== this.hp || s.playerMaxHp !== this.maxHp) {
      this.hp = s.playerHp
      this.maxHp = s.playerMaxHp
      const ratio = s.playerMaxHp > 0 ? s.playerHp / s.playerMaxHp : 0
      this.el.hp.textContent = `${Math.ceil(s.playerHp)} / ${s.playerMaxHp}`
      // The fill art is clipped, not scaled, so its rounded ends keep their shape.
      this.el.hpFill.style.setProperty('--hp', String(ratio))
      this.el.hpFill.dataset.level = ratio > 0.5 ? 'high' : ratio > 0.25 ? 'mid' : 'low'
    }

    if (s.enemyCount !== this.enemies) {
      this.enemies = s.enemyCount
      this.el.enemies.textContent = String(s.enemyCount)
    }

    // A polite live region: it only changes on phase transitions, never per frame.
    const status = statusText(s)
    if (status !== this.status) {
      this.status = status
      this.el.status.textContent = status
    }
  }
}

function statusText(s: HudSnapshot): string {
  switch (s.phase) {
    case 'idle':
      return ''
    case 'running':
      return 'Match running.'
    case 'paused':
      return 'Match paused.'
    case 'ended':
      return `${s.endReason === 'death' ? 'Your ship sank' : "Time's up"}. Final score ${s.score}.`
  }
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
