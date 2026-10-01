import { z } from 'zod'
import { matchResultSchema } from './lastResult'
import type { MatchResult } from './lastResult'
import { STORAGE_KEYS, readStored, writeStored } from './localStore'

const queueSchema = z.array(matchResultSchema)

/**
 * Completed matches not yet confirmed by the server. A match enters the queue the moment it
 * ends and leaves only when the server confirms it, so failures and refreshes never lose one.
 */
export function loadPendingMatches(storage: Storage | null): MatchResult[] {
  return readStored(storage, STORAGE_KEYS.pendingMatches, queueSchema) ?? []
}

export function savePendingMatches(storage: Storage | null, queue: readonly MatchResult[]): void {
  writeStored(storage, STORAGE_KEYS.pendingMatches, queue)
}
