import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { CardInput } from '../../components/forms/CardInput'
import { moneyValue, operationResponseMessage } from '../../utils/format'
import { CardIntelligence } from './CardIntelligence'
import { PerfectGeneratorPanel } from './PerfectGeneratorPage'

const tabs = [
  ['ip', 'IP Lookup'],
  ['bin', 'Card BIN Check'],
  ['live', 'Card Live Check'],
  ['balance', 'Balance Check'],
  ['learning', 'Machine Learning / Card Üretim'],
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

function numericDelay(value) {
  const delay = Number(String(value || '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(delay) || delay < 0) return 0
  return Math.min(Math.round(delay), 60000)
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

export function CheckersPage({ cards, onRefreshCards, runAction }) {
  const [tab, setTab] = useState('ip')
  const [form, setForm] = useState({ amount: '0.00', quantity: '10', maxAttempts: '30', billingZip: '00000', liveMode: 'single', bulkDelayMs: '1000' })
  const [result, setResult] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    api('/provider-operations/catalog').then(setCatalog).catch(console.error)
  }, [])

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
      const response = await api('/providers/paypal/manager/cards/bin-check', { method: 'POST', body: JSON.stringify({ ...payload, bin: normalizedBin }) })
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

  async function runLiveWithBin(payload, provider) {
    const operation = 'verification'
    const liveResp = await api('/checkers/live-checker', {
      method: 'POST',
      body: JSON.stringify({ ...payload, provider, operation })
    })

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

  async function runBulkLive(provider, onProgress) {
    const rows = String(form.bulkLive || '')
      .split(/\r?\n/)
      .map((line, index) => parseBulkLiveLine(line, index + 1, form.billingZip || '00000'))
      .filter(Boolean)

    if (!rows.length) {
      throw new Error('Toplu live check için en az bir kart satırı gir.')
    }

    const results = []
    const delayMs = numericDelay(form.bulkDelayMs)
    for (const [rowIndex, row] of rows.entries()) {
      if (row.error) {
        results.push({ row, lines: formatBulkLiveLines(row, null, null, row.error), status: 'failed' })
        onProgress?.(results)
        continue
      }

      try {
        const payload = {
          ...row,
          provider,
          amount: 1,
          currency: form.currency || 'USD',
        }
        const { live, bin } = await runLiveWithBin(payload, provider)
        results.push({ row, live, bin, lines: formatBulkLiveLines(row, live, bin), status: liveStatusLabel(live) })
      } catch (error) {
        results.push({ row, lines: formatBulkLiveLines(row, null, null, error.message), status: 'failed' })
      }
      onProgress?.(results)
      if (delayMs > 0 && rowIndex < rows.length - 1) {
        await sleep(delayMs)
      }
    }

    return results
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
          const selectedProvider = form.provider || 'paypal'

          if (form.liveMode === 'bulk') {
            const applyBulkResult = (bulkResults) => setResult({
              type: 'bulkLive',
              title: 'Bulk Live Check Result',
              data: bulkResults,
              lines: bulkResults.flatMap((item) => item.lines || []).join('\n'),
              status: bulkResults.some((item) => item.status === 'ACTIVE') ? 'passed' : 'failed',
              pending: true,
            })
            const bulkResults = await runBulkLive(selectedProvider, applyBulkResult)
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

          const payload = withSavedCard({ ...form, billingZip: form.billingZip || '00000', zip: form.billingZip || form.zip || '00000', amount: Number(moneyValue(form.amount || '1.00')) || 1 })
          const provider = payload.provider || selectedProvider
          const { live: liveResp, bin } = await runLiveWithBin(payload, provider)
          setResult({ type: 'live', live: liveResp, bin })
          await onRefreshCards()
          return
        }
        if (tab === 'balance') {
          const payload = withSavedCard({
            ...form,
            amount: form.amount ? Number(moneyValue(form.amount)) : undefined,
            balanceAmount: form.balanceAmount ? Number(moneyValue(form.balanceAmount)) : undefined,
          })
          const provider = payload.provider || form.provider || 'manual'
          
          let balanceRequest
          if (provider === 'manual') {
            balanceRequest = api('/checkers/balance', { method: 'POST', body: JSON.stringify(payload) })
          } else {
            balanceRequest = api('/provider-operations/cards', { 
              method: 'POST', 
              body: JSON.stringify({ ...payload, provider, operation: 'balance' }) 
            })
          }

          setResult({ type: 'simple', title: 'Balance Check', data: await balanceRequest })
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
              <label className="full">
                <span>Provider</span>
        <select value={form.provider || 'paypal'} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
          <option value="paypal">PayPal</option>
          {catalog ? Object.values(catalog)
            .filter((p) => {
              if (p.key === 'paypal') return false;
              if (!p.configured) return false;
              return p.methods?.some(m => ['verification', 'verify', 'live', 'auth', 'authorize'].includes(m.operation));
            })
            .map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
                    )) : (
                      <>
                        <option value="clover">Clover</option>
                        <option value="fluidpay">FluidPay</option>
                        <option value="globalpayments">Global Payments</option>
                        <option value="propelrpay">PropelrPay</option>
                        <option value="quiklie">Quiklie Payment</option>
                        <option value="braintree">Braintree</option>
                      </>
                  )}
                </select>
              </label>
              <div className="segmented full" role="tablist" aria-label="Live check input mode">
                <button type="button" className={form.liveMode !== 'bulk' ? 'active' : ''} onClick={() => setForm({ ...form, liveMode: 'single' })}>Tekli</button>
                <button type="button" className={form.liveMode === 'bulk' ? 'active' : ''} onClick={() => setForm({ ...form, liveMode: 'bulk' })}>Çoklu</button>
              </div>
              {form.liveMode === 'bulk' ? (
                <>
                  <label>
                    <span>Sorgu Delay (ms)</span>
                    <input value={form.bulkDelayMs || ''} inputMode="numeric" onChange={(event) => setForm({ ...form, bulkDelayMs: event.target.value.replace(/\D/g, '').slice(0, 5) })} />
                  </label>
                  <label>
                    <span>Default ZIP</span>
                    <input value={form.billingZip || '00000'} inputMode="numeric" onChange={(event) => setForm({ ...form, billingZip: event.target.value.replace(/\D/g, '').slice(0, 10) || '00000' })} />
                  </label>
                  <label className="full">
                    <span>Çoklu Live Check</span>
                    <textarea
                      rows="9"
                      value={form.bulkLive || ''}
                      placeholder={'5312378833981055|02/2032|958|00000\n5312378833981055|02/2032|958\n5312378833981055|02|2032|958|00000\n5312378833981055|02|2032|958'}
                      onChange={(event) => setForm({ ...form, bulkLive: event.target.value })}
                    />
                  </label>
                </>
              ) : (
                <CardInput value={form} onChange={setForm} cards={cards} savedCard={false} holder={false} address={false} zip />
              )}
            </>
          ) : null}
          {tab === 'balance' ? (
            <>
              <label className="full">
                <span>Provider</span>
        <select value={form.provider || 'manual'} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
          <option value="manual">Manual Record (No API)</option>
          {catalog ? Object.values(catalog)
            .filter((p) => {
              if (!p.configured) return false;
              return p.methods?.some(m => ['auth', 'authorize'].includes(m.operation));
            })
            .map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
                    )) : (
                      <>
                        <option value="clover">Clover</option>
                        <option value="paypal">PayPal</option>
                        <option value="fluidpay">FluidPay</option>
                        <option value="globalpayments">Global Payments</option>
                        <option value="propelrpay">PropelrPay</option>
                        <option value="quiklie">Quiklie Payment</option>
                        <option value="braintree">Braintree</option>
                      </>
                  )}
                </select>
              </label>
              <CardInput value={form} onChange={setForm} cards={cards} cvv={false} amount />
              <label><span>Balance Amount</span><input value={form.balanceAmount || ''} onChange={(event) => setForm({ ...form, balanceAmount: event.target.value })} /></label>
            </>
          ) : null}
            <button className="primary full" type="submit" disabled={submitting}>
              {submitting ? 'Çalışıyor...' : 'Çalıştır'}
            </button>
          </form>
        </div>
        {tab === 'live' ? (
          <div className="checker-result-column">
            {result ? resultView : (
              <article className="card result checker-empty-result">
                <div className="result-head">
                  <strong>Live System</strong>
                  <span className="pill warn">ready</span>
                </div>
                <div className="summary">
                  <div><span>Provider</span><strong>{form.provider || 'paypal'}</strong></div>
                  <div><span>Operation</span><strong>live-checker / verification + bin</strong></div>
                  <div><span>BIN Check</span><strong>enabled</strong></div>
                  <div><span>Result</span><strong>-</strong></div>
                </div>
              </article>
            )}
          </div>
        ) : null}
      </section>
      {tab !== 'live' ? resultView : null}
    </div>
  )
}
