import { SURVIVOR, openApp, playSurvivorMatch, startMatch } from './support/app'
import { expect, test } from './support/fixtures'

test('recovers a registration whose response timed out, without a duplicate', async ({ page }) => {
  await openApp(page, { scenario: 'register-timeout', matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  await playSurvivorMatch(page)
  await expect(page.locator('.result-record')).toContainText('Registering')
  await expect(page.locator('.result-record')).toContainText('Registered', { timeout: 30_000 })

  await page.getByRole('button', { name: 'Main Menu' }).click()
  await page.getByRole('button', { name: 'Match History' }).click()
  await expect(page.locator('.records-table tbody tr')).toHaveCount(1)
})

test('repeated retry clicks never create a second record', async ({ page }) => {
  await openApp(page, { scenario: 'register-unavailable', matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  await playSurvivorMatch(page)
  await expect(page.locator('.result-record')).toContainText('Not registered')

  await page.getByRole('button', { name: 'Main Menu' }).click()
  await page.getByRole('button', { name: 'Match History' }).click()
  await page.getByText('Simulated network').click()
  await page.getByLabel('Scenario').selectOption('success')
  const retry = page.getByRole('button', { name: 'Retry now' })
  await retry.click()
  await retry.click({ force: true, timeout: 1000 }).catch(() => undefined)
  await retry.click({ force: true, timeout: 1000 }).catch(() => undefined)
  await expect(page.getByText(/waiting to be registered/)).toHaveCount(0)
  await expect(page.locator('.records-table tbody tr')).toHaveCount(1)
})

test('a slow, older response never overwrites the page shown', async ({ page }) => {
  await openApp(page, { scenario: 'out-of-order' })
  await page.getByRole('button', { name: 'Ranking' }).click()
  await expect(page.getByText('Page 1 of 7')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Next page' }).click()
  await page.getByRole('button', { name: 'Previous page' }).click()
  await page.waitForTimeout(2500)
  await expect(page.getByText('Page 1 of 7')).toBeVisible()
  await expect(page.locator('.records-table tbody tr').first().locator('td').first()).toHaveText('01')
})
