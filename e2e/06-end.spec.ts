import { DOOMED, SURVIVOR, openApp, startMatch, state, step, stepPastEnd } from './support/app'
import { expect, test } from './support/fixtures'

test('ends by time, freezes everything, and Play Again starts a clean match', async ({ page }) => {
  await openApp(page, { matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  const keys = ['KeyW', 'KeyD', 'Space', 'KeyQ']
  for (const key of keys) await page.keyboard.down(key)
  const [ended, later] = await stepPastEnd(page, SURVIVOR.sessionSeconds + 0.5, 3)
  for (const key of keys) await page.keyboard.up(key)
  expect(ended).toMatchObject({ phase: 'ended', endReason: 'time', elapsedSeconds: 60, timeLeftSeconds: 0 })
  expect(later.elapsedSeconds).toBe(ended.elapsedSeconds)
  expect(later.score).toBe(ended.score)
  expect(later.player).toEqual(ended.player)
  expect(later.enemies).toEqual(ended.enemies)
  expect(later.events).toEqual(ended.events)

  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Play Again' }).click()
  await page.waitForFunction(() => window.__pirateBattle?.state().phase === 'running')
  const fresh = await state(page)
  expect(fresh).toMatchObject({ score: 0, elapsedSeconds: 0, timeLeftSeconds: 60, projectiles: 0, enemies: [] })
  expect(fresh.player.hp).toBe(fresh.player.maxHp)
  expect(fresh.events.playerFrontShots).toBe(0)
})

test('ends when the hull is destroyed', async ({ page }) => {
  await openApp(page, { matchSeed: DOOMED.seed, options: DOOMED })
  await startMatch(page)
  await step(page, 15)
  const s = await state(page)
  expect(s).toMatchObject({ phase: 'ended', endReason: 'death' })
  expect(s.player.hp).toBe(0)
  expect(s.elapsedSeconds).toBeLessThan(60)
  await expect(page.locator('.result-details')).toContainText('Defeated')
})
