import { detailValue, displayStatus, statusClass } from '../../utils/format'

export function Details({ items = {} }) {
  return (
    <div className="details">
      {Object.entries(items).map(([label, value]) => (
        <div className="detail-row" key={label}>
          <span>{label}</span>
          <strong>{detailValue(value)}</strong>
        </div>
      ))}
    </div>
  )
}

export function ResultCard({ title, status, message, items }) {
  return (
    <article className={`card result ${statusClass(status)}`}>
      <div className="result-head">
        <strong>{title}</strong>
        <span className={`pill ${statusClass(status)}`}>{displayStatus(status)}</span>
      </div>
      {message ? <p>{message}</p> : null}
      <Details items={items} />
    </article>
  )
}

export function JsonDetails({ title = 'JSON', value }) {
  return (
    <details className="json-details">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value || {}, null, 2)}</pre>
    </details>
  )
}
