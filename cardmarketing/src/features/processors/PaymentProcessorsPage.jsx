import { useEffect, useState } from 'react'
import { api, toQuery } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { formatMoneyInput, moneyValue, operationResponseMessage } from '../../utils/format'
import { normalizeProcessorPayload, normalizeProviderKey } from './actions/processorActions'
import { ProcessorActionModal } from './ProcessorActionModal'
import { ProcessorList } from './ProcessorList'
import { ProcessorLogTable } from './ProcessorLogTable'
import { ProcessorOperationPage } from './ProcessorOperationPage'

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function processorResultItems(result = {}) {
  return {
    Provider: result.provider || result.result?.processor || '-',
    Operation: result.operation || '-',
    Status: result.status || result.result?.status || '-',
    Transaction: result.result?.transactionId || result.result?.chargeId || result.transactionId || result.result?.retref || '-',
    Code: result.resultCode || result.result?.resultCode || '-',
    ProviderStatus: result.result?.providerStatus || result.providerStatus || '-',
    ProviderMessage: result.result?.providerMessage || '-',
  }
}

function amazonCheckoutUrl(result = {}) {
  return result.webCheckoutDetails?.amazonPayRedirectUrl ||
    result.result?.webCheckoutDetails?.amazonPayRedirectUrl ||
    result.providerResponse?.webCheckoutDetails?.amazonPayRedirectUrl ||
    result.result?.providerResponse?.webCheckoutDetails?.amazonPayRedirectUrl ||
    ''
}

function amazonCheckoutSessionId(result = {}) {
  return result.checkoutSessionId ||
    result.result?.checkoutSessionId ||
    result.providerResponse?.checkoutSessionId ||
    result.result?.providerResponse?.checkoutSessionId ||
    ''
}

function amazonChargePermissionId(result = {}) {
  return result.chargePermissionId ||
    result.result?.chargePermissionId ||
    result.providerResponse?.chargePermissionId ||
    result.result?.providerResponse?.chargePermissionId ||
    ''
}

function AmazonPayFlowPanel({ flow, onPatch, onComplete, onCancel }) {
  if (!flow) return null
  const checkoutUrl = flow.checkoutUrl || amazonCheckoutUrl(flow.checkoutResponse)
  const checkoutSessionId = flow.checkoutSessionId || amazonCheckoutSessionId(flow.checkoutResponse)
  const targetLabel = flow.targetMethod?.label || flow.targetMethod?.key || flow.targetMethod?.operation || 'Auth'
  return (
    <section className="panel wide">
      <div className="section-head">
        <div>
          <p className="eyebrow">Amazon Pay Flow</p>
          <h3>{targetLabel} akışı</h3>
        </div>
        <button className="ghost small" type="button" onClick={onCancel}>Flow kapat</button>
      </div>
      <div className="summary full operation-features">
        <div><span>1. Adım</span><strong>Checkout session oluşturuldu</strong></div>
        <div><span>2. Adım</span><strong>Amazon onayı sonrası complete + {targetLabel} çalışacak</strong></div>
      </div>
      {checkoutUrl ? (
        <div className="summary full">
          <div>
            <span>Checkout URL</span>
            <strong>{checkoutUrl}</strong>
          </div>
        </div>
      ) : null}
      <div className="processor-actions">
        {checkoutUrl ? (
          <a className="primary small" href={checkoutUrl} target="_blank" rel="noreferrer">Amazon onayını aç</a>
        ) : null}
      </div>
      <form className="form-grid" onSubmit={(event) => {
        event.preventDefault()
        onComplete()
      }}>
        <label className="full">
          <span>Checkout Session ID</span>
          <input value={checkoutSessionId} onChange={(event) => onPatch({ checkoutSessionId: event.target.value })} />
        </label>
        <label className="full">
          <span>Charge Permission ID</span>
          <input value={flow.chargePermissionId || ''} onChange={(event) => onPatch({ chargePermissionId: event.target.value })} />
        </label>
        <button className="primary full" type="submit">Complete + {targetLabel} çalıştır</button>
      </form>
    </section>
  )
}

export function PaymentProcessorsPage({ cards, catalog, refreshSignal, runAction }) {
  const [filters, setFilters] = useState({ processor: '', attemptType: '', status: '', amountMin: '' })
  const [data, setData] = useState(null)
  const [operation, setOperation] = useState(null)
  const [rowAction, setRowAction] = useState(null)
  const [result, setResult] = useState(null)
  const [amazonFlow, setAmazonFlow] = useState(null)
  const withLoader = runAction || ((task) => task())

  async function load(nextFilters = filters) {
    const query = toQuery({ ...nextFilters, amountMin: moneyValue(nextFilters.amountMin) })
    setData(await api(`/payment-processors/logs${query}`))
  }

  async function applyFilters(nextFilters, loader = { label: 'Processor logları filtreleniyor', variant: 'logs', detail: 'Seçili filtrelerle liste hazırlanıyor' }) {
    setFilters(nextFilters)
    await withLoader(() => load(nextFilters), loader)
  }

  function loaderVariantFor(method = {}) {
    const key = String(method.key || method.operation || '').toLowerCase()
    if (key === 'capture_tip') return 'tip'
    if (key === 'amount_sequence') return 'sequence'
    if (key === 'transaction_detail') return 'transaction'
    if (key.includes('refund')) return 'refund'
    if (key.includes('void')) return 'void'
    if (key.includes('capture')) return 'capture'
    if (key.includes('auth') || key.includes('verification')) return 'auth'
    if (key.includes('sale') || key.includes('token')) return 'sale'
    return 'default'
  }

  function loaderMetaFor(providerKey, method = {}, override = {}) {
    const provider = normalizeProviderKey(providerKey)
    const actionLabel = method.label || method.key || method.operation || 'işlem'
    return {
      variant: override.variant || loaderVariantFor(method),
      label: override.label || `${provider} ${actionLabel} çalışıyor`,
      detail: override.detail || 'Provider isteği gönderiliyor ve loglar yenilenecek',
    }
  }

  useEffect(() => {
    withLoader(() => load(), { label: 'Processor logları yükleniyor', variant: 'logs', detail: 'Log listesi ve filtre değerleri hazırlanıyor' }).catch((error) => setResult({ status: 'failed', responseMessage: error.message }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  function selectOperation(providerKey, methodKey) {
    setOperation({ providerKey, methodKey })
    setAmazonFlow(null)
  }

  async function executeProcessorRequest(provider, method, body) {
    if (provider === 'paypal' && method.operation === 'sandbox_order_auth') {
      return api('/providers/paypal/sandbox/orders/card-authorize', { method: 'POST', body: JSON.stringify(body) })
    }
    if (method.operation === 'amount_sequence') {
      body.amounts = [body.sequenceAmount1 || '1,100.12', body.sequenceAmount2 || '1,100.25']
      delete body.amount
      delete body.sequenceAmount1
      delete body.sequenceAmount2
      return api(`/providers/${provider === 'propelrpay' ? 'propelr' : provider}/amount-sequence`, { method: 'POST', body: JSON.stringify(body) })
    }
    if (method.operation === 'transaction_detail') {
      return api(`/providers/${provider === 'propelrpay' ? 'propelr' : provider}/transactions/${encodeURIComponent(body.transactionId || body.retref || body.authorizationPnref || 'invalid')}`)
    }
    if (provider === 'quiklie' && method.operation === 'verify_otp') {
      return api('/providers/quiklie/otp/verify', { method: 'POST', body: JSON.stringify(body) })
    }
    return api('/provider-operations/cards', { method: 'POST', body: JSON.stringify(body) })
  }

  async function submitAmazonPayApprovalFlow(provider, method, body) {
    const checkoutBody = compactPayload({
      ...body,
      provider,
      operation: 'checkout_session',
      paymentIntent: method.operation === 'sale' || method.operation === 'charge' ? 'AuthorizeWithCapture' : 'Authorize',
    })
    delete checkoutBody.chargePermissionId
    delete checkoutBody.providerPaymentToken
    delete checkoutBody.source
    delete checkoutBody.token

    let checkoutResponse
    try {
      checkoutResponse = await executeProcessorRequest(provider, { key: 'checkout_session', operation: 'checkout_session', label: 'Create Checkout Session' }, checkoutBody)
    } catch (error) {
      checkoutResponse = error.data || {
        status: 'failed',
        provider,
        operation: 'checkout_session',
        responseMessage: error.message,
        providerStatus: error.status,
      }
    }

    const nextFlow = {
      provider,
      targetMethod: method,
      originalBody: body,
      checkoutResponse,
      checkoutSessionId: amazonCheckoutSessionId(checkoutResponse),
      checkoutUrl: amazonCheckoutUrl(checkoutResponse),
      chargePermissionId: amazonChargePermissionId(checkoutResponse),
    }
    setAmazonFlow(nextFlow)
    setResult({
      ...checkoutResponse,
      responseMessage: checkoutResponse.responseMessage || `Amazon Pay checkout session hazır. Onaydan sonra ${method.label || method.operation} çalıştırılacak.`,
    })
  }

  async function submitOperation(providerKey, method, payload, loaderOverride = {}) {
    await withLoader(async () => {
      let body = compactPayload({
        ...payload,
        provider: providerKey,
        operation: method.operation,
      })

      if (body.cardId) {
        const card = cards.find((item) => item.id === body.cardId)
        if (card) {
          body = compactPayload({
            ...body,
            pan: body.pan || card.pan,
            expMonth: body.expMonth || card.exp_month,
            expYear: body.expYear || card.exp_year,
            source: body.source || card.provider_payment_token,
            first6: card.first6,
            last4: card.last4,
          })
        }
      }

      const provider = normalizeProviderKey(providerKey)
      body = compactPayload(normalizeProcessorPayload(provider, body))
      let response
      try {
        const shouldStartAmazonFlow = provider === 'amazonpay' &&
          ['auth', 'authorize', 'sale', 'charge', 'verification', 'verify', 'live'].includes(String(method.operation || '').toLowerCase()) &&
          !body.chargePermissionId &&
          !body.providerPaymentToken &&
          !body.source &&
          !body.token
        if (shouldStartAmazonFlow) {
          await submitAmazonPayApprovalFlow(provider, method, body)
          await load()
          return
        }
        response = await executeProcessorRequest(provider, method, body)
      } catch (error) {
        response = error.data || {
          status: 'failed',
          provider,
          operation: method.operation,
          responseMessage: error.message,
          providerStatus: error.status,
        }
      }
      setResult(response)
      await load()
    }, loaderMetaFor(providerKey, method, loaderOverride))
  }

  async function completeAmazonFlow() {
    if (!amazonFlow) return
    const provider = 'amazonpay'
    const targetMethod = amazonFlow.targetMethod
    await withLoader(async () => {
      let chargePermissionId = amazonFlow.chargePermissionId
      let completeResponse = null
      const checkoutSessionId = amazonFlow.checkoutSessionId || amazonCheckoutSessionId(amazonFlow.checkoutResponse)
      if (!chargePermissionId && checkoutSessionId) {
        const completeBody = compactPayload(normalizeProcessorPayload(provider, {
          ...amazonFlow.originalBody,
          provider,
          operation: 'complete_checkout_session',
          checkoutSessionId,
        }))
        try {
          completeResponse = await executeProcessorRequest(provider, { key: 'complete_checkout_session', operation: 'complete_checkout_session', label: 'Complete Checkout Session' }, completeBody)
          chargePermissionId = amazonChargePermissionId(completeResponse)
        } catch (error) {
          completeResponse = error.data || {
            status: 'failed',
            provider,
            operation: 'complete_checkout_session',
            responseMessage: error.message,
            providerStatus: error.status,
          }
          setResult(completeResponse)
          await load()
          return
        }
      }

      if (!chargePermissionId) {
        setResult({
          status: 'failed',
          provider,
          operation: targetMethod.operation,
          responseMessage: 'Amazon Pay chargePermissionId bulunamadı. Amazon onayı tamamlandıktan sonra Charge Permission ID alanına değeri girip tekrar deneyin.',
        })
        return
      }

      const authBody = compactPayload(normalizeProcessorPayload(provider, {
        ...amazonFlow.originalBody,
        provider,
        operation: targetMethod.operation,
        chargePermissionId,
      }))
      let response
      try {
        response = await executeProcessorRequest(provider, targetMethod, authBody)
      } catch (error) {
        response = error.data || {
          status: 'failed',
          provider,
          operation: targetMethod.operation,
          responseMessage: error.message,
          providerStatus: error.status,
        }
      }
      setAmazonFlow({
        ...amazonFlow,
        chargePermissionId,
        completeResponse,
        finalResponse: response,
      })
      setResult(response)
      await load()
    }, loaderMetaFor(provider, targetMethod, {
      label: `amazonpay ${targetMethod.label || targetMethod.operation} flow çalışıyor`,
      detail: 'Checkout complete ediliyor, chargePermissionId ile hedef işlem gönderiliyor',
    }))
  }

  async function submitRowAction(payload) {
    const provider = normalizeProviderKey(payload.provider)
    const actionKey = rowAction?.action || payload.operation
    await submitOperation(provider, { key: actionKey, operation: payload.operation }, payload, {
      detail: `${payload.transactionId || payload.retref || payload.authorizationPnref || 'Transaction'} üzerinde aksiyon çalışıyor`,
    })
    setRowAction(null)
  }

  async function handleDropInResult(response) {
    setResult(response)
    await withLoader(() => load(), {
      label: 'Unified processor logları yenileniyor',
      variant: 'logs',
      detail: 'Auth + void sonuçları işlem kayıtlarına yansıtılıyor',
    })
  }

  const processors = data?.processors || []
  const visibleProcessors = filters.processor
    ? processors.filter((processor) => processor.key === filters.processor)
    : processors

  if (operation) {
    return (
      <>
        <ProcessorOperationPage
          providerKey={operation.providerKey}
          methodKey={operation.methodKey}
          catalog={catalog}
          cards={cards}
          onBack={() => setOperation(null)}
          onSelectOperation={selectOperation}
          onSubmit={submitOperation}
          onDropInResult={handleDropInResult}
          runAction={withLoader}
        />
        {operation?.providerKey === 'amazonpay' ? (
          <AmazonPayFlowPanel
            flow={amazonFlow}
            onPatch={(patch) => setAmazonFlow((current) => current ? { ...current, ...patch } : current)}
            onComplete={completeAmazonFlow}
            onCancel={() => setAmazonFlow(null)}
          />
        ) : null}
        {result ? <ResultCard title="Processor Result" status={result.status || result.result?.status} message={operationResponseMessage(result)} items={processorResultItems(result)} /> : null}
      </>
    )
  }

  return (
    <div className="page-stack">
      <ProcessorList processors={visibleProcessors} selected={filters.processor} catalog={catalog} onSelectOperation={selectOperation} />
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Payment Processors</p>
            <h3>Filtre</h3>
          </div>
          <button className="ghost small" type="button" onClick={() => withLoader(() => load(), { label: 'Processor logları yenileniyor', variant: 'logs', detail: 'Güncel işlem kayıtları alınıyor' })}>Refresh</button>
        </div>
        <form className="form-grid processor-filter" onSubmit={(event) => { event.preventDefault(); applyFilters(filters) }}>
          <label><span>Processor</span><select value={filters.processor} onChange={(event) => applyFilters({ ...filters, processor: event.target.value })}><option value="">All</option>{processors.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label>
          <label><span>İşlem Tipi</span><select value={filters.attemptType} onChange={(event) => applyFilters({ ...filters, attemptType: event.target.value })}><option value="">All</option>{(data?.facets?.attemptTypes || []).map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label><span>Status</span><select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value })}><option value="">All</option>{(data?.facets?.statuses || []).map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label><span>Min Miktar</span><input value={filters.amountMin} onChange={(event) => setFilters({ ...filters, amountMin: formatMoneyInput(event.target.value) })} /></label>
          <button className="primary" type="submit">Filtrele</button>
        </form>
      </section>

      <ProcessorLogTable logs={data?.logs || []} canViewJson={data?.canViewJsonModels} onAction={(log, action) => setRowAction({ log, action })} />
      {rowAction ? <ProcessorActionModal log={rowAction.log} action={rowAction.action} onClose={() => setRowAction(null)} onSubmit={submitRowAction} /> : null}
      {result ? <ResultCard title="Processor Result" status={result.status || result.result?.status} message={operationResponseMessage(result)} items={processorResultItems(result)} /> : null}
    </div>
  )
}
