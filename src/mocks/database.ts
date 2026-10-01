import { compareRanking, paginate } from '../api/contracts'
import type { HistoryPage, MatchRecord, RankingPage } from '../api/contracts'
import { matchRecordSchema } from '../api/contracts'
import { readStored, writeStored } from '../storage/localStore'
import { z } from 'zod'

export const MOCK_DB_KEY = 'pirate-battle:mock-db:v1'

const storedSchema = z.object({ records: z.array(matchRecordSchema) })

/**
 * The mock backend's data: deterministic fixtures for other players plus every match this
 * browser registered. Registered matches persist in localStorage, so confirmed records
 * survive a refresh and both tabs read one consistent store.
 */
export class MockDatabase {
  private readonly registered = new Map<string, MatchRecord>()

  constructor(
    private readonly fixtures: () => readonly MatchRecord[],
    private readonly storage: Storage | null,
  ) {
    const stored = readStored(storage, MOCK_DB_KEY, storedSchema)
    for (const record of stored?.records ?? []) this.registered.set(record.matchId, record)
  }

  /** Idempotent by match id: registering again returns the stored record unchanged. */
  register(record: MatchRecord): { record: MatchRecord; created: boolean } {
    const existing = this.registered.get(record.matchId)
    if (existing !== undefined) return { record: existing, created: false }
    this.registered.set(record.matchId, record)
    this.persist()
    return { record, created: true }
  }

  ranking(config: string, page: number, pageSize: number, includeFixtures = true): RankingPage {
    const pool = includeFixtures ? [...this.fixtures(), ...this.registered.values()] : [...this.registered.values()]
    const sorted = pool.filter((r) => r.config.fingerprint === config).sort(compareRanking)
    const slice = paginate(sorted, page, pageSize)
    const offset = (page - 1) * pageSize
    return {
      ...slice,
      config,
      items: slice.items.map((r, i) => ({
        rank: offset + i + 1,
        matchId: r.matchId,
        playerId: r.playerId,
        playerName: r.playerName,
        score: r.score,
        durationSeconds: r.durationSeconds,
        endReason: r.endReason,
        endedAt: r.endedAt,
      })),
    }
  }

  history(playerId: string, page: number, pageSize: number): HistoryPage {
    const mine = [...this.registered.values()]
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt) || a.matchId.localeCompare(b.matchId))
    return paginate(mine, page, pageSize)
  }

  get registeredCount(): number {
    return this.registered.size
  }

  reset(): void {
    this.registered.clear()
    this.persist()
  }

  private persist(): void {
    writeStored(this.storage, MOCK_DB_KEY, { records: [...this.registered.values()] })
  }
}
