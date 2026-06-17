import { moneyValue } from '../../../utils/format'

function withDefaultZip(payload) {
  const billingZip = payload.billingZip || payload.zip || payload.postalCode || '00000'
  return { ...payload, billingZip, zip: payload.zip || billingZip, postalCode: payload.postalCode || billingZip }
}

export const processorActionComponents = {
  propelrpay: {
    normalize(payload) {
      const next = withDefaultZip(payload)
      next.account = next.account || String(next.pan || '').replace(/\D/g, '')
      if (!next.expiry && next.expMonth && next.expYear) {
        next.expiry = `${String(next.expMonth).padStart(2, '0')}${String(next.expYear).slice(-2)}`
      }
      delete next.expMonth
      delete next.expYear
      delete next.cardholderName
      delete next.billingAddressLine1
      delete next.billingCity
      delete next.billingState
      delete next.billingCountry
      delete next.currency
      return next
    },
  },
  fluidpay: {
    normalize(payload) {
      return { ...withDefaultZip(payload), amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount }
    },
  },
  braintree: {
    normalize(payload) {
      return { ...withDefaultZip(payload), amount: payload.amount ? moneyValue(payload.amount) : payload.amount }
    },
  },
  nmi: {
    normalize(payload) {
      return { ...withDefaultZip(payload), amount: payload.amount ? moneyValue(payload.amount) : payload.amount }
    },
  },
  zoho: {
    normalize(payload) {
      return { ...withDefaultZip(payload), amount: payload.amount ? moneyValue(payload.amount) : payload.amount }
    },
  },
  quiklie: {
    normalize(payload) {
      const next = withDefaultZip(payload)
      return {
        ...next,
        amount: next.amount ? moneyValue(next.amount) : next.amount,
        midType: 'TWO_D',
        email: next.email || 'customer@example.com',
        phone: next.phone || '0000000000',
      }
    },
  },
  globalpayments: {
    normalize(payload) {
      return { ...withDefaultZip(payload), amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount }
    },
  },
  paypal: {
    normalize(payload) {
      return { ...withDefaultZip(payload), amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount }
    },
  },
  clover: {
    normalize(payload) {
      return { ...withDefaultZip(payload), amount: payload.amount ? Number(moneyValue(payload.amount)) : payload.amount, currency: payload.currency || 'usd' }
    },
  },
}

export function normalizeProviderKey(provider) {
  const key = String(provider || '').toLowerCase()
  if (key === 'propelr' || key === 'propelrpay') return 'propelrpay'
  if (key === 'globalpayments' || key === 'global-payments' || key === 'portico') return 'globalpayments'
  if (key === 'networkmerchants' || key === 'network-merchants') return 'nmi'
  if (key === 'zohopayments' || key === 'zoho-payments' || key === 'zoho_payment') return 'zoho'
  if (key === 'quikliepay' || key === 'quiklie-payment' || key === 'quicklie' || key === 'quickliepay' || key === 'quicklie-payment') return 'quiklie'
  return key
}

export function normalizeProcessorPayload(provider, payload) {
  const key = normalizeProviderKey(provider)
  return processorActionComponents[key]?.normalize(payload) || payload
}
