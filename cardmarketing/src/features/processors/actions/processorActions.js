import { moneyValue } from '../../../utils/format'

export const processorActionComponents = {
  propelrpay: {
    normalize(payload) {
      const next = { ...payload }
      next.account = next.account || String(next.pan || '').replace(/\D/g, '')
      if (!next.expiry && next.expMonth && next.expYear) {
        next.expiry = `${String(next.expMonth).padStart(2, '0')}${String(next.expYear).slice(-2)}`
      }
      delete next.cvv2
      delete next.expMonth
      delete next.expYear
      delete next.cardholderName
      delete next.billingAddressLine1
      delete next.billingCity
      delete next.billingState
      delete next.billingZip
      delete next.billingCountry
      delete next.currency
      return next
    },
  },
  fluidpay: {
    normalize(payload) {
      return { ...payload, amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount }
    },
  },
  braintree: {
    normalize(payload) {
      return { ...payload, amount: payload.amount ? moneyValue(payload.amount) : payload.amount }
    },
  },
  nmi: {
    normalize(payload) {
      return { ...payload, amount: payload.amount ? moneyValue(payload.amount) : payload.amount }
    },
  },
  zoho: {
    normalize(payload) {
      return { ...payload, amount: payload.amount ? moneyValue(payload.amount) : payload.amount }
    },
  },
  globalpayments: {
    normalize(payload) {
      return { ...payload, amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount }
    },
  },
  paypal: {
    normalize(payload) {
      return { ...payload, amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount }
    },
  },
  clover: {
    normalize(payload) {
      return { ...payload, amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount, currency: payload.currency || 'usd' }
    },
  },
}

export function normalizeProviderKey(provider) {
  const key = String(provider || '').toLowerCase()
  if (key === 'propelr' || key === 'propelrpay') return 'propelrpay'
  if (key === 'globalpayments' || key === 'global-payments' || key === 'portico') return 'globalpayments'
  if (key === 'networkmerchants' || key === 'network-merchants') return 'nmi'
  if (key === 'zohopayments' || key === 'zoho-payments' || key === 'zoho_payment') return 'zoho'
  return key
}

export function normalizeProcessorPayload(provider, payload) {
  const key = normalizeProviderKey(provider)
  return processorActionComponents[key]?.normalize(payload) || payload
}
