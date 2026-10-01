export interface TestMode {
  readonly hooks: boolean
  readonly frozenClock: boolean
  readonly matchSeed: number | null
}

/**
 * Test switches read from the page URL: `?testHooks` installs the game's test
 * instrumentation, `?frozenClock` (with it) starts every match on the manual clock so no
 * real time ever passes, and `?matchSeed=<n>` makes every match use that seed. All are
 * inert in normal play.
 */
export function readTestMode(search: string = globalThis.location?.search ?? ''): TestMode {
  const params = new URLSearchParams(search)
  const seed = Number(params.get('matchSeed'))
  return {
    hooks: params.has('testHooks'),
    frozenClock: params.has('testHooks') && params.has('frozenClock'),
    matchSeed: params.has('matchSeed') && Number.isInteger(seed) ? seed >>> 0 : null,
  }
}
