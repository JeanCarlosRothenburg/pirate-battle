export interface Clock {
  now(): number
}

export const systemClock: Clock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
}

export function createManualClock(start = 0): Clock & { advance(ms: number): void; set(ms: number): void } {
  let current = start
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms
    },
    set: (ms: number) => {
      current = ms
    },
  }
}
