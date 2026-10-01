import { openApp } from './support/app'
import { expect, test } from './support/fixtures'

test('shows loading progress, reports a failed asset and recovers with Retry', async ({ page, context }) => {
  let failing = true
  await context.route(/tiles_sheet[^/]*\.png$/, async (route) => {
    if (failing) return route.abort()
    await new Promise((resolve) => setTimeout(resolve, 800))
    return route.continue()
  })
  await openApp(page)
  await page.getByRole('button', { name: 'Play' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('The game assets could not be loaded.')
  await expect(alert).toContainText('tiles_sheet')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeFocused()

  failing = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('progressbar', { name: 'Loading game assets' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByText('Pirate Battle match')).toBeAttached()
  await page.waitForFunction(() => window.__pirateBattle?.state().phase === 'running')
})
