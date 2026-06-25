import { useEffect, useMemo, useState } from 'react'
import { CardInput } from '../../components/forms/CardInput'
import { formatMoneyInput } from '../../utils/format'

const cardFields = new Set(['pan', 'expMonth', 'expYear', 'expiry', 'cvv2', 'cvv', 'bin', 'billingZip'])
const moneyFields = new Set(['amount', 'sequenceAmount1', 'sequenceAmount2', 'balanceAmount', 'gratuityAmount'])

const fieldLabels = {
  merchid: 'Merchant ID',
  retref: 'Retref',
  transactionId: 'Transaction Id',
  authorizationPnref: 'Authorization PNREF',
  routingNumber: 'Routing Number',
  accountNumber: 'Account Number',
  accountHolderName: 'Account Holder',
  achEntryCode: 'ACH Entry Code',
  sequenceAmount1: 'Request 1 Amount',
  sequenceAmount2: 'Request 2 Amount',
  captureComplete: 'Complete Capture',
  note: 'Note',
  reference: 'Reference / Order',
  description: 'Description',
  token: 'Token',
  source: 'Source Token',
  ip: 'Customer IP',
  currency: 'Currency',
  customerVaultId: 'Customer Vault ID',
  providerPaymentToken: 'Provider Token',
  chargePermissionId: 'Charge Permission ID',
  checkoutReviewReturnUrl: 'Review Return URL',
  checkoutResultReturnUrl: 'Result Return URL',
  checkoutSessionId: 'Checkout Session ID',
  scopes: 'Scopes',
  deliverySpecifications: 'Delivery Specifications JSON',
  storeName: 'Store Name',
  noteToBuyer: 'Note To Buyer',
  customInformation: 'Custom Information',
  softDescriptor: 'Soft Descriptor',
  reason: 'Reason',
  closureReason: 'Closure Reason',
  cancelPendingCharges: 'Cancel Pending Charges',
  email: 'Email',
  phone: 'Phone',
  transactionReferenceId: 'Transaction Reference',
  customerReferenceId: 'Customer Reference',
  last4: 'Card Last 4',
  otp: 'OTP',
}

function defaultPayloadFor(fields) {
  const payload = { currency: 'USD' }
  if (fields.includes('sequenceAmount1')) payload.sequenceAmount1 = '1,100.12'
  if (fields.includes('sequenceAmount2')) payload.sequenceAmount2 = '1,100.25'
  if (fields.includes('captureComplete')) payload.captureComplete = 'true'
  if (fields.includes('achEntryCode')) payload.achEntryCode = 'WEB'
  if (fields.includes('billingZip')) payload.billingZip = '00000'
  return payload
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
}

function yearOptions() {
  const year = new Date().getFullYear()
  return Array.from({ length: 16 }, (_, index) => String(year + index))
}

function labelFor(field) {
  return fieldLabels[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

function normalizedProvider(providerKey) {
  const key = String(providerKey || '').toLowerCase()
  if (key === 'propelr') return 'propelrpay'
  if (key === 'global-payments' || key === 'portico') return 'globalpayments'
  if (key === 'networkmerchants' || key === 'network-merchants') return 'nmi'
  if (key === 'authorize.net' || key === 'authorize-net' || key === 'authorize_net' || key === 'authnet' || key === 'anet') return 'authorizenet'
  if (key === 'zohopayments' || key === 'zoho-payments' || key === 'zoho_payment') return 'zoho'
  if (key === 'amazon' || key === 'amazon-pay' || key === 'amazon_pay' || key === 'amazonpayments') return 'amazonpay'
  if (key === 'quikliepay' || key === 'quiklie-payment' || key === 'quicklie' || key === 'quickliepay' || key === 'quicklie-payment') return 'quiklie'
  return key
}

function cardsForProvider(cards, providerKey) {
  const provider = normalizedProvider(providerKey)
  return cards.filter((card) => normalizedProvider(card.provider) === provider)
}

function formProfileFor(providerKey, method = {}, fields = []) {
  const provider = normalizedProvider(providerKey)
  const operation = String(method.operation || method.key || '').toLowerCase()
  const fieldSet = new Set(fields)
  const isTransactionOnly = ['capture', 'refund', 'void', 'reversal', 'transaction_detail', 'verify_otp'].includes(operation)
  const isLiveCheck = ['verification', 'verify', 'live'].includes(operation)
  const hasCardNumber = fieldSet.has('pan') || fieldSet.has('expiry')

  return {
    savedCard: hasCardNumber && !isLiveCheck && !['propelrpay'].includes(provider),
    bin: fieldSet.has('bin'),
    cvv: fieldSet.has('cvv2') || fieldSet.has('cvv'),
    zip: fieldSet.has('billingZip'),
    holder: fieldSet.has('cardholderName'),
    address: fieldSet.has('addressFields') || fieldSet.has('billingAddressLine1'),
    source: fieldSet.has('source'),
    amount: fieldSet.has('amount') && !isTransactionOnly,
    currency: fieldSet.has('currency') && !isTransactionOnly,
    transactionOnly: isTransactionOnly,
  }
}

function GenericField({ field, value, required, onChange }) {
  if (field === 'captureComplete') {
    return (
      <label>
        <span>{labelFor(field)}</span>
        <select value={value.captureComplete || 'true'} onChange={(event) => onChange({ captureComplete: event.target.value })}>
          <option value="true">yes</option>
          <option value="false">no</option>
        </select>
      </label>
    )
  }

  if (field === 'cancelPendingCharges') {
    return (
      <label>
        <span>{labelFor(field)}</span>
        <select value={value.cancelPendingCharges || 'false'} onChange={(event) => onChange({ cancelPendingCharges: event.target.value })}>
          <option value="false">no</option>
          <option value="true">yes</option>
        </select>
      </label>
    )
  }

  if (field === 'achEntryCode') {
    return (
      <label>
        <span>{labelFor(field)}</span>
        <select value={value.achEntryCode || 'WEB'} onChange={(event) => onChange({ achEntryCode: event.target.value })}>
          <option value="WEB">WEB</option>
          <option value="PPD">PPD</option>
          <option value="CCD">CCD</option>
        </select>
      </label>
    )
  }

  return (
    <label className={['retref', 'transactionId', 'authorizationPnref', 'accountNumber', 'note', 'description', 'token', 'source', 'transactionReferenceId', 'customerReferenceId', 'chargePermissionId', 'checkoutReviewReturnUrl', 'checkoutResultReturnUrl', 'checkoutSessionId', 'deliverySpecifications', 'customInformation'].includes(field) ? 'full' : ''}>
      <span>{labelFor(field)}</span>
      <input
        required={required}
        inputMode={moneyFields.has(field) ? 'decimal' : undefined}
        value={value[field] || ''}
        onChange={(event) => onChange({ [field]: moneyFields.has(field) ? formatMoneyInput(event.target.value) : event.target.value })}
      />
    </label>
  )
}

function ExpiryBridge({ value, onChange }) {
  return (
    <>
      <label>
        <span>Exp Month</span>
        <select value={value.expMonth || ''} onChange={(event) => {
          const expMonth = event.target.value
          onChange({ expMonth, expiry: expMonth && value.expYear ? `${expMonth}${String(value.expYear).slice(-2)}` : value.expiry })
        }}>
          <option value="">Month</option>
          {monthOptions().map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        <span>Exp Year</span>
        <select value={value.expYear || ''} onChange={(event) => {
          const expYear = event.target.value
          onChange({ expYear, expiry: value.expMonth && expYear ? `${value.expMonth}${String(expYear).slice(-2)}` : value.expiry })
        }}>
          <option value="">Year</option>
          {yearOptions().map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </label>
    </>
  )
}

export function ProcessorOperationForm({ open, providerKey, methodKey, catalog, cards, onClose, onSubmit }) {
  const provider = catalog?.[providerKey] || (providerKey === 'propelrpay' ? catalog?.propelr : null)
  const method = useMemo(() => provider?.methods?.find((item) => item.key === methodKey) || provider?.methods?.[0], [provider, methodKey])
  const fields = method?.fields || []
  const required = new Set(method?.required || [])
  const [payload, setPayload] = useState(defaultPayloadFor(fields))

  useEffect(() => {
    setPayload(defaultPayloadFor(fields))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerKey, methodKey])

  if (!open || !provider || !method) return null

  function patch(next) {
    setPayload((current) => ({ ...current, ...next }))
  }

  const compatibleCards = cardsForProvider(cards, provider.key)
  const profile = formProfileFor(provider.key, method, fields)
  const normalizedProviderKey = normalizedProvider(provider.key)
  const normalizedOperation = String(method.operation || method.key || '').toLowerCase()
  if (normalizedProviderKey === 'amazonpay' && ['auth', 'authorize', 'sale', 'charge', 'verification', 'verify', 'live'].includes(normalizedOperation)) {
    required.delete('chargePermissionId')
  }
  const hasCard = fields.some((item) => cardFields.has(item))
  const genericFields = fields.filter((field) => {
    if (cardFields.has(field)) return false
    if (field === 'currency' && !profile.transactionOnly) return false
    if (hasCard && field === 'amount') return false
    if (['cardholderName', 'addressFields', 'billingZip', 'billingAddressLine1'].includes(field)) return false
    return true
  })

  return (
    <section className="panel wide">
      <div className="section-head">
        <div>
          <p className="eyebrow">New Operation</p>
          <h3>{provider.label} / {method.label}</h3>
        </div>
        <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
      </div>
      {method.features?.length ? (
        <div className="summary full operation-features">
          {method.features.map((feature) => <div key={feature}><span>Feature</span><strong>{feature}</strong></div>)}
        </div>
      ) : null}
      <form className="form-grid" onSubmit={(event) => {
        event.preventDefault()
        onSubmit(provider.key, method, payload)
      }}>
        {hasCard ? (
          <CardInput
            value={payload}
            onChange={patch}
            cards={compatibleCards}
            savedCard={profile.savedCard && compatibleCards.length > 0}
            source={fields.includes('source')}
            bin={profile.bin}
            cvv={profile.cvv}
            zip={profile.zip}
            holder={profile.holder}
            address={profile.address}
            amount={profile.amount}
            currency={profile.currency}
          />
        ) : null}
        {fields.includes('expiry') && !hasCard ? <ExpiryBridge value={payload} onChange={patch} /> : null}
        {genericFields.map((field) => (
          <GenericField key={field} field={field} value={payload} required={required.has(field)} onChange={patch} />
        ))}
        <button className="primary full" type="submit">İşlemi Çalıştır</button>
      </form>
    </section>
  )
}
