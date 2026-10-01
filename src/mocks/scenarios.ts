import { z } from 'zod'
import { readStored, removeStored, writeStored } from '../storage/localStore'

export const SCENARIO_KEY = 'pirate-battle:mock-scenario:v1'

/** Network conditions the mock API can simulate (brief §6). */
export const SCENARIOS = {
  success: 'Success: quick, reliable responses',
  empty: 'Empty lists',
  'many-pages': 'Many pages of ranking',
  slow: 'Slow responses (2.5 s)',
  'variable-latency': 'Variable latency (0.1–2.5 s, seeded)',
  'out-of-order': 'Out-of-order responses',
  timeout: 'Timeouts: no response in time',
  'connection-failure': 'Connection failures',
  'http-4xx': 'HTTP 400 responses',
  'http-5xx': 'HTTP 503 responses',
  'ranking-failure': 'Ranking fails, history works',
  'history-failure': 'History fails, ranking works',
  'register-timeout': 'Registration saved, but its first response times out',
  'register-unavailable': 'Registration unavailable (503)',
} as const

export type ScenarioId = keyof typeof SCENARIOS
export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[]

const storedSchema = z.object({
  scenario: z.enum(SCENARIO_IDS as [ScenarioId, ...ScenarioId[]]),
  seed: z.number().int(),
})
export type ScenarioSettings = z.infer<typeof storedSchema>

export const DEFAULT_SCENARIO: ScenarioSettings = { scenario: 'success', seed: 1 }

/**
 * The active scenario. `?scenario=<id>&seed=<n>` in the URL wins and is remembered, so a
 * test or a shared link selects it reproducibly; otherwise the last selection is restored.
 */
export function loadScenario(storage: Storage | null, search = ''): ScenarioSettings {
  const params = new URLSearchParams(search)
  const fromUrl = storedSchema.safeParse({
    scenario: params.get('scenario') ?? undefined,
    seed: params.has('seed') ? Number(params.get('seed')) : DEFAULT_SCENARIO.seed,
  })
  if (fromUrl.success) {
    writeStored(storage, SCENARIO_KEY, fromUrl.data)
    return fromUrl.data
  }
  return readStored(storage, SCENARIO_KEY, storedSchema) ?? DEFAULT_SCENARIO
}

export function saveScenario(storage: Storage | null, settings: ScenarioSettings): void {
  writeStored(storage, SCENARIO_KEY, settings)
}

export function clearScenario(storage: Storage | null): void {
  removeStored(storage, SCENARIO_KEY)
}
