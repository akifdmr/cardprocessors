import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { RequestLogPanel } from '../../components/common/RequestLogPanel'
import { CardInput } from '../../components/forms/CardInput'
import { formatMoneyInput, moneyValue, operationResponseMessage } from '../../utils/format'
import { CardIntelligence } from './CardIntelligence'
import { PerfectGeneratorPanel } from './PerfectGeneratorPage'

const tabs = [
  ['ip', 'IP Lookup'],
  ['bin', 'Card BIN Check'],
  ['live', 'Card Live Check'],
  ['balance', 'Balance Check'],
  ['learning', 'Machine Learning / Card Üretim'],
]

const liveProviders = [
  { value: 'clover', label: 'Clover' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'amazonpay', label: 'Amazon Pay' },
]

function firstSixFromCard(card = {}) {
  return String(card.first6 || card.bin || card.masked_pan || card.maskedPan || card.pan || '')
    .replace(/\D/g, '')
    .slice(0, 6)
}

function normalizeBin(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''))
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

function numericDelay(value) {
  const delay = Number(String(value || '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(delay) || delay < 0) return 0
  return Math.min(Math.round(delay), 60000)
}

function numericConcurrency(value) {
  const concurrency = Number(String(value || '').replace(/\D/g, ''))
  if (!Number.isFinite(concurrency) || concurrency < 1) return 3
  return Math.min(concurrency, 10)
}

function offlineBinNetwork(bin) {
  const value = String(bin || '')
  const firstTwo = Number(value.slice(0, 2))
  const firstFour = Number(value.slice(0, 4))
  const firstSix = Number(value.slice(0, 6))
  if (value.startsWith('4')) return 'VISA'
  if ((firstTwo >= 51 && firstTwo <= 55) || (firstFour >= 2221 && firstFour <= 2720)) return 'MASTERCARD'
  if (value.startsWith('34') || value.startsWith('37')) return 'AMERICAN EXPRESS'
  if (value.startsWith('6011') || value.startsWith('65') || (firstSix >= 622126 && firstSix <= 622925)) return 'DISCOVER'
  if (value.startsWith('35')) return 'JCB'
  if (value.startsWith('36') || value.startsWith('38') || value.startsWith('39')) return 'DINERS CLUB'
  return 'UNKNOWN'
}

function isRapidApiQuotaResult(resultOrError) {
  const text = [
    resultOrError?.responseMessage,
    resultOrError?.failureReason,
    resultOrError?.message,
    resultOrError?.resultCode,
  ].filter(Boolean).join(' ').toLowerCase()
  return text.includes('monthly quota') || text.includes('rapidapi_quota') || text.includes('quota exceeded')
}

function offlineBinResult(bin, warning) {
  const normalizedBin = String(bin || '').replace(/\D/g, '').slice(0, 6)
  const network = offlineBinNetwork(normalizedBin)
  return {
    status: 'passed',
    bin: normalizedBin || null,
    resultCode: 'CLIENT_OFFLINE_BIN_PREFIX_FALLBACK',
    source: 'client_offline_bin_prefix_fallback',
    providerWarning: warning || null,
    summary: {
      bin: normalizedBin || null,
      scheme: network,
      brand: network,
      usefulLabel: network,
    },
    details: {
      'BIN/IIN': normalizedBin || '-',
      'Card Scheme': network,
      'Card Brand': network,
    },
  }
}

function parseBulkLiveLine(line, index, defaultZip = '00000') {
  const raw = String(line || '').trim()
  if (!raw) return null

  const parts = raw.split('|').map((part) => part.trim())
  let [pan, expMonth, expYear, cvv, billingZip] = parts

  if (parts.length >= 3 && /[/-]/.test(parts[1])) {
    const expiryParts = parts[1].split(/[/-]/).map((part) => part.trim())
    pan = parts[0]
    expMonth = expiryParts[0]
    expYear = expiryParts[1]
    cvv = parts[2]
    billingZip = parts[3]
  }

  const normalizedPan = String(pan || '').replace(/\D/g, '')
  const normalizedMonth = String(expMonth || '').replace(/\D/g, '').padStart(2, '0')
  const normalizedYear = String(expYear || '').replace(/\D/g, '')
  const normalizedCvv = String(cvv || '').replace(/\D/g, '')
  const normalizedZip = String(billingZip || '').replace(/\D/g, '') || String(defaultZip || '00000').replace(/\D/g, '') || '00000'

  if (!normalizedPan || !normalizedMonth || !normalizedYear || !normalizedCvv) {
    return {
      index,
      raw,
      error: 'Format: pan|month|year|cvv|zip, pan|month|year|cvv, pan|month/year|cvv|zip veya pan|month/year|cvv',
    }
  }

  return {
    index,
    raw,
    pan: normalizedPan,
    expMonth: normalizedMonth,
    expYear: normalizedYear.length === 2 ? `20${normalizedYear}` : normalizedYear,
    cvv2: normalizedCvv,
    billingZip: normalizedZip,
    zip: normalizedZip,
    bin: normalizedPan.slice(0, 6),
  }
}

function bulkBrandFrom(bin) {
  return bin?.summary?.brand ||
    bin?.summary?.scheme ||
    bin?.details?.['Card Brand'] ||
    bin?.details?.['Card Scheme'] ||
    offlineBinNetwork(bin?.bin || '')
}

function liveStatusLabel(live) {
  const status = String(live?.status || live?.result?.status || '').toLowerCase()
  if (['tokenized', 'token_ready'].includes(status)) return 'TOKENIZED'
  if (['approved', 'verified', 'passed', 'success', 'authorized'].includes(status)) return 'ACTIVE'
  if (['declined', 'failed', 'invalid', 'error'].includes(status)) return 'DECLINED'
  return status ? status.toUpperCase() : 'UNKNOWN'
}

function liveOutputStatus(live) {
  const status = liveStatusLabel(live)
  if (status === 'ACTIVE') return 'APPROVED'
  return status
}

function liveResultCode(live) {
  return live?.resultCode ||
    live?.result?.resultCode ||
    live?.authCode ||
    live?.result?.authCode ||
    live?.result?.status ||
    live?.status ||
    '-'
}

function liveResultReason(live) {
  return live?.responseMessage ||
    live?.failureReason ||
    live?.result?.responseMessage ||
    live?.result?.failureReason ||
    live?.error ||
    ''
}

function compactToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
}

function pickBinValue(bin, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => acc?.[part], bin)
    if (value != null && value !== '' && value !== 'API Only') return value
  }
  return ''
}

function readableBinValue(value) {
  if (value == null || value === '' || value === 'API Only') return ''
  if (typeof value === 'object') return value.name || value.label || value.value || ''
  return String(value).trim()
}

function readableCountry(value) {
  const country = readableBinValue(value)
  if (/^(tr|turkey|turkiye|türkiye)$/i.test(country)) return 'Türkiye'
  return country
}

function binReadableLine(bin) {
  const country = readableCountry(pickBinValue(bin, ['summary.country', 'details.ISO Country Name', 'details.ISO Country Code A2']))
  const issuer = readableBinValue(pickBinValue(bin, ['summary.issuer', 'details.Issuer Name / Bank', 'details.Issuer']))
  const type = readableBinValue(pickBinValue(bin, ['summary.type', 'details.Card Type'])).toUpperCase()
  const brand = readableBinValue(pickBinValue(bin, ['summary.brand', 'summary.scheme', 'details.Card Brand', 'details.Card Scheme'])).toUpperCase()
  const pieces = [country, issuer, type, brand].filter(Boolean)
  return pieces.length ? pieces.join(' / ') : ''
}

function binIssuerLine(bin) {
  const issuer = pickBinValue(bin, ['summary.issuer', 'details.Issuer Name / Bank', 'details.Issuer'])
  const type = pickBinValue(bin, ['summary.type', 'details.Card Type'])
  const level = pickBinValue(bin, ['summary.level', 'details.Card Level'])
  const brand = pickBinValue(bin, ['summary.brand', 'summary.scheme', 'details.Card Brand', 'details.Card Scheme'])
  const pieces = [issuer || brand, type, level].map(compactToken).filter(Boolean)
  return pieces.length ? pieces.join('/') : compactToken(bulkBrandFrom(bin)) || 'bin'
}

function formatCardForOutput(row) {
  return `${row.pan}|${row.expMonth}|${row.expYear}|${row.cvv2}`
}

function formatBulkLiveLines(row, live, bin, error) {
  const index = String(row.index).padStart(3, '0')
  if (error) {
    return [`${index}. ${row.raw || row.pan || '-'} - ❌ ERROR - ${error}`]
  }
  const status = liveOutputStatus(live)
  const active = status === 'APPROVED'
  const brand = bulkBrandFrom(bin) || 'CARD'
  const message = status === 'TOKENIZED' ? 'tokenize edildi, auth yapılmadı' : active ? 'onaylandı' : 'onaylanmadı'
  const code = liveResultCode(live)
  const reason = liveResultReason(live)
  const reasonText = reason ? ` - Mesaj: ${reason}` : ''
  const card = formatCardForOutput(row)
  const binText = binReadableLine(bin)
  const cardWithBin = binText ? `${card} - ${binText}` : card
  return [
    `${index}. ${cardWithBin} - ${active ? '✅' : '❌'} ${status} - ${brand} ${message} - Kod: ${code}${reasonText}`,
    `${index}. ${cardWithBin} - ${active ? '✅' : '❌'} ${status} - ${binIssuerLine(bin)} - ${message} - Kod: ${code}${reasonText}`,
  ]
}

function liveOperationsFor(provider) {
  if (provider === 'clover') {
    return [
      { value: 'verification', label: 'Clover Verify', amount: false },
      { value: 'live', label: 'Clover Live / Preauth', amount: true },
      { value: 'auth', label: 'Clover Auth / Preauth', amount: true },
    ]
  }
  if (provider === 'amazonpay') {
    return [
      { value: 'verification', label: 'Charge Permission Status', amount: false },
      { value: 'auth', label: 'Authorize $0.20', amount: true },
      { value: 'sale', label: 'Sale / Capture Now', amount: true },
    ]
  }
  if (provider === 'paypal') {
    return [
      { value: 'live', label: 'PayPal Live Check', amount: true },
      { value: 'auth', label: 'PayPal Auth', amount: true },
      { value: 'sale', label: 'PayPal Sale', amount: true },
    ]
  }
  return [
    { value: 'verification', label: 'Verify', amount: false },
    { value: 'live', label: 'Live / Auth', amount: true },
  ]
}

function selectedLiveOperation(provider, current) {
  const operations = liveOperationsFor(provider)
  return operations.find((item) => item.value === current) || operations[0]
}

function AmazonPayCheckerFlow({ flow, onPatch, onComplete, onCancel, submitting }) {
  if (!flow) return null
  const checkoutUrl = flow.checkoutUrl || amazonCheckoutUrl(flow.checkoutResponse)
  const checkoutSessionId = flow.checkoutSessionId || amazonCheckoutSessionId(flow.checkoutResponse)
  const targetLabel = flow.targetOperationLabel || flow.targetOperation || 'Amazon Pay'

  return (
    <article className="card result">
      <div className="result-head">
        <strong>Amazon Pay Approval</strong>
        <span className="pill warn">pending</span>
      </div>
      <div className="summary">
        <div><span>Step 1</span><strong>Checkout session created</strong></div>
        <div><span>Step 2</span><strong>After Amazon approval, run {targetLabel}</strong></div>
        <div><span>Checkout Session</span><strong>{checkoutSessionId || '-'}</strong></div>
      </div>
      {checkoutUrl ? (
        <div className="processor-actions">
          <a className="primary small" href={checkoutUrl} target="_blank" rel="noreferrer">Amazon onayını aç</a>
          <button className="ghost small" type="button" onClick={onCancel}>Kapat</button>
        </div>
      ) : null}
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
        <button className="primary full" type="submit" disabled={submitting}>Complete + {targetLabel} çalıştır</button>
      </form>
    </article>
  )
}

export function CheckersPage({ cards, onRefreshCards, runAction }) {
  const [tab, setTab] = useState('ip')
  const [form, setForm] = useState({ provider: 'clover', amount: '0.20', currency: 'USD', quantity: '10', maxAttempts: '30', billingZip: '00000', liveMode: 'single', bulkDelayMs: '0', bulkConcurrency: '3', liveOperation: 'verification' })
  const [result, setResult] = useState(null)
  const [amazonFlow, setAmazonFlow] = useState(null)
  const [requestLogs, setRequestLogs] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  function pushRequestLog({ action, request, response, ok = true, status = 'ok' }) {
    setRequestLogs((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date().toLocaleTimeString(),
        action,
        request,
        response,
        ok,
        status,
      },
      ...current,
    ].slice(0, 50))
  }

  async function loggedApi(endpoint, body, action) {
    const request = { endpoint: `/api${endpoint}`, body }
    try {
      const response = await api(endpoint, { method: 'POST', body: JSON.stringify(body) })
      pushRequestLog({
        action,
        request,
        response,
        ok: response?.status !== 'failed',
        status: response?.status || response?.resultCode || 'ok',
      })
      return response
    } catch (error) {
      const response = error.data || { status: 'failed', responseMessage: error.message, statusCode: error.status }
      pushRequestLog({
        action,
        request,
        response,
        ok: false,
        status: response.status || error.status || 'failed',
      })
      throw error
    }
  }

  function withSavedCard(payload) {
    const card = cards.find((item) => item.id === payload.cardId)
    if (!card) return payload
    const first6 = firstSixFromCard(card)
    return {
      ...payload,
      pan: card.pan || payload.pan,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      first6,
      bin: payload.bin || first6,
      provider: card.provider || payload.provider,
    }
  }

  async function runBin(extra = {}) {
    const payload = withSavedCard({ ...form, ...extra })
    const normalizedBin = normalizeBin(payload.bin || payload.first6 || payload.pan)
    if (normalizedBin.length !== 6) {
      throw new Error('BIN/IIN için 6 rakam gerekli. Kayıtlı kartta ilk 6 yoksa Manual Card seçip BIN gir.')
    }
    try {
      const response = await loggedApi('/checkers/bincheck', { ...payload, bin: normalizedBin }, 'BIN Check')
      if (isRapidApiQuotaResult(response)) {
        return offlineBinResult(normalizedBin, response.responseMessage || response.failureReason)
      }
      return response
    } catch (error) {
      if (isRapidApiQuotaResult(error)) {
        return offlineBinResult(normalizedBin, error.message)
      }
      throw error
    }
  }

  async function runLiveWithBin(payload, provider, operation = 'live') {
    const liveResp = await loggedApi('/checkers/livecheck', { ...payload, provider, operation, runBinCheck: true }, 'Live Check')

    let bin = liveResp.binCheck || null
    if (!bin) {
      const normalizedBin = normalizeBin(payload.bin || payload.first6 || payload.pan)
      bin = {
        status: 'skipped',
        bin: normalizedBin || null,
        summary: normalizedBin ? { bin: normalizedBin, brand: offlineBinNetwork(normalizedBin) } : {},
        details: normalizedBin ? { 'BIN/IIN': normalizedBin, 'Card Brand': offlineBinNetwork(normalizedBin) } : {},
        source: 'live_checker_without_bin',
      }
    }

    if (!bin || bin.status === 'failed') {
      const normalizedBin = normalizeBin(payload.bin || payload.first6 || payload.pan)
      bin = {
        ...(bin || {}),
        status: bin?.status || 'skipped',
        bin: normalizedBin || null,
        summary: bin?.summary || (normalizedBin ? { bin: normalizedBin, brand: offlineBinNetwork(normalizedBin) } : {}),
        details: bin?.details || (normalizedBin ? { 'BIN/IIN': normalizedBin, 'Card Brand': offlineBinNetwork(normalizedBin) } : {}),
        source: bin?.source || 'live_check_without_bin',
      }
    }

    return { live: liveResp, bin }
  }

  async function startAmazonPayFlow(payload, operation) {
    const checkoutPayload = compactPayload({
      ...payload,
      operation: 'checkout_session',
      paymentIntent: operation === 'sale' || operation === 'charge' ? 'AuthorizeWithCapture' : 'Authorize',
    })
    delete checkoutPayload.chargePermissionId
    delete checkoutPayload.providerPaymentToken
    delete checkoutPayload.source
    delete checkoutPayload.token

    const checkoutResponse = await loggedApi('/checkers/livecheck', { ...checkoutPayload, provider: 'amazonpay', operation: 'checkout_session' }, 'Amazon Pay Checkout')
    const operationMeta = selectedLiveOperation('amazonpay', operation)
    setAmazonFlow({
      targetOperation: operation,
      targetOperationLabel: operationMeta.label,
      originalPayload: payload,
      checkoutResponse,
      checkoutSessionId: amazonCheckoutSessionId(checkoutResponse),
      checkoutUrl: amazonCheckoutUrl(checkoutResponse),
      chargePermissionId: amazonChargePermissionId(checkoutResponse),
    })
    setResult({
      type: 'simple',
      title: 'Amazon Pay Checkout Session',
      data: checkoutResponse,
    })
  }

  async function completeAmazonPayFlow() {
    if (!amazonFlow || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const withLoader = runAction || ((task) => task())
    try {
      await withLoader(async () => {
        let chargePermissionId = amazonFlow.chargePermissionId
        let completeResponse = null
        const checkoutSessionId = amazonFlow.checkoutSessionId || amazonCheckoutSessionId(amazonFlow.checkoutResponse)
        if (!chargePermissionId && checkoutSessionId) {
          completeResponse = await loggedApi('/checkers/livecheck', compactPayload({
              ...amazonFlow.originalPayload,
              provider: 'amazonpay',
              operation: 'complete_checkout_session',
              checkoutSessionId,
            }), 'Amazon Pay Complete')
          chargePermissionId = amazonChargePermissionId(completeResponse)
        }

        if (!chargePermissionId) {
          setResult({
            type: 'simple',
            title: 'Amazon Pay Flow Error',
            data: {
              status: 'failed',
              provider: 'amazonpay',
              operation: amazonFlow.targetOperation,
              responseMessage: 'Amazon Pay chargePermissionId bulunamadı. Amazon onayı tamamlandıktan sonra Charge Permission ID alanına değeri girip tekrar deneyin.',
            },
          })
          return
        }

        const finalPayload = compactPayload({
          ...amazonFlow.originalPayload,
          provider: 'amazonpay',
          chargePermissionId,
        })
        const { live } = await runLiveWithBin(finalPayload, 'amazonpay', amazonFlow.targetOperation)
        setAmazonFlow({
          ...amazonFlow,
          chargePermissionId,
          completeResponse,
          finalResponse: live,
        })
        setResult({ type: 'simple', title: 'Amazon Pay Live Check', data: live })
        await onRefreshCards()
      }, { label: 'Amazon Pay approval flow çalışıyor', variant: 'auth', detail: 'Checkout complete ediliyor ve hedef canlı işlem gönderiliyor' })
    } catch (error) {
      setResult({
        type: 'simple',
        title: 'Amazon Pay Flow Error',
        data: error.data || { status: 'failed', responseMessage: error.message, statusCode: error.status },
      })
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  async function runBulkLive(provider, operation, onProgress) {
    const rows = String(form.bulkLive || '')
      .split(/\r?\n/)
      .map((line, index) => parseBulkLiveLine(line, index + 1, form.billingZip || '00000'))
      .filter(Boolean)

    if (!rows.length) {
      throw new Error('Toplu live check için en az bir kart satırı gir.')
    }

    const results = Array(rows.length).fill(null)
    const delayMs = numericDelay(form.bulkDelayMs)
    const concurrency = numericConcurrency(form.bulkConcurrency)
    let cursor = 0

    async function worker() {
      while (cursor < rows.length) {
        const rowIndex = cursor
        cursor += 1
        const row = rows[rowIndex]
      if (row.error) {
        results[rowIndex] = { row, lines: formatBulkLiveLines(row, null, null, row.error), status: 'failed' }
        onProgress?.(results.filter(Boolean))
        continue
      }

      try {
        const payload = {
          ...row,
          provider,
          amount: 1,
          currency: form.currency || 'USD',
        }
        const { live, bin } = await runLiveWithBin(payload, provider, operation)
        results[rowIndex] = { row, live, bin, lines: formatBulkLiveLines(row, live, bin), status: liveStatusLabel(live) }
      } catch (error) {
        results[rowIndex] = { row, lines: formatBulkLiveLines(row, null, null, error.message), status: 'failed' }
      }
        onProgress?.(results.filter(Boolean))
        if (delayMs > 0 && cursor < rows.length) {
        await sleep(delayMs)
      }
    }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()))
    return results.filter(Boolean)
  }

  async function submit(event) {
    event.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const withLoader = runAction || ((task) => task())
    const loaderByTab = {
      ip: { label: 'IP/BIN istihbaratı çalışıyor', variant: 'auth', detail: 'BIN ve IP detayları sorgulanıyor' },
      bin: { label: 'Card BIN check çalışıyor', variant: 'auth', detail: 'Kart BIN bilgileri doğrulanıyor' },
      live: { label: 'Live checker çalışıyor', variant: 'auth', detail: 'Tek request içinde provider verify ve BIN sorgusu çalışıyor' },
      balance: { label: 'Balance check çalışıyor', variant: 'transaction', detail: 'Seçili kart için balance sorgusu gönderiliyor' },
      learning: { label: 'Card üretim modeli çalışıyor', variant: 'sequence', detail: 'Clover learning run başlatılıyor' },
    }
    try {
      await withLoader(async () => {
        setResult(null)
        if (tab === 'ip' || tab === 'bin') {
          setResult({ type: 'bin', data: await runBin() })
          return
        }
        if (tab === 'live') {
          const selectedProvider = form.provider || 'clover'
            const operationMeta = selectedLiveOperation(selectedProvider, form.liveOperation)
            const liveOperation = operationMeta.value

            if (form.liveMode === 'bulk') {
            if (selectedProvider === 'amazonpay') {
              throw new Error('Amazon Pay bulk live check için her satırda buyer-approved chargePermissionId gerekir. Bu ekran bulk kart girdisini Clover/PayPal için çalıştırır.')
            }
            const applyBulkResult = (bulkResults) => setResult({
              type: 'bulkLive',
              title: 'Bulk Live Check Result',
              data: bulkResults,
              lines: bulkResults.flatMap((item) => item.lines || []).join('\n'),
              status: bulkResults.some((item) => item.status === 'ACTIVE') ? 'passed' : 'failed',
              pending: true,
            })
            const bulkResults = await runBulkLive(selectedProvider, liveOperation, applyBulkResult)
            setResult({
              type: 'bulkLive',
              title: 'Bulk Live Check Result',
              data: bulkResults,
              lines: bulkResults.flatMap((item) => item.lines || []).join('\n'),
              status: bulkResults.some((item) => item.status === 'ACTIVE') ? 'passed' : 'failed',
              pending: false,
            })
            await onRefreshCards()
            return
          }

          const isAmazonPay = selectedProvider === 'amazonpay'
          const defaultLiveAmount = isAmazonPay ? 0.2 : 1
          const payload = isAmazonPay
            ? compactPayload({ ...form, amount: operationMeta.amount ? Number(moneyValue(form.amount || '0.20')) || defaultLiveAmount : undefined, currency: form.currency || 'USD' })
            : withSavedCard(compactPayload({ ...form, provider: selectedProvider, billingZip: form.billingZip || '00000', zip: form.billingZip || form.zip || '00000', amount: operationMeta.amount ? Number(moneyValue(form.amount || '1.00')) || defaultLiveAmount : undefined }))
          const provider = payload.provider || selectedProvider
          if (isAmazonPay && !payload.chargePermissionId && !payload.source && !payload.providerPaymentToken && !payload.token) {
            await startAmazonPayFlow(payload, liveOperation)
            return
          }
          const { live: liveResp, bin } = await runLiveWithBin(payload, provider, liveOperation)
          setAmazonFlow(null)
          setResult(isAmazonPay ? { type: 'simple', title: 'Amazon Pay Live Check', data: liveResp } : { type: 'live', live: liveResp, bin })
          await onRefreshCards()
          return
        }
        if (tab === 'balance') {
          const payload = compactPayload({
            ...form,
            provider: 'amazonpay',
            amount: form.amount ? Number(moneyValue(form.amount)) : undefined,
            currency: form.currency || 'USD',
          })
          if (!payload.chargePermissionId && !payload.source && !payload.providerPaymentToken && !payload.token) {
            await startAmazonPayFlow(payload, 'verification')
            return
          }

          const balanceResponse = await loggedApi('/checkers/livecheck', { ...payload, provider: 'amazonpay', operation: 'verification' }, 'Amazon Pay Balance')
          setResult({ type: 'simple', title: 'Amazon Pay Balance Check', data: balanceResponse })
          await onRefreshCards()
          return
        }
      }, loaderByTab[tab] || { label: 'Checker çalışıyor', variant: 'default' })
    } catch (error) {
      const response = error.data || {
        status: 'failed',
        responseMessage: error.message,
        statusCode: error.status,
      }
      setResult({
        type: 'simple',
        title: 'Checker Error',
        data: response,
      })
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const currentLiveProvider = form.provider || 'clover'
  const currentLiveOperation = selectedLiveOperation(currentLiveProvider, form.liveOperation)

  const resultView = (
    <>
      {result?.type === 'bin' ? <CardIntelligence result={result.data} title="BIN/IP Detayları" /> : null}
      {result?.type === 'live' ? <CardIntelligence result={result.bin} title="Live Check ile Gelen BIN Detayları" live={result.live} /> : null}
      {result?.type === 'bulkLive' ? (
        <article className={`card result ${result.status === 'passed' ? 'good' : 'bad'}`}>
          <div className="result-head">
            <strong>{result.title}</strong>
            <span className={`pill ${result.pending ? 'warn' : result.status === 'passed' ? 'good' : 'bad'}`}>{result.pending ? 'running' : `${result.data.length} rows`}</span>
          </div>
          <pre className="bulk-live-output">{result.lines}</pre>
        </article>
      ) : null}
      {result?.type === 'simple' ? <ResultCard title={result.title} status={result.data.status} message={operationResponseMessage(result.data) || result.data.responseMessage} items={result.data} /> : null}
    </>
  )

  if (tab === 'learning') {
    return (
      <div className="page-stack">
        <section className="panel">
          <div className="tabs">
            {tabs.map(([key, label]) => <button type="button" className={tab === key ? 'primary' : 'ghost'} key={key} onClick={() => { setTab(key); setResult(null) }}>{label}</button>)}
          </div>
        </section>
        <PerfectGeneratorPanel runAction={runAction} onRefreshCards={onRefreshCards} />
      </div>
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="tabs">
          {tabs.map(([key, label]) => <button type="button" className={tab === key ? 'primary' : 'ghost'} key={key} onClick={() => { setTab(key); setResult(null) }}>{label}</button>)}
        </div>
      </section>
      <section className={tab === 'live' ? 'checker-live-grid' : 'checker-standard'}>
        <div className="panel checker-input-panel">
          <form className="form-grid" onSubmit={submit}>
          {tab === 'ip' ? (
            <>
              <label><span>BIN/IIN</span><input required value={form.bin || ''} minLength={6} maxLength={6} pattern="\d{6}" inputMode="numeric" onChange={(event) => setForm({ ...form, bin: event.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>
              <label><span>IP</span><input value={form.ip || ''} onChange={(event) => setForm({ ...form, ip: event.target.value })} /></label>
            </>
          ) : null}
          {tab === 'bin' ? <CardInput value={form} onChange={setForm} cards={cards} binOnly /> : null}
          {tab === 'live' ? (
            <>
              <label>
                <span>Provider</span>
                <select value={currentLiveProvider} onChange={(event) => {
                  const provider = event.target.value
                  const operation = selectedLiveOperation(provider, form.liveOperation)
                  setAmazonFlow(null)
                  setForm({
                    ...form,
                    provider,
                    liveMode: provider === 'amazonpay' ? 'single' : form.liveMode,
                    liveOperation: operation.value,
                    amount: operation.amount ? (form.amount || (provider === 'amazonpay' ? '0.20' : '1.00')) : form.amount,
                  })
                }}>
                  {liveProviders.map((provider) => (
                    <option key={provider.value} value={provider.value}>{provider.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Operation</span>
                <select value={currentLiveOperation.value} onChange={(event) => {
                  const operation = selectedLiveOperation(currentLiveProvider, event.target.value)
                  setAmazonFlow(null)
                  setForm({ ...form, liveOperation: operation.value, amount: operation.amount ? (form.amount || (currentLiveProvider === 'amazonpay' ? '0.20' : '1.00')) : form.amount })
                }}>
                  {liveOperationsFor(currentLiveProvider).map((operation) => (
                    <option key={operation.value} value={operation.value}>{operation.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Mode</span>
                <select value={form.liveMode || 'single'} onChange={(event) => setForm({ ...form, liveMode: event.target.value })} disabled={currentLiveProvider === 'amazonpay'}>
                  <option value="single">Tekli</option>
                  <option value="bulk">Çoklu paralel</option>
                </select>
              </label>
              {currentLiveOperation.amount ? <label>
                <span>Amount</span>
                <input value={form.amount || (currentLiveProvider === 'amazonpay' ? '0.20' : '1.00')} inputMode="decimal" onChange={(event) => setForm({ ...form, amount: formatMoneyInput(event.target.value) })} />
              </label> : null}
              <label>
                <span>Currency</span>
                <input value={form.currency || 'USD'} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase().slice(0, 3) })} />
              </label>
              {currentLiveProvider === 'amazonpay' ? (
                <>
                  <label className="full">
                    <span>Charge Permission ID</span>
                    <input value={form.chargePermissionId || ''} onChange={(event) => setForm({ ...form, chargePermissionId: event.target.value })} />
                  </label>
                  <label className="full">
                    <span>Reference / Order</span>
                    <input value={form.reference || ''} onChange={(event) => setForm({ ...form, reference: event.target.value })} />
                  </label>
                </>
              ) : null}
              {currentLiveProvider !== 'amazonpay' && (form.liveMode || 'single') === 'single' ? (
                <div className="full">
                  <CardInput value={form} onChange={setForm} cards={cards} />
                </div>
              ) : null}
              {currentLiveProvider !== 'amazonpay' && form.liveMode === 'bulk' ? (
                <>
                  <label>
                    <span>Parallel</span>
                    <input value={form.bulkConcurrency || '3'} inputMode="numeric" onChange={(event) => setForm({ ...form, bulkConcurrency: event.target.value.replace(/\D/g, '').slice(0, 2) })} />
                  </label>
                  <label>
                    <span>Delay ms</span>
                    <input value={form.bulkDelayMs || '0'} inputMode="numeric" onChange={(event) => setForm({ ...form, bulkDelayMs: event.target.value.replace(/\D/g, '').slice(0, 5) })} />
                  </label>
                  <label className="full">
                    <span>Bulk Cards</span>
                    <textarea rows="10" value={form.bulkLive || ''} placeholder="4111111111111111|12|2028|123|10001" onChange={(event) => setForm({ ...form, bulkLive: event.target.value })} />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          {tab === 'balance' ? (
            <>
              <label className="full">
                <span>Charge Permission ID</span>
                <input value={form.chargePermissionId || ''} onChange={(event) => setForm({ ...form, provider: 'amazonpay', chargePermissionId: event.target.value })} />
              </label>
              <label>
                <span>Amount</span>
                <input value={form.amount || '0.20'} inputMode="decimal" onChange={(event) => setForm({ ...form, provider: 'amazonpay', amount: formatMoneyInput(event.target.value) })} />
              </label>
              <label>
                <span>Currency</span>
                <input value={form.currency || 'USD'} onChange={(event) => setForm({ ...form, provider: 'amazonpay', currency: event.target.value.toUpperCase().slice(0, 3) })} />
              </label>
              <label className="full">
                <span>Reference / Order</span>
                <input value={form.reference || ''} onChange={(event) => setForm({ ...form, provider: 'amazonpay', reference: event.target.value })} />
              </label>
            </>
          ) : null}
            <button className="primary full" type="submit" disabled={submitting}>
              {submitting ? 'Çalışıyor...' : 'Çalıştır'}
            </button>
          </form>
        </div>
        {tab === 'live' ? (
          <div className="checker-result-column">
            <AmazonPayCheckerFlow
              flow={amazonFlow}
              onPatch={(patch) => setAmazonFlow((current) => current ? { ...current, ...patch } : current)}
              onComplete={completeAmazonPayFlow}
              onCancel={() => setAmazonFlow(null)}
              submitting={submitting}
            />
            {result ? resultView : (
              <article className="card result checker-empty-result">
                <div className="result-head">
                  <strong>Live System</strong>
                  <span className="pill warn">ready</span>
                </div>
                <div className="summary">
                  <div><span>Provider</span><strong>{currentLiveProvider}</strong></div>
                  <div><span>Operation</span><strong>{currentLiveOperation.label}</strong></div>
                  <div><span>BIN Check</span><strong>skipped</strong></div>
                  <div><span>Result</span><strong>-</strong></div>
                </div>
              </article>
            )}
            <RequestLogPanel logs={requestLogs} title="LiveChecker Logs" />
          </div>
        ) : null}
      </section>
      {tab !== 'live' ? (
        <div className="checker-standard-result-grid">
          <div>{resultView}</div>
          <RequestLogPanel logs={requestLogs} title="Checker Logs" />
        </div>
      ) : null}
    </div>
  )
}
