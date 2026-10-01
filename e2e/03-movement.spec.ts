import { hold, openApp, overlapsIsland, startMatch, state, step } from './support/app'
import { expect, test } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await openApp(page, { matchSeed: 7, options: { sessionSeconds: 180, spawnIntervalSeconds: 10 } })
  await startMatch(page)
})

test('sails forward along its heading and turns both ways', async ({ page }) => {
  const start = await state(page)
  await hold(page, ['KeyW'], 1)
  const moved = await state(page)
  const dx = moved.player.x - start.player.x
  const dy = moved.player.y - start.player.y
  expect(Math.hypot(dx, dy)).toBeGreaterThan(80)
  expect(dx * Math.cos(start.player.angle) + dy * Math.sin(start.player.angle)).toBeCloseTo(Math.hypot(dx, dy), 0)

  await step(page, 1)
  const before = (await state(page)).player.angle
  await hold(page, ['KeyD'], 0.25)
  const right = (await state(page)).player.angle
  await hold(page, ['KeyA'], 0.5)
  const left = (await state(page)).player.angle
  expect(right - before).toBeCloseTo(start.config.playerTurnRate * 0.25, 1)
  expect(left - right).toBeCloseTo(-start.config.playerTurnRate * 0.5, 1)
})

test('never reverses: holding S does not move the ship', async ({ page }) => {
  const start = await state(page)
  await hold(page, ['KeyS'], 1)
  const after = await state(page)
  expect(after.player.x).toBe(start.player.x)
  expect(after.player.y).toBe(start.player.y)
})

test('stays inside the arena and slides along islands without entering them', async ({ page }) => {
  const s0 = await state(page)
  const turnFor = (radians: number) => Math.abs(radians) / s0.config.playerTurnRate

  await hold(page, ['KeyA'], turnFor(Math.PI / 4))
  await page.keyboard.down('KeyW')
  for (let i = 0; i < 40; i++) {
    await step(page, 0.15)
    const s = await state(page)
    expect(s.player.y).toBeGreaterThanOrEqual(s.player.radius - 1e-6)
    expect(overlapsIsland(s)).toBe(false)
  }
  await page.keyboard.up('KeyW')
  const atWall = await state(page)
  expect(atWall.player.y).toBeCloseTo(atWall.player.radius, 3)

  await step(page, 0.6)
  const here = await state(page)
  const target = Math.atan2(250 - here.player.y, 420 - here.player.x)
  await hold(page, ['KeyD'], turnFor(target - here.player.angle))
  await page.keyboard.down('KeyW')
  for (let i = 0; i < 30; i++) {
    await step(page, 0.1)
    expect(overlapsIsland(await state(page))).toBe(false)
  }
  await page.keyboard.up('KeyW')
  expect((await state(page)).events.playerScrapes).toBeGreaterThan(0)
})

test('steers toward the mouse pointer @desktop', async ({ page }) => {
  const s = await state(page)
  const canvas = await page.locator('canvas').boundingBox()
  const point = await page.evaluate(
    ([x, y]) => window.__pirateBattle!.arenaToScreen(x, y),
    [s.player.x, s.player.y + 300] as const,
  )
  await page.mouse.move(canvas!.x + point.x, canvas!.y + point.y)
  await step(page, 1.5)
  expect((await state(page)).player.angle).toBeCloseTo(Math.PI / 2, 1)
})
