export interface Rng {
  next(): number
  range(min: number, max: number): number
  int(minInclusive: number, maxExclusive: number): number
  pick<T>(items: readonly T[]): T
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (minInclusive, maxExclusive) =>
      minInclusive + Math.floor(next() * (maxExclusive - minInclusive)),
    pick: <T>(items: readonly T[]): T => {
      const index = Math.floor(next() * items.length)
      const value = items[Math.min(index, items.length - 1)]
      if (value === undefined) throw new Error('pick called with an empty list')
      return value
    },
  }
}
