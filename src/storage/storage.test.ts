import { configFingerprint } from '../game/config/gameConfig'
import { STORAGE_KEYS } from './localStore'
import { loadLastResult, loadView, saveLastResult, saveView } from './lastResult'
import type { MatchResult } from './lastResult'
import { DEFAULT_OPTIONS, gameConfigFor, loadOptions, optionsSchema, saveOptions } from './options'
import { loadPlayerId } from './player'

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

const result: MatchResult = {
  matchId: 'm-1',
  playerId: 'p-1',
  playerName: 'Anne',
  endedAt: '2026-09-30T12:00:00.000Z',
  score: 7,
  durationSeconds: 95.5,
  endReason: 'death',
  config: { sessionSeconds: 120, spawnIntervalSeconds: 3, fingerprint: 'abc' },
}

describe('options', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage()
    const options = { playerName: 'Anne', sessionSeconds: 90, spawnIntervalSeconds: 1.5 }
    expect(saveOptions(storage, options)).toBe(true)
    expect(loadOptions(storage)).toEqual(options)
  })

  it('falls back to defaults for missing, corrupted or out-of-range data', () => {
    const storage = memoryStorage()
    expect(loadOptions(storage)).toEqual(DEFAULT_OPTIONS)
    storage.setItem(STORAGE_KEYS.options, '{not json')
    expect(loadOptions(storage)).toEqual(DEFAULT_OPTIONS)
    storage.setItem(STORAGE_KEYS.options, JSON.stringify({ ...DEFAULT_OPTIONS, sessionSeconds: 500 }))
    expect(loadOptions(storage)).toEqual(DEFAULT_OPTIONS)
    expect(loadOptions(null)).toEqual(DEFAULT_OPTIONS)
  })

  it('validates the documented limits', () => {
    const valid = (patch: object) => optionsSchema.safeParse({ ...DEFAULT_OPTIONS, ...patch }).success
    expect(valid({ sessionSeconds: 60 })).toBe(true)
    expect(valid({ sessionSeconds: 180 })).toBe(true)
    expect(valid({ sessionSeconds: 59 })).toBe(false)
    expect(valid({ sessionSeconds: 90.5 })).toBe(false)
    expect(valid({ spawnIntervalSeconds: 0 })).toBe(false)
    expect(valid({ spawnIntervalSeconds: -1 })).toBe(false)
    expect(valid({ spawnIntervalSeconds: 0.5 })).toBe(true)
    expect(valid({ spawnIntervalSeconds: 10.5 })).toBe(false)
    expect(valid({ playerName: '   ' })).toBe(false)
    expect(valid({ playerName: 'x'.repeat(17) })).toBe(false)
  })

  it('freezes the options into a match configuration', () => {
    const config = gameConfigFor({ ...DEFAULT_OPTIONS, sessionSeconds: 75, spawnIntervalSeconds: 2 })
    expect(config.sessionSeconds).toBe(75)
    expect(config.spawn.intervalSeconds).toBe(2)
    expect(configFingerprint(config)).not.toBe(configFingerprint(gameConfigFor(DEFAULT_OPTIONS)))
  })
})

describe('player id', () => {
  it('is created once and then reused', () => {
    const storage = memoryStorage()
    let created = 0
    const next = () => `id-${++created}`
    expect(loadPlayerId(storage, next)).toBe('id-1')
    expect(loadPlayerId(storage, next)).toBe('id-1')
    expect(created).toBe(1)
  })
})

describe('last result and view', () => {
  it('persists the last completed match', () => {
    const storage = memoryStorage()
    expect(loadLastResult(storage)).toBeNull()
    saveLastResult(storage, result)
    expect(loadLastResult(storage)).toEqual(result)
  })

  it('rejects a malformed record', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.lastResult, JSON.stringify({ ...result, score: -1 }))
    expect(loadLastResult(storage)).toBeNull()
  })

  it('restores only the result view, defaulting to the menu', () => {
    const storage = memoryStorage()
    expect(loadView(storage)).toBe('menu')
    saveView(storage, 'result')
    expect(loadView(storage)).toBe('result')
    saveView(storage, 'menu')
    expect(loadView(storage)).toBe('menu')
  })
})
