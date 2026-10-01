import { create } from 'zustand'
import { browserStorage } from '../storage/localStore'
import type { MatchResult } from '../storage/lastResult'
import { loadPendingMatches, savePendingMatches } from '../storage/pendingMatches'

/**
 * - queued: waiting to be sent (also every pending match restored after a refresh)
 * - sending: request in flight
 * - failed: the last attempt failed; the match stays queued until a retry succeeds
 * - confirmed: the server holds the record
 */
export type SubmissionStatus = 'queued' | 'sending' | 'failed' | 'confirmed'

export interface Submission {
  readonly status: SubmissionStatus
  readonly error?: string
  /** False when a retry recovered a record the server already had. */
  readonly created?: boolean
}

export interface SubmissionState {
  readonly queue: readonly MatchResult[]
  readonly submissions: Readonly<Record<string, Submission>>

  enqueue(record: MatchResult): void
  markSending(matchId: string): void
  markConfirmed(matchId: string, created: boolean): void
  markFailed(matchId: string, error: string): void
  /** Re-queues failed submissions: one match, or all of them. */
  retry(matchId?: string): void
  statusOf(matchId: string): Submission
}

export function createSubmissionStore(storage: Storage | null = browserStorage()) {
  const restored = loadPendingMatches(storage)

  return create<SubmissionState>()((set, get) => {
    const setQueue = (queue: readonly MatchResult[]): void => {
      savePendingMatches(storage, queue)
      set({ queue })
    }
    const setStatus = (matchId: string, submission: Submission): void =>
      set({ submissions: { ...get().submissions, [matchId]: submission } })

    return {
      queue: restored,
      submissions: Object.fromEntries(restored.map((r) => [r.matchId, { status: 'queued' as const }])),

      enqueue(record) {
        // Idempotent: a match already queued or confirmed is never queued twice.
        if (get().submissions[record.matchId] !== undefined) return
        setQueue([...get().queue, record])
        setStatus(record.matchId, { status: 'queued' })
      },

      markSending(matchId) {
        setStatus(matchId, { status: 'sending' })
      },

      markConfirmed(matchId, created) {
        setQueue(get().queue.filter((r) => r.matchId !== matchId))
        setStatus(matchId, { status: 'confirmed', created })
      },

      markFailed(matchId, error) {
        setStatus(matchId, { status: 'failed', error })
      },

      retry(matchId) {
        const next = { ...get().submissions }
        for (const record of get().queue) {
          if (matchId !== undefined && record.matchId !== matchId) continue
          if (next[record.matchId]?.status === 'failed') next[record.matchId] = { status: 'queued' }
        }
        set({ submissions: next })
      },

      statusOf(matchId) {
        // Not tracked and not queued means it was confirmed in an earlier session.
        return get().submissions[matchId] ?? { status: 'confirmed' }
      },
    }
  })
}

export const useSubmissionStore = createSubmissionStore()
