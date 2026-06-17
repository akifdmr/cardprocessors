import { useEffect, useMemo, useState } from 'react'
import { api, toQuery } from '../../api/client'
import { PaginationControls } from '../../components/common/Pagination'
import { RequestLogPanel, maskLogPayload } from '../../components/common/RequestLogPanel'

// CSS styles
const styles = `
  .address-cell {
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .address-cell[title]:hover::after {
    content: attr(title);
    position: absolute;
    background: #333;
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    white-space: normal;
    max-width: 300px;
    word-wrap: break-word;
    margin-top: 4px;
    margin-left: -10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  .table-wrap table td {
    position: relative;
    padding: 8px 10px;
    font-size: 13px;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .table-wrap table th {
    padding: 8px 10px;
    font-size: 13px;
  }

  /* Address column specific */
  .table-wrap table td:nth-child(5) {
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Truncate other long text columns */
  .table-wrap table td:nth-child(4) { /* Holder name */
    max-width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .table-wrap table td:nth-child(6) { /* Bank */
    max-width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Tooltip for all truncated cells */
  .table-wrap table td[title]:hover::after {
    content: attr(title);
    position: absolute;
    background: #333;
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    white-space: normal;
    max-width: 300px;
    word-wrap: break-word;
    margin-top: 4px;
    margin-left: -10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    pointer-events: none;
  }
`

const providers = ['clover', 'paypal', 'nmi', 'fluidpay', 'braintree', 'globalpayments', 'propelrpay', 'quiklie', 'zoho']

function serverPagination(meta, setPage, setPageSize) {
  return {
    page: meta.page,
    pageSize: meta.pageSize,
    pageCount: meta.pageCount,
    total: meta.total,
    setPage,
    setPageSize: (value) => {
      setPageSize(Number(value))
      setPage(1)
    },
  }
}

function StatusPill({ value }) {
  const text = value == null || value === '' ? 'none' : String(value)
  const tone = ['true', 'passed', 'live', 'checked', 'success'].includes(text.toLowerCase()) ? 'good' : 'muted'
  return <span className={tone}>{text}</span>
}

function ResultModal({ value, onClose }) {
  if (!value) return null
  return (
    <div className="modal-overlay json-modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label="Action result" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Processor Result</p>
            <h3>{value.title}</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <pre className="json-modal-pre">{JSON.stringify(maskLogPayload(value.payload || {}), null, 2)}</pre>
      </article>
    </div>
  )
}

function ProviderPrompt({ prompt, setPrompt, onSubmit }) {
  if (!prompt) return null
  return (
    <div className="modal-overlay" role="presentation" onClick={() => setPrompt(null)}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label="Provider select" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Processor</p>
            <h3>{prompt.action}</h3>
          </div>
          <button className="ghost small" type="button" onClick={() => setPrompt(null)}>Kapat</button>
        </div>
        <label>
          Provider
          <select value={prompt.provider} onChange={(event) => setPrompt((current) => ({ ...current, provider: event.target.value }))}>
            {providers.map((provider) => <option value={provider} key={provider}>{provider}</option>)}
          </select>
        </label>
        <label>
          Amount
          <input value={prompt.amount} onChange={(event) => setPrompt((current) => ({ ...current, amount: event.target.value }))} />
        </label>
        <label>
          Transaction / Retref
          <input value={prompt.transactionId || ''} onChange={(event) => setPrompt((current) => ({ ...current, transactionId: event.target.value }))} />
        </label>
        <div className="row-actions">
          <button type="button" onClick={() => onSubmit(prompt)}>Çalıştır</button>
          <button className="ghost" type="button" onClick={() => setPrompt(null)}>Vazgeç</button>
        </div>
      </article>
    </div>
  )
}

function stripQuotes(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '').trim()
}

function jsonField(block, keys) {
  for (const key of keys) {
    const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']*)["']`, 'i')
    const match = block.match(pattern)
    if (match?.[1]?.trim()) return stripQuotes(match[1])
  }
  return ''
}

function objectToCardLine(source = {}) {
  const card = source.CreditCard || source.creditCard || source.card || source
  const number = stripQuotes(card.CardNumber || card.cardNumber || card.number || card.pan)
  const cvv = stripQuotes(card.CardCCV2 || card.CardCVV2 || card.CVV || card.CVV2 || card.cvv || card.cvv2)
  const exp = stripQuotes(card.CardExpDate || card.ExpDate || card.Exp || card.exp || card.expiry)
  const name = stripQuotes(card.Name || card.CardHolder || card.holderName || card.cardholderName || card.name)
  const address = stripQuotes(card.Address || card.address || card.CardNetwork || card.IssuingNetwork || card.network || card.level)
  const zip = stripQuotes(card.Zip || card.ZIP || card.PostalCode || card.zip || card.postalCode) || '00000'
  if (!number || !cvv || !exp) return null
  return `${number}|${exp}|${cvv}|${zip}|${name}|${address}`
}

function parseTupleLine(line) {
  const values = [...line.matchAll(/'([^']*)'|"([^"]*)"/g)].map((match) => stripQuotes(match[1] || match[2]))
  if (values.length < 3) return null
  const [number, cvv, exp, name = '', level = ''] = values
  if (!number || !cvv || !exp) return null
  return `${number}|${exp}|${cvv}|00000|${name}|${level}`
}

function parseCreditCardBlocks(text) {
  const lines = []
  const blockPattern = /CreditCard["']?\s*:\s*\{([\s\S]*?)\}/gi
  for (const match of text.matchAll(blockPattern)) {
    const block = match[1]
    const number = jsonField(block, ['CardNumber'])
    const cvv = jsonField(block, ['CardCCV2', 'CardCVV2', 'CVV', 'CVV2'])
    const exp = jsonField(block, ['CardExpDate', 'ExpDate', 'Exp'])
    const name = jsonField(block, ['Name', 'CardHolder'])
    const address = jsonField(block, ['Address', 'CardNetwork', 'IssuingNetwork'])
    const zip = jsonField(block, ['Zip', 'ZIP', 'PostalCode']) || '00000'
    if (number && cvv && exp) {
      lines.push(`${number}|${exp}|${cvv}|${zip}|${name}|${address}`)
    }
  }
  return lines
}

function parseImportedCards(text) {
  const raw = String(text || '').trim()
  if (!raw) return { lines: [], skipped: 0 }

  const parsedLines = []
  const physicalLines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  for (const line of physicalLines) {
    if (line.includes('|')) {
      parsedLines.push(line)
      continue
    }
    const tuple = parseTupleLine(line)
    if (tuple) parsedLines.push(tuple)
  }

  if (parsedLines.length) {
    return { lines: parsedLines, skipped: Math.max(0, physicalLines.length - parsedLines.length) }
  }

  try {
    const normalizedJson = raw.startsWith('[') ? raw : `[${raw.replace(/,\s*$/, '')}]`
    const parsed = JSON.parse(normalizedJson)
    const items = Array.isArray(parsed) ? parsed : [parsed]
    const lines = items.map(objectToCardLine).filter(Boolean)
    return { lines, skipped: Math.max(0, items.length - lines.length) }
  } catch (_) {
    const lines = parseCreditCardBlocks(raw)
    return { lines, skipped: lines.length ? 0 : physicalLines.length }
  }
}

function AddCardsModal({ value, setValue, feedback, saving, progress, onClose, onSubmit, onFileImport }) {
  const lineCount = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <article className="modal panel" role="dialog" aria-modal="true" aria-label="Add cards" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Manual Intake</p>
            <h3>Add Cards</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
        </div>
        <label>
          Cards
          <textarea
            rows="10"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={'cardnumber|exp|cvv|zip|holdername|address\ncardnumber|exp|cvv|zip|holdername|address'}
          />
        </label>
        <label>
          File
          <input
            type="file"
            accept=".txt,.json,text/plain,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFileImport(file)
              event.target.value = ''
            }}
            disabled={saving}
          />
        </label>
        {feedback ? <div className={feedback.tone === 'error' ? 'error' : 'muted'}>{feedback.text}</div> : null}
        {saving ? (
          <div className="inline-loader">
            <span className="loader-dot" />
            <div>
              <strong>{progress.done}/{progress.total} kart işlendi</strong>
              <p className="muted">{progress.current || 'Kart kaydediliyor'}</p>
            </div>
          </div>
        ) : null}
        <div className="row-actions">
          <button type="button" onClick={onSubmit} disabled={!lineCount || saving}>Kaydet{lineCount ? ` (${lineCount})` : ''}</button>
          <button className="ghost" type="button" onClick={onClose} disabled={saving}>Vazgeç</button>
        </div>
      </article>
    </div>
  )
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function permissionMessage(error) {
  if (!error) return ''
  if (error.status === 401) return 'Oturum gerekli. Tekrar giriş yapın.'
  if (error.status === 403) return 'Bu liste veya işlem için yetkiniz yok.'
  return error.message
}

// Helper function for truncating text
function truncateText(text, maxLength = 30) {
  if (!text) return '-'
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

export function UncheckedCardsPage({ user, runAction }) {
  // Inject styles
  useEffect(() => {
    const styleId = 'unchecked-cards-styles'
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style')
      styleElement.id = styleId
      styleElement.textContent = styles
      document.head.appendChild(styleElement)
    }
    return () => {
      const styleElement = document.getElementById(styleId)
      if (styleElement) {
        styleElement.remove()
      }
    }
  }, [])

  const [unchecked, setUnchecked] = useState({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 })
  const [checkedLive, setCheckedLive] = useState({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 })
  const [uncheckedPage, setUncheckedPage] = useState(1)
  const [uncheckedPageSize, setUncheckedPageSize] = useState(25)
  const [livePage, setLivePage] = useState(1)
  const [livePageSize, setLivePageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [prompt, setPrompt] = useState(null)
  const [result, setResult] = useState(null)
  const [uncheckedError, setUncheckedError] = useState('')
  const [checkedLiveError, setCheckedLiveError] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addFeedback, setAddFeedback] = useState(null)
  const [addSaving, setAddSaving] = useState(false)
  const [addProgress, setAddProgress] = useState({ done: 0, total: 0, current: '' })
  const [requestLogs, setRequestLogs] = useState([])
  const [cardsText, setCardsText] = useState('')
  const [range, setRange] = useState({ start: '1', end: '10', delayMs: '750' })
  const withLoader = runAction || ((task) => task())
  const canCreateCards = Boolean(user?.permissions?.canCreateCards)
  const canRunAuthCheck = Boolean(user?.permissions?.canRunAuthCheck)

  function pushRequestLog({ action, request, response, ok = true, status = 'ok' }) {
    setRequestLogs((current) => [{
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toLocaleTimeString(),
      action,
      request,
      response,
      ok,
      status,
    }, ...current].slice(0, 50))
  }

  const uncheckedPagination = useMemo(
    () => serverPagination(unchecked, setUncheckedPage, setUncheckedPageSize),
    [unchecked]
  )
  const livePagination = useMemo(
    () => serverPagination(checkedLive, setLivePage, setLivePageSize),
    [checkedLive]
  )

  async function loadUnchecked() {
    setUncheckedError('')
    setUnchecked(await api(`/unchecked-cards${toQuery({ page: uncheckedPage, pageSize: uncheckedPageSize, q: search })}`))
  }

  async function loadCheckedLive() {
    setCheckedLiveError('')
    setCheckedLive(await api(`/checked-live-cards${toQuery({ page: livePage, pageSize: livePageSize, q: search })}`))
  }

  async function reloadAll() {
    await Promise.all([loadUnchecked(), loadCheckedLive()])
  }

  useEffect(() => {
    loadUnchecked().catch((error) => setUncheckedError(permissionMessage(error)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uncheckedPage, uncheckedPageSize, search])

  useEffect(() => {
    loadCheckedLive().catch((error) => setCheckedLiveError(permissionMessage(error)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePage, livePageSize, search])

  function openPrompt(kind, card) {
    setPrompt({
      kind,
      card,
      action: kind === 'unchecked-live' ? 'Live Check' : kind,
      provider: card.provider || 'clover',
      amount: kind === 'capture' ? '1.00' : '0.01',
      transactionId: card.providerReferenceId || '',
    })
  }

  async function submitPrompt(nextPrompt) {
    await withLoader(async () => {
      try {
        const amount = Math.max(1, Math.round(Number(nextPrompt.amount || 0.01) * 100))
        const body = {
          provider: nextPrompt.provider,
          operation: nextPrompt.kind === 'unchecked-live' ? 'live' : nextPrompt.kind,
          amount,
          currency: 'usd',
          transactionId: nextPrompt.transactionId || undefined,
          retref: nextPrompt.transactionId || undefined,
        }
        const payload = nextPrompt.kind === 'unchecked-live'
          ? await api(`/unchecked-cards/${nextPrompt.card.id}/live-check`, { method: 'POST', body: JSON.stringify(body) })
          : await api(`/checked-live-cards/${nextPrompt.card.id}/action`, { method: 'POST', body: JSON.stringify(body) })
        pushRequestLog({
          action: nextPrompt.action,
          request: { endpoint: nextPrompt.kind === 'unchecked-live' ? `/api/unchecked-cards/${nextPrompt.card.id}/live-check` : `/api/checked-live-cards/${nextPrompt.card.id}/action`, body },
          response: payload,
          ok: true,
          status: payload.status || (payload.live ? 'live' : 'ok'),
        })
        setResult({ title: `${nextPrompt.action} Result`, payload })
        setPrompt(null)
        await reloadAll()
      } catch (error) {
        const payload = error.data || { message: error.message, status: error.status }
        pushRequestLog({
          action: `${nextPrompt.action} Failed`,
          request: { cardId: nextPrompt.card?.id, prompt: nextPrompt },
          response: payload,
          ok: false,
          status: error.status || 'failed',
        })
        setResult({ title: `${nextPrompt.action} Failed`, payload })
      }
    }, { label: `${nextPrompt.action} çalışıyor`, variant: 'transaction', detail: `${nextPrompt.provider} provider isteği gönderiliyor` })
  }

  async function addCards() {
    const lines = cardsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (!lines.length || addSaving) return

    setAddSaving(true)
    setAddFeedback(null)
    setAddProgress({ done: 0, total: lines.length, current: '' })
    let inserted = 0
    const errors = []
    let remaining = [...lines]

    try {
      for (const [index, line] of lines.entries()) {
        setAddProgress({ done: index, total: lines.length, current: line })
        try {
          const payload = await api('/unchecked-cards', {
            method: 'POST',
            body: JSON.stringify({ cardsText: line, provider: 'clover' }),
          })
          pushRequestLog({
            action: 'Add Card',
            request: { endpoint: '/api/unchecked-cards', body: { cardsText: line, provider: 'clover' } },
            response: payload,
            ok: !payload.errors?.length,
            status: payload.status || 'created',
          })
          inserted += payload.inserted || 0
          remaining = remaining.filter((item) => item !== line)
          setCardsText(remaining.join('\n'))
          if (payload.rows?.length) {
            setUnchecked((current) => ({
              ...current,
              rows: [...payload.rows, ...current.rows].slice(0, current.pageSize || 25),
              total: current.total + payload.rows.length,
            }))
          }
        } catch (error) {
          const payload = error.data || { message: error.message, status: error.status }
          pushRequestLog({
            action: 'Add Card Failed',
            request: { endpoint: '/api/unchecked-cards', body: { cardsText: line, provider: 'clover' } },
            response: payload,
            ok: false,
            status: error.status || 'failed',
          })
          errors.push({ line, message: payload.responseMessage || payload.error || payload.message })
        }
        setAddProgress({ done: index + 1, total: lines.length, current: line })
      }

      const summary = {
        status: errors.length ? 'partial' : 'created',
        inserted,
        errors,
      }
      setResult({ title: 'Add Cards Result', payload: summary })
      setAddFeedback({
        tone: errors.length ? 'error' : 'success',
        text: `${inserted} kart kaydedildi${errors.length ? `, ${errors.length} satır kaydedilemedi` : ''}.`,
      })
      setUncheckedPage(1)
      await loadUnchecked()
    } finally {
      setAddSaving(false)
      setAddProgress((current) => ({ ...current, current: '' }))
    }
  }

  async function importCardsFile(file) {
    try {
      const text = await file.text()
      const parsed = parseImportedCards(text)
      if (!parsed.lines.length) {
        setAddFeedback({ tone: 'error', text: 'Dosyadan okunabilir kart verisi bulunamadı.' })
        return
      }
      setCardsText((current) => {
        const prefix = current.trim() ? `${current.trim()}\n` : ''
        return `${prefix}${parsed.lines.join('\n')}`
      })
      setAddFeedback({
        tone: parsed.skipped ? 'error' : 'success',
        text: `${parsed.lines.length} kart dosyadan okundu${parsed.skipped ? `, ${parsed.skipped} kayıt atlandı` : ''}.`,
      })
    } catch (error) {
      setAddFeedback({ tone: 'error', text: `Dosya okunamadı: ${error.message}` })
    }
  }

  async function checkRange() {
    await withLoader(async () => {
      try {
        const body = {
          start: range.start,
          end: range.end,
          delayMs: range.delayMs,
          provider: 'clover',
          liveMode: 'verification',
        }
        const payload = await api('/unchecked-cards/check-range', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        pushRequestLog({
          action: 'CheckCard Range',
          request: { endpoint: '/api/unchecked-cards/check-range', body },
          response: payload,
          ok: true,
          status: payload.status || 'completed',
        })
        setResult({ title: 'CheckCard Result', payload })
        await reloadAll()
      } catch (error) {
        const payload = error.data || { message: error.message, status: error.status }
        pushRequestLog({
          action: 'CheckCard Failed',
          request: { endpoint: '/api/unchecked-cards/check-range', range },
          response: payload,
          ok: false,
          status: error.status || 'failed',
        })
        setResult({ title: 'CheckCard Failed', payload })
      }
    }, { label: 'CheckCard çalışıyor', variant: 'transaction', detail: 'Kartlar sırayla liveCheck ve binCheck servislerinden geçiriliyor' })
  }

  return (
    <div className="unchecked-page-grid">
      <div className="page-stack">
        <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Masked Import</p>
            <h2>Unchecked Cards</h2>
          </div>
          <div className="row-actions unchecked-toolbar">
            {canCreateCards && <button type="button" onClick={() => { setAddFeedback(null); setAddModalOpen(true) }}>Add Cards</button>}
            <input value={search} onChange={(event) => { setSearch(event.target.value); setUncheckedPage(1); setLivePage(1) }} placeholder="Search masked PAN, BIN, bank" />
          </div>
        </div>
        {canRunAuthCheck && <div className="unchecked-checkbar">
          <button type="button" onClick={checkRange}>CheckCard</button>
          <label>
            Başlangıç
            <input type="number" min="1" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} />
          </label>
          <label>
            Bitiş
            <input type="number" min="1" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} />
          </label>
          <label>
            Delay ms
            <input type="number" min="250" max="5000" step="250" value={range.delayMs} onChange={(event) => setRange((current) => ({ ...current, delayMs: event.target.value }))} />
          </label>
        </div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Masked PAN</th>
                <th>Exp</th>
                <th>ZIP</th>
                <th>Holder</th>
                <th>Address</th>
                <th>Bank</th>
                <th>Level</th>
                <th>Type</th>
                <th>Country</th>
                <th>BIN</th>
                <th>Checked</th>
                <th>Live</th>
                <th>Added</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {unchecked.rows.map((card) => (
                <tr key={card.id}>
                  <td>{card.maskedPan}</td>
                  <td>{card.exp}</td>
                  <td>{card.zip || '-'}</td>
                  <td title={card.holderName || ''}>{truncateText(card.holderName, 20)}</td>
                  <td className="address-cell" title={card.address || ''}>{truncateText(card.address, 35)}</td>
                  <td title={card.bank || ''}>{truncateText(card.bank, 15)}</td>
                  <td>{card.cardLevel || '-'}</td>
                  <td>{card.cardType || '-'}</td>
                  <td>{card.countryCode || '-'}</td>
                  <td>{card.bin}</td>
                  <td><StatusPill value={card.checked} /></td>
                  <td><StatusPill value={card.live} /></td>
                  <td>{formatDate(card.createdAt)}</td>
                  <td>
                    {!canRunAuthCheck
                      ? <span className="muted">-</span>
                      : !card.checked
                        ? <button className="small" type="button" onClick={() => openPrompt('unchecked-live', card)}>Live Check</button>
                        : <span className="muted">checked</span>}
                  </td>
                </tr>
              ))}
              {uncheckedError && <tr><td colSpan="14" className="muted">{uncheckedError}</td></tr>}
              {!unchecked.rows.length && !uncheckedError && <tr><td colSpan="14" className="muted">Kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationControls pagination={uncheckedPagination} />
        </section>

        <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Live Records</p>
            <h2>Checked Live Cards</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Masked PAN</th>
                <th>Provider</th>
                <th>Reference</th>
                <th>Balance</th>
                <th>Live Check</th>
                <th>Auth</th>
                <th>Capture</th>
              </tr>
            </thead>
            <tbody>
              {checkedLive.rows.map((card) => (
                <tr key={card.id}>
                  <td>{card.maskedPan}</td>
                  <td>{card.provider || '-'}</td>
                  <td title={card.providerReferenceId || ''}>{truncateText(card.providerReferenceId, 25)}</td>
                  <td>{canRunAuthCheck ? <button className="small ghost" type="button" onClick={() => openPrompt('balance', card)}>Balance</button> : <span className="muted">-</span>}</td>
                  <td>{canRunAuthCheck ? <button className="small ghost" type="button" onClick={() => openPrompt('live', card)}>Live</button> : <span className="muted">-</span>}</td>
                  <td>{canRunAuthCheck ? <button className="small ghost" type="button" onClick={() => openPrompt('auth', card)}>Auth</button> : <span className="muted">-</span>}</td>
                  <td>{canRunAuthCheck ? <button className="small ghost" type="button" onClick={() => openPrompt('capture', card)}>Capture</button> : <span className="muted">-</span>}</td>
                </tr>
              ))}
              {checkedLiveError && <tr><td colSpan="7" className="muted">{checkedLiveError}</td></tr>}
              {!checkedLive.rows.length && !checkedLiveError && <tr><td colSpan="7" className="muted">Live kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationControls pagination={livePagination} />
        </section>
      </div>
      <RequestLogPanel logs={requestLogs} title="Unchecked Logs" />
      {addModalOpen && (
        <AddCardsModal
          value={cardsText}
          setValue={setCardsText}
          feedback={addFeedback}
          saving={addSaving}
          progress={addProgress}
          onClose={() => setAddModalOpen(false)}
          onSubmit={addCards}
          onFileImport={importCardsFile}
        />
      )}
      <ProviderPrompt prompt={prompt} setPrompt={setPrompt} onSubmit={submitPrompt} />
      <ResultModal value={result} onClose={() => setResult(null)} />
    </div>
  )
}