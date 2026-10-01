import { z } from 'zod'
import { STORAGE_KEYS, readStored, removeStored, writeStored } from './localStore'

/**
 * A completed match, shaped like the record the ranking and history API will receive:
 * match and player identity, date, score, effective duration, end reason and the
 * configuration used. Abandoned matches never produce one.
 */
export const matchResultSchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  /** ISO 8601 time the match ended. */
  endedAt: z.string().datetime(),
  score: z.number().int().nonnegative(),
  /** Seconds of active play; pauses do not count. */
  durationSeconds: z.number().nonnegative(),
  endReason: z.enum(['time', 'death']),
  config: z.object({
    sessionSeconds: z.number(),
    spawnIntervalSeconds: z.number(),
    /** `configFingerprint` of the full frozen configuration. */
    fingerprint: z.string().min(1),
  }),
})

export type MatchResult = z.infer<typeof matchResultSchema>

export function loadLastResult(storage: Storage | null): MatchResult | null {
  return readStored(storage, STORAGE_KEYS.lastResult, matchResultSchema)
}

export function saveLastResult(storage: Storage | null, result: MatchResult): boolean {
  return writeStored(storage, STORAGE_KEYS.lastResult, result)
}

/** Screens restored after a refresh. Combat is not: reloading abandons the match. */
const viewSchema = z.enum(['menu', 'result'])
export type RestorableView = z.infer<typeof viewSchema>

export function loadView(storage: Storage | null): RestorableView {
  return readStored(storage, STORAGE_KEYS.view, viewSchema) ?? 'menu'
}

export function saveView(storage: Storage | null, view: RestorableView): void {
  if (view === 'menu') removeStored(storage, STORAGE_KEYS.view)
  else writeStored(storage, STORAGE_KEYS.view, view)
}
