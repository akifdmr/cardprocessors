import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { formatCardLabel } from '../../utils/format'

function isEligible(card = {}) {
  return ['paypal', 'braintree'].includes(String(card.provider || '').toLowerCase()) &&
    Boolean(card.provider_payment_token)
}

export function UnifiedPaymentsPage({ cards = [], onBack, onResult, runAction }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [result, setResult] = useState(null)
  const eligibleCards = useMemo(() => cards.filter(isEligible), [cards])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = eligibleCards.length > 0 && eligibleCards.slice(0, 25).every((card) => selectedSet.has(card.id))
  const withLoader = runAction || ((task) => task())

  function toggle(cardId, checked) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(cardId)
      else next.delete(cardId)
      return [...next].slice(0, 25)
    })
  }

  function toggleAll(checked) {
    setSelectedIds(checked ? eligibleCards.slice(0, 25).map((card) => card.id) : [])
  }

  async function verify(cardIds) {
    const ids = [...new Set(cardIds)].slice(0, 25)
    if (!ids.length) return
    await withLoader(async () => {
      let response
      try {
        response = await api('/unified-processor/payment-methods/verify', {
          method: 'POST',
          body: JSON.stringify({ cardIds: ids, amount: 1, currency: 'USD' }),
        })
      } catch (error) {
        response = error.data || { status: 'failed', responseMessage: error.message }
      }
      setResult(response)
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)))
      onResult?.(response)
    }, {
      label: `${ids.length} payment method doğrulanıyor`,
      variant: 'auth',
      detail: 'PayPal/Braintree sandbox tokenları için 1 USD auth ve ardından void çalışıyor',
    })
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Unified Processor</p>
            <h3>PayPal + Braintree Unified</h3>
          </div>
          <button className="ghost small" type="button" onClick={onBack}>Processor listesine dön</button>
        </div>
        <div className="summary">
          <div><span>Method</span><strong>Token Auth + Void</strong></div>
          <div><span>Environment</span><strong>Sandbox only</strong></div>
          <div><span>Amount</span><strong>1.00 USD</strong></div>
          <div><span>Batch limit</span><strong>25</strong></div>
        </div>
      </section>

      <section className="panel wide">
        <div className="section-head">
          <div>
            <p className="eyebrow">Vaulted Payment Methods</p>
            <h3>Tekli veya çoklu seçim</h3>
          </div>
          <button className="primary small" type="button" disabled={!selectedIds.length} onClick={() => verify(selectedIds)}>
            Seçilenleri Auth + Void ({selectedIds.length})
          </button>
        </div>
        <div className="table-wrap">
          <table className="processor-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Tüm uygun kayıtları seç" checked={allSelected} disabled={!eligibleCards.length} onChange={(event) => toggleAll(event.target.checked)} /></th>
                <th>Card</th>
                <th>Gateway</th>
                <th>Holder</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {eligibleCards.map((card) => (
                <tr key={card.id}>
                  <td><input type="checkbox" aria-label={`${formatCardLabel(card)} seç`} checked={selectedSet.has(card.id)} onChange={(event) => toggle(card.id, event.target.checked)} /></td>
                  <td>{formatCardLabel(card)}</td>
                  <td>{card.provider}</td>
                  <td>{card.cardholder_name || '-'}</td>
                  <td>{card.verification_status || '-'}</td>
                  <td><button className="ghost small" type="button" onClick={() => verify([card.id])}>Auth + Void</button></td>
                </tr>
              ))}
              {!eligibleCards.length ? <tr><td colSpan="6" className="muted">Vaulted PayPal veya Braintree payment method kaydı yok.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {result ? (
        <ResultCard
          title="Unified Processor Result"
          status={result.status}
          message={result.responseMessage || `${result.verified || 0} verified, ${result.failed || 0} failed`}
          items={{
            Processor: result.processor,
            Requested: result.requested,
            Verified: result.verified,
            Failed: result.failed,
            Amount: result.amount,
            Currency: result.currency,
          }}
        />
      ) : null}
    </div>
  )
}
