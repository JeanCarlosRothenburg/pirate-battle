import { HttpResponse, delay, http } from 'msw'
import type { HttpHandler } from 'msw'
import { matchRecordSchema, pageQuerySchema } from '../api/contracts'
import type { MatchRecord } from '../api/contracts'
import { createRng } from '../game/sim/rng'
import type { Rng } from '../game/sim/rng'
import { MockDatabase } from './database'
import { DEFAULT_FINGERPRINT, fixtureRecords } from './fixtures'
import type { ScenarioId, ScenarioSettings } from './scenarios'

export const API_BASE = '/api'

export const BEYOND_CLIENT_TIMEOUT_MS = 8000

type Endpoint = 'ranking' | 'history' | 'register'

interface ScenarioRequest {
  readonly endpoint: Endpoint
  readonly index: number
  readonly rng: Rng
}

type ScenarioBehaviour = (request: ScenarioRequest) => Promise<Response | null>

const pass: ScenarioBehaviour = async () => null
const waitFor = (ms: (request: ScenarioRequest) => number): ScenarioBehaviour => async (request) => {
  await delay(ms(request))
  return null
}
const fail = (status: number, error: string, only?: Endpoint): ScenarioBehaviour => async ({ endpoint }) =>
  only === undefined || endpoint === only ? HttpResponse.json({ error }, { status }) : null

const SCENARIO_BEHAVIOUR: Readonly<Record<ScenarioId, ScenarioBehaviour>> = {
  success: pass,
  empty: pass,
  'many-pages': pass,
  slow: waitFor(() => 2500),
  'variable-latency': waitFor(({ rng }) => Math.round(rng.range(100, 2500))),
  'out-of-order': waitFor(({ index }) => (index % 2 === 0 ? 1800 : 150)),
  timeout: waitFor(() => BEYOND_CLIENT_TIMEOUT_MS),
  'connection-failure': async () => HttpResponse.error(),
  'http-4xx': fail(400, 'Bad request (simulated)'),
  'http-5xx': fail(503, 'Service unavailable (simulated)'),
  'ranking-failure': fail(500, 'Ranking unavailable (simulated)', 'ranking'),
  'history-failure': fail(500, 'History unavailable (simulated)', 'history'),
  'register-timeout': pass,
  'register-unavailable': fail(503, 'Registration unavailable (simulated)', 'register'),
}

export interface MockApi {
  readonly handlers: readonly HttpHandler[]
  readonly db: MockDatabase
  /** Switches scenario and reseeds latency, e.g. from the scenario panel or a test. */
  setScenario(settings: ScenarioSettings): void
  get scenario(): ScenarioSettings
  /** Restores the initial state: default scenario, no registered matches. */
  reset(settings: ScenarioSettings): void
}

/**
 * Builds the mock ranking and history API. The same handlers serve development, the
 * published demo (through the service worker) and the tests (through `msw/node`); `base` is
 * relative in the browser and absolute under Node.
 *
 * Each network scenario is a behaviour applied to every request (Strategy): it resolves to
 * a failure response, or lets the request through after any extra delay, on top of a small
 * seeded base latency. `out-of-order` makes every other request slow, so a later request
 * overtakes an earlier one. `register-timeout` lives in the PUT handler: the record is
 * committed and only the first response is delayed past the client timeout, so a retry
 * recovers it without a duplicate.
 */
export function createMockApi(
  storage: Storage | null,
  initial: ScenarioSettings,
  base = API_BASE,
): MockApi {
  let settings = initial
  let rng: Rng = createRng(initial.seed)
  let requestCount = 0
  const registerAttempts = new Map<string, number>()

  const normalFixtures = fixtureRecords(34)
  const manyFixtures = fixtureRecords(240)
  const db = new MockDatabase(() => (settings.scenario === 'many-pages' ? manyFixtures : normalFixtures), storage)

  /** Applies the active scenario to one request, after the seeded base latency every request gets. */
  async function condition(endpoint: Endpoint): Promise<Response | null> {
    const request: ScenarioRequest = { endpoint, index: requestCount++, rng }
    const failure = await SCENARIO_BEHAVIOUR[settings.scenario](request)
    if (failure !== null) return failure
    await delay(Math.round(rng.range(60, 180)))
    return null
  }

  const handlers: HttpHandler[] = [
    http.get(`${base}/ranking`, async ({ request }) => {
      const failure = await condition('ranking')
      if (failure !== null) return failure
      const url = new URL(request.url)
      const query = pageQuerySchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return HttpResponse.json({ error: 'Invalid page' }, { status: 400 })
      const config = url.searchParams.get('config') ?? DEFAULT_FINGERPRINT
      const empty = settings.scenario === 'empty'
      return HttpResponse.json(db.ranking(config, query.data.page, query.data.pageSize, !empty))
    }),

    http.get(`${base}/players/:playerId/matches`, async ({ request, params }) => {
      const failure = await condition('history')
      if (failure !== null) return failure
      const query = pageQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
      if (!query.success) return HttpResponse.json({ error: 'Invalid page' }, { status: 400 })
      if (settings.scenario === 'empty') {
        return HttpResponse.json({ items: [], page: query.data.page, pageSize: query.data.pageSize, totalItems: 0, totalPages: 0 })
      }
      return HttpResponse.json(db.history(String(params['playerId']), query.data.page, query.data.pageSize))
    }),

    http.put(`${base}/matches/:matchId`, async ({ request, params }) => {
      const failure = await condition('register')
      if (failure !== null) return failure
      const parsed = matchRecordSchema.safeParse(await request.json())
      if (!parsed.success || parsed.data.matchId !== params['matchId']) {
        return HttpResponse.json({ error: 'Invalid match record' }, { status: 400 })
      }
      const record: MatchRecord = parsed.data
      const result = db.register(record)

      const attempt = (registerAttempts.get(record.matchId) ?? 0) + 1
      registerAttempts.set(record.matchId, attempt)
      if (settings.scenario === 'register-timeout' && attempt === 1) await delay(BEYOND_CLIENT_TIMEOUT_MS)

      return HttpResponse.json(result, { status: result.created ? 201 : 200 })
    }),
  ]

  return {
    handlers,
    db,
    get scenario() {
      return settings
    },
    setScenario(next) {
      settings = next
      rng = createRng(next.seed)
      requestCount = 0
      registerAttempts.clear()
    },
    reset(next) {
      db.reset()
      this.setScenario(next)
    },
  }
}

