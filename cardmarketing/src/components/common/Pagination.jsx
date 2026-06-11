import { useEffect, useMemo, useState } from 'react'

const defaultPageSizes = [10, 25, 50, 100]

export function usePagination(items = [], initialPageSize = 25) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const visibleItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, pageSize, safePage])

  return {
    page: safePage,
    pageCount,
    pageSize,
    setPage,
    setPageSize: (nextPageSize) => {
      setPageSize(Number(nextPageSize))
      setPage(1)
    },
    total,
    visibleItems,
  }
}

export function PaginationControls({ pagination, pageSizes = defaultPageSizes, label = 'Rows per page', extra }) {
  if (!pagination) return null

  const start = pagination.total ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0
  const end = Math.min(pagination.total, pagination.page * pagination.pageSize)

  return (
    <div className="pagination-controls">
      <select value={pagination.pageSize} onChange={(event) => pagination.setPageSize(event.target.value)} aria-label={label}>
        {pageSizes.map((size) => <option value={size} key={size}>{size}</option>)}
      </select>
      <button className="ghost small" type="button" disabled={pagination.page <= 1} onClick={() => pagination.setPage((value) => Math.max(1, value - 1))}>Önceki</button>
      <span className="muted">{pagination.page}/{pagination.pageCount}</span>
      <button className="ghost small" type="button" disabled={pagination.page >= pagination.pageCount} onClick={() => pagination.setPage((value) => Math.min(pagination.pageCount, value + 1))}>Sonraki</button>
      <span className="muted">{start}-{end} / {pagination.total}</span>
      {extra}
    </div>
  )
}
