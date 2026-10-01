import type { ReactNode } from 'react'
import { describeError } from '../../api/client'
import { MenuButton } from './MenuButton'

interface QueryStatusProps {
  readonly isPending: boolean
  readonly isError: boolean
  readonly error: unknown
  readonly isFetching: boolean
  /** True when earlier data is still available to show. */
  readonly hasData: boolean
  readonly isEmpty: boolean
  readonly loadingText: string
  readonly emptyText: string
  readonly onRetry: () => void
  readonly children: ReactNode
}

/**
 * Loading, error, empty and background-refresh states shared by the record panels. When a
 * refresh fails but earlier data exists, that data stays on screen under an error notice.
 */
export function QueryStatus(props: QueryStatusProps) {
  if (props.isPending) {
    return (
      <p role="status" className="query-note">
        {props.loadingText}
      </p>
    )
  }

  const errorNotice = props.isError && (
    <div role="alert" className="query-error">
      <p>
        {describeError(props.error)}
        {props.hasData && ' Showing the last results received.'}
      </p>
      <MenuButton variant="secondary" onClick={props.onRetry}>
        Try again
      </MenuButton>
    </div>
  )
  if (!props.hasData) return errorNotice

  return (
    <>
      {errorNotice}
      <p role="status" className="query-note query-refreshing">
        {props.isFetching ? 'Updating…' : ''}
      </p>
      {props.isEmpty ? <p className="query-note">{props.emptyText}</p> : props.children}
    </>
  )
}
