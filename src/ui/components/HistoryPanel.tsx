import { useState } from 'react'
import { useHistory } from '../../api/queries'
import { useAppStore } from '../appStore'
import { formatClockPadded, formatPlayedAt } from '../format'
import { Pagination } from './Pagination'
import { QueryStatus } from './QueryStatus'

export function HistoryPanel() {
  const playerId = useAppStore((s) => s.playerId)
  const playerName = useAppStore((s) => s.options.playerName)
  const [page, setPage] = useState(1)
  const query = useHistory(playerId, page)
  const data = query.data

  return (
    <div className="records">
      <p className="records-scope">{playerName} · your recent battles</p>
      <QueryStatus
        isPending={query.isPending}
        isError={query.isError}
        hasData={data !== undefined}
        error={query.error}
        isFetching={query.isFetching}
        isEmpty={data?.items.length === 0}
        loadingText="Loading your battles…"
        emptyText="No registered battles yet. Finish a match to see it here."
        onRetry={() => void query.refetch()}
      >
        {data !== undefined && (
          <>
            <table className="records-table" aria-busy={query.isPlaceholderData}>
              <caption className="visually-hidden">Match history, page {data.page}</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Points</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((match, index) => {
                  const played = formatPlayedAt(match.endedAt)
                  const latest = data.page === 1 && index === 0
                  return (
                    <tr key={match.matchId} className={latest ? 'is-highlighted' : undefined}>
                      <td className="records-date">
                        <span className="records-day">{played.day}</span> · {played.time}
                      </td>
                      <td className="records-points">{match.score}</td>
                      <td>{formatClockPadded(match.durationSeconds)}</td>
                      <td className={`records-result is-${match.endReason}`}>
                        {match.endReason === 'death' ? 'Defeated' : 'Time up'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} label="History pages" />
          </>
        )}
      </QueryStatus>
    </div>
  )
}
