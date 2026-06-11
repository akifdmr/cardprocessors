import { Details, ResultCard } from '../../components/common/Details'
import { pickDetail, statusClass } from '../../utils/format'

function displayValue(value) {
  if (value === null || value === undefined || value === '' || value === 'API Only') return '-'
  if (typeof value === 'object') {
    return value.name || value.label || value.value || JSON.stringify(value)
  }
  return String(value)
}

export function CardIntelligence({ result, title = 'Card Intelligence', live }) {
  const details = result?.details || {}
  const summary = result?.summary || {}
  const ipDetails = result?.ipDetails || {}
  const usefulLabel = summary.usefulLabel || [
    displayValue(summary.country || pickDetail(details, ['ISO Country Name', 'ISO Country Code A2'])),
    displayValue(summary.issuer || pickDetail(details, ['Issuer Name / Bank'])),
    displayValue(summary.level || pickDetail(details, ['Card Level'])),
    displayValue(summary.type || pickDetail(details, ['Card Type'])),
    displayValue(summary.scheme || pickDetail(details, ['Card Scheme', 'Card Brand'])),
  ].filter(Boolean).join(' / ')

  return (
    <article className="card intelligence">
      <div className="result-head">
        <strong>{title}</strong>
        <span className={`pill ${statusClass(result?.status)}`}>{result?.status || '-'}</span>
      </div>
      <div className="result-hero">
        <span>Useful BIN Result</span>
        <strong>{usefulLabel || '-'}</strong>
      </div>
      {result?.responseMessage || result?.failureReason || (result?.providerWarning && result?.status !== 'passed') ? (
        <p className={`error ${result?.status === 'passed' ? 'muted' : ''}`}>
          {result.responseMessage || result.failureReason || (result?.status !== 'passed' ? result.providerWarning : '')}
        </p>
      ) : null}
      <div className="summary">
        <div><span>BIN/IIN</span><strong>{displayValue(summary.bin || result?.bin || details['BIN/IIN'])}</strong></div>
        <div><span>Country</span><strong>{displayValue(summary.country || pickDetail(details, ['ISO Country Name', 'ISO Country Code A2']))}</strong></div>
        <div><span>Issuer / Bank</span><strong>{displayValue(summary.issuer || pickDetail(details, ['Issuer Name / Bank']))}</strong></div>
        <div><span>Level</span><strong>{displayValue(summary.level || pickDetail(details, ['Card Level']))}</strong></div>
        <div><span>Type</span><strong>{displayValue(summary.type || pickDetail(details, ['Card Type']))}</strong></div>
        <div><span>Scheme</span><strong>{displayValue(summary.scheme || pickDetail(details, ['Card Scheme']))}</strong></div>
        <div><span>Brand</span><strong>{displayValue(summary.brand || pickDetail(details, ['Card Brand']))}</strong></div>
        <div><span>Commercial</span><strong>{displayValue(summary.commercial || pickDetail(details, ['Commercial Card?']))}</strong></div>
        <div><span>Prepaid</span><strong>{displayValue(summary.prepaid || pickDetail(details, ['Prepaid Card?']))}</strong></div>
        <div><span>Currency</span><strong>{displayValue(summary.currency || pickDetail(details, ['Card Currency', 'ISO Country Currency']))}</strong></div>
      </div>
      {live ? (
        <section className="live-card-visual">
          <div className="live-card-face">
            <span>{pickDetail(details, ['Card Scheme', 'Card Brand']) || live.card?.brand || 'CARD'}</span>
            <strong>{live.card?.maskedPan || result?.bin || '•••• •••• •••• ••••'}</strong>
            <small>{live.card?.first6 || result?.bin || '-'} / {live.card?.last4 || '-'}</small>
          </div>
          <div className="summary">
            <div><span>Live Status</span><strong>{live.status || '-'}</strong></div>
            <div><span>Provider Message</span><strong>{live.responseMessage || '-'}</strong></div>
            <div><span>PNREF</span><strong>{live.pnref || live.result?.transactionId || live.result?.cloverChargeId || live.result?.pnref || '-'}</strong></div>
            <div><span>Auth Code</span><strong>{live.authCode || live.result?.authCode || '-'}</strong></div>
            <div><span>AVS</span><strong>{live.avsZip || live.avsAddress || live.result?.avsResult || live.result?.avsZip || '-'}</strong></div>
            <div><span>CVV</span><strong>{live.cvv2Match || live.result?.cvvResult || live.result?.cvv2Match || '-'}</strong></div>
            <div><span>Amount</span><strong>{live.amount?.submittedAmount ?? live.amount ?? '-'}</strong></div>
            <div><span>BIN Check</span><strong>{result?.status || '-'}</strong></div>
          </div>
        </section>
      ) : null}
      <h4>Kart / BIN Detayları</h4>
      <Details items={details} />
      {Object.keys(ipDetails).length ? <><h4>IP Detayları</h4><Details items={ipDetails} /></> : null}
    </article>
  )
}
