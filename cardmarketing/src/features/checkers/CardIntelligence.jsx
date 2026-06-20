import { displayStatus, operationResponseMessage, pickDetail, statusClass } from '../../utils/format'

function displayValue(value) {
  if (value === null || value === undefined || value === '' || value === 'API Only') return '-'
  if (typeof value === 'object') {
    return value.name || value.label || value.value || JSON.stringify(value)
  }
  return String(value)
}

export function CardIntelligence({ result, title = 'Card Intelligence', live }) {
  const details = result?.details || {}
  const ipDetails = result?.ipDetails || {}
  const summary = result?.summary || {}
  const compactDetails = {
    'BIN / IIN': result?.bin || pickDetail(details, ['BIN/IIN']),
    'Kart Ağı': summary.scheme || summary.brand || pickDetail(details, ['Card Scheme', 'Card Brand']),
    'Kart Tipi': summary.type || pickDetail(details, ['Card Type']),
    'Kart Seviyesi': summary.level || pickDetail(details, ['Card Level']),
    'İhraççı Adı / Banka': summary.issuer || pickDetail(details, ['Issuer Name / Bank']),
    'Ülke': summary.country || pickDetail(details, ['ISO Country Name', 'ISO Country Code A2']),
    'Para Birimi': summary.currency || pickDetail(details, ['Card Currency', 'ISO Country Currency']),
    'Veri Kaynağı': result?.sourceLabel || result?.source,
    'Güven Seviyesi': result?.confidence,
    'PayPal Vault Durumu': result?.paypalVault?.status,
    'PayPal Kart Sahibi': result?.paypalVault?.card?.name,
    'PayPal Kart': result?.paypalVault?.card?.brand && result?.paypalVault?.card?.last4
      ? `${result.paypalVault.card.brand} •••• ${result.paypalVault.card.last4}`
      : null,
    'PayPal Son Kullanma': result?.paypalVault?.card?.expiry,
    'PayPal Billing Ülkesi': result?.paypalVault?.card?.countryCode,
  }

  return (
    <article className="card intelligence">
      <div className="result-head">
        <strong>{title}</strong>
        <span className={`pill ${statusClass(result?.status)}`}>{result?.status || '-'}</span>
      </div>
      {result?.responseMessage || result?.failureReason || result?.providerWarning ? (
        <p className={`error ${result?.status === 'passed' ? 'muted' : ''}`}>
          {result.responseMessage || result.failureReason || result.providerWarning}
        </p>
      ) : null}
      {result?.paypalVault?.error ? (
        <p className="error">
          PayPal Vault: {result.paypalVault.error}
        </p>
      ) : null}
      <div className="summary">
        {Object.entries(compactDetails).map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{displayValue(value)}</strong></div>
        ))}
      </div>
      {result?.ip && Object.keys(ipDetails).length ? (
        <>
          <div className="result-head">
            <strong>IP Intelligence</strong>
            <span className="pill">{result.ip}</span>
          </div>
          <div className="summary">
            {Object.entries(ipDetails).map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{displayValue(value)}</strong></div>
            ))}
          </div>
        </>
      ) : null}
      {live ? (
        <section className="live-card-visual">
          <div className="live-card-face">
            <span>{pickDetail(details, ['Card Scheme', 'Card Brand']) || live.card?.brand || 'CARD'}</span>
            <strong>{live.card?.maskedPan || result?.bin || '•••• •••• •••• ••••'}</strong>
            <small>{live.card?.first6 || result?.bin || '-'} / {live.card?.last4 || '-'}</small>
          </div>
          <div className="summary">
            <div><span>Live Status</span><strong>{displayStatus(live.status)}</strong></div>
            <div><span>Provider Message</span><strong>{operationResponseMessage(live) || '-'}</strong></div>
            <div><span>Failure Reason</span><strong>{live.failureReason || '-'}</strong></div>
            <div><span>Provider Status</span><strong>{live.result?.providerStatus || live.providerStatus || '-'}</strong></div>
            <div><span>PNREF</span><strong>{live.pnref || live.result?.transactionId || live.result?.cloverChargeId || live.result?.pnref || '-'}</strong></div>
            <div><span>Auth Code</span><strong>{live.authCode || live.result?.authCode || '-'}</strong></div>
            <div><span>AVS</span><strong>{live.avsZip || live.avsAddress || live.result?.avsResult || live.result?.avsZip || '-'}</strong></div>
            <div><span>CVV</span><strong>{live.cvv2Match || live.result?.cvvResult || live.result?.cvv2Match || '-'}</strong></div>
            <div><span>Amount</span><strong>{live.amount?.submittedAmount ?? live.amount ?? '-'}</strong></div>
            <div><span>BIN Check</span><strong>{result?.status || '-'}</strong></div>
          </div>
        </section>
      ) : null}
    </article>
  )
}
