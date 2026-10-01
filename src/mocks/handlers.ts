import { HttpResponse, delay, http } from 'msw'
import type { HttpHandler } from 'msw'
import { matchRecordSchema, pageQuerySchema } from '../api/contracts'
import type { MatchRecord } from '../api/contracts'
import { createRng } from '../game/sim/rng'
import type { Rng } from '../game/sim/rng'
import { MockDatabase } from './database'
import { DEFAULT_FINGERPRINT, fixtureRecords } from './fixtures'
import type { ScenarioSettings } from './scenarios'

export const API_BASE = '/api'

/** Longer than the client timeout, so a "timed out" request really times out. */
export const BEYOND_CLIENT_TIMEOUT_MS = 8000

type Endpoint = 'ranking' | 'history' | 'register'

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
 * published demo (through the service worker) and the tests (through `msw/node`).
 */
export function createMockApi(
  storage: Storage | null,
  initial: ScenarioSettings,
  /** Relative in the browser (resolved against the page); absolute under Node. */
  base = API_BASE,
): MockApi {
  let settings = initial
  let rng: Rng = createRng(initial.seed)
  let requestCount = 0
  const registerAttempts = new Map<string, number>()

  const normalFixtures = fixtureRecords(34)
  const manyFixtures = fixtureRecords(240)
  const db = new MockDatabase(() => (settings.scenario === 'many-pages' ? manyFixtures : normalFixtures), storage)

  /** Latency and failures for one request, decided by the active scenario. */
  async function condition(endpoint: Endpoint): Promise<Response | null> {
    const n = requestCount++
    switch (settings.scenario) {
      case 'slow':
        await delay(2500)
        break
      case 'variable-latency':
        await delay(Math.round(rng.range(100, 2500)))
        break
      case 'out-of-order':
        // Every other request is slow, so a later request overtakes an earlier one.
        await delay(n % 2 === 0 ? 1800 : 150)
        break
      case 'timeout':
        await delay(BEYOND_CLIENT_TIMEOUT_MS)
        break
      case 'connection-failure':
        return HttpResponse.error()
      case 'http-4xx':
        return HttpResponse.json({ error: 'Bad request (simulated)' }, { status: 400 })
      case 'http-5xx':
        return HttpResponse.json({ error: 'Service unavailable (simulated)' }, { status: 503 })
      case 'ranking-failure':
        if (endpoint === 'ranking') return HttpResponse.json({ error: 'Ranking unavailable (simulated)' }, { status: 500 })
        break
      case 'history-failure':
        if (endpoint === 'history') return HttpResponse.json({ error: 'History unavailable (simulated)' }, { status: 500 })
        break
      case 'register-unavailable':
        if (endpoint === 'register') return HttpResponse.json({ error: 'Registration unavailable (simulated)' }, { status: 503 })
        break
      default:
        break
    }
    // Every scenario gets a small, seeded base latency, like a real network.
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

      // The record is committed above; only the first response is lost, so a retry
      // recovers it without creating a duplicate.
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

