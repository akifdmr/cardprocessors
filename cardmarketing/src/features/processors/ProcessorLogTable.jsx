import { useState } from 'react'
import { formatCardLabel, statusClass } from '../../utils/format'
import { processorTransactionId } from './actions/logActions'
import { ProcessorRowActions } from './ProcessorRowActions'

function hasJsonValue(value) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function logKey(log, index) {
  return String(log.id || `${log.processor || log.provider || 'processor'}-${log.created_at || index}`)
}

function formatMoney(value) {
  if (value === undefined || value === null || value === '') return '-'
  const amount = Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(amount)) return String(value)
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

function fullPanFromValue(value) {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') {
    const raw = String(value)
    if (raw.includes('*') || raw.toLowerCase().includes('redacted')) return ''
    const digits = raw.replace(/\D/g, '')
    return digits.length >= 12 && digits.length <= 19 ? digits : ''
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const pan = fullPanFromValue(item)
      if (pan) return pan
    }
    return ''
  }
  if (typeof value === 'object') {
    const directKeys = ['pan', 'cardNumber', 'card_number', 'account']
    for (const key of directKeys) {
      const pan = fullPanFromValue(value[key])
      if (pan) return pan
    }
    for (const item of Object.values(value)) {
      const pan = fullPanFromValue(item)
      if (pan) return pan
    }
  }
  return ''
}

function formatFullPan(value) {
  const pan = fullPanFromValue(value)
  return pan ? pan.replace(/(.{4})/g, '$1 ').trim() : ''
}

function processorCardLabel(log) {
  return formatFullPan([
    log.requestModel?.card,
    log.responseModel?.card,
    log.requestModel,
    log.responseModel,
    log.raw_response?.card,
    log.raw_response,
  ]) || (log.card ? formatCardLabel(log.card) : '-')
}

function JsonModal({ title, value, onClose }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">JSON Debug</p>
            <h3>{title}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <pre className="json-modal-pre">{JSON.stringify(value || {}, null, 2)}</pre>
      </article>
    </div>
  )
}

export function ProcessorLogTable({ logs = [], canViewJson, onAction }) {
  const [jsonModal, setJsonModal] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const pageCount = Math.max(1, Math.ceil(logs.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const visibleLogs = logs.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <section className="panel wide">
      <div className="section-head">
        <div>
          <p className="eyebrow">Logs</p>
          <h3>İşlem Listesi</h3>
        </div>
        <div className="pagination-controls">
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} aria-label="Sayfa boyutu">
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button className="ghost small" type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Önceki</button>
          <span className="muted">{safePage}/{pageCount}</span>
          <button className="ghost small" type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sonraki</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="processor-table processor-log-table">
          <thead>
            <tr>
              <th>Transaction Id</th>
              <th>Kart Numarası</th>
              <th>Miktar</th>
              <th>Actions</th>
              <th>İşlem</th>
              <th>Status</th>
              <th>İşlemi Yapan</th>
              {canViewJson ? <th>Request</th> : null}
              {canViewJson ? <th>Response</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map((log, index) => {
              const tx = processorTransactionId(log)
              const provider = log.processor || log.provider
              const key = logKey(log, index)
              const requestEnabled = hasJsonValue(log.requestModel)
              const responseEnabled = hasJsonValue(log.responseModel)
              return (
                <tr key={key}>
                  <td className="mono processor-transaction-id">{tx || '-'}</td>
                  <td className="mono processor-card-pan">{processorCardLabel(log)}</td>
                  <td>{formatMoney(log.amount)}</td>
                  <td className="processor-table-actions"><ProcessorRowActions log={log} onAction={onAction} /></td>
                  <td><strong>{log.attempt_type || '-'}</strong><div className="muted">{provider}</div></td>
                  <td><span className={`pill ${statusClass(log.status)}`}>{log.status || '-'}</span></td>
                  <td>{log.actor?.displayName || log.actor?.username || log.created_by_user_id || '-'}</td>
                  {canViewJson ? (
                    <td className="processor-table-action">
                      <button className="ghost small" type="button" disabled={!requestEnabled} onClick={() => setJsonModal({ title: 'Request JSON', value: log.requestModel })}>
                        Request
                      </button>
                    </td>
                  ) : null}
                  {canViewJson ? (
                    <td className="processor-table-action">
                      <button className="ghost small" type="button" disabled={!responseEnabled} onClick={() => setJsonModal({ title: 'Response JSON', value: log.responseModel })}>
                        Response
                      </button>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!logs.length ? <article className="card">Bu filtrelerle işlem logu yok.</article> : null}
      {jsonModal ? <JsonModal title={jsonModal.title} value={jsonModal.value} onClose={() => setJsonModal(null)} /> : null}
    </section>
  )
}
