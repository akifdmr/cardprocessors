import { useState } from 'react'

function JsonModal({ value, onClose }) {
  if (!value) return null
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label={value.title} onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">JSON Model</p>
            <h3>{value.title}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <pre className="json-modal-pre">{JSON.stringify(value.payload || {}, null, 2)}</pre>
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
