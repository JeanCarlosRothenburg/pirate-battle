import type { CDPSession, Locator } from '@playwright/test'
import { openApp, startMatch, state, step } from './support/app'
import { expect, test } from './support/fixtures'

test('abandoning a match records nothing', async ({ page }) => {
  await openApp(page, { matchSeed: 7 })
  await startMatch(page)
  await step(page, 5)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Main Menu' }).click()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)

  await page.getByRole('button', { name: 'Match History' }).click()
  await expect(page.getByText('No registered battles yet.', { exact: false })).toBeVisible()
  await expect(page.getByText(/waiting to be registered/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
})

test('navigating repeatedly between screens leaves one game at a time and no errors', async ({ page }) => {
  await openApp(page, { matchSeed: 7 })
  for (let round = 0; round < 3; round++) {
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Ranking' }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await page.getByRole('button', { name: 'Main Menu' }).click()
    await startMatch(page)
    await expect(page.locator('canvas')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Main Menu' }).click()
    await expect(page.locator('canvas')).toHaveCount(0)
  }
  expect(await page.evaluate(() => window.__pirateBattle)).toBeUndefined()
})

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchEnd', targets: readonly Locator[]): Promise<void> {
  const points = []
  for (const [index, target] of targets.entries()) {
    const box = await target.boundingBox()
    if (box !== null) points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, id: index + 1 })
  }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : points })
}

test('touch buttons sail and fire at the same time @mobile', async ({ page, context }) => {
  await openApp(page, { matchSeed: 7 })
  await startMatch(page)
  const cdp = await context.newCDPSession(page)
  const buttons = [page.getByRole('button', { name: 'Sail forward' }), page.getByRole('button', { name: 'Bow gun' })]
  await touch(cdp, 'touchStart', buttons)
  await step(page, 1)
  const held = await state(page)
  await touch(cdp, 'touchEnd', buttons)
  await step(page, 1)
  const released = await state(page)

  expect(held.player.speed).toBeGreaterThan(100)
  expect(held.events.playerFrontShots).toBeGreaterThanOrEqual(2)
  expect(released.player.speed).toBe(0)
})
