/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs'
import type { CDPSession, Page } from '@playwright/test'
import { test } from '@playwright/test'
import { openApp, startMatch } from '../e2e/support/app'

const REPORT_DIR = 'reports/performance'
const COMBAT_KEYS = ['KeyW', 'KeyD', 'Space', 'KeyQ'] as const

interface FrameSample {
  readonly deltas: number[]
  readonly entities: { t: number; enemies: number; projectiles: number }[]
  readonly seconds: number
}

/** Holds the combat keys: the ship circles while firing its bow gun and port broadside. */
async function holdCombatKeys(page: Page, down: boolean): Promise<void> {
  for (const key of COMBAT_KEYS) await (down ? page.keyboard.down(key) : page.keyboard.up(key))
}

/**
 * Records every animation-frame interval and, once a second, the live entity counts, until
 * the match ends or `limitMs` passes.
 */
function sampleFrames(page: Page, limitMs: number): Promise<FrameSample> {
  return page.evaluate(
    (limit) =>
      new Promise<FrameSample>((resolve) => {
        const deltas: number[] = []
        const entities: FrameSample['entities'] = []
        const start = performance.now()
        let last = start
        let nextSample = start
        const frame = (now: number): void => {
          deltas.push(now - last)
          last = now
          const state = window.__pirateBattle?.state()
          if (now >= nextSample && state !== undefined) {
            entities.push({ t: Math.round((now - start) / 1000), enemies: state.enemies.length, projectiles: state.projectiles })
            nextSample += 1000
          }
          if (state === undefined || state.phase === 'ended' || now - start > limit) {
            resolve({ deltas: deltas.slice(1), entities, seconds: (now - start) / 1000 })
            return
          }
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
    limitMs,
  )
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

/** Frame statistics: rate, frame-time percentiles and the share of frames over budget. */
function summarise(sample: FrameSample) {
  const sorted = [...sample.deltas].sort((a, b) => a - b)
  const round = (n: number) => Math.round(n * 100) / 100
  const enemies = sample.entities.map((e) => e.enemies)
  const projectiles = sample.entities.map((e) => e.projectiles)
  return {
    durationSeconds: round(sample.seconds),
    frames: sample.deltas.length,
    averageFps: round(sample.deltas.length / sample.seconds),
    frameTimeMs: {
      p50: round(percentile(sorted, 50)),
      p95: round(percentile(sorted, 95)),
      p99: round(percentile(sorted, 99)),
      max: round(sorted[sorted.length - 1] ?? 0),
    },
    framesOver25ms: sorted.filter((d) => d > 25).length,
    entities: {
      maxEnemies: Math.max(...enemies),
      averageEnemies: round(enemies.reduce((a, b) => a + b, 0) / enemies.length),
      maxProjectiles: Math.max(...projectiles),
      averageProjectiles: round(projectiles.reduce((a, b) => a + b, 0) / projectiles.length),
      maxTotal: Math.max(...sample.entities.map((e) => e.enemies + e.projectiles + 1)),
    },
  }
}

/** Main-thread busy time so far, in seconds: all tasks, and script execution alone. */
async function mainThreadSeconds(cdp: CDPSession) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0
  return { task: get('TaskDuration'), script: get('ScriptDuration') }
}

/** JS heap, DOM nodes, listeners and documents after a forced garbage collection. */
async function memory(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0
  return {
    jsHeapUsedMB: Math.round((get('JSHeapUsedSize') / 1048576) * 100) / 100,
    domNodes: get('Nodes'),
    eventListeners: get('JSEventListeners'),
    documents: get('Documents'),
  }
}

test('combat over a three-minute match, then memory over five match cycles', async ({ page, context, browser }) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')

  await openApp(page, { matchSeed: 7, frozenClock: false, options: { sessionSeconds: 180, spawnIntervalSeconds: 3 } })
  const menuBaseline = await memory(cdp)
  await startMatch(page)
  await page.evaluate(() => window.__pirateBattle!.sustainPlayer())
  await holdCombatKeys(page, true)
  const busyBefore = await mainThreadSeconds(cdp)
  const sample = await sampleFrames(page, 190_000)
  const busyAfter = await mainThreadSeconds(cdp)
  await holdCombatKeys(page, false)
  const perFrame = (seconds: number) => Math.round(((seconds * 1000) / sample.deltas.length) * 100) / 100
  const combat = {
    ...summarise(sample),
    mainThreadPerFrameMs: {
      allTasks: perFrame(busyAfter.task - busyBefore.task),
      script: perFrame(busyAfter.script - busyBefore.script),
    },
  }
  await page.getByRole('button', { name: 'Main Menu' }).click()

  const cycles = []
  for (let cycle = 1; cycle <= 5; cycle++) {
    await startMatch(page)
    await holdCombatKeys(page, true)
    await page.waitForTimeout(15_000)
    await holdCombatKeys(page, false)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Main Menu' }).click()
    await page.getByRole('button', { name: 'Play' }).waitFor()
    await page.waitForTimeout(1000)
    cycles.push({ cycle, ...(await memory(cdp)), canvases: await page.locator('canvas').count() })
  }

  const report = {
    measuredAt: new Date().toISOString(),
    browser: `Google Chrome ${browser.version()} (headless, GPU: ${await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    })})`,
    viewport: '1280x720 CSS px, device pixel ratio 1',
    match: { seed: 7, sessionSeconds: 180, spawnIntervalSeconds: 3, input: 'W + D + Space + Q held (circling, bow gun and port broadside firing)', playerSustained: true },
    combat,
    memory: { menuBaseline, cycles },
  }
  mkdirSync(REPORT_DIR, { recursive: true })
  writeFileSync(`${REPORT_DIR}/profile.json`, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
})
