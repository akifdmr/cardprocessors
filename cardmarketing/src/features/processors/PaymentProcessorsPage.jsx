import { useEffect, useState } from 'react'
import { api, toQuery } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { formatMoneyInput, moneyValue } from '../../utils/format'
import { normalizeProcessorPayload, normalizeProviderKey } from './actions/processorActions'
import { ProcessorActionModal } from './ProcessorActionModal'
import { ProcessorList } from './ProcessorList'
import { ProcessorLogTable } from './ProcessorLogTable'
import { ProcessorOperationPage } from './ProcessorOperationPage'

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

export function PaymentProcessorsPage({ cards, catalog, refreshSignal, runAction }) {
  const [filters, setFilters] = useState({ processor: '', attemptType: '', status: '', amountMin: '' })
  const [data, setData] = useState(null)
  const [operation, setOperation] = useState(null)
  const [rowAction, setRowAction] = useState(null)
  const [result, setResult] = useState(null)
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

  async function executeProcessorRequest(provider, method, body) {
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
    return api('/provider-operations/cards', { method: 'POST', body: JSON.stringify(body) })
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
      const response = await executeProcessorRequest(provider, method, body)
      setResult(response)
      await load()
    }, loaderMetaFor(providerKey, method, loaderOverride))
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
      label: 'Braintree logları yenileniyor',
      variant: 'logs',
      detail: 'Drop-in işlem sonucu işlem kayıtlarına yansıtılıyor',
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
          onSelectOperation={(providerKey, methodKey) => setOperation({ providerKey, methodKey })}
          onSubmit={submitOperation}
          onDropInResult={handleDropInResult}
        />
        {result ? <ResultCard title="Processor Result" status={result.status || result.result?.status} message={result.responseMessage || result.result?.responseMessage || result.error} items={{ Provider: result.provider, Operation: result.operation, Transaction: result.result?.transactionId || result.transactionId || result.result?.retref, Code: result.resultCode || result.result?.resultCode }} /> : null}
      </>
    )
  }

  return (
    <div className="page-stack">
      <ProcessorList processors={visibleProcessors} selected={filters.processor} catalog={catalog} onSelectOperation={(providerKey, methodKey) => setOperation({ providerKey, methodKey })} />
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
      {result ? <ResultCard title="Processor Result" status={result.status || result.result?.status} message={result.responseMessage || result.result?.responseMessage || result.error} items={{ Provider: result.provider, Operation: result.operation, Transaction: result.result?.transactionId || result.transactionId || result.result?.retref, Code: result.resultCode || result.result?.resultCode }} /> : null}
    </div>
  )
}
