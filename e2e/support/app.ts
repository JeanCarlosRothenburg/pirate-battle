import type { Page } from '@playwright/test'
import type { TestState } from '../../src/game/bridge/testApi'
import { expect } from './fixtures'

export interface AppOptions {
  readonly scenario?: string
  readonly matchSeed?: number
  readonly frozenClock?: boolean
  readonly hooks?: boolean
  readonly options?: { sessionSeconds: number; spawnIntervalSeconds: number; playerName?: string }
}

export const SURVIVOR = { seed: 7, sessionSeconds: 60, spawnIntervalSeconds: 10 } as const
export const DOOMED = { seed: 1, sessionSeconds: 60, spawnIntervalSeconds: 0.5 } as const

/**
 * Opens the app with test instrumentation, a seeded network scenario and, optionally,
 * stored options, then waits for the main menu (which renders once the mock API listens).
 */
export async function openApp(page: Page, app: AppOptions = {}): Promise<void> {
  if (app.options) {
    const options = { playerName: 'Tester', ...app.options }
    await page.addInitScript((stored) => {
      if (sessionStorage.getItem('e2e-seeded') !== null) return
      localStorage.setItem('pirate-battle:options:v1', JSON.stringify(stored))
      sessionStorage.setItem('e2e-seeded', '1')
    }, options)
  }
  const params = new URLSearchParams({ scenario: app.scenario ?? 'success', seed: '1' })
  if (app.hooks !== false) params.set('testHooks', '')
  if (app.frozenClock !== false) params.set('frozenClock', '')
  if (app.matchSeed !== undefined) params.set('matchSeed', String(app.matchSeed))
  await page.goto(`/?${params.toString()}`)
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
}

/** Starts a match from the main menu and waits until it runs. */
export async function startMatch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 30_000 })
  await page.waitForFunction(() => window.__pirateBattle?.state().phase === 'running')
}

export function state(page: Page): Promise<TestState> {
  return page.evaluate(() => {
    const api = window.__pirateBattle
    if (api === undefined) throw new Error('test instrumentation is not installed')
    return api.state()
  })
}

/** Advances the frozen simulation with the keys and pointer currently held. */
export async function step(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => window.__pirateBattle?.step(s), seconds)
}

/** Holds keys for `seconds` of simulation, then releases them. */
export async function hold(page: Page, keys: readonly string[], seconds: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key)
  await step(page, seconds)
  for (const key of keys) await page.keyboard.up(key)
}

/**
 * Steps across the end of the match and on for `afterSeconds` more inside one page call, so
 * the result screen (shown 1.5 s of real time after the end) cannot interrupt, and returns
 * the state at the end and after the extra time.
 */
export function stepPastEnd(page: Page, untilEnd: number, afterSeconds: number): Promise<[TestState, TestState]> {
  return page.evaluate(
    ([until, after]) => {
      const api = window.__pirateBattle!
      api.step(until)
      const ended = api.state()
      api.step(after)
      return [ended, api.state()] as [TestState, TestState]
    },
    [untilEnd, afterSeconds] as const,
  )
}

/** Plays SURVIVOR's 60 s match (circling while firing) until it ends by time. */
export async function playSurvivorMatch(page: Page): Promise<TestState> {
  const keys = ['KeyW', 'KeyD', 'Space', 'KeyQ']
  for (const key of keys) await page.keyboard.down(key)
  const [ended] = await stepPastEnd(page, SURVIVOR.sessionSeconds + 1, 0)
  for (const key of keys) await page.keyboard.up(key)
  return ended
}

export function overlapsIsland(s: TestState, x = s.player.x, y = s.player.y, r = s.player.radius): boolean {
  return s.arena.islands.some((island) => {
    if (island.kind === 'circle') return Math.hypot(x - island.x, y - island.y) < island.radius + r - 1e-6
    const nx = Math.max(island.x, Math.min(x, island.x + island.width))
    const ny = Math.max(island.y, Math.min(y, island.y + island.height))
    return Math.hypot(x - nx, y - ny) < r - 1e-6
  })
}
