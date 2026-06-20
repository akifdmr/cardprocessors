import { ProcessorOperationForm } from './ProcessorOperationForm'
import { UnifiedPaymentsPage } from './UnifiedPaymentsPage'

function methodsFor(catalog, providerKey) {
  return catalog?.[providerKey]?.methods || (providerKey === 'propelrpay' ? catalog?.propelr?.methods : []) || []
}

export function ProcessorOperationPage({ providerKey, methodKey, catalog, cards, onBack, onSelectOperation, onSubmit, onDropInResult, runAction }) {
  const provider = catalog?.[providerKey] || (providerKey === 'propelrpay' ? catalog?.propelr : null)
  const methods = methodsFor(catalog, providerKey)

  if (providerKey === 'unifiedpayments') {
    return (
      <UnifiedPaymentsPage
        cards={cards}
        onBack={onBack}
        onResult={onDropInResult}
        runAction={runAction}
      />
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Processor Action</p>
            <h3>{provider?.label || providerKey}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onBack}>Processor listesine dön</button>
        </div>
        <div className="processor-actions">
          {methods.map((method) => (
            <button
              type="button"
              className={method.key === methodKey ? 'primary small' : 'ghost small'}
              key={method.key}
              onClick={() => onSelectOperation(providerKey, method.key)}
            >
              {method.label || method.key}
            </button>
          ))}
        </div>
      </section>
      <ProcessorOperationForm
        open
        providerKey={providerKey}
        methodKey={methodKey}
        catalog={catalog}
        cards={cards}
        onClose={onBack}
        onSubmit={onSubmit}
      />
    </div>
  )
}
