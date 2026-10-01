import { SURVIVOR, openApp, playSurvivorMatch, startMatch } from './support/app'
import { expect, test } from './support/fixtures'

test('registers a finished match once and both tabs show it', async ({ page }) => {
  await openApp(page, { matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  const s = await playSurvivorMatch(page)
  await expect(page.locator('.result-record')).toContainText('Registered')

  await page.getByRole('button', { name: 'Main Menu' }).click()
  await page.getByRole('button', { name: 'Ranking' }).click()
  await expect(page.getByText('60 second battles · 10 second spawn interval')).toBeVisible()
  const mine = page.locator('.records-table tbody tr', { hasText: 'Tester' })
  await expect(mine).toHaveCount(1)
  await expect(mine).toContainText('You')
  await expect(mine.locator('.records-points')).toHaveText(String(s.score))

  await page.getByRole('tab', { name: 'Match History' }).click()
  const history = page.locator('.records-table tbody tr')
  await expect(history).toHaveCount(1)
  await expect(history.first()).toContainText('Time up')
})

test('keeps a pending registration across a refresh and sends it once the service recovers', async ({ page }) => {
  await openApp(page, { scenario: 'register-unavailable', matchSeed: SURVIVOR.seed, options: SURVIVOR })
  await startMatch(page)
  await playSurvivorMatch(page)
  const record = page.locator('.result-record')
  await expect(record).toContainText('Not registered: The server is unavailable (HTTP 503).')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
  await expect(record).toContainText('Not registered')

  await page.getByRole('button', { name: 'Main Menu' }).click()
  await expect(page.getByText('1 match is waiting to be registered.')).toBeVisible()
  await page.getByRole('button', { name: 'Match History' }).click()
  await page.getByText('Simulated network').click()
  await page.getByLabel('Scenario').selectOption('success')
  await page.getByRole('button', { name: 'Retry now' }).click()
  await expect(page.getByText(/waiting to be registered/)).toHaveCount(0)
  await expect(page.locator('.records-table tbody tr')).toHaveCount(1)
})
