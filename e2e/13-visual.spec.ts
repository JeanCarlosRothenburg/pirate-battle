import { SURVIVOR, openApp, playSurvivorMatch, startMatch } from './support/app'
import { expect, test } from './support/fixtures'

test('main menu', async ({ page }) => {
  await openApp(page)
  await expect(page).toHaveScreenshot('menu.png')
})

test('arena in a stable state', async ({ page }) => {
  await openApp(page, { matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('arena.png')
})

test('result screen', async ({ page }) => {
  await openApp(page, { matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  await playSurvivorMatch(page)
  await expect(page.locator('.result-record')).toContainText('Registered')
  await expect(page).toHaveScreenshot('result.png')
})
