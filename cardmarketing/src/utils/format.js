export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

export function moneyValue(value) {
  return String(value || '').replace(/,/g, '')
}

export function formatMoneyInput(value) {
  const raw = String(value || '').replace(/[^\d.]/g, '')
  if (!raw) return ''
  const [whole, ...rest] = raw.split('.')
  const decimal = rest.join('').slice(0, 2)
  const formattedWhole = whole ? Number(whole).toLocaleString('en-US') : ''
  return rest.length ? `${formattedWhole}.${decimal}` : formattedWhole
}

export function formatCardNumber(value) {
  return digitsOnly(value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim()
}

export function formatCardLabel(card) {
  if (!card) return '-'
  const masked = card.masked_pan || card.maskedPan || (card.first6 && card.last4 ? `${card.first6}******${card.last4}` : card.id)
  return [masked, card.brand, card.exp_month || card.expMonth ? `${card.exp_month || card.expMonth}/${card.exp_year || card.expYear}` : null, card.cardholder_name || card.cardholderName]
    .filter(Boolean)
    .join(' · ')
}

export function statusClass(status) {
  const value = String(status || '').toLowerCase()
  if (['approved', 'verified', 'passed', 'success', 'captured', 'recorded', 'configured', 'healthy'].includes(value)) return 'good'
  if (['declined', 'failed', 'invalid', 'error', 'unhealthy'].includes(value)) return 'bad'
  return 'warn'
}

export function displayStatus(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'tokenized' || value === 'token_ready') return 'TOKENIZED - AUTH YOK'
  if (value === 'declined') return 'DECLINED'
  if (value === 'approved' || value === 'authorized') return 'APPROVED'
  return status || '-'
}

export function operationResponseMessage(result = {}) {
  const status = String(result.status || result.result?.status || '').toLowerCase()
  const provider = result.provider || result.result?.processor || ''
  const message = result.responseMessage || result.result?.responseMessage || result.failureReason || result.error
  const code = result.resultCode || result.result?.resultCode
  if (provider === 'clover' && status === 'declined') {
    return message || 'Clover kartı reddetti. Karttan ödeme alınabilir görünmüyor.'
  }
  if (provider === 'clover' && code === 'CLOVER_ECOMMERCE_UNAUTHORIZED') {
    return message || 'Clover eCommerce token yetkisi geçersiz.'
  }
  if (provider === 'clover' && code === 'CLOVER_CARD_VERIFIED') {
    return message || 'Clover card verification tamamlandı. Charge/preauth oluşturulmadı.'
  }
  if (status === 'approved' || status === 'authorized') {
    return message || 'İşlem onaylandı. Karttan ödeme alınabilir görünüyor.'
  }
  if (status === 'failed') {
    return message || 'İşlem başarısız oldu.'
  }
  return message || ''
}

export function detailValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function pickDetail(details, keys) {
  for (const key of keys) {
    const value = details?.[key]
    if (value !== undefined && value !== null && value !== '' && value !== 'API Only') return value
  }
  return null
}
