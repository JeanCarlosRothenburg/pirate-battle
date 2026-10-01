import { hold, openApp, startMatch, state, step } from './support/app'
import { expect, test } from './support/fixtures'

test('Esc pauses, freezes the timer, and resuming does not catch up on the paused time', async ({ page }) => {
  await openApp(page, { matchSeed: 7, frozenClock: false })
  await startMatch(page)
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: 'Paused' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused()

  const pausedAt = (await state(page)).elapsedSeconds
  await page.waitForTimeout(2000)
  expect((await state(page)).elapsedSeconds).toBe(pausedAt)
  await expect(page.locator('[data-hud=status]')).toHaveText('Match paused.')

  const resumedAtMs = Date.now()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(300)
  const resumed = (await state(page)).elapsedSeconds
  const realSeconds = (Date.now() - resumedAtMs) / 1000
  expect(resumed - pausedAt).toBeGreaterThan(0)
  expect(resumed - pausedAt).toBeLessThanOrEqual(realSeconds + 0.05)
  expect(resumed - pausedAt).toBeLessThan(1.5)
})

test('pauses automatically when the window loses focus or the tab is hidden', async ({ page }) => {
  await openApp(page, { matchSeed: 7 })
  await startMatch(page)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.waitForFunction(() => window.__pirateBattle?.state().phase === 'running')

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
})

test('keys held through a pause move nothing while paused', async ({ page }) => {
  await openApp(page, { matchSeed: 7 })
  await startMatch(page)
  await hold(page, ['KeyW'], 0.5)
  await page.keyboard.down('KeyW')
  await page.keyboard.press('KeyP')
  const paused = await state(page)
  await step(page, 2)
  await page.keyboard.up('KeyW')
  const after = await state(page)
  expect(after.phase).toBe('paused')
  expect(after.player.x).toBe(paused.player.x)
  expect(after.elapsedSeconds).toBe(paused.elapsedSeconds)
})
