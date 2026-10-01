import { useState } from 'react'
import { useRanking } from '../../api/queries'
import { configFingerprint } from '../../game/config/gameConfig'
import { gameConfigFor } from '../../storage/options'
import { useAppStore } from '../appStore'
import { formatPlayedAt } from '../format'
import { Pagination } from './Pagination'
import { QueryStatus } from './QueryStatus'

/** Ranking for the configuration the player would play next: only like-for-like matches. */
export function RankingPanel() {
  const options = useAppStore((s) => s.options)
  const playerId = useAppStore((s) => s.playerId)
  const config = configFingerprint(gameConfigFor(options))
  const [page, setPage] = useState(1)
  const query = useRanking(config, page)
  const data = query.data

  return (
    <div className="records">
      <p className="records-scope">
        {options.sessionSeconds} second battles · {options.spawnIntervalSeconds} second spawn interval
      </p>
      <QueryStatus
        isPending={query.isPending}
        isError={query.isError}
        hasData={data !== undefined}
        error={query.error}
        isFetching={query.isFetching}
        isEmpty={data?.items.length === 0}
        loadingText="Loading the ranking…"
        emptyText="No battles recorded with these settings yet."
        onRetry={() => void query.refetch()}
      >
        {data !== undefined && (
          <>
            <table className="records-table" aria-busy={query.isPlaceholderData}>
              <caption className="visually-hidden">Ranking, page {data.page}</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Captain</th>
                  <th scope="col">Points</th>
                  <th scope="col">Played</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => {
                  const you = entry.playerId === playerId
                  const played = formatPlayedAt(entry.endedAt)
                  return (
                    <tr key={entry.matchId} className={you ? 'is-highlighted' : undefined}>
                      <td className="records-rank">{entry.rank.toString().padStart(2, '0')}</td>
                      <td className="records-name">
                        {entry.rank === 1 && <span className="hud-icon hud-icon-score records-star" aria-label="Top score" role="img" />}
                        {entry.playerName}
                        {you && <span className="you-tag">You</span>}
                      </td>
                      <td className="records-points">{entry.score}</td>
                      <td className="records-date">
                        {played.day} · {played.time}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} label="Ranking pages" />
          </>
        )}
      </QueryStatus>
    </div>
  )
}
