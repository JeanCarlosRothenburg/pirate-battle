import { SURVIVOR, openApp, playSurvivorMatch, startMatch } from './support/app'
import { expect, test } from './support/fixtures'

test('shows the result and keeps it after a refresh', async ({ page }) => {
  await openApp(page, { matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  const s = await playSurvivorMatch(page)

  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
  const summary = page.locator('.result-summary')
  await expect(page.locator('.result-score')).toHaveText(String(s.score))
  await expect(summary).toContainText('01:00')
  await expect(summary).toContainText('Time up')
  await expect(page.locator('.result-record')).toContainText('Registered')
  await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
  await expect(page.locator('.result-score')).toHaveText(String(s.score))
  await expect(page.locator('.result-record')).toContainText('Registered')
})
