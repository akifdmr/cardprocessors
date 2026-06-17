import { normalizeProviderKey } from './processorActions'

const supportedRowActionProviders = new Set(['propelrpay', 'fluidpay', 'globalpayments', 'paypal', 'braintree', 'nmi', 'zoho', 'quiklie', 'clover'])

export const processorActionConfigs = {
  void: {
    title: 'İşlemi İptal Et',
    operation: 'void',
    submitLabel: 'İptal Et',
    amount: false,
    tip: false,
  },
  refund: {
    title: 'İade Oluştur',
    operation: 'refund',
    submitLabel: 'İade Et',
    amount: true,
    amountLabel: 'İade Miktarı',
    amountRequired: true,
    tip: false,
  },
  capture: {
    title: 'Provizyonu Capture Et',
    operation: 'capture',
    submitLabel: 'Capture',
    amount: true,
    amountLabel: 'Capture Miktarı',
    amountRequired: false,
    tip: false,
  },
  capture_tip: {
    title: 'Tip ile Capture Et',
    operation: 'capture',
    submitLabel: 'Tip + Capture',
    amount: true,
    amountLabel: 'Capture Miktarı',
    amountRequired: false,
    tip: true,
  },
}

export function processorTransactionId(log) {
  return log.provider_reference_id ||
    log.transactionId ||
    log.responseModel?.transactionId ||
    log.raw_response?.result?.transactionId ||
    log.raw_response?.result?.retref ||
    log.raw_response?.result?.cloverChargeId ||
    log.raw_response?.providerResponse?.transactionId ||
    log.raw_response?.providerResponse?.retref ||
    log.raw_response?.request?.transactionId ||
    log.raw_response?.request?.retref ||
    log.responseModel?.result?.transactionId ||
    log.responseModel?.result?.retref ||
    log.responseModel?.result?.cloverChargeId ||
    log.responseModel?.providerResponse?.transactionId ||
    log.responseModel?.providerResponse?.retref ||
    log.requestModel?.transactionId ||
    log.requestModel?.retref ||
    ''
}

export function processorLogProvider(log) {
  return normalizeProviderKey(log.processor || log.provider)
}

function logOperationText(log = {}) {
  return [
    log.attempt_type,
    log.operation,
    log.requestModel?.operation,
    log.responseModel?.operation,
    log.responseModel?.result?.type,
    log.raw_response?.operation,
    log.raw_response?.result?.type,
  ].filter(Boolean).join(' ').toLowerCase()
}

function logStatusText(log = {}) {
  return String(log.status || log.responseModel?.status || log.responseModel?.result?.status || log.raw_response?.result?.status || '').toLowerCase()
}

export function processorLogSettlementType(log = {}) {
  const text = logOperationText(log)
  const status = logStatusText(log)
  if (text.includes('refund') || text.includes('void')) return 'closed'
  if (text.includes('capture') || text.includes('sale') || text.includes('charge') || status.includes('captured')) return 'charged'
  if (text.includes('auth') || text.includes('authorization') || text.includes('preauth') || status.includes('authorized')) return 'authorized'
  return 'unknown'
}

export function getProcessorRowActions(log) {
  const provider = processorLogProvider(log)
  if (!supportedRowActionProviders.has(provider)) {
    return []
  }
  if (provider === 'paypal') {
    return [
      { key: 'void', label: 'İptal' },
      { key: 'capture', label: 'Capture' },
    ]
  }
  if (provider === 'clover') {
    return [
      { key: 'void', label: 'İptal' },
    ]
  }
  return [
    { key: 'void', label: 'İptal' },
    { key: 'refund', label: 'İade' },
    { key: 'capture', label: 'Capture' },
    { key: 'capture_tip', label: 'Tip + Capture' },
  ]
}

export function getProcessorRowActionState(log) {
  const provider = processorLogProvider(log)
  if (!supportedRowActionProviders.has(provider)) {
    return { runnable: false, reason: 'Destek yok', provider, transactionId: '' }
  }

  const transactionId = processorTransactionId(log)
  if (!transactionId) {
    return { runnable: false, reason: 'Transaction yok', provider, transactionId: '' }
  }

  const actions = getProcessorRowActions(log)
  return {
    runnable: actions.length > 0,
    reason: actions.length ? '' : 'Aksiyon yok',
    provider,
    transactionId,
    actions,
  }
}

export function getProcessorActionConfig(action) {
  return processorActionConfigs[action] || null
}
