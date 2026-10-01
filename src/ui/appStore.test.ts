import { configFingerprint } from '../game/config/gameConfig'
import { DEFAULT_OPTIONS } from '../storage/options'
import { createAppStore } from './appStore'

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

const outcome = { score: 4, durationSeconds: 88.25, endReason: 'death' as const }

describe('app store', () => {
  it('starts on the menu with default options', () => {
    const store = createAppStore(memoryStorage())
    expect(store.getState().screen).toBe('menu')
    expect(store.getState().options).toEqual(DEFAULT_OPTIONS)
  })

  it('freezes the options when a match starts', () => {
    const store = createAppStore(memoryStorage())
    store.getState().saveOptions({ ...DEFAULT_OPTIONS, sessionSeconds: 60 })
    store.getState().play()
    store.getState().saveOptions({ ...DEFAULT_OPTIONS, sessionSeconds: 180 })

    const match = store.getState().match
    expect(store.getState().screen).toBe('game')
    expect(match?.config.sessionSeconds).toBe(60)
  })

  it('gives every match its own id', () => {
    const store = createAppStore(memoryStorage())
    store.getState().play()
    const first = store.getState().match?.matchId
    store.getState().goToMenu()
    store.getState().play()
    expect(store.getState().match?.matchId).not.toBe(first)
  })

  it('records a finished match with the frozen configuration', () => {
    const store = createAppStore(memoryStorage())
    store.getState().play()
    const match = store.getState().match
    store.getState().finishMatch(outcome, new Date('2026-09-30T12:00:00Z'))
    store.getState().showResult()

    const result = store.getState().lastResult
    expect(store.getState().screen).toBe('result')
    expect(result).toMatchObject({
      matchId: match?.matchId,
      playerId: store.getState().playerId,
      playerName: DEFAULT_OPTIONS.playerName,
      endedAt: '2026-09-30T12:00:00.000Z',
      ...outcome,
    })
    expect(result?.config.fingerprint).toBe(configFingerprint(match!.config))
  })

  it('records nothing when a match is abandoned', () => {
    const storage = memoryStorage()
    const store = createAppStore(storage)
    store.getState().play()
    store.getState().goToMenu()
    expect(store.getState().lastResult).toBeNull()
    expect(createAppStore(storage).getState().lastResult).toBeNull()
  })

  it('restores the result screen after a refresh, but never a match in progress', () => {
    const storage = memoryStorage()
    const store = createAppStore(storage)
    store.getState().play()
    store.getState().finishMatch(outcome)
    store.getState().showResult()

    const reloaded = createAppStore(storage).getState()
    expect(reloaded.screen).toBe('result')
    expect(reloaded.lastResult?.score).toBe(4)

    reloaded.play()
    expect(createAppStore(storage).getState().screen).toBe('menu')
  })

  it('opens the Captain\'s Log on the requested tab, and a refresh returns to the menu', () => {
    const storage = memoryStorage()
    const store = createAppStore(storage)
    store.getState().openRecords('history')
    expect(store.getState()).toMatchObject({ screen: 'records', recordsTab: 'history' })
    expect(createAppStore(storage).getState().screen).toBe('menu')
  })

  it('uses the test seed for every match when one is given', () => {
    const store = createAppStore(memoryStorage(), { hooks: true, frozenClock: false, matchSeed: 42 })
    store.getState().play()
    expect(store.getState().match?.seed).toBe(42)
  })

  it('keeps the same player id across reloads', () => {
    const storage = memoryStorage()
    const id = createAppStore(storage).getState().playerId
    expect(createAppStore(storage).getState().playerId).toBe(id)
  })
})
