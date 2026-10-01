import type { MatchRecord } from '../api/contracts'
import { configFingerprint } from '../game/config/gameConfig'
import { createRng } from '../game/sim/rng'
import { DEFAULT_OPTIONS, gameConfigFor } from '../storage/options'
import type { PlayerOptions } from '../storage/options'

const CAPTAINS = [
  'Anne Bonny', 'Black Bart', 'Calico Jack', 'Grace O’Malley', 'Henry Every', 'Mary Read',
  'Ching Shih', 'Edward Low', 'Stede Bonnet', 'Sam Bellamy', 'Ned England', 'Jean Lafitte',
] as const

/** The configuration most fixture matches were played with: the game's defaults. */
export const DEFAULT_FINGERPRINT = configFingerprint(gameConfigFor(DEFAULT_OPTIONS))

const FIXTURE_CONFIGS: readonly PlayerOptions[] = [
  DEFAULT_OPTIONS,
  { ...DEFAULT_OPTIONS, sessionSeconds: 60 },
  { ...DEFAULT_OPTIONS, sessionSeconds: 180, spawnIntervalSeconds: 2 },
]

/**
 * Matches by other players, generated from a seed so every run sees the same data.
 * `perDefaultConfig` matches use the default configuration; a few more use other ones, so
 * the ranking visibly filters by configuration.
 */
export function fixtureRecords(perDefaultConfig: number, seed = 7): MatchRecord[] {
  const rng = createRng(seed)
  const records: MatchRecord[] = []
  const start = Date.UTC(2026, 8, 1)
  const add = (options: PlayerOptions, index: number): void => {
    const config = gameConfigFor(options)
    const playerIndex = rng.int(0, CAPTAINS.length)
    const died = rng.next() < 0.45
    records.push({
      matchId: `fixture-${configFingerprint(config)}-${index}`,
      playerId: `fixture-player-${playerIndex}`,
      playerName: CAPTAINS[playerIndex] ?? 'Captain',
      endedAt: new Date(start + index * 3_600_000 + rng.int(0, 3_000_000)).toISOString(),
      score: rng.int(0, 31),
      durationSeconds: died ? Math.round(rng.range(20, options.sessionSeconds) * 10) / 10 : options.sessionSeconds,
      endReason: died ? 'death' : 'time',
      config: {
        sessionSeconds: options.sessionSeconds,
        spawnIntervalSeconds: options.spawnIntervalSeconds,
        fingerprint: configFingerprint(config),
      },
    })
  }
  for (let i = 0; i < perDefaultConfig; i++) add(FIXTURE_CONFIGS[0] ?? DEFAULT_OPTIONS, i)
  FIXTURE_CONFIGS.slice(1).forEach((options, k) => {
    for (let i = 0; i < 6; i++) add(options, 10_000 * (k + 1) + i)
  })
  return records
}
