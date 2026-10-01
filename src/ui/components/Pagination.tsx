interface PaginationProps {
  readonly page: number
  readonly totalPages: number
  readonly onPage: (page: number) => void
  readonly label: string
}

/** Round arrow buttons around "Page N of M", like the records screens in the samples. */
export function Pagination({ page, totalPages, onPage, label }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <nav className="pagination" aria-label={label}>
      <button
        type="button"
        className="round-button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <span className="hud-icon touch-icon-turn-left" aria-hidden="true" />
      </button>
      <span className="page-indicator" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="round-button"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        <span className="hud-icon touch-icon-turn-right" aria-hidden="true" />
      </button>
    </nav>
  )
}
