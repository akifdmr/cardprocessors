const variantLabels = {
  default: 'İşlem',
  sale: 'Sale',
  auth: 'Auth',
  capture: 'Capture',
  refund: 'İade',
  void: 'İptal',
  tip: 'Tip',
  sequence: 'Sequence',
  transaction: 'Transaction',
  logs: 'Logs',
  cards: 'Cards',
  login: 'Login',
}

function normalizeLoaderState(label, variant, detail) {
  if (typeof label === 'object' && label !== null) {
    return {
      label: label.label || 'İşlem yapılıyor',
      variant: label.variant || variant || 'default',
      detail: label.detail || detail || '',
    }
  }

  return {
    label: label || 'İşlem yapılıyor',
    variant: variant || 'default',
    detail: detail || '',
  }
}

export function ActionLoader({ active, label = 'İşlem yapılıyor', variant = 'default', detail = '' }) {
  const state = normalizeLoaderState(label, variant, detail)
  const normalizedVariant = variantLabels[state.variant] ? state.variant : 'default'

  return (
    <div className={`action-loader ${active ? 'active' : ''}`} aria-live="polite" aria-busy={active}>
      <div className="action-loader-card">
        <span className={`busy-spinner busy-spinner-${normalizedVariant}`} aria-hidden="true" />
        <div className="action-loader-copy">
          <span>{variantLabels[normalizedVariant]}</span>
          <strong>{state.label}</strong>
          {state.detail ? <small>{state.detail}</small> : null}
        </div>
      </div>
    </div>
  )
}
