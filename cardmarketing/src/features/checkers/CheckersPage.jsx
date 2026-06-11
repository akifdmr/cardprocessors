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
    return api('/providers/paypal/manager/cards/bin-check', { method: 'POST', body: JSON.stringify(payload) })
  }

  async function submit(event) {
    event.preventDefault()
    const withLoader = runAction || ((task) => task())
    const loaderByTab = {
      ip: { label: 'IP/BIN istihbaratı çalışıyor', variant: 'auth', detail: 'BIN ve IP detayları sorgulanıyor' },
      bin: { label: 'Card BIN check çalışıyor', variant: 'auth', detail: 'Kart BIN bilgileri doğrulanıyor' },
      live: { label: 'Card live check çalışıyor', variant: 'sale', detail: 'Live check ve BIN sorgusu birlikte çalışıyor' },
      balance: { label: 'Balance check çalışıyor', variant: 'transaction', detail: 'Seçili kart için balance sorgusu gönderiliyor' },
      learning: { label: 'Card üretim modeli çalışıyor', variant: 'sequence', detail: 'Clover learning run başlatılıyor' },
    }
    await withLoader(async () => {
      setResult(null)
      if (tab === 'ip' || tab === 'bin') {
        setResult({ type: 'bin', data: await runBin() })
        return
      }
      if (tab === 'live') {
        const payload = withSavedCard({ ...form, amount: Number(moneyValue(form.amount || 0)) })
        const provider = payload.provider || form.provider || 'paypal'
        
        const liveRequest = api('/provider-operations/cards', { 
          method: 'POST', 
          body: JSON.stringify({ ...payload, provider, operation: 'live', runBinCheck: true }) 
        })

        const [liveResp, bin] = await Promise.all([
          liveRequest,
          runBin(payload),
        ])
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
          {catalog ? Object.values(catalog)
            .filter((p) => {
              if (!p.configured) return false;
              return p.key === 'paypal' || p.methods?.some(m => ['verification', 'verify'].includes(m.operation));
            })
            .map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
                    )) : (
                      <>
                        <option value="paypal">PayPal</option>
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
