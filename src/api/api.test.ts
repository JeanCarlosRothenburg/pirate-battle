import { setupServer } from 'msw/node'
import type { MatchRecord } from './contracts'
import { compareRanking } from './contracts'
import { createApiClient, describeError, isRetryable } from './client'
import { createMockApi } from '../mocks/handlers'
import type { MockApi } from '../mocks/handlers'
import { DEFAULT_FINGERPRINT } from '../mocks/fixtures'
import { DEFAULT_SCENARIO } from '../mocks/scenarios'
import type { ScenarioId } from '../mocks/scenarios'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

function record(patch: Partial<MatchRecord> = {}): MatchRecord {
  return {
    matchId: 'match-1',
    playerId: 'me',
    playerName: 'Tester',
    endedAt: '2026-09-30T12:00:00.000Z',
    score: 12,
    durationSeconds: 120,
    endReason: 'time',
    config: { sessionSeconds: 120, spawnIntervalSeconds: 3, fingerprint: DEFAULT_FINGERPRINT },
    ...patch,
  }
}

const BASE = 'http://localhost/api'
let storage: Storage
let mock: MockApi
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  storage = memoryStorage()
  mock = createMockApi(storage, DEFAULT_SCENARIO, BASE)
  server.resetHandlers(...mock.handlers)
})

const use = (scenario: ScenarioId) => mock.setScenario({ scenario, seed: 1 })

describe('ranking', () => {
  it('pages the fixture ranking in a deterministic order', async () => {
    const client = createApiClient(BASE)
    const first = await client.fetchRanking(DEFAULT_FINGERPRINT, 1)
    const second = await client.fetchRanking(DEFAULT_FINGERPRINT, 2)

    expect(first.totalItems).toBe(34)
    expect(first.totalPages).toBe(7)
    expect(first.items.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5])
    expect(second.items[0]?.rank).toBe(6)
    const scores = [...first.items, ...second.items].map((e) => e.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('only compares matches played with the same configuration', async () => {
    const client = createApiClient(BASE)
    const page = await client.fetchRanking('no-such-config', 1)
    expect(page.items).toEqual([])
    expect(page.totalPages).toBe(0)
  })

  it('breaks ties by time, then date, then match id', () => {
    const a = record({ matchId: 'a', score: 5, durationSeconds: 90 })
    const b = record({ matchId: 'b', score: 5, durationSeconds: 60 })
    const c = record({ matchId: 'c', score: 5, durationSeconds: 60, endedAt: '2026-09-29T00:00:00.000Z' })
    const d = record({ matchId: 'd', score: 5, durationSeconds: 60, endedAt: '2026-09-29T00:00:00.000Z' })
    expect([a, d, b, c].sort(compareRanking).map((r) => r.matchId)).toEqual(['c', 'd', 'b', 'a'])
  })
})

describe('registering a match', () => {
  it('creates one record that both the ranking and the history show', async () => {
    const client = createApiClient(BASE)
    const response = await client.registerMatch(record({ score: 999 }))
    expect(response.created).toBe(true)

    const ranking = await client.fetchRanking(DEFAULT_FINGERPRINT, 1)
    expect(ranking.items[0]).toMatchObject({ matchId: 'match-1', rank: 1, playerName: 'Tester' })
    const history = await client.fetchHistory('me', 1)
    expect(history.items.map((r) => r.matchId)).toEqual(['match-1'])
  })

  it('returns the existing record on a repeat, without duplicating it', async () => {
    const client = createApiClient(BASE)
    await client.registerMatch(record())
    const again = await client.registerMatch(record({ score: 0 }))
    expect(again.created).toBe(false)
    expect(again.record.score).toBe(12)
    expect((await client.fetchHistory('me', 1)).totalItems).toBe(1)
  })

  it('persists confirmed records across a reload of the mock', async () => {
    await createApiClient(BASE).registerMatch(record())
    const reloaded = createMockApi(storage, DEFAULT_SCENARIO, BASE)
    server.resetHandlers(...reloaded.handlers)
    expect((await createApiClient(BASE).fetchHistory('me', 1)).totalItems).toBe(1)
  })

  it('recovers a registration whose response timed out, without a duplicate', async () => {
    use('register-timeout')
    const client = createApiClient(BASE, 300)
    const first = await client.registerMatch(record()).catch((error: unknown) => error)
    expect(isRetryable(first)).toBe(true)
    expect(describeError(first)).toMatch(/too long/)

    const retry = await client.registerMatch(record())
    expect(retry.created).toBe(false)
    expect(mock.db.registeredCount).toBe(1)
  })

  it('accepts the registration once an outage ends', async () => {
    use('register-unavailable')
    const client = createApiClient(BASE)
    const failed = await client.registerMatch(record()).catch((error: unknown) => error)
    expect(isRetryable(failed)).toBe(true)
    expect(mock.db.registeredCount).toBe(0)

    use('success')
    expect((await client.registerMatch(record())).created).toBe(true)
  })

  it('rejects a record whose id does not match the URL', async () => {
    const client = createApiClient(BASE)
    const bad = { ...record(), matchId: 'other' }
    const http = await fetch(`${BASE}/matches/match-1`, { method: 'PUT', body: JSON.stringify(bad) })
    expect(http.status).toBe(400)
    await expect(client.registerMatch(record())).resolves.toMatchObject({ created: true })
  })
})

describe('network scenarios', () => {
  it('returns empty lists', async () => {
    use('empty')
    const client = createApiClient(BASE)
    expect((await client.fetchRanking(DEFAULT_FINGERPRINT, 1)).items).toEqual([])
    expect((await client.fetchHistory('me', 1)).items).toEqual([])
  })

  it('serves many pages', async () => {
    use('many-pages')
    expect((await createApiClient(BASE).fetchRanking(DEFAULT_FINGERPRINT, 1)).totalPages).toBe(48)
  })

  it.each([
    ['connection-failure', /reach the server/, true],
    ['http-5xx', /HTTP 503/, true],
    ['http-4xx', /HTTP 400/, false],
  ] as const)('%s fails with a clear, correctly classified error', async (scenario, message, retryable) => {
    use(scenario)
    const error = await createApiClient(BASE).fetchRanking(DEFAULT_FINGERPRINT, 1).catch((e: unknown) => e)
    expect(describeError(error)).toMatch(message)
    expect(isRetryable(error)).toBe(retryable)
  })

  it('times out', async () => {
    use('timeout')
    const error = await createApiClient(BASE, 200).fetchHistory('me', 1).catch((e: unknown) => e)
    expect(describeError(error)).toMatch(/too long/)
  })

  it('fails only the ranking, or only the history', async () => {
    const client = createApiClient(BASE)
    use('ranking-failure')
    await expect(client.fetchRanking(DEFAULT_FINGERPRINT, 1)).rejects.toThrow()
    await expect(client.fetchHistory('me', 1)).resolves.toBeDefined()
    use('history-failure')
    await expect(client.fetchHistory('me', 1)).rejects.toThrow()
    await expect(client.fetchRanking(DEFAULT_FINGERPRINT, 1)).resolves.toBeDefined()
  })

  it('lets a later request finish before an earlier one when out of order', async () => {
    use('out-of-order')
    const client = createApiClient(BASE)
    const finished: number[] = []
    await Promise.all([
      client.fetchRanking(DEFAULT_FINGERPRINT, 1).then(() => finished.push(1)),
      client.fetchRanking(DEFAULT_FINGERPRINT, 2).then(() => finished.push(2)),
    ])
    expect(finished).toEqual([2, 1])
  })

  it('restores the initial state on reset', async () => {
    const client = createApiClient(BASE)
    await client.registerMatch(record())
    use('http-5xx')
    mock.reset(DEFAULT_SCENARIO)
    expect(mock.scenario.scenario).toBe('success')
    expect((await client.fetchHistory('me', 1)).totalItems).toBe(0)
  })
})
