import { z } from 'zod'
import { matchResultSchema } from '../storage/lastResult'

/**
 * Typed contracts for the ranking and match history API. The client validates every
 * response against them, and the MSW handlers build their responses from the same schemas,
 * so the two sides cannot drift apart.
 *
 *   PUT /api/matches/:matchId                      register a completed match (idempotent)
 *   GET /api/ranking?config=&page=&pageSize=      ranking for one configuration
 *   GET /api/players/:playerId/matches?page=&pageSize=   a player's match history
 */

/** A completed match as registered: identity, date, score, duration, reason, configuration. */
export const matchRecordSchema = matchResultSchema
export type MatchRecord = z.infer<typeof matchRecordSchema>

/** Five rows per page, as in the records screens of the samples. */
export const PAGE_SIZE = 5

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(PAGE_SIZE),
})

function pageOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
}

export const rankingEntrySchema = z.object({
  rank: z.number().int().min(1),
  matchId: z.string(),
  playerId: z.string(),
  playerName: z.string(),
  score: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  endReason: z.enum(['time', 'death']),
  endedAt: z.string().datetime(),
})
export type RankingEntry = z.infer<typeof rankingEntrySchema>

export const rankingPageSchema = pageOf(rankingEntrySchema).extend({
  /** The configuration fingerprint every entry on this page was played with. */
  config: z.string(),
})
export type RankingPage = z.infer<typeof rankingPageSchema>

export const historyPageSchema = pageOf(matchRecordSchema)
export type HistoryPage = z.infer<typeof historyPageSchema>

export const registerResponseSchema = z.object({
  record: matchRecordSchema,
  /** False when the match was already registered: a retry recovered the existing record. */
  created: z.boolean(),
})
export type RegisterResponse = z.infer<typeof registerResponseSchema>

export const apiErrorSchema = z.object({ error: z.string() })

/**
 * Ranking order, deterministic for any data: higher score first; on a tie, the match that
 * reached it in less active time; then the earlier match; finally the match id.
 */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  return (
    b.score - a.score ||
    a.durationSeconds - b.durationSeconds ||
    a.endedAt.localeCompare(b.endedAt) ||
    a.matchId.localeCompare(b.matchId)
  )
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  const totalItems = items.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageSize, totalItems, totalPages }
}
