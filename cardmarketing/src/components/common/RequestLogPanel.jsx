import { useState } from 'react'

function maskCardNumber(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 10) return value
  return `${digits.slice(0, 6)}${'*'.repeat(Math.max(4, digits.length - 10))}${digits.slice(-4)}`
}

export function maskLogPayload(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item) => maskLogPayload(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, maskLogPayload(entryValue, entryKey)]))
  }
  const normalizedKey = String(key || '').toLowerCase()
  if (/(cvv|cvc|ccv|securitycode)/.test(normalizedKey)) return value ? '[masked]' : value
  if (/(pan|cardnumber|card_number|number)/.test(normalizedKey)) return maskCardNumber(value)
  if (/(token|source|providerpaymenttoken)/.test(normalizedKey) && typeof value === 'string' && value.length > 12) {
    return `${value.slice(0, 6)}...${value.slice(-4)}`
  }
  if (typeof value === 'string' && /^\d{12,19}$/.test(value.replace(/\s+/g, ''))) {
    return maskCardNumber(value)
  }
  return value
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

export function RequestLogPanel({ logs = [], title = 'Request Logs' }) {
  const [modal, setModal] = useState(null)
  return (
    <section className="panel request-log-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">JSON Trace</p>
          <h2>{title}</h2>
        </div>
        <span className="pill warn">{logs.length}</span>
      </div>
      <div className="table-wrap">
        <table className="request-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Status</th>
              <th>Request</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.time}</td>
                <td>{log.action}</td>
                <td><span className={`pill ${log.ok ? 'good' : 'bad'}`}>{log.status}</span></td>
                <td><button className="small ghost" type="button" onClick={() => setModal({ title: `${log.action} Request`, payload: log.request })}>JSON</button></td>
                <td><button className="small ghost" type="button" onClick={() => setModal({ title: `${log.action} Response`, payload: log.response })}>JSON</button></td>
              </tr>
            ))}
            {!logs.length && <tr><td colSpan="5" className="muted">Henüz işlem yok</td></tr>}
          </tbody>
        </table>
      </div>
      <JsonModal value={modal} onClose={() => setModal(null)} />
    </section>
  )
}
