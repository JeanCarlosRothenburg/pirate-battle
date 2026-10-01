import { openApp } from './support/app'
import { expect, test } from './support/fixtures'

test('the ranking pages through like-for-like matches', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ranking' }).click()
  await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('120 second battles · 3 second spawn interval')).toBeVisible()
  const rows = page.locator('.records-table tbody tr')
  await expect(rows).toHaveCount(5)
  await expect(page.getByText('Page 1 of 7')).toBeVisible()
  await expect(rows.first().locator('td').first()).toHaveText('01')

  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('Page 2 of 7')).toBeVisible()
  await expect(rows.first().locator('td').first()).toHaveText('06')
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(page.getByText('Page 1 of 7')).toBeVisible()
})

test('shows a loading state, then the data, on a slow network', async ({ page }) => {
  await openApp(page, { scenario: 'slow' })
  await page.getByRole('button', { name: 'Ranking' }).click()
  await expect(page.getByText('Loading the ranking…')).toBeVisible()
  await expect(page.locator('.records-table tbody tr')).toHaveCount(5)
  await page.getByRole('tab', { name: 'Match History' }).click()
  await expect(page.getByText('Loading your battles…')).toBeVisible()
  await expect(page.getByText(/No registered battles yet/)).toBeVisible()
})

test('shows empty lists', async ({ page }) => {
  await openApp(page, { scenario: 'empty' })
  await page.getByRole('button', { name: 'Ranking' }).click()
  await expect(page.getByText('No battles recorded with these settings yet.')).toBeVisible()
  await page.getByRole('tab', { name: 'Match History' }).click()
  await expect(page.getByText(/No registered battles yet/)).toBeVisible()
})

test('reports a failing ranking with a retry, while the history still works', async ({ page }) => {
  await openApp(page, { scenario: 'ranking-failure' })
  await page.getByRole('button', { name: 'Ranking' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('The server is unavailable (HTTP 500).')
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()

  await page.getByRole('tab', { name: 'Match History' }).click()
  await expect(page.getByText(/No registered battles yet/)).toBeVisible()

  await page.getByText('Simulated network').click()
  await page.getByLabel('Scenario').selectOption('success')
  await page.getByRole('tab', { name: 'Ranking' }).click()
  await expect(page.locator('.records-table tbody tr')).toHaveCount(5)
})
