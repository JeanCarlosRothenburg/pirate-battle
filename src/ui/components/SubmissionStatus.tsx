import { useSubmissionStore } from '../submissionStore'

/** The registration state of one match, with a retry when it failed. */
export function SubmissionStatus({ matchId }: { readonly matchId: string }) {
  const submission = useSubmissionStore((s) => s.submissions[matchId]) ?? { status: 'confirmed' as const }
  const retry = useSubmissionStore((s) => s.retry)

  switch (submission.status) {
    case 'queued':
    case 'sending':
      return <span>Registering…</span>
    case 'confirmed':
      return <span>Registered</span>
    case 'failed':
      return (
        <span className="submission-failed">
          Not registered: {submission.error}{' '}
          <button type="button" className="page-button" onClick={() => retry(matchId)}>
            Retry
          </button>
        </span>
      )
  }
}

/** A notice for matches still waiting to be registered, with one retry for all of them. */
export function PendingNotice() {
  const queue = useSubmissionStore((s) => s.queue)
  const submissions = useSubmissionStore((s) => s.submissions)
  const retry = useSubmissionStore((s) => s.retry)
  if (queue.length === 0) return null
  const failed = queue.filter((r) => submissions[r.matchId]?.status === 'failed').length
  const count = queue.length === 1 ? '1 match is' : `${queue.length} matches are`

  return (
    <p role="status" className="pending-notice">
      {count} waiting to be registered.
      {failed > 0 && (
        <>
          {' '}
          <button type="button" className="page-button" onClick={() => retry()}>
            Retry now
          </button>
        </>
      )}
    </p>
  )
}
