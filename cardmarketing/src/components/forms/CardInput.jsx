import { useMemo, useState } from 'react'
import { formatCardLabel, formatCardNumber, formatMoneyInput } from '../../utils/format'

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
}

function yearOptions() {
  const year = new Date().getFullYear()
  return Array.from({ length: 16 }, (_, index) => String(year + index))
}

export function CardInput({
  value,
  onChange,
  cards = [],
  savedCard = true,
  source = false,
  bin = false,
  binOnly = false,
  cvv = true,
  holder = true,
  address = true,
  amount = false,
  amountLabel = 'Amount',
  currency = false,
  zip = false,
  zipDefault = '00000',
}) {
  const [addressOpen, setAddressOpen] = useState(false)
  const selected = useMemo(() => cards.find((card) => card.id === value.cardId), [cards, value.cardId])

  function patch(next) {
    onChange({ ...value, ...next })
  }

  return (
    <div className="card-input-component">
      {savedCard ? (
        <label className="full">
          <span>Saved Card</span>
          <select value={value.cardId || ''} onChange={(event) => patch({ cardId: event.target.value })}>
            <option value="">Manual Card</option>
            {cards.map((card) => (
              <option value={card.id} key={card.id}>{formatCardLabel(card)}</option>
            ))}
          </select>
        </label>
      ) : null}

      {selected ? (
        <div className="summary full">
          <div><span>Card</span><strong>{formatCardLabel(selected)}</strong></div>
          <div><span>Provider</span><strong>{selected.provider || '-'}</strong></div>
          <div><span>Status</span><strong>{selected.verification_status || '-'}</strong></div>
        </div>
      ) : (
        <>
          {!binOnly ? (
            <label className="full">
              <span>Card Number</span>
              <input value={value.pan || ''} inputMode="numeric" autoComplete="off" onChange={(event) => patch({ pan: formatCardNumber(event.target.value) })} />
            </label>
          ) : null}
          {bin || binOnly ? (
            <label>
              <span>BIN/IIN</span>
              <input required={binOnly} value={value.bin || ''} minLength={6} maxLength={6} pattern="\d{6}" inputMode="numeric" onChange={(event) => patch({ bin: event.target.value.replace(/\D/g, '').slice(0, 6) })} />
            </label>
          ) : null}
          {!binOnly ? (
            <>
              <label>
                <span>Exp Month</span>
                <select value={value.expMonth || ''} onChange={(event) => patch({ expMonth: event.target.value })}>
                  <option value="">Month</option>
                  {monthOptions().map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Exp Year</span>
                <select value={value.expYear || ''} onChange={(event) => patch({ expYear: event.target.value })}>
                  <option value="">Year</option>
                  {yearOptions().map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>
              {cvv ? (
                <label>
                  <span>CVV</span>
                  <input value={value.cvv2 || ''} maxLength={4} inputMode="numeric" autoComplete="off" onChange={(event) => patch({ cvv2: event.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </label>
              ) : null}
              {holder ? (
                <label className="full">
                  <span>Cardholder Name</span>
                  <input value={value.cardholderName || ''} onChange={(event) => patch({ cardholderName: event.target.value })} />
                </label>
              ) : null}
              {zip ? (
                <label>
                  <span>ZIP</span>
                  <input value={value.billingZip ?? zipDefault} inputMode="numeric" autoComplete="postal-code" onChange={(event) => patch({ billingZip: event.target.value.replace(/\D/g, '').slice(0, 10) })} />
                </label>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {source ? (
        <label className="full">
          <span>Source Token</span>
          <input value={value.source || ''} autoComplete="off" onChange={(event) => patch({ source: event.target.value })} />
        </label>
      ) : null}
      {amount ? (
        <label>
          <span>{amountLabel}</span>
          <input value={value.amount || ''} inputMode="decimal" onChange={(event) => patch({ amount: formatMoneyInput(event.target.value) })} />
        </label>
      ) : null}
      {currency ? (
        <label>
          <span>Currency</span>
          <input value={value.currency || 'USD'} maxLength={3} onChange={(event) => patch({ currency: event.target.value.toUpperCase() })} />
        </label>
      ) : null}

      {address && !selected && !binOnly && !zip ? (
        <div className="address-block full">
          <button type="button" className="ghost small" onClick={() => setAddressOpen((item) => !item)}>
            {addressOpen ? 'Adres Bilgisi Kapat' : 'Adres Bilgisi Ekle'}
          </button>
          {addressOpen ? (
            <div className="form-grid address-grid">
              <label className="full"><span>Street</span><input value={value.billingAddressLine1 || ''} onChange={(event) => patch({ billingAddressLine1: event.target.value })} /></label>
              <label><span>City</span><input value={value.billingCity || ''} onChange={(event) => patch({ billingCity: event.target.value })} /></label>
              <label><span>State</span><input value={value.billingState || ''} onChange={(event) => patch({ billingState: event.target.value })} /></label>
              <label><span>ZIP</span><input value={value.billingZip || ''} onChange={(event) => patch({ billingZip: event.target.value })} /></label>
              <label><span>Country</span><input value={value.billingCountry || 'US'} maxLength={2} onChange={(event) => patch({ billingCountry: event.target.value.toUpperCase() })} /></label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
