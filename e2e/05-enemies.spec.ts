import { DOOMED, openApp, startMatch, state, step } from './support/app'
import { expect, test } from './support/fixtures'

test('spawns enemies on the configured interval', async ({ page }) => {
  await openApp(page, { matchSeed: 7, options: { sessionSeconds: 60, spawnIntervalSeconds: 2 } })
  await startMatch(page)
  const spawned = async () => {
    const s = await state(page)
    return s.enemies.length + s.events.scoredKills + s.events.chaserSelfDestructs
  }
  await step(page, 1.4)
  expect(await spawned()).toBe(0)
  await step(page, 0.2)
  expect(await spawned()).toBe(1)
  await step(page, 2)
  expect(await spawned()).toBe(2)
  await step(page, 2)
  expect(await spawned()).toBe(3)
})

test('Chasers close in and explode on impact without scoring; Shooters fire only within range', async ({ page }) => {
  await openApp(page, { matchSeed: DOOMED.seed, options: DOOMED })
  await startMatch(page)

  const kinds = new Set<string>()
  let lastShots = 0
  const chaserGaps = new Map<number, number[]>()
  for (let i = 0; i < 80; i++) {
    await step(page, 0.1)
    const s = await state(page)
    if (s.phase !== 'running') break
    for (const e of s.enemies) {
      kinds.add(e.kind)
      if (e.kind === 'chaser') chaserGaps.set(e.id, [...(chaserGaps.get(e.id) ?? []), Math.hypot(e.x - s.player.x, e.y - s.player.y)])
    }
    if (s.events.enemyShots > lastShots) {
      const nearest = Math.min(
        ...s.enemies.filter((e) => e.kind === 'shooter').map((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y)),
      )
      expect(nearest).toBeLessThanOrEqual(s.config.shooterAttackRange + 30)
      lastShots = s.events.enemyShots
    }
  }

  const s = await state(page)
  expect([...kinds].sort()).toEqual(['chaser', 'shooter'])
  expect(s.events.chaserSelfDestructs).toBeGreaterThan(0)
  expect(s.events.enemyShots).toBeGreaterThan(0)
  expect(s.score).toBe(0)
  const tracked = [...chaserGaps.values()].filter((gaps) => gaps.length > 3)
  expect(tracked.length).toBeGreaterThan(0)
  for (const gaps of tracked) expect(gaps[gaps.length - 1]!).toBeLessThan(gaps[0]!)
})
