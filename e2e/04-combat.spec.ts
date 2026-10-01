import { SURVIVOR, hold, openApp, playSurvivorMatch, startMatch, state, step } from './support/app'
import { expect, test } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await openApp(page, { matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
})

test('the bow gun fires one ball and respects its cooldown', async ({ page }) => {
  await page.keyboard.down('Space')
  await step(page, 1 / 60)
  expect((await state(page)).projectiles).toBe(1)
  await step(page, 2)
  await page.keyboard.up('Space')
  const s = await state(page)
  expect(s.events.playerFrontShots).toBeGreaterThanOrEqual(4)
  expect(s.events.playerFrontShots).toBeLessThanOrEqual(5)
})

test('broadsides fire three parallel balls to each side, with their own cooldown', async ({ page }) => {
  await page.keyboard.down('KeyQ')
  await step(page, 1 / 60)
  expect((await state(page)).projectiles).toBe(3)
  await step(page, 2)
  await page.keyboard.up('KeyQ')
  expect((await state(page)).events.playerSideShots).toBe(3)

  await step(page, 1)
  await hold(page, ['KeyE'], 1 / 60)
  expect((await state(page)).events.playerSideShots).toBe(4)
})

test('hits damage enemies and every kill scores exactly one point', async ({ page }) => {
  const s = await playSurvivorMatch(page)
  expect(s.score).toBeGreaterThanOrEqual(1)
  expect(s.events.scoredKills).toBe(s.score)
  expect(s.events.enemiesHitByPlayer).toBeGreaterThanOrEqual(s.score)
  expect(s.player.hp).toBeLessThan(s.player.maxHp)
  await expect(page.locator('.result-score')).toHaveText(String(s.score))
})
