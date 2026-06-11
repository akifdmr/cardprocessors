import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { PaginationControls, usePagination } from '../../components/common/Pagination'
import { statusClass } from '../../utils/format'

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function formatDigitSeries(value) {
  return digitsOnly(value).replace(/(.{4})/g, '$1 ').trim()
}

function compactNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function attemptCardLabel(attempt) {
  if (typeof attempt.cardMasked === 'string') return attempt.cardMasked
  return attempt.cardMasked?.pan || attempt.cardMasked?.maskedPan || attempt.card?.pan || attempt.card?.maskedPan || '-'
}

function appendLog(setLogs, level, message, data = null) {
  const timestamp = new Date().toISOString()
  setLogs((current) => [{ timestamp, level, message, data }, ...current].slice(0, 80))
}

function successfulRows(run) {
  return run?.output?.successfulAttempts?.length
    ? run.output.successfulAttempts
    : (run?.output?.validCards || []).map((card, index) => ({
      attempt: index + 1,
      status: 'success',
      maskedPan: card.maskedPan,
      pan: card.pan,
      cvv: card.cvv,
      last4: card.last4,
      expiryFormatted: card.expiryFormatted || card.expiry,
      brand: card.brand,
      luhnValid: card.luhnValid,
      tokenizationSuccess: card.tokenizationSuccess,
      chargeSuccess: card.chargeSuccess,
      tokenMasked: card.tokenMasked,
      chargeIdMasked: card.chargeIdMasked,
    }))
}

function GeneratorLogModal({ run, onClose }) {
  const rows = successfulRows(run)
  const pagination = usePagination(rows, 10)
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label="Generator logları" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Generator Logs</p>
            <h3>Başarılı Denemeler</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <PaginationControls pagination={pagination} pageSizes={[10, 25, 50]} label="Başarılı deneme sayfa boyutu" />
        <div className="summary full">
          <div><span>Girilen Seri</span><strong>{formatDigitSeries(run?.input?.bin) || '-'}</strong></div>
          <div><span>İstenen Adet</span><strong>{run?.output?.requestedCount ?? '-'}</strong></div>
          <div><span>Başarılı</span><strong>{run?.output?.validCount ?? '-'}</strong></div>
          <div><span>Başarı</span><strong>{run?.output?.successRate ?? 0}%</strong></div>
        </div>
        <div className="table-wrap">
          <table className="processor-table dynamic-table">
            <thead>
              <tr>
                <th>Deneme</th>
                <th>Kart Numarası</th>
                <th>CVV</th>
                <th>Expiry</th>
                <th>Brand</th>
                <th>Luhn</th>
                <th>Tokenization</th>
                <th>Charge</th>
                <th>Token</th>
                <th>Charge Id</th>
              </tr>
            </thead>
            <tbody>
              {pagination.visibleItems.map((row, index) => (
                <tr key={`${row.pan || row.maskedPan || 'card'}-${row.attempt || index}`}>
                  <td>{row.attempt || index + 1}</td>
                  <td className="mono">{row.pan || row.maskedPan || '-'}</td>
                  <td className="mono">{row.cvv || '-'}</td>
                  <td>{row.expiryFormatted || '-'}</td>
                  <td>{row.brand || '-'}</td>
                  <td><span className={`pill ${statusClass(row.luhnValid ? 'success' : 'failed')}`}>{row.luhnValid ? 'valid' : '-'}</span></td>
                  <td><span className={`pill ${statusClass(row.tokenizationSuccess ? 'success' : 'failed')}`}>{row.tokenizationSuccess ? 'ok' : '-'}</span></td>
                  <td><span className={`pill ${statusClass(row.chargeSuccess ? 'success' : 'failed')}`}>{row.chargeSuccess ? 'ok' : '-'}</span></td>
                  <td className="mono">{row.tokenMasked || '-'}</td>
                  <td className="mono">{row.chargeIdMasked || '-'}</td>
                </tr>
              ))}
              {!pagination.visibleItems.length ? <tr><td colSpan="10" className="muted">Başarılı deneme yok.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  )
}

function GeneratorHistoryTable({ runs, onOpenLogs, loading }) {
  const pagination = usePagination(runs, 10)

  return (
    <section className="panel wide">
      <div className="section-head">
        <div>
          <p className="eyebrow">Generator History</p>
          <h3>Geçmiş Generate Listesi</h3>
        </div>
        <PaginationControls pagination={pagination} pageSizes={[10, 25, 50]} label="Generator geçmiş sayfa boyutu" />
      </div>
      <div className="table-wrap">
        <table className="processor-table dynamic-table">
          <thead>
            <tr>
              <th>Zaman</th>
              <th>Girilen Seri</th>
              <th>İstenen Adet</th>
              <th>Maks. Deneme</th>
              <th>Başarılı Kart</th>
              <th>Toplam Deneme</th>
              <th>Başarı</th>
              <th>Status</th>
              <th>Log</th>
            </tr>
          </thead>
          <tbody>
            {pagination.visibleItems.map((run) => (
              <tr key={run.runId}>
                <td>{run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</td>
                <td className="mono">{formatDigitSeries(run.input?.bin) || '-'}</td>
                <td>{run.output?.requestedCount ?? run.input?.quantity ?? '-'}</td>
                <td>{run.input?.maxAttempts ?? '-'}</td>
                <td>{run.output?.validCount ?? 0}</td>
                <td>{run.output?.totalAttempts ?? 0}</td>
                <td><strong>{run.output?.successRate ?? 0}%</strong></td>
                <td><span className={`pill ${statusClass(run.status)}`}>{run.status || '-'}</span></td>
                <td><button className="ghost small" type="button" onClick={() => onOpenLogs(run)}>Tüm Log</button></td>
              </tr>
            ))}
            {!pagination.visibleItems.length ? <tr><td colSpan="9" className="muted">{loading ? 'Generator geçmişi yükleniyor.' : 'Geçmiş generate kaydı yok.'}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PerfectGeneratorPanel({ runAction, onRefreshCards }) {
  const [form, setForm] = useState({ bin: '411111', quantity: '2', maxAttempts: '30' })
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [logModalRun, setLogModalRun] = useState(null)

  const withLoader = runAction || (async (task) => {
    setLoading(true)
    try {
      return await task()
    } finally {
      setLoading(false)
    }
  })

  async function loadStatus() {
    const response = await api('/providers/clover/learning/status')
    setStatus(response)
  }

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const response = await api('/providers/clover/learning/runs')
      setHistory(response.runs || [])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    Promise.all([loadStatus(), loadHistory()]).catch((loadError) => {
      setError(loadError.message)
      appendLog(setLogs, 'error', 'Generator verisi yüklenemedi', { message: loadError.message })
    })
  }, [])

  async function handleRun(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    setLogs([])

    const payload = {
      bin: digitsOnly(form.bin),
      quantity: compactNumber(form.quantity, 1, 1, 100),
      maxAttempts: compactNumber(form.maxAttempts, 30, 1, 200),
    }

    await withLoader(async () => {
      appendLog(setLogs, 'info', 'Create run isteği hazırlanıyor', payload)
      const response = await api('/providers/clover/learning/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setResult(response)
      appendLog(setLogs, response.ok ? 'success' : 'warn', response.message || 'Run tamamlandı', {
        status: response.status,
        validCount: response.output?.validCount,
        totalAttempts: response.output?.totalAttempts,
      })
      await loadHistory()
      if (onRefreshCards && response.output?.validCount > 0) {
        await onRefreshCards()
      }
      ;(response.output?.attemptsLog || []).forEach((attempt) => {
        appendLog(setLogs, attempt.status === 'success' ? 'success' : 'attempt', `Deneme #${attempt.attempt}: ${attempt.status}`, {
          card: attemptCardLabel(attempt),
          errorCode: attempt.errorCode || attempt.reason || null,
        })
      })
    }, {
      label: 'Perfect generator run çalışıyor',
      variant: 'sequence',
      detail: `${payload.bin} BIN için ${payload.quantity} adet sonuç hedefleniyor`,
    }).catch((runError) => {
      setError(runError.message)
      appendLog(setLogs, 'error', 'Create run başarısız', { message: runError.message })
    })
  }

  const validCards = result?.output?.validCards || result?.output?.cards || []
  const resultPagination = usePagination(validCards, 10)

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Clover Learning</p>
            <h3>Perfect Generator Panel</h3>
          </div>
          <button className="ghost small" type="button" onClick={() => withLoader(loadStatus, { label: 'Clover learning status yenileniyor', variant: 'transaction' })}>
            Status Yenile
          </button>
        </div>

        {status ? (
          <div className="summary full">
            <div><span>Mode</span><strong>{status.mode || '-'}</strong></div>
            <div><span>Configured</span><strong>{String(Boolean(status.configured))}</strong></div>
            <div><span>Provider</span><strong>Clover</strong></div>
            <div><span>Endpoint</span><strong>/api/providers/clover/learning/runs</strong></div>
          </div>
        ) : null}

        <form className="form-grid perfect-generator-form" onSubmit={handleRun}>
          <label>
            <span>BIN / Seri Prefix</span>
            <input value={form.bin} inputMode="numeric" onChange={(event) => setForm({ ...form, bin: formatDigitSeries(event.target.value) })} placeholder="4111 11" />
          </label>
          <label>
            <span>Adet</span>
            <input type="number" min="1" max="100" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
          </label>
          <label>
            <span>Maks. Deneme</span>
            <input type="number" min="1" max="200" value={form.maxAttempts} onChange={(event) => setForm({ ...form, maxAttempts: event.target.value })} />
          </label>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Çalışıyor...' : 'Create Run'}
          </button>
        </form>
      </section>

      {error ? <ResultCard title="Perfect Generator Hatası" status="failed" message={error} /> : null}

      {result ? (
        <>
          <ResultCard
            title="Create Run Raporu"
            status={result.status}
            message={result.message}
            items={{
              Mode: result.mode,
              BIN: result.input?.bin,
              'İstenen Adet': result.output?.requestedCount,
              'Geçerli Sonuç': result.output?.validCount,
              'Toplam Deneme': result.output?.totalAttempts,
              'Başarı': `${result.output?.successRate ?? 0}%`,
              Scheme: result.output?.binMetadata?.scheme,
              'Card Length': result.output?.binMetadata?.cardLength,
              'CVV Length': result.output?.binMetadata?.cvvLength,
            }}
          />

          <section className="panel wide">
            <div className="section-head">
              <div>
                <p className="eyebrow">Results</p>
                <h3>Başarılı Sonuçlar</h3>
              </div>
              <PaginationControls pagination={resultPagination} pageSizes={[10, 25, 50]} label="Başarılı sonuç sayfa boyutu" />
            </div>
            <div className="table-wrap">
              <table className="processor-table">
                <thead>
                  <tr>
                    <th>Kart Numarası</th>
                    <th>CVV</th>
                    <th>Expiry</th>
                    <th>Brand</th>
                    <th>Luhn</th>
                    <th>Tokenization</th>
                    <th>Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {resultPagination.visibleItems.map((card, index) => (
                    <tr key={`${card.pan || card.maskedPan || 'card'}-${index}`}>
                      <td className="mono">{card.pan || card.maskedPan || '-'}</td>
                      <td className="mono">{card.cvv || '-'}</td>
                      <td>{card.expiryFormatted || card.expiry || '-'}</td>
                      <td>{card.brand || '-'}</td>
                      <td><span className={`pill ${statusClass(card.luhnValid ? 'success' : 'failed')}`}>{card.luhnValid ? 'valid' : 'invalid'}</span></td>
                      <td><span className={`pill ${statusClass(card.tokenizationSuccess ? 'success' : 'failed')}`}>{card.tokenizationSuccess ? 'ok' : '-'}</span></td>
                      <td><span className={`pill ${statusClass(card.chargeSuccess ? 'success' : 'failed')}`}>{card.chargeSuccess ? 'ok' : '-'}</span></td>
                    </tr>
                  ))}
                  {!resultPagination.visibleItems.length ? (
                    <tr><td colSpan="7" className="muted">Başarılı sonuç yok.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <GeneratorHistoryTable runs={history} loading={historyLoading} onOpenLogs={setLogModalRun} />

      <section className="panel wide">
        <div className="section-head">
          <div>
            <p className="eyebrow">Run Logs</p>
            <h3>Panel Günlüğü</h3>
          </div>
        </div>
        <div className="logs-container">
          {logs.map((log) => (
            <div className={`log-entry log-${log.level}`} key={`${log.timestamp}-${log.message}`}>
              <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className="log-level">[{log.level.toUpperCase()}]</span>
              <span className="log-message">{log.message}</span>
              {log.data ? <pre className="log-data">{JSON.stringify(log.data, null, 2)}</pre> : null}
            </div>
          ))}
          {!logs.length ? <div className="muted">Henüz log yok.</div> : null}
        </div>
      </section>
      {logModalRun ? <GeneratorLogModal run={logModalRun} onClose={() => setLogModalRun(null)} /> : null}
    </div>
  )
}

export function PerfectGeneratorPage({ runAction, onRefreshCards }) {
  return <PerfectGeneratorPanel runAction={runAction} onRefreshCards={onRefreshCards} />
}
