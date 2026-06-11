import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { formatMoneyInput, moneyValue } from '../../utils/format'
import { ProcessorOperationForm } from './ProcessorOperationForm'

const dropInScriptUrl = 'https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js'

function loadDropInScript() {
  if (window.braintree?.dropin) return Promise.resolve()
  const existing = document.querySelector(`script[src="${dropInScriptUrl}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = dropInScriptUrl
    script.async = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function methodFor(catalog, providerKey, methodKey) {
  const provider = catalog?.[providerKey]
  return provider?.methods?.find((item) => item.key === methodKey) || provider?.methods?.[0]
}

function isDropInOperation(method = {}) {
  const operation = String(method.operation || method.key || '').toLowerCase()
  return ['sale', 'charge', 'auth', 'authorize'].includes(operation)
}

export function BraintreeDropInPage({ providerKey, methodKey, catalog, cards, onBack, onSelectOperation, onSubmit, onDropInResult }) {
  const provider = catalog?.[providerKey]
  const methods = provider?.methods || []
  const method = useMemo(() => methodFor(catalog, providerKey, methodKey), [catalog, providerKey, methodKey])
  const [amount, setAmount] = useState('10.00')
  const [currency, setCurrency] = useState('USD')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const dropInRef = useRef(null)
  const instanceRef = useRef(null)
  const operation = String(method?.operation || method?.key || 'sale').toLowerCase()
  const submitForSettlement = !['auth', 'authorize'].includes(operation)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError('')
    setResult(null)

    async function setup() {
      if (!isDropInOperation(method)) return
      try {
        await loadDropInScript()
        const token = await api('/providers/braintree/client-token')
        if (cancelled) return
        if (instanceRef.current) {
          await instanceRef.current.teardown()
          instanceRef.current = null
        }
        window.braintree.dropin.create({
          authorization: token.clientToken,
          container: dropInRef.current,
        }, (createError, dropinInstance) => {
          if (cancelled) {
            dropinInstance?.teardown()
            return
          }
          if (createError) {
            setError(createError.message)
            return
          }
          instanceRef.current = dropinInstance
          setReady(true)
        })
      } catch (setupError) {
        if (!cancelled) setError(setupError.message)
      }
    }

    setup()
    return () => {
      cancelled = true
      if (instanceRef.current) {
        instanceRef.current.teardown().catch(() => {})
        instanceRef.current = null
      }
    }
  }, [method])

  async function submitDropIn(event) {
    event.preventDefault()
    setError('')
    setResult(null)
    if (!instanceRef.current) {
      setError('Braintree Drop-in is not ready')
      return
    }
    try {
      const payment = await instanceRef.current.requestPaymentMethod()
      const response = await api('/providers/braintree/dropin/checkout', {
        method: 'POST',
        body: JSON.stringify({
          operation,
          amount: moneyValue(amount),
          currency,
          paymentMethodNonce: payment.nonce,
          deviceData: payment.deviceData,
          submitForSettlement,
        }),
      })
      setResult(response)
      onDropInResult?.(response)
    } catch (checkoutError) {
      const response = checkoutError.data || {
        status: 'failed',
        responseMessage: checkoutError.message,
      }
      setError(checkoutError.message)
      setResult(response)
      onDropInResult?.(response)
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Braintree</p>
            <h3>{provider?.label || 'Braintree'}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onBack}>Processor listesine dön</button>
        </div>
        <div className="processor-actions">
          {methods.map((item) => (
            <button
              type="button"
              className={item.key === methodKey ? 'primary small' : 'ghost small'}
              key={item.key}
              onClick={() => onSelectOperation(providerKey, item.key)}
            >
              {item.label || item.key}
            </button>
          ))}
        </div>
      </section>

      {isDropInOperation(method) ? (
        <section className="panel wide braintree-dropin-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Drop-in Checkout</p>
              <h3>{method?.label || 'Checkout'}</h3>
            </div>
            <span className="pill">{submitForSettlement ? 'sale' : 'auth'}</span>
          </div>
          <form className="form-grid" onSubmit={submitDropIn}>
            <label>
              <span>Amount</span>
              <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(formatMoneyInput(event.target.value))} />
            </label>
            <label>
              <span>Currency</span>
              <input required value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} />
            </label>
            <div className="braintree-dropin-container full" ref={dropInRef} />
            {error ? <p className="error full">{error}</p> : null}
            <button className="primary full" type="submit" disabled={!ready}>
              {ready ? 'İşlemi Çalıştır' : 'Braintree hazırlanıyor'}
            </button>
          </form>
        </section>
      ) : (
        <ProcessorOperationForm
          open
          providerKey={providerKey}
          methodKey={methodKey}
          catalog={catalog}
          cards={cards}
          onClose={onBack}
          onSubmit={onSubmit}
        />
      )}

      {result ? (
        <ResultCard
          title="Braintree Result"
          status={result.status || result.result?.status}
          message={result.responseMessage || result.result?.responseMessage || result.error}
          items={{
            Provider: result.provider,
            Operation: result.operation,
            Transaction: result.result?.transactionId || result.transactionId,
            Code: result.resultCode || result.result?.resultCode,
          }}
        />
      ) : null}
    </div>
  )
}
