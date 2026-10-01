import { HudPublisher } from './hud'
import type { HudElements } from './hud'
import type { HudSnapshot } from '../sim/types'

type FakeElement = HTMLElement & { writes: number; vars: Record<string, string> }

function fakeElement(): FakeElement {
  let text = ''
  const el = {
    writes: 0,
    hidden: false,
    dataset: {} as Record<string, string>,
    vars: {} as Record<string, string>,
    style: {
      setProperty(name: string, value: string) {
        el.vars[name] = value
      },
    },
    get textContent() {
      return text
    },
    set textContent(value: string) {
      el.writes++
      text = value
    },
  }
  return el as unknown as FakeElement
}

function fakeHud() {
  return {
    score: fakeElement(),
    time: fakeElement(),
    hp: fakeElement(),
    hpFill: fakeElement(),
    enemies: fakeElement(),
    status: fakeElement(),
  } satisfies HudElements
}

const base: HudSnapshot = {
  phase: 'running',
  score: 3,
  timeLeftSeconds: 65.2,
  elapsedSeconds: 54.8,
  playerHp: 80,
  playerMaxHp: 100,
  enemyCount: 4,
  projectileCount: 2,
  endReason: null,
}

describe('HudPublisher', () => {
  it('formats values into their slots', () => {
    const el = fakeHud()
    new HudPublisher(el).publish(base)
    expect(el.score.textContent).toBe('3')
    expect(el.time.textContent).toBe('1:06')
    expect(el.hp.textContent).toBe('80 / 100')
    expect(el.hpFill.vars['--hp']).toBe('0.8')
    expect(el.hpFill.dataset['level']).toBe('high')
    expect(el.enemies.textContent).toBe('4')
    expect(el.status.textContent).toBe('Match running.')
  })

  it('skips DOM writes when displayed values are unchanged', () => {
    const el = fakeHud()
    const hud = new HudPublisher(el)
    hud.publish(base)
    hud.publish({ ...base, timeLeftSeconds: 65.1, projectileCount: 9 })
    expect(el.score.writes).toBe(1)
    expect(el.time.writes).toBe(1)
    expect(el.status.writes).toBe(1)
  })

  it('shows the end-of-match message with the final score', () => {
    const el = fakeHud()
    new HudPublisher(el).publish({ ...base, phase: 'ended', endReason: 'death', score: 7 })
    expect(el.status.textContent).toContain('sank')
    expect(el.status.textContent).toContain('Final score 7')
  })
})
