import type { MatchResult } from '../storage/lastResult'
import { createSubmissionStore } from './submissionStore'

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

const record = (matchId: string): MatchResult => ({
  matchId,
  playerId: 'me',
  playerName: 'Tester',
  endedAt: '2026-09-30T12:00:00.000Z',
  score: 3,
  durationSeconds: 60,
  endReason: 'time',
  config: { sessionSeconds: 60, spawnIntervalSeconds: 3, fingerprint: 'f' },
})

describe('submission store', () => {
  it('queues a match once, however often it is enqueued', () => {
    const store = createSubmissionStore(memoryStorage())
    store.getState().enqueue(record('a'))
    store.getState().enqueue(record('a'))
    expect(store.getState().queue).toHaveLength(1)
    expect(store.getState().statusOf('a').status).toBe('queued')
  })

  it('keeps a failed match queued until a retry succeeds', () => {
    const store = createSubmissionStore(memoryStorage())
    store.getState().enqueue(record('a'))
    store.getState().markSending('a')
    store.getState().markFailed('a', 'Could not reach the server.')
    expect(store.getState().queue).toHaveLength(1)
    expect(store.getState().statusOf('a')).toMatchObject({ status: 'failed', error: 'Could not reach the server.' })

    store.getState().retry('a')
    expect(store.getState().statusOf('a').status).toBe('queued')
    store.getState().markConfirmed('a', true)
    expect(store.getState().queue).toHaveLength(0)
    expect(store.getState().statusOf('a').status).toBe('confirmed')
  })

  it('restores pending matches after a refresh, queued to be sent again', () => {
    const storage = memoryStorage()
    const store = createSubmissionStore(storage)
    store.getState().enqueue(record('a'))
    store.getState().enqueue(record('b'))
    store.getState().markConfirmed('a', true)
    store.getState().markFailed('b', 'down')

    const reloaded = createSubmissionStore(storage)
    expect(reloaded.getState().queue.map((r) => r.matchId)).toEqual(['b'])
    expect(reloaded.getState().statusOf('b').status).toBe('queued')
    expect(reloaded.getState().statusOf('a').status).toBe('confirmed')
  })

  it('retries every failed match at once', () => {
    const store = createSubmissionStore(memoryStorage())
    for (const id of ['a', 'b']) {
      store.getState().enqueue(record(id))
      store.getState().markFailed(id, 'down')
    }
    store.getState().retry()
    expect(store.getState().statusOf('a').status).toBe('queued')
    expect(store.getState().statusOf('b').status).toBe('queued')
  })
})
