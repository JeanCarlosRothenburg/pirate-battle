import { useEffect } from 'react'
import { describeError } from '../api/client'
import { useRegisterMatch } from '../api/queries'
import { useSubmissionStore } from './submissionStore'

/**
 * Sends queued match records in the background. It runs on every screen, so a registration
 * never blocks starting another match, and on start-up it resends anything a refresh left
 * pending. Failed records stay queued until the player retries or the connection returns.
 */
export function SubmissionManager() {
  const queue = useSubmissionStore((s) => s.queue)
  const submissions = useSubmissionStore((s) => s.submissions)
  const { mutateAsync } = useRegisterMatch()

  useEffect(() => {
    for (const record of queue) {
      const store = useSubmissionStore.getState()
      if (store.submissions[record.matchId]?.status !== 'queued') continue
      store.markSending(record.matchId)
      mutateAsync(record).then(
        (response) => useSubmissionStore.getState().markConfirmed(record.matchId, response.created),
        (error: unknown) => useSubmissionStore.getState().markFailed(record.matchId, describeError(error)),
      )
    }
  }, [queue, submissions, mutateAsync])

  useEffect(() => {
    const onOnline = (): void => useSubmissionStore.getState().retry()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  return null
}
