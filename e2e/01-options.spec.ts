import { openApp, startMatch, state } from './support/app'
import { expect, test } from './support/fixtures'

test('navigates to Options, validates, saves, persists after refresh and applies to the next match', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Options' }).click()
  await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible()

  const session = page.getByLabel('Game session time (seconds)')
  const spawn = page.getByLabel('Enemy spawn time (seconds)')
  await session.fill('59')
  await spawn.fill('0')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toHaveText('2 fields need attention.')
  await expect(session).toHaveAttribute('aria-invalid', 'true')
  await expect(session).toBeFocused()
  await expect(page.getByText('Use at least 60 seconds.')).toBeVisible()
  await expect(page.getByText('The interval must be positive.')).toBeVisible()

  await page.getByLabel('Player name').fill('Anne')
  await session.fill('75')
  await spawn.fill('2.5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Options saved.')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Options' }).click()
  await expect(page.getByLabel('Player name')).toHaveValue('Anne')
  await expect(session).toHaveValue('75')
  await expect(spawn).toHaveValue('2.5')

  await page.getByRole('button', { name: 'Back' }).click()
  await startMatch(page)
  const s = await state(page)
  expect(s.config).toMatchObject({ sessionSeconds: 75, spawnIntervalSeconds: 2.5 })
  expect(s.timeLeftSeconds).toBe(75)
})
