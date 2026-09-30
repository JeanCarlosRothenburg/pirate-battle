import { describe, expect, it } from 'vitest'
import { DEFAULT_GAME_CONFIG, buildConfig, configFingerprint } from '../config/gameConfig'
import type { GameConfig } from '../config/gameConfig'
import { isValidSpawnInterval, isValidSessionSeconds } from '../config/limits'
import {
  circleHitsAnyIsland,
  isFreeWater,
  segmentHitsAnyIsland,
  segmentHitsCircle,
} from '../systems/collision'
import { FixedStepRunner } from './loop'
import { angleDelta, distance } from './mathUtils'
import { createRng } from './rng'
import { Simulation } from './simulation'
import type { InputIntent } from './types'
import { NEUTRAL_INTENT } from './types'

const STEP = 1 / 60

function intent(partial: Partial<InputIntent>): InputIntent {
  return { ...NEUTRAL_INTENT, ...partial }
}

/** Config with spawning disabled, for tests about timing rather than combat. */
function peacefulConfig(sessionSeconds: number): Partial<GameConfig> {
  return {
    sessionSeconds,
    spawn: { ...DEFAULT_GAME_CONFIG.spawn, firstSpawnDelay: 1e6, intervalSeconds: 1e6 },
  }
}

function makeSim(overrides: Partial<GameConfig> = {}, seed = 1234): Simulation {
  const sim = new Simulation({ config: { ...DEFAULT_GAME_CONFIG, ...overrides }, seed })
  sim.start()
  return sim
}

function run(sim: Simulation, seconds: number, input: InputIntent = NEUTRAL_INTENT): void {
  const steps = Math.round(seconds / STEP)
  for (let i = 0; i < steps; i++) sim.step(STEP, input)
}

/** Counts fire events, which measure the weapon rate independently of projectile lifetime. */
function countShots(sim: Simulation, seconds: number, input: InputIntent): number {
  const steps = Math.round(seconds / STEP)
  let shots = 0
  for (let i = 0; i < steps; i++) {
    sim.step(STEP, input)
    for (const event of sim.events) {
      if (event.type === 'shot' && event.faction === 'player') shots++
    }
  }
  return shots
}

describe('rng', () => {
  it('produces the same stream for the same seed', () => {
    const a = createRng(99)
    const b = createRng(99)
    const left = [a.next(), a.next(), a.next()]
    const right = [b.next(), b.next(), b.next()]
    expect(left).toEqual(right)
  })

  it('diverges for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })
})

describe('configuration limits', () => {
  it('accepts only session durations between 60 and 180 seconds', () => {
    expect(isValidSessionSeconds(59)).toBe(false)
    expect(isValidSessionSeconds(60)).toBe(true)
    expect(isValidSessionSeconds(180)).toBe(true)
    expect(isValidSessionSeconds(181)).toBe(false)
  })

  it('rejects non-positive spawn intervals', () => {
    expect(isValidSpawnInterval(0)).toBe(false)
    expect(isValidSpawnInterval(-2)).toBe(false)
    expect(isValidSpawnInterval(3)).toBe(true)
  })

  it('changes the fingerprint when balancing changes', () => {
    const a = buildConfig({ sessionSeconds: 120, spawnIntervalSeconds: 3 })
    const b = buildConfig({ sessionSeconds: 120, spawnIntervalSeconds: 4 })
    expect(configFingerprint(a)).not.toBe(configFingerprint(b))
    expect(configFingerprint(a)).toBe(configFingerprint({ ...a }))
  })
})

describe('collision geometry', () => {
  it('detects a fast projectile crossing a target instead of tunnelling', () => {
    const crossed = segmentHitsCircle(0, 0, 100, 0, 50, 0, 6)
    expect(crossed).toBe(true)
  })

  it('reports no hit when the segment misses', () => {
    expect(segmentHitsCircle(0, 0, 100, 0, 50, 40, 6)).toBe(false)
  })
})

describe('frame-rate independence', () => {
  it('reaches the same position at 30 and 144 frames per second', () => {
    const input = intent({ throttle: 1 })
    const slow = makeSim()
    const fast = makeSim()
    const slowRunner = new FixedStepRunner()
    const fastRunner = new FixedStepRunner()

    for (let i = 0; i < 30; i++) slowRunner.advance(slow, 1 / 30, input)
    for (let i = 0; i < 144; i++) fastRunner.advance(fast, 1 / 144, input)

    // The accumulator remainder differs between the two frame budgets, so the
    // positions may lag by at most the distance covered in a single fixed step.
    const tolerance = DEFAULT_GAME_CONFIG.player.speed * STEP
    expect(Math.abs(slow.player.x - fast.player.x)).toBeLessThan(tolerance)
    expect(Math.abs(slow.player.y - fast.player.y)).toBeLessThan(tolerance)
  })

  it('clamps oversized frames so a background tab does not spiral', () => {
    const sim = makeSim()
    const runner = new FixedStepRunner()
    runner.advance(sim, 10, NEUTRAL_INTENT)
    expect(runner.lastStepCount).toBeLessThanOrEqual(15)
  })

  it('hands every step to onStep so no step events are lost in a long frame', () => {
    const sim = makeSim(peacefulConfig(120))
    const runner = new FixedStepRunner()
    let steps = 0
    let shots = 0
    // One 0.2 s frame runs 12 steps; the front gun (0.45 s cooldown) fires on the first.
    runner.advance(sim, 0.2, intent({ fireFront: true }), (s) => {
      steps++
      for (const event of s.events) if (event.type === 'shot') shots++
    })
    expect(steps).toBe(runner.lastStepCount)
    expect(shots).toBe(1)
    expect(sim.events.some((e) => e.type === 'shot')).toBe(false)
  })
})

describe('player movement', () => {
  it('starts in open water, clear of every island', () => {
    const sim = makeSim()
    expect(
      circleHitsAnyIsland(sim.player.x, sim.player.y, sim.player.radius, DEFAULT_GAME_CONFIG.arena),
    ).toBe(false)
  })

  it('never leaves the arena', () => {
    const sim = makeSim()
    run(sim, 30, intent({ throttle: 1 }))
    expect(sim.player.x).toBeGreaterThanOrEqual(sim.player.radius)
    expect(sim.player.y).toBeGreaterThanOrEqual(sim.player.radius)
    expect(sim.player.x).toBeLessThanOrEqual(DEFAULT_GAME_CONFIG.arena.width - sim.player.radius)
    expect(sim.player.y).toBeLessThanOrEqual(DEFAULT_GAME_CONFIG.arena.height - sim.player.radius)
  })

  it('never ends a step overlapping an island', () => {
    const sim = makeSim()
    for (let i = 0; i < 3600; i++) {
      sim.step(STEP, intent({ throttle: 1, turn: Math.sin(i / 60) }))
      const inside = circleHitsAnyIsland(
        sim.player.x,
        sim.player.y,
        sim.player.radius,
        DEFAULT_GAME_CONFIG.arena,
      )
      expect(inside).toBe(false)
      if (sim.phase !== 'running') break
    }
  })

  it('pushes a ship that starts inside an island out within one step', () => {
    for (const [x, y] of [
      [800 - 80 - 10, 450], // overlapping the rim of the central circular island
      [200, 660], // centre inside the bottom-left rectangular island
    ] as const) {
      const sim = makeSim(peacefulConfig(120))
      sim.player.x = x
      sim.player.y = y
      sim.step(STEP, NEUTRAL_INTENT)
      expect(circleHitsAnyIsland(sim.player.x, sim.player.y, sim.player.radius, sim.config.arena)).toBe(false)
    }
  })

  it('only moves forward: a negative throttle never sails astern', () => {
    const sim = makeSim(peacefulConfig(120))
    const startX = sim.player.x
    const startY = sim.player.y
    run(sim, 2, intent({ throttle: -1 }))
    expect(sim.player.speed).toBe(0)
    expect(sim.player.x).toBe(startX)
    expect(sim.player.y).toBe(startY)
  })

  it('rotates in both directions', () => {
    const left = makeSim()
    const right = makeSim()
    run(left, 0.5, intent({ turn: -1 }))
    run(right, 0.5, intent({ turn: 1 }))
    expect(left.player.angle).toBeLessThan(right.player.angle)
  })
})

describe('pointer steering', () => {
  function openWaterSim(): Simulation {
    const sim = makeSim(peacefulConfig(120))
    sim.player.x = 1000
    sim.player.y = 450
    sim.player.angle = 0
    sim.player.prevAngle = 0
    return sim
  }

  it('turns toward the pointer at the turn rate, then holds that heading', () => {
    const sim = openWaterSim()
    // A point straight "down" from the ship: a quarter turn away.
    const toward = intent({ steerTo: true, steerX: 1000, steerY: 700 })
    const perStep = sim.config.player.turnRate * STEP

    sim.step(STEP, toward)
    expect(sim.player.angle).toBeCloseTo(perStep, 9)

    run(sim, 1, toward)
    expect(sim.player.angle).toBeCloseTo(Math.PI / 2, 9)
  })

  it('re-aims every step from where the ship is now', () => {
    const sim = openWaterSim()
    const target = { steerTo: true, steerX: 1300, steerY: 600 }
    run(sim, 3, intent({ ...target, throttle: 1 }))
    const bearing = Math.atan2(target.steerY - sim.player.y, target.steerX - sim.player.x)
    // Having reached the point, it keeps circling it rather than holding the old bearing.
    expect(Math.abs(angleDelta(sim.player.angle, bearing))).toBeLessThan(Math.PI / 2)
  })

  it('lets the keyboard override the pointer', () => {
    const sim = openWaterSim()
    sim.step(STEP, intent({ turn: -1, steerTo: true, steerX: 1000, steerY: 700 }))
    expect(sim.player.angle).toBeLessThan(0)
  })

  it('holds the heading while the pointer is over the hull', () => {
    const sim = openWaterSim()
    run(sim, 0.5, intent({ steerTo: true, steerX: 1005, steerY: 460 }))
    expect(sim.player.angle).toBe(0)
  })
})

describe('island contact', () => {
  // The central island of the default arena: a circle at (800, 450), radius 80, centred
  // vertically, so the arena is mirror-symmetric across its horizontal axis.
  const island = { x: 800, y: 450, radius: 80 }
  const LEAD_IN = 120

  /**
   * Places the player so that, sailing straight at `heading`, it first touches the island's
   * left side (normal pointing -x) at 45° to the surface.
   */
  function approachAt45(heading: number): Simulation {
    const sim = makeSim(peacefulConfig(120))
    const reach = island.radius + sim.player.radius
    sim.player.x = island.x - reach - Math.cos(heading) * LEAD_IN
    sim.player.y = island.y - Math.sin(heading) * LEAD_IN
    sim.player.angle = heading
    sim.player.speed = 0
    return sim
  }

  function firstScrape(sim: Simulation, input: InputIntent, maxSeconds: number) {
    for (let i = 0; i < maxSeconds * 60; i++) {
      sim.step(STEP, input)
      if (sim.events.some((e) => e.type === 'scrape')) return { x: sim.player.x, y: sim.player.y }
    }
    throw new Error('the ship never touched the island')
  }

  it('slides a ship driven at 45° into a circular island along its edge', () => {
    const sim = approachAt45(-Math.PI / 4)
    const input = intent({ throttle: 1 })
    const contact = firstScrape(sim, input, 3)

    let contactSteps = 0
    for (let i = 0; i < 120; i++) {
      sim.step(STEP, input)
      if (sim.events.some((e) => e.type === 'scrape')) {
        contactSteps++
        expect(sim.player.speed).toBeGreaterThan(0)
      }
      expect(circleHitsAnyIsland(sim.player.x, sim.player.y, sim.player.radius, sim.config.arena)).toBe(false)
    }

    expect(contactSteps).toBeGreaterThan(1)
    const travelled = Math.hypot(sim.player.x - contact.x, sim.player.y - contact.y)
    expect(travelled).toBeGreaterThan(island.radius / 2)
  })

  it('stops a ship driven head-on into a flat rectangle face', () => {
    // Bottom-left rectangle (180, 640, 260 × 140): its top face is the line y = 640.
    const sim = makeSim(peacefulConfig(120))
    sim.player.x = 310
    sim.player.y = 640 - sim.player.radius - 100
    sim.player.angle = Math.PI / 2
    sim.player.speed = 0
    const input = intent({ throttle: 1 })

    run(sim, 2, input)
    const settled = { x: sim.player.x, y: sim.player.y }
    let scrapes = 0
    for (let i = 0; i < 60; i++) {
      sim.step(STEP, input)
      for (const e of sim.events) if (e.type === 'scrape' && e.strength > 0) scrapes++
    }

    expect(settled.x).toBeCloseTo(310, 9)
    expect(settled.y).toBeCloseTo(640 - sim.player.radius, 3)
    expect(sim.player.x).toBeCloseTo(settled.x, 9)
    expect(sim.player.y).toBeCloseTo(settled.y, 9)
    expect(scrapes).toBe(60)
  })

  it('scrapes toward the side the heading points to', () => {
    const up = approachAt45(-Math.PI / 4)
    const down = approachAt45(Math.PI / 4)
    const input = intent({ throttle: 1 })

    run(up, 1.2, input)
    run(down, 1.2, input)

    // Mirrored approaches across the island's horizontal axis give mirrored slides.
    expect(up.player.x).toBeCloseTo(down.player.x, 6)
    expect(up.player.y - island.y).toBeCloseTo(-(down.player.y - island.y), 6)
    expect(up.player.y).toBeLessThan(island.y)
    expect(down.player.y).toBeGreaterThan(island.y)
  })

  it('reports each contact as a scrape event with the contact point on the surface', () => {
    const sim = approachAt45(-Math.PI / 4)
    const input = intent({ throttle: 1 })
    for (let i = 0; i < 180; i++) {
      sim.step(STEP, input)
      const scrape = sim.events.find((e) => e.type === 'scrape')
      if (scrape === undefined || scrape.type !== 'scrape') continue
      expect(Math.hypot(scrape.x - island.x, scrape.y - island.y)).toBeCloseTo(island.radius, 3)
      expect(scrape.strength).toBeGreaterThanOrEqual(0)
      expect(scrape.faction).toBe('player')
      return
    }
    throw new Error('no scrape event')
  })
})

describe('enemy obstacle avoidance', () => {
  // The central island (800, 450, radius 80) sits exactly between the enemy and the player.
  const PLAYER = { x: 1010, y: 450 }

  function behindIsland(kind: 'chaser' | 'shooter', enemyX: number, avoidance = DEFAULT_GAME_CONFIG.avoidance) {
    const sim = makeSim({ ...peacefulConfig(120), avoidance })
    sim.player.x = PLAYER.x
    sim.player.y = PLAYER.y
    const enemy = placeEnemy(sim, kind, enemyX, PLAYER.y, 0)
    return { sim, enemy }
  }

  function runWatching(sim: Simulation, seconds: number, until: () => boolean) {
    let enemyScrapes = 0
    let reached = false
    for (let i = 0; i < seconds * 60 && !reached; i++) {
      sim.step(STEP, NEUTRAL_INTENT)
      for (const e of sim.events) if (e.type === 'scrape' && e.faction === 'enemy') enemyScrapes++
      reached = until()
    }
    return { enemyScrapes, reached }
  }

  it('steers a Chaser around an island to reach the player without touching it', () => {
    const { sim } = behindIsland('chaser', 590)
    let rammed = false
    const outcome = runWatching(sim, 8, () => {
      rammed ||= sim.events.some((e) => e.type === 'enemyKilled' && e.cause === 'selfDestruct')
      return rammed
    })
    expect(outcome.reached).toBe(true)
    expect(outcome.enemyScrapes).toBe(0)
  })

  it('leaves a Chaser stuck against the island when avoidance is off', () => {
    const { sim } = behindIsland('chaser', 590, { ...DEFAULT_GAME_CONFIG.avoidance, lookahead: 0 })
    const outcome = runWatching(sim, 8, () => sim.enemies.length === 0)
    expect(outcome.reached).toBe(false)
    expect(outcome.enemyScrapes).toBeGreaterThan(0)
  })

  it('steers a Shooter around an island into its preferred range', () => {
    const { sim, enemy } = behindIsland('shooter', 500)
    const range = sim.config.shooter.preferredRange
    const outcome = runWatching(sim, 10, () => distance(enemy.x, enemy.y, PLAYER.x, PLAYER.y) <= range)
    expect(outcome.reached).toBe(true)
    expect(outcome.enemyScrapes).toBe(0)
  })

  it('never lets an enemy end a step inside an island', () => {
    const sim = makeSim({ sessionSeconds: 180 }, 99)
    for (let i = 0; i < 180 * 60 && sim.phase === 'running'; i++) {
      sim.step(STEP, intent({ throttle: 1, turn: Math.sin(i / 70) }))
      for (const enemy of sim.enemies) {
        expect(circleHitsAnyIsland(enemy.x, enemy.y, enemy.radius, sim.config.arena)).toBe(false)
      }
    }
  })
})

describe('weapons', () => {
  it('fires a single frontal projectile', () => {
    const sim = makeSim()
    sim.step(STEP, intent({ fireFront: true }))
    expect(sim.projectiles).toHaveLength(1)
  })

  it('fires three parallel projectiles to each side', () => {
    const left = makeSim()
    left.step(STEP, intent({ fireLeft: true }))
    expect(left.projectiles).toHaveLength(DEFAULT_GAME_CONFIG.player.sideWeapon.barrelCount)

    const right = makeSim()
    right.step(STEP, intent({ fireRight: true }))
    expect(right.projectiles).toHaveLength(DEFAULT_GAME_CONFIG.player.sideWeapon.barrelCount)

    const headings = new Set(right.projectiles.map((p) => Math.atan2(p.vy, p.vx).toFixed(6)))
    expect(headings.size).toBe(1)
  })

  it('respects the cooldown between frontal shots', () => {
    const sim = makeSim(peacefulConfig(60))
    const input = intent({ fireFront: true })
    const cooldown = DEFAULT_GAME_CONFIG.player.frontWeapon.cooldown

    const duringCooldown = countShots(sim, cooldown * 0.8, input)
    expect(duringCooldown).toBe(1)

    const afterCooldown = countShots(sim, cooldown * 0.8, input)
    expect(afterCooldown).toBe(1)
  })

  it('fires at the configured rate over a longer window', () => {
    const sim = makeSim(peacefulConfig(60))
    const cooldown = DEFAULT_GAME_CONFIG.player.frontWeapon.cooldown
    const window = 5
    const shots = countShots(sim, window, intent({ fireFront: true }))
    // Cooldowns are quantised to the fixed step, so the count may fall one short
    // of the continuous-time ideal but must never exceed it.
    const ideal = Math.floor(window / cooldown) + 1
    expect(shots).toBeLessThanOrEqual(ideal)
    expect(shots).toBeGreaterThanOrEqual(ideal - 1)
  })

  it('allows moving and firing in the same step', () => {
    const sim = makeSim()
    const startX = sim.player.x
    sim.step(STEP, intent({ throttle: 1, fireFront: true }))
    expect(sim.projectiles).toHaveLength(1)
    expect(sim.player.x).not.toBe(startX)
  })
})

describe('damage and scoring', () => {
  it('applies each projectile once and removes it on impact', () => {
    const sim = makeSim()
    const enemy = spawnEnemyAhead(sim, 'shooter', 120)
    const hpBefore = enemy.hp

    run(sim, 0.6, intent({ fireFront: true }))

    const damageTaken = hpBefore - enemy.hp
    expect(damageTaken).toBeGreaterThan(0)
    expect(damageTaken % DEFAULT_GAME_CONFIG.player.frontWeapon.projectile.damage).toBe(0)
  })

  it('awards exactly one point per enemy destroyed by the player', () => {
    const sim = makeSim()
    spawnEnemyAhead(sim, 'shooter', 140)
    run(sim, 6, intent({ fireFront: true }))
    expect(sim.score).toBe(1)
  })

  it('does not award a point when a Chaser destroys itself against the player', () => {
    const sim = makeSim()
    const chaser = spawnEnemyAhead(sim, 'chaser', 5)
    chaser.x = sim.player.x
    chaser.y = sim.player.y
    sim.step(STEP, NEUTRAL_INTENT)

    expect(sim.score).toBe(0)
    expect(sim.player.hp).toBeLessThan(sim.player.maxHp)
    expect(sim.enemies).toHaveLength(0)
  })

  it('stops a destroyed enemy from colliding or dealing damage', () => {
    const sim = makeSim()
    const chaser = spawnEnemyAhead(sim, 'chaser', 60)
    chaser.hp = 1
    run(sim, 1.5, intent({ fireFront: true }))
    expect(sim.enemies.some((e) => e.id === chaser.id)).toBe(false)
  })
})

describe('match rules', () => {
  it('ends when the session time runs out', () => {
    const sim = makeSim(peacefulConfig(60))
    run(sim, 61)
    expect(sim.phase).toBe('ended')
    expect(sim.endReason).toBe('time')
    expect(sim.timeLeftSeconds).toBe(0)
  })

  it('ends when the player health reaches zero', () => {
    const sim = makeSim()
    sim.player.hp = 1
    const chaser = spawnEnemyAhead(sim, 'chaser', 5)
    chaser.x = sim.player.x
    chaser.y = sim.player.y
    sim.step(STEP, NEUTRAL_INTENT)
    expect(sim.phase).toBe('ended')
    expect(sim.endReason).toBe('death')
  })

  it('freezes the simulation once the match is over', () => {
    const sim = makeSim(peacefulConfig(60))
    run(sim, 61)
    const before = { x: sim.player.x, score: sim.score, enemies: sim.enemies.length }
    run(sim, 5, intent({ throttle: 1, fireFront: true }))
    expect(sim.player.x).toBe(before.x)
    expect(sim.score).toBe(before.score)
    expect(sim.enemies).toHaveLength(before.enemies)
  })

  it('suspends the clock and cooldowns while paused', () => {
    const sim = makeSim()
    run(sim, 1, intent({ fireFront: true }))
    const elapsed = sim.elapsedSeconds
    const cooldown = sim.player.frontCooldown

    sim.pause()
    run(sim, 3, intent({ throttle: 1, fireFront: true }))
    expect(sim.elapsedSeconds).toBe(elapsed)
    expect(sim.player.frontCooldown).toBe(cooldown)

    sim.resume()
    expect(sim.phase).toBe('running')
  })

  it('does not replay the paused period after resuming', () => {
    const sim = makeSim()
    const runner = new FixedStepRunner()
    const input = intent({ throttle: 1 })
    runner.advance(sim, 1 / 60, input)
    const x = sim.player.x

    sim.pause()
    runner.advance(sim, 5, input)
    runner.clear()
    sim.resume()
    runner.advance(sim, 1 / 60, input)

    expect(sim.player.x - x).toBeLessThan(10)
  })

  it('restores health, score, timer and entities on restart', () => {
    const sim = makeSim()
    run(sim, 20, intent({ throttle: 1, fireFront: true }))
    sim.start()

    expect(sim.score).toBe(0)
    expect(sim.elapsedSeconds).toBe(0)
    expect(sim.endReason).toBeNull()
    expect(sim.player.hp).toBe(DEFAULT_GAME_CONFIG.player.maxHp)
    expect(sim.enemies).toHaveLength(0)
    expect(sim.projectiles).toHaveLength(0)
    expect(sim.phase).toBe('running')
  })

  it('replays identically from the same seed', () => {
    const a = makeSim({}, 777)
    const b = makeSim({}, 777)
    const input = intent({ throttle: 1, turn: 0.4, fireFront: true })
    run(a, 20, input)
    run(b, 20, input)

    expect(a.score).toBe(b.score)
    expect(a.enemies.length).toBe(b.enemies.length)
    expect(a.player.x).toBeCloseTo(b.player.x, 6)
    expect(a.player.hp).toBe(b.player.hp)
  })
})

describe('spawning', () => {
  it('spawns both enemy types over a standard match', () => {
    const sim = makeSim({ sessionSeconds: 120 })
    const seen = new Set<string>()
    for (let i = 0; i < 120 * 60; i++) {
      sim.step(STEP, NEUTRAL_INTENT)
      for (const enemy of sim.enemies) seen.add(enemy.kind)
      if (sim.phase !== 'running') break
    }
    expect(seen.has('chaser')).toBe(true)
    expect(seen.has('shooter')).toBe(true)
  })

  it('honours the configured spawn interval', () => {
    const config = buildConfig({ sessionSeconds: 60, spawnIntervalSeconds: 5 })
    const sim = new Simulation({ config, seed: 42 })
    sim.start()
    run(sim, 20, NEUTRAL_INTENT)
    const expected = Math.floor((20 - config.spawn.firstSpawnDelay) / 5) + 1
    expect(sim.enemies.length).toBeLessThanOrEqual(expected)
    expect(sim.enemies.length).toBeGreaterThan(0)
  })

  it('never spawns on an island or next to the player', () => {
    const sim = makeSim({ sessionSeconds: 180 })
    const minDistance = DEFAULT_GAME_CONFIG.spawn.minDistanceFromPlayer
    const seenIds = new Set<number>()
    for (let i = 0; i < 180 * 60; i++) {
      sim.step(STEP, NEUTRAL_INTENT)
      for (const enemy of sim.enemies) {
        if (seenIds.has(enemy.id)) continue
        seenIds.add(enemy.id)
        expect(
          circleHitsAnyIsland(enemy.x, enemy.y, enemy.radius, DEFAULT_GAME_CONFIG.arena),
        ).toBe(false)
        expect(Math.hypot(enemy.x - sim.player.x, enemy.y - sim.player.y)).toBeGreaterThanOrEqual(
          minDistance - 1,
        )
      }
      if (sim.phase !== 'running') break
    }
    expect(seenIds.size).toBeGreaterThan(5)
  })
})

describe('enemy behaviour', () => {
  it('makes a Chaser close the distance to the player', () => {
    const sim = makeSim()
    const chaser = spawnEnemyAhead(sim, 'chaser', 400)
    const before = Math.hypot(chaser.x - sim.player.x, chaser.y - sim.player.y)
    run(sim, 2)
    const after = Math.hypot(chaser.x - sim.player.x, chaser.y - sim.player.y)
    expect(after).toBeLessThan(before)
  })

  it('keeps a Shooter from firing outside its attack range', () => {
    const sim = makeSim()
    spawnEnemyAhead(sim, 'shooter', DEFAULT_GAME_CONFIG.shooter.attackRange + 200)
    sim.step(STEP, NEUTRAL_INTENT)
    expect(sim.projectiles.filter((p) => p.faction === 'enemy')).toHaveLength(0)
  })

  it('makes a Shooter hold position inside its preferred range instead of backing away', () => {
    const sim = makeSim(peacefulConfig(120))
    const shooter = spawnEnemyAhead(sim, 'shooter', DEFAULT_GAME_CONFIG.shooter.preferredRange * 0.5)
    const gapBefore = Math.hypot(shooter.x - sim.player.x, shooter.y - sim.player.y)
    run(sim, 1)
    const gapAfter = Math.hypot(shooter.x - sim.player.x, shooter.y - sim.player.y)
    expect(shooter.speed).toBe(0)
    expect(gapAfter).toBeCloseTo(gapBefore, 6)
  })

  it('never moves any ship astern during a full match', () => {
    const sim = makeSim({ sessionSeconds: 120 }, 7)
    for (let i = 0; i < 120 * 60 && sim.phase === 'running'; i++) {
      sim.step(STEP, intent({ throttle: i % 240 < 120 ? 1 : 0, turn: Math.sin(i / 90) }))
      expect(sim.player.speed).toBeGreaterThanOrEqual(0)
      for (const enemy of sim.enemies) expect(enemy.speed).toBeGreaterThanOrEqual(0)
    }
  })

  it('makes a Shooter fire once inside range', () => {
    const sim = makeSim()
    spawnEnemyAhead(sim, 'shooter', DEFAULT_GAME_CONFIG.shooter.attackRange - 50)
    run(sim, 0.5)
    expect(sim.projectiles.filter((p) => p.faction === 'enemy').length).toBeGreaterThan(0)
  })
})

describe('resource lifecycle', () => {
  it('releases every entity across repeated match cycles', () => {
    const sim = makeSim({ sessionSeconds: 60 })
    for (let cycle = 0; cycle < 5; cycle++) {
      sim.start()
      run(sim, 30, intent({ throttle: 1, fireFront: true, turn: 0.2 }))
      sim.reset()
      expect(sim.enemies).toHaveLength(0)
      expect(sim.projectiles).toHaveLength(0)
    }
  })
})

/**
 * Test helper: turns the player toward a bearing where an enemy at `gap` sits in
 * open water with an unobstructed line of fire, then places the enemy there.
 */
function spawnEnemyAhead(
  sim: Simulation,
  kind: 'chaser' | 'shooter',
  gap: number,
): NonNullable<Simulation['enemies'][number]> {
  const stats = kind === 'chaser' ? sim.config.chaser : sim.config.shooter
  const arena = sim.config.arena
  let bearing: number | null = null

  for (let i = 0; i < 72; i++) {
    const candidate = sim.player.angle + (i * Math.PI) / 36
    const x = sim.player.x + Math.cos(candidate) * gap
    const y = sim.player.y + Math.sin(candidate) * gap
    if (!isFreeWater(x, y, stats.radius + 10, arena)) continue
    if (segmentHitsAnyIsland(sim.player.x, sim.player.y, x - sim.player.x, y - sim.player.y, 8, arena, 32)) {
      continue
    }
    bearing = candidate
    break
  }
  if (bearing === null) throw new Error(`no clear bearing at distance ${gap}`)
  sim.player.angle = bearing
  sim.player.prevAngle = bearing

  const enemy = {
    id: 9000 + sim.enemies.length,
    kind,
    faction: 'enemy' as const,
    x: sim.player.x + Math.cos(bearing) * gap,
    y: sim.player.y + Math.sin(bearing) * gap,
    prevX: 0,
    prevY: 0,
    angle: bearing + Math.PI,
    prevAngle: 0,
    speed: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    radius: stats.radius,
    alive: true,
    frontCooldown: 0,
    sideCooldown: 0,
    hitFlash: 0,
  }
  enemy.prevX = enemy.x
  enemy.prevY = enemy.y
  enemy.prevAngle = enemy.angle
  sim.enemies.push(enemy)
  return enemy
}

/** Test helper: puts an enemy of `kind` at (x, y), heading `angle`. */
function placeEnemy(
  sim: Simulation,
  kind: 'chaser' | 'shooter',
  x: number,
  y: number,
  angle: number,
): NonNullable<Simulation['enemies'][number]> {
  const stats = kind === 'chaser' ? sim.config.chaser : sim.config.shooter
  const enemy = {
    id: 9000 + sim.enemies.length,
    kind,
    faction: 'enemy' as const,
    x,
    y,
    prevX: x,
    prevY: y,
    angle,
    prevAngle: angle,
    speed: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    radius: stats.radius,
    alive: true,
    frontCooldown: 0,
    sideCooldown: 0,
    hitFlash: 0,
  }
  sim.enemies.push(enemy)
  return enemy
}
