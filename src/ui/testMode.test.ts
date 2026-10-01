import { readTestMode } from './testMode'

describe('readTestMode', () => {
  it('is off without parameters', () => {
    expect(readTestMode('')).toEqual({ hooks: false, frozenClock: false, matchSeed: null })
  })

  it('reads the hooks switch and a match seed', () => {
    expect(readTestMode('?testHooks&frozenClock&matchSeed=7')).toEqual({ hooks: true, frozenClock: true, matchSeed: 7 })
  })

  it('never freezes the clock without the hooks', () => {
    expect(readTestMode('?frozenClock').frozenClock).toBe(false)
  })

  it('ignores a malformed seed', () => {
    expect(readTestMode('?matchSeed=abc').matchSeed).toBeNull()
  })
})
