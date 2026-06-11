import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { CardInput } from '../../components/forms/CardInput'
import { moneyValue } from '../../utils/format'
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

export function CheckersPage({ cards, onRefreshCards, runAction }) {
  const [tab, setTab] = useState('ip')
  const [form, setForm] = useState({ amount: '0.00', quantity: '10', maxAttempts: '30' })
  const [result, setResult] = useState(null)
  const [catalog, setCatalog] = useState(null)

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
    const normalizedBin = String(payload.bin || payload.pan || '').replace(/\D/g, '').slice(0, 6)
    if (!normalizedBin) {
      throw new Error('BIN/IIN için 6 rakam gerekli. Kayıtlı kartta ilk 6 yoksa Manual Card seçip BIN gir.')
    }
    try {
      const response = await api('/providers/paypal/manager/cards/bin-check', { method: 'POST', body: JSON.stringify(payload) })
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

  async function submit(event) {
    event.preventDefault()
    const withLoader = runAction || ((task) => task())
    const loaderByTab = {
      ip: { label: 'IP/BIN istihbaratı çalışıyor', variant: 'auth', detail: 'BIN ve IP detayları sorgulanıyor' },
      bin: { label: 'Card BIN check çalışıyor', variant: 'auth', detail: 'Kart BIN bilgileri doğrulanıyor' },
      live: { label: 'Card live check çalışıyor', variant: 'sale', detail: 'Provider authorization ve BIN sorgusu birlikte çalışıyor' },
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
          const payload = withSavedCard({ ...form, amount: Number(moneyValue(form.amount || 0)) })
          const provider = payload.provider || form.provider || 'paypal'
          
          const liveResp = await api('/provider-operations/cards', { 
            method: 'POST', 
            body: JSON.stringify({ ...payload, provider, operation: 'live' }) 
          })

          let bin
          try {
            bin = await runBin(payload)
          } catch {
            const normalizedBin = String(payload.bin || payload.pan || '').replace(/\D/g, '').slice(0, 6)
            bin = {
              status: 'skipped',
              bin: normalizedBin || null,
              summary: normalizedBin ? { bin: normalizedBin } : {},
              details: normalizedBin ? { 'BIN/IIN': normalizedBin } : {},
              source: 'live_check_without_bin',
            }
          }
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
      setResult({
        type: 'simple',
        title: 'Checker Error',
        data: {
          status: 'failed',
          responseMessage: error.message,
          statusCode: error.status,
        },
      })
    }
  }

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
      <section className="panel">
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
              return p.methods?.some(m => ['verification', 'verify', 'live'].includes(m.operation));
            })
            .map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
                    )) : (
                      <>
                        <option value="clover">Clover</option>
                        <option value="fluidpay">FluidPay</option>
                        <option value="globalpayments">Global Payments</option>
                        <option value="propelrpay">PropelrPay</option>
                        <option value="braintree">Braintree</option>
                      </>
                  )}
                </select>
              </label>
              <CardInput value={form} onChange={setForm} cards={cards} amount amountLabel="Live Check Amount" />
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
                        <option value="braintree">Braintree</option>
                      </>
                  )}
                </select>
              </label>
              <CardInput value={form} onChange={setForm} cards={cards} cvv={false} amount />
              <label><span>Balance Amount</span><input value={form.balanceAmount || ''} onChange={(event) => setForm({ ...form, balanceAmount: event.target.value })} /></label>
            </>
          ) : null}
          <button className="primary full" type="submit">Çalıştır</button>
        </form>
      </section>
      {result?.type === 'bin' ? <CardIntelligence result={result.data} title="BIN/IP Detayları" /> : null}
      {result?.type === 'live' ? <CardIntelligence result={result.bin} title="Live Check ile Gelen BIN Detayları" live={result.live} /> : null}
      {result?.type === 'simple' ? <ResultCard title={result.title} status={result.data.status} message={result.data.responseMessage} items={result.data} /> : null}
    </div>
  )
}
