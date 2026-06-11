import { useState } from 'react'
import { formatMoneyInput, moneyValue } from '../../utils/format'
import { getProcessorActionConfig, processorLogProvider, processorTransactionId } from './actions/logActions'

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

export function ProcessorActionModal({ action, log, onClose, onSubmit }) {
  const config = getProcessorActionConfig(action)
  const [form, setForm] = useState({ amount: '', gratuityAmount: '' })
  const transactionId = processorTransactionId(log || {})
  if (!config || !log || !transactionId) return null

  const provider = processorLogProvider(log)

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label={config.title} onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Processor Action</p>
            <h3>{config.title}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <div className="summary full">
          <div><span>Provider</span><strong>{provider}</strong></div>
          <div><span>İşlem</span><strong>{log.attempt_type || '-'}</strong></div>
          <div><span>Transaction</span><strong>{transactionId}</strong></div>
          <div><span>Mevcut Miktar</span><strong>{log.amount ?? '-'}</strong></div>
        </div>
        <form className="form-grid processor-action-form" onSubmit={(event) => {
          event.preventDefault()
          onSubmit(compactPayload({
            provider,
            operation: config.operation,
            transactionId,
            retref: transactionId,
            authorizationPnref: transactionId,
            currency: log.currency || 'USD',
            cardId: log.card_id || log.cardId,
            amount: config.amount ? moneyValue(form.amount) : undefined,
            gratuityAmount: config.tip ? moneyValue(form.gratuityAmount) : undefined,
          }))
        }}>
          {config.amount ? (
            <label>
              <span>{config.amountLabel || 'Miktar'}</span>
              <input required={Boolean(config.amountRequired)} value={form.amount} inputMode="decimal" onChange={(event) => setForm({ ...form, amount: formatMoneyInput(event.target.value) })} />
            </label>
          ) : null}
          {config.tip ? (
            <label>
              <span>Tip Miktarı</span>
              <input value={form.gratuityAmount} inputMode="decimal" onChange={(event) => setForm({ ...form, gratuityAmount: formatMoneyInput(event.target.value) })} />
            </label>
          ) : null}
          <div className="form-actions full">
            <button className="ghost" type="button" onClick={onClose}>Vazgeç</button>
            <button className="primary" type="submit">{config.submitLabel}</button>
          </div>
        </form>
      </article>
    </div>
  )
}
