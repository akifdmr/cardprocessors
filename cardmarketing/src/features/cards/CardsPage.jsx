import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { PaginationControls, usePagination } from '../../components/common/Pagination'
import { formatCardLabel, formatMoneyInput, moneyValue, statusClass } from '../../utils/format'

function attemptStatus(checks, type) {
  const item = checks.find((check) => check.attempt_type === type)
  return item?.status || 'none'
}

function firstSixFromCard(card = {}) {
  return String(card.first6 || card.bin || card.masked_pan || card.maskedPan || card.pan || '')
    .replace(/\D/g, '')
    .slice(0, 6)
}

function JsonModal({ title, value, onClose }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Card Debug</p>
            <h3>{title}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <pre className="json-modal-pre">{JSON.stringify(value || {}, null, 2)}</pre>
      </article>
    </div>
  )
}

export function CardsPage({ cards, onRefreshCards, runAction }) {
  const [checksByCard, setChecksByCard] = useState({})
  const [modal, setModal] = useState(null)
  const [enrollment, setEnrollment] = useState(null)
  const [actionPrompt, setActionPrompt] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const withLoader = runAction || ((task) => task())
  const cardPagination = usePagination(cards, 25)

  useEffect(() => {
    api('/provider-operations/catalog').then(setCatalog).catch(console.error)
  }, [])

  async function loadChecks(cardId) {
    const checks = await api(`/cards/${cardId}/checks`)
    setChecksByCard((current) => ({ ...current, [cardId]: checks }))
    return checks
  }

  function payloadForCard(card, extra = {}) {
    const first6 = firstSixFromCard(card)
    return {
      cardId: card.id,
      provider: card.provider || 'paypal',
      pan: card.pan,
      bin: first6,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      providerPaymentToken: card.provider_payment_token,
      source: card.provider === 'clover' ? card.provider_payment_token : undefined,
      first6,
      last4: card.last4,
      cardholderName: card.cardholder_name,
      billingAddressLine1: card.billing_address_line1,
      billingCity: card.billing_city,
      billingState: card.billing_state,
      billingZip: card.billing_zip || '00000',
      billingCountry: card.billing_country || 'US',
      ...extra,
    }
  }

  function amountToCents(value, fallback = 1) {
    const number = Number(moneyValue(value || fallback))
    if (!Number.isFinite(number) || number <= 0) return fallback
    return Math.round(number * 100)
  }

  function handleCardActionClick(card, action) {
    if (action === 'live' || action === 'balance') {
      const configuredProviders = catalog ? Object.values(catalog).filter((p) => {
        if (!p.configured) return false;
        const hasLive = p.key === 'paypal' || p.methods?.some(m => ['verification', 'verify'].includes(m.operation));
        const hasBalance = p.methods?.some(m => ['auth', 'authorize'].includes(m.operation));
        return action === 'live' ? hasLive : hasBalance;
      }) : []
      const defaultProvider = configuredProviders.find(p => p.key === card.provider)?.key 
        || configuredProviders[0]?.key 
        || 'paypal'

      setActionPrompt({
        card,
        action,
        provider: defaultProvider,
        amount: action === 'balance' ? '0.01' : '1.00'
      })
    } else {
      runCardAction(card, action)
    }
  }

  async function runCardAction(card, action, config = {}) {
    const loaderByAction = {
      select: { label: `${formatCardLabel(card)} açılıyor`, variant: 'cards', detail: 'Kart detayları ve check kayıtları yükleniyor' },
      enroll: { label: `${formatCardLabel(card)} enrollment kaydı`, variant: 'cards', detail: 'Enrollment formu hazırlanıyor' },
      'view-enroll': { label: `${formatCardLabel(card)} enrollment`, variant: 'logs', detail: 'Enrollment detayları alınıyor' },
      'call-card': { label: `${formatCardLabel(card)} arama`, variant: 'transaction', detail: 'Maskeli kart araması başlatılıyor' },
      history: { label: `${formatCardLabel(card)} geçmişi açılıyor`, variant: 'logs', detail: 'Kart işlem kayıtları yükleniyor' },
      bin: { label: `${formatCardLabel(card)} BIN kontrolü`, variant: 'auth', detail: 'PayPal Manager BIN check çalışıyor' },
      live: { label: `${formatCardLabel(card)} live check`, variant: 'sale', detail: 'Live check isteği gönderiliyor' },
      balance: { label: `${formatCardLabel(card)} provision check`, variant: 'transaction', detail: 'Balance check metodu çalışıyor' },
      'number-lookup': { label: `${formatCardLabel(card)} numara kayıtları`, variant: 'transaction', detail: 'Karta bağlı numara kayıtları alınıyor' },
      'verify-number': { label: `${formatCardLabel(card)} numara doğrulama`, variant: 'transaction', detail: 'Twilio OTP doğrulaması çalışıyor' },
    }

    await withLoader(async () => {
      let result
      if (action === 'select') {
        const checks = await loadChecks(card.id)
        setModal({ title: `${formatCardLabel(card)} Details`, value: { card, checks } })
        return
      }

      if (action === 'enroll') {
        setEnrollment({ card, form: { enrollBankUrl: '', username: '', password: '', holderSsn: '', holderDob: '', freeText: '' } })
        return
      }

      if (action === 'view-enroll') {
        result = await api(`/cards/${card.id}/enrollment`)
        setModal({ title: `${formatCardLabel(card)} Enrollment`, value: result })
        return
      }

      if (action === 'call-card') {
        await ensureCardPhoneNumber(card)
        const realTo = window.prompt('Number to call')
        if (!realTo) return
        result = await api('/calls/card', {
          method: 'POST',
          body: JSON.stringify({ cardId: card.id, realTo }),
        })
      }

      if (action === 'history') {
        result = await loadChecks(card.id)
        setModal({ title: `${formatCardLabel(card)} History`, value: result })
        return
      }

      if (action === 'bin') {
        result = await api('/providers/paypal/manager/cards/bin-check', {
          method: 'POST',
          body: JSON.stringify(payloadForCard(card)),
        })
      }

      if (action === 'live') {
        const provider = config.provider || 'paypal'
        const payload = payloadForCard(card, { billingZip: '00000' })
        result = await api('/provider-operations/cards', {
          method: 'POST',
          body: JSON.stringify({ ...payload, provider, operation: 'live', amount: amountToCents(formatMoneyInput(config.amount), 1), runBinCheck: true }),
        })
      }

      if (action === 'balance') {
        const provider = config.provider || 'clover'
        const payload = payloadForCard(card, {
          provider,
          operation: 'balance',
          amount: amountToCents(formatMoneyInput(config.amount), 1),
          currency: 'usd',
        })
        
        result = await api('/provider-operations/cards', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      if (action === 'number-lookup') {
        result = await api(`/numbers/card/${card.id}`)
        setModal({ title: `${formatCardLabel(card)} Number Lookup`, value: result })
        return
      }

      if (action === 'verify-number') {
        const number = await ensureCardPhoneNumber(card)
        if (!window.confirm(`Verify ${number.phoneNumber} with Twilio OTP?`)) return
        const channel = window.prompt('Verification channel', 'sms') || 'sms'
        await api(`/numbers/${number.id}/twilio/start`, {
          method: 'POST',
          body: JSON.stringify({ channel }),
        })
        const code = window.prompt(`OTP code sent to ${number.phoneNumber}`)
        if (!code) return
        result = await api(`/numbers/${number.id}/twilio/check`, {
          method: 'POST',
          body: JSON.stringify({ code }),
        })
      }

      if (result) {
        await Promise.all([loadChecks(card.id), onRefreshCards?.()])
        setModal({ title: `${formatCardLabel(card)} ${action}`, value: result })
      }
    }, loaderByAction[action] || { label: 'Kart işlemi çalışıyor', variant: 'cards', detail: formatCardLabel(card) })
  }

  async function ensureCardPhoneNumber(card) {
    const existing = await api(`/numbers/card/${card.id}`)
    if (existing.data?.length) return existing.data[0]
    const phoneNumber = window.prompt('Card phone number')
    if (!phoneNumber) throw new Error('Phone number is required')
    const created = await api('/numbers/add', {
      method: 'POST',
      body: JSON.stringify({ cardId: card.id, phoneNumber, addedBy: 'react-panel' }),
    })
    return created.data
  }

  async function submitEnrollment(event) {
    event.preventDefault()
    if (!enrollment?.card) return
    const payload = enrollment.form
    await withLoader(async () => {
      const result = await api(`/cards/${enrollment.card.id}/enrollment`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setEnrollment(null)
      await onRefreshCards?.()
      setModal({ title: `${formatCardLabel(enrollment.card)} Enrollment`, value: result })
    }, { label: `${formatCardLabel(enrollment.card)} enrollment kaydediliyor`, variant: 'cards', detail: 'Enrollment profili güncelleniyor' })
  }

  return (
    <section className="panel wide">
      <div className="section-head">
        <div>
          <p className="eyebrow">Records</p>
          <h3>Cards</h3>
        </div>
        <PaginationControls pagination={cardPagination} />
      </div>
      <div className="table-wrap">
        <table className="processor-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Holder</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cardPagination.visibleItems.map((card) => {
              return (
                <tr key={card.id}>
                  <td>{formatCardLabel(card)}</td>
                  <td>{card.cardholder_name || '-'}</td>
                  <td className="processor-table-actions">
                    <div className="processor-row-actions">
                      <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'select')}>Open</button>
                      <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'verify-number')}>Verify Number</button>
                      <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'bin')}>BIN Check</button>
                      <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'live')}>Live Check</button>
                      <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'balance')}>Balance</button>
                      <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'number-lookup')}>Number Lookup</button>
                      <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'history')}>History</button>
                      {!card.is_enrolled ? <button className="primary small" type="button" onClick={() => handleCardActionClick(card, 'enroll')}>Enroll</button> : null}
                      {card.is_enrolled ? <button className="ghost small" type="button" onClick={() => handleCardActionClick(card, 'view-enroll')}>View Enroll</button> : null}
                      <button className="primary small" type="button" onClick={() => handleCardActionClick(card, 'call-card')}>Call</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!cards.length ? <article className="card">Kayıtlı kart yok.</article> : null}
      {modal ? <JsonModal title={modal.title} value={modal.value} onClose={() => setModal(null)} /> : null}
      {actionPrompt ? (
        <div className="modal-overlay" role="presentation" onClick={() => setActionPrompt(null)}>
          <article className="modal panel" role="dialog" aria-modal="true" aria-label="Action Configuration" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <p className="eyebrow">Card Action</p>
                <h3>{actionPrompt.action.toUpperCase()} - {formatCardLabel(actionPrompt.card)}</h3>
              </div>
              <button className="ghost small" type="button" onClick={() => setActionPrompt(null)}>Kapat</button>
            </div>
            <form className="form-grid" onSubmit={(e) => {
              e.preventDefault();
              const { card, action, provider, amount } = actionPrompt;
              setActionPrompt(null);
              runCardAction(card, action, { provider, amount });
            }}>
              <label className="full">
                <span>Provider</span>
        <select value={actionPrompt.provider} onChange={(e) => setActionPrompt({ ...actionPrompt, provider: e.target.value })}>
          {catalog ? Object.values(catalog)
            .filter((p) => {
              if (!p.configured) return false;
              const hasLive = p.key === 'paypal' || p.methods?.some(m => ['verification', 'verify'].includes(m.operation));
              const hasBalance = p.methods?.some(m => ['auth', 'authorize'].includes(m.operation));
              return actionPrompt.action === 'live' ? hasLive : hasBalance;
            })
            .map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
                    )) : (
                      <>
                        <option value="paypal">PayPal</option>
                        <option value="clover">Clover</option>
                        <option value="fluidpay">FluidPay</option>
                        <option value="globalpayments">Global Payments</option>
                        <option value="propelrpay">PropelrPay</option>
                        <option value="braintree">Braintree</option>
                      </>
                  )}
                </select>
              </label>
              <label className="full">
                <span>Amount</span>
                <input value={actionPrompt.amount} onChange={(e) => setActionPrompt({ ...actionPrompt, amount: e.target.value })} />
              </label>
              <div className="form-actions full">
                <button className="ghost" type="button" onClick={() => setActionPrompt(null)}>Vazgeç</button>
                <button className="primary" type="submit">İşlemi Başlat</button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
      {enrollment ? (
        <div className="modal-overlay" role="presentation" onClick={() => setEnrollment(null)}>
          <article className="modal panel" role="dialog" aria-modal="true" aria-label="Enrollment" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <p className="eyebrow">Enrollment</p>
                <h3>{formatCardLabel(enrollment.card)}</h3>
              </div>
              <button className="ghost small" type="button" onClick={() => setEnrollment(null)}>Kapat</button>
            </div>
            <form className="form-grid" onSubmit={submitEnrollment}>
              <label className="full"><span>Enroll Bank URL</span><input value={enrollment.form.enrollBankUrl} onChange={(event) => setEnrollment({ ...enrollment, form: { ...enrollment.form, enrollBankUrl: event.target.value } })} /></label>
              <label><span>Username</span><input value={enrollment.form.username} onChange={(event) => setEnrollment({ ...enrollment, form: { ...enrollment.form, username: event.target.value } })} /></label>
              <label><span>Password</span><input type="password" value={enrollment.form.password} onChange={(event) => setEnrollment({ ...enrollment, form: { ...enrollment.form, password: event.target.value } })} /></label>
              <label><span>Holder SSN</span><input value={enrollment.form.holderSsn} onChange={(event) => setEnrollment({ ...enrollment, form: { ...enrollment.form, holderSsn: event.target.value } })} /></label>
              <label><span>Holder DOB</span><input placeholder="YYYY-MM-DD" value={enrollment.form.holderDob} onChange={(event) => setEnrollment({ ...enrollment, form: { ...enrollment.form, holderDob: event.target.value } })} /></label>
              <label className="full"><span>Free Text</span><textarea rows="3" value={enrollment.form.freeText} onChange={(event) => setEnrollment({ ...enrollment, form: { ...enrollment.form, freeText: event.target.value } })} /></label>
              <div className="form-actions full">
                <button className="ghost" type="button" onClick={() => setEnrollment(null)}>Vazgeç</button>
                <button className="primary" type="submit">Save Enrollment</button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </section>
  )
}
