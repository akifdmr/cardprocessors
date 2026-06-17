import { useEffect, useMemo, useState } from 'react'
import { api, toQuery } from '../../api/client'
import { PaginationControls } from '../../components/common/Pagination'
import { ResultCard } from '../../components/common/Details'
import { maskLogPayload } from '../../components/common/RequestLogPanel'
import { formatMoneyInput, operationResponseMessage, statusClass } from '../../utils/format'

function serverPagination(meta, setPage, setPageSize) {
  return {
    page: meta.page,
    pageSize: meta.pageSize,
    pageCount: meta.pageCount,
    total: meta.total,
    setPage,
    setPageSize: (value) => {
      setPageSize(Number(value))
      setPage(1)
    },
  }
}

const emptyResponse = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  pageCount: 1,
  filters: {
    countries: [],
    cardTypes: [],
    segments: [],
  },
}

function JsonModal({ value, onClose }) {
  if (!value) return null
  return (
    <div className="modal-overlay json-modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label={value.title} onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">JSON Model</p>
            <h3>{value.title}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <pre className="json-modal-pre">{JSON.stringify(maskLogPayload(value.payload || {}), null, 2)}</pre>
      </article>
    </div>
  )
}

function CheckedCardLogsModal({ value, loading, error, onClose, onOpenJson }) {
  if (!value) return null
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel checked-card-log-modal" role="dialog" aria-modal="true" aria-label="Checked card logs" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">CheckedCard Logs</p>
            <h3>{value.card?.maskedPan || value.card?.id || 'Log'}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        {loading ? <p className="muted">Loglar yükleniyor...</p> : null}
        {error ? <p className="bad">{error}</p> : null}
        <div className="table-wrap">
          <table className="request-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Status</th>
                <th>Request</th>
                <th>Response</th>
                <th>Full</th>
              </tr>
            </thead>
            <tbody>
              {(value.logs || []).map((log) => {
                const details = log.details || {}
                return (
                  <tr key={log.id || `${log.action}-${log.created_at}`}>
                    <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
                    <td>{log.action || '-'}</td>
                    <td><span className={`pill ${statusClass(log.status)}`}>{log.status || '-'}</span></td>
                    <td><button className="small ghost" type="button" onClick={() => onOpenJson(`${log.action || 'Log'} Request`, details.request || {})}>JSON</button></td>
                    <td><button className="small ghost" type="button" onClick={() => onOpenJson(`${log.action || 'Log'} Response`, details.response || {})}>JSON</button></td>
                    <td><button className="small ghost" type="button" onClick={() => onOpenJson(`${log.action || 'Log'} Full`, log)}>JSON</button></td>
                  </tr>
                )
              })}
              {!loading && !(value.logs || []).length ? (
                <tr><td colSpan="6" className="muted">Bu kart için log yok</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  )
}

export function CheckedCardsPage({ runAction }) {
  const [data, setData] = useState(emptyResponse)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [filters, setFilters] = useState({
    q: '',
    country: '',
    cardType: '',
    segment: '',
  })
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [busyRow, setBusyRow] = useState('')
  const [logsModal, setLogsModal] = useState(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState('')
  const [jsonModal, setJsonModal] = useState(null)
  const withLoader = runAction || ((task) => task())

  const pagination = useMemo(
    () => serverPagination(data, setPage, setPageSize),
    [data]
  )

  async function loadRows() {
    setError('')
    const response = await api(`/checked-cards${toQuery({
      page,
      pageSize,
      q: filters.q,
      country: filters.country,
      cardType: filters.cardType,
      segment: filters.segment,
    })}`)
    setData(response)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRows().catch((loadError) => setError(loadError.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters])

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  function resetFilters() {
    setFilters({ q: '', country: '', cardType: '', segment: '' })
    setPage(1)
  }

  async function refresh() {
    await withLoader(loadRows, {
      label: 'Checked cards yenileniyor',
      variant: 'cards',
      detail: 'Liste ve filtre seçenekleri güncelleniyor',
    })
  }

  function cardBank(card) {
    return card.cardBank || card.bank || card.Bank || card.binBank || card.binlabel || '-'
  }

  function providerLabel(card) {
    return card.provider || card.lastLiveProvider || 'amazonpay'
  }

  function balanceText(card) {
    if (card.authStatus === 'authorized' && card.authAmount) {
      return `${card.authAmount} ${card.authCurrency || 'USD'}`
    }
    return card.balanceAmount ? `${card.balanceAmount} ${card.authCurrency || 'USD'}` : (card.balance || 'none')
  }

  function resultItems(response = {}) {
    const checkedCard = response.checkedCard || {}
    const state = checkedCard.state || {}
    const operationResult = response.result || response
    return {
      Provider: checkedCard.provider || response.provider || 'amazonpay',
      Operation: checkedCard.operation || response.operation || '-',
      Status: response.status || operationResult.status || '-',
      Message: response.responseMessage || operationResult.responseMessage || response.failureReason || '-',
      ChargePermission: state.amazonPayChargePermissionId || operationResult.chargePermissionId || '-',
      ChargeId: state.amazonPayChargeId || operationResult.chargeId || operationResult.transactionId || '-',
      Amount: state.authAmount || operationResult.amount || '-',
    }
  }

  async function runAmazonPayAction(card, operation, payload = {}) {
    setBusyRow(`${card.id}:${operation}`)
    try {
      const response = await withLoader(() => api(`/checked-cards/${encodeURIComponent(card.id)}/amazonpay/action`, {
        method: 'POST',
        body: JSON.stringify({ operation, ...payload }),
      }), {
        label: `Amazon Pay ${operation} çalışıyor`,
        variant: operation.includes('capture') ? 'capture' : operation.includes('sale') ? 'sale' : 'auth',
        detail: 'Checked card satırı Amazon Pay charge permission ile işleniyor',
      })
      setResult(response)
      await loadRows()
    } catch (actionError) {
      const response = actionError.data || { status: 'failed', responseMessage: actionError.message, operation, provider: 'amazonpay' }
      setResult(response)
    } finally {
      setBusyRow('')
    }
  }

  function askAmount(card, operation) {
    const fallback = card.authAmount || '0.20'
    const value = window.prompt(`${operation} miktarı`, fallback)
    if (value === null) return null
    return formatMoneyInput(value) || fallback
  }

  function hasAuth(card) {
    return ['authorized', 'captured'].includes(String(card.authStatus || '').toLowerCase()) || Boolean(card.amazonPayChargeId)
  }

  function canCapture(card) {
    return hasAuth(card) && card.amazonPayCaptureStatus !== 'captured' && card.amazonPayVoidStatus !== 'voided'
  }

  function actionDisabled(card, operation) {
    return busyRow === `${card.id}:${operation}`
  }

  async function openLogs(card) {
    setLogsModal({ card, logs: [] })
    setLogsError('')
    setLogsLoading(true)
    try {
      const logs = await api(`/audit-logs${toQuery({ entityType: 'checked_card', entityId: card.id, limit: 50 })}`)
      setLogsModal({ card, logs })
    } catch (logError) {
      setLogsError(logError.message)
    } finally {
      setLogsLoading(false)
    }
  }

  function openJson(title, payload) {
    setJsonModal({ title, payload })
  }

  return (
    <section className="panel page-stack">
      <div className="section-head">
        <div>
          <p className="eyebrow">CheckedCards</p>
          <h2>Checked Cards</h2>
        </div>
        <button className="ghost small" type="button" onClick={refresh}>Yenile</button>
      </div>

      <div className="form-grid checked-card-filters">
        <label>
          <span>Search</span>
          <input value={filters.q} onChange={(event) => updateFilter('q', event.target.value)} placeholder="Masked PAN, holder, BIN label" />
        </label>
        <label>
          <span>Country</span>
          <select value={filters.country} onChange={(event) => updateFilter('country', event.target.value)}>
            <option value="">All</option>
            {(data.filters?.countries || []).map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Card Type</span>
          <select value={filters.cardType} onChange={(event) => updateFilter('cardType', event.target.value)}>
            <option value="">All</option>
            {(data.filters?.cardTypes || []).map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Segment</span>
          <select value={filters.segment} onChange={(event) => updateFilter('segment', event.target.value)}>
            <option value="">All</option>
            {(data.filters?.segments || []).map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <div className="row-actions full">
          <button className="ghost small" type="button" onClick={resetFilters}>Filtreleri temizle</button>
          {error ? <span className="bad">{error}</span> : <span className="muted">{data.total} kayıt</span>}
        </div>
      </div>

      <div className="table-wrap">
        <table className="checked-cards-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>Card Type</th>
              <th>Card Segment</th>
              <th>Masked PAN</th>
              <th>Card Bank</th>
              <th>Balance</th>
              <th>İşlemler</th>
              <th>Log</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((card) => (
              <tr key={card.id}>
                <td>{card.CountryCode || '-'}</td>
                <td>{card.CardType || '-'}</td>
                <td>{card.Segment || '-'}</td>
                <td className="mono">{card.maskedPan || '-'}</td>
                <td>{cardBank(card)}</td>
                <td>
                  <button
                    className={`balance-button ${statusClass(card.balanceStatus || card.authStatus)}`}
                    type="button"
                    disabled={!canCapture(card) || actionDisabled(card, 'capture')}
                    title={canCapture(card) ? 'Capture et' : 'Capture için önce Amazon Pay auth gerekli'}
                    onClick={() => {
                      if (!canCapture(card)) return
                      const amount = askAmount(card, 'capture')
                      if (amount) runAmazonPayAction(card, 'capture', { amount })
                    }}
                  >
                    {balanceText(card)}
                  </button>
                </td>
                <td className="checked-card-actions">
                  <span className="pill">{providerLabel(card)}</span>
                  {providerLabel(card) === 'amazonpay' ? (
                    <>
                      <button className="ghost small" type="button" disabled={actionDisabled(card, 'live')} onClick={() => runAmazonPayAction(card, 'live')}>Card live check</button>
                      <button className="ghost small" type="button" disabled={actionDisabled(card, 'auth')} onClick={() => {
                        const amount = askAmount(card, 'auth')
                        if (amount) runAmazonPayAction(card, 'auth', { amount })
                      }}>Card auth</button>
                      {hasAuth(card) && card.amazonPayVoidStatus !== 'voided' ? (
                        <button className="ghost small" type="button" disabled={actionDisabled(card, 'void')} onClick={() => runAmazonPayAction(card, 'void')}>İptal</button>
                      ) : null}
                      <button className="ghost small" type="button" disabled={actionDisabled(card, 'balance')} onClick={() => runAmazonPayAction(card, 'balance')}>Balance check</button>
                      <button className="ghost small" type="button" disabled={actionDisabled(card, 'sale')} onClick={() => {
                        const amount = askAmount(card, 'sale')
                        if (amount) runAmazonPayAction(card, 'sale', { amount })
                      }}>Card sale</button>
                    </>
                  ) : (
                    <button className="ghost small" type="button" disabled title={card.lastLiveMessage || 'Live result checked and stored'}>Live kayıtlı</button>
                  )}
                </td>
                <td>
                  <button className="ghost small" type="button" onClick={() => openLogs(card)}>Log</button>
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr>
                <td colSpan="8" className="muted">Kayıt yok</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls pagination={pagination} />
      {result ? <ResultCard title="Amazon Pay Result" status={result.status || result.result?.status} message={operationResponseMessage(result)} items={resultItems(result)} /> : null}
      <CheckedCardLogsModal
        value={logsModal}
        loading={logsLoading}
        error={logsError}
        onClose={() => setLogsModal(null)}
        onOpenJson={openJson}
      />
      <JsonModal value={jsonModal} onClose={() => setJsonModal(null)} />
    </section>
  )
}
