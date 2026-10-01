import { z } from 'zod'
import { STORAGE_KEYS, readStored, removeStored, writeStored } from './localStore'

export const matchResultSchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  endedAt: z.string().datetime(),
  score: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  endReason: z.enum(['time', 'death']),
  config: z.object({
    sessionSeconds: z.number(),
    spawnIntervalSeconds: z.number(),
    fingerprint: z.string().min(1),
  }),
})

export type MatchResult = z.infer<typeof matchResultSchema>

/**
 * The last completed match, shaped like the record the ranking and history API receives:
 * match and player identity, end time (ISO 8601), score, active duration (pauses excluded),
 * end reason and the configuration used with its fingerprint. Abandoned matches never
 * produce one.
 */
export function loadLastResult(storage: Storage | null): MatchResult | null {
  return readStored(storage, STORAGE_KEYS.lastResult, matchResultSchema)
}

export function saveLastResult(storage: Storage | null, result: MatchResult): boolean {
  return writeStored(storage, STORAGE_KEYS.lastResult, result)
}

const viewSchema = z.enum(['menu', 'result'])
export type RestorableView = z.infer<typeof viewSchema>

/** The screen to restore after a refresh: the result screen or the menu, never a match. */
export function loadView(storage: Storage | null): RestorableView {
  return readStored(storage, STORAGE_KEYS.view, viewSchema) ?? 'menu'
}

export function saveView(storage: Storage | null, view: RestorableView): void {
  if (view === 'menu') removeStored(storage, STORAGE_KEYS.view)
  else writeStored(storage, STORAGE_KEYS.view, view)
}
