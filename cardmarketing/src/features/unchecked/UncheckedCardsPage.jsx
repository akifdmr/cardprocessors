import { useEffect, useMemo, useState } from 'react'
import { api, toQuery } from '../../api/client'
import { PaginationControls } from '../../components/common/Pagination'
import { RequestLogPanel, maskLogPayload } from '../../components/common/RequestLogPanel'

// CSS styles
const styles = `
  .unchecked-cards-table {
    width: max-content;
    min-width: 100%;
    table-layout: auto;
  }

  .unchecked-cards-table th,
  .unchecked-cards-table td {
    white-space: nowrap;
    max-width: none;
  }

  .unchecked-identity,
  .unchecked-owner,
  .unchecked-issuer,
  .unchecked-status {
    display: grid;
    gap: 3px;
  }

  .unchecked-identity strong,
  .unchecked-owner strong {
    color: #e4f2e9;
  }

  .unchecked-meta {
    color: #8ea49a;
    font-size: 11px;
  }

  .unchecked-owner {
    min-width: 190px;
    max-width: 280px;
  }

  .unchecked-owner .unchecked-meta {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .unchecked-status {
    min-width: 105px;
  }

  .unchecked-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .unchecked-status-row > span:first-child {
    color: #8ea49a;
    font-size: 11px;
  }

  .checked-live-table {
    width: max-content;
    min-width: 100%;
    table-layout: auto;
  }

  .checked-live-table th,
  .checked-live-table td {
    white-space: nowrap;
    max-width: none;
  }

  .checked-live-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 250px;
  }

  .checked-live-result {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

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
  const tone = ['true', 'passed', 'live', 'checked', 'success', 'approved', 'authorized', 'captured', 'verified'].includes(text.toLowerCase()) ? 'good' : 'muted'
  return <span className={`pill ${tone}`}>{text}</span>
}

function ownerPrimary(card = {}) {
  return String(card.holderName || '').trim() || 'Sahip bilgisi girilmemiş'
}

function ownerDetail(card = {}) {
  return [card.phone, card.address].filter(Boolean).join(' · ') || 'Telefon/adres bilgisi yok'
}

function cardMeta(card = {}) {
  return [
    card.bin ? `BIN ${card.bin}` : null,
    card.cardType,
    card.cardLevel,
  ].filter(Boolean).join(' · ') || 'Kart tipi henüz belirlenmedi'
}

function checkedLiveStatus(card = {}) {
  if (card.voidStatus === 'voided' || card.void === true) return 'voided'
  if (card.captureStatus === 'captured' || card.capture === true) return 'captured'
  if (card.authStatus === 'authorized' || card.auth === true) return 'authorized'
  if (card.live === true) return 'live'
  return card.lastAction || 'review'
}

function checkedLiveAmount(card = {}) {
  const value = card.balanceAmount ?? card.authAmount ?? card.lastAmount
  if (value === null || value === undefined || value === '') return '-'
  return `${value} ${card.authCurrency || card.lastCurrency || 'USD'}`
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
          <select value={prompt.provider} disabled onChange={(event) => setPrompt((current) => ({ ...current, provider: event.target.value }))}>
            <option value="clover">clover</option>
          </select>
        </label>
        {prompt.kind !== 'void' && (
          <label>
            {prompt.kind === 'balance' ? 'Balance value' : 'Amount'}
            <input value={prompt.amount} onChange={(event) => setPrompt((current) => ({ ...current, amount: event.target.value }))} />
          </label>
        )}
        {['capture', 'void'].includes(prompt.kind) && (
          <label>
            Transaction / Retref
            <input value={prompt.transactionId || ''} onChange={(event) => setPrompt((current) => ({ ...current, transactionId: event.target.value }))} />
          </label>
        )}
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

function splitSqlTupleFields(line) {
  const body = String(line || '').trim().replace(/^\(/, '').replace(/\),?$/, '')
  const fields = []
  let current = ''
  let quote = ''

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    const next = body[index + 1]
    if (quote) {
      if (char === quote && next === quote) {
        current += char
        index += 1
      } else if (char === quote) {
        quote = ''
      } else {
        current += char
      }
      continue
    }

    if (char === '\'' || char === '"') {
      quote = char
      continue
    }
    if (char === ',') {
      fields.push(stripQuotes(current))
      current = ''
      continue
    }
    current += char
  }
  fields.push(stripQuotes(current))
  return fields.map((field) => field.trim())
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
  const values = splitSqlTupleFields(line)
  if (values.length >= 6 && /^\d+$/.test(values[0]) && /^\d{12,19}$/.test(values[1])) {
    const [, number, name = '', month = '', year = '', cvv = '', , , , , phone = '', , , bank = '', level = ''] = values
    if (!number || !month || !year || !cvv) return null
    const note = [bank, level, phone ? `phone:${phone}` : ''].filter(Boolean).join(' / ')
    return `${number}|${month}|${year}|${cvv}|00000|${name}|${note}`
  }

  const quotedValues = [...String(line || '').matchAll(/'([^']*)'|"([^"]*)"/g)].map((match) => stripQuotes(match[1] || match[2]))
  if (quotedValues.length < 3) return null
  const [number, cvv, exp, name = '', level = ''] = quotedValues
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
  } catch {
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
            placeholder={'cardnumber|exp|cvv|12345|holdername|address\ncardnumber|exp|cvv|holdername|address'}
          />
        </label>
        <p className="muted">
          Kart sahibini listede görebilmek için holdername alanını ekleyin:
          cardnumber|exp|cvv|zip|holdername|address
        </p>
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

function checkedLiveCanRun(card, operation) {
  if (!card) return false
  const provider = String(card.provider || 'clover').toLowerCase()
  if (provider && provider !== 'clover') return false
  const hasReference = Boolean(card.providerReferenceId)
  const isAuthorized = card.authStatus === 'authorized' || card.auth === true
  const isCaptured = card.captureStatus === 'captured' || card.capture === true
  const isVoided = card.voidStatus === 'voided' || card.void === true
  if (operation === 'balance') return !isCaptured && !isVoided
  if (operation === 'auth') return !isCaptured && !isVoided
  if (operation === 'capture') return isAuthorized && hasReference && !isCaptured && !isVoided
  if (operation === 'void') return isAuthorized && hasReference && !isCaptured && !isVoided
  return true
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
  const [debugLog, setDebugLog] = useState(null)
  const [uncheckedError, setUncheckedError] = useState('')
  const [checkedLiveError, setCheckedLiveError] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addFeedback, setAddFeedback] = useState(null)
  const [addSaving, setAddSaving] = useState(false)
  const [addProgress, setAddProgress] = useState({ done: 0, total: 0, current: '' })
  const [requestLogs, setRequestLogs] = useState([])
  const [cardsText, setCardsText] = useState('')
  const [range, setRange] = useState({ start: '1', end: '10', delayMs: '750' })
  const [selectedUncheckedIds, setSelectedUncheckedIds] = useState([])
  const withLoader = runAction || ((task) => task())
  const canCreateCards = Boolean(user?.permissions?.canCreateCards)
  const canRunAuthCheck = Boolean(user?.permissions?.canRunAuthCheck)
  const selectableUncheckedRows = unchecked.rows.filter(() => canRunAuthCheck)
  const selectedUncheckedSet = useMemo(() => new Set(selectedUncheckedIds), [selectedUncheckedIds])
  const allVisibleUncheckedSelected = selectableUncheckedRows.length > 0 && selectableUncheckedRows.every((card) => selectedUncheckedSet.has(card.id))

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
      provider: 'clover',
      amount: ['unchecked-live', 'auth', 'capture'].includes(kind) ? '1.00' : '0.00',
      transactionId: card.providerReferenceId || '',
    })
  }

  function toggleUncheckedSelection(cardId, checked) {
    setSelectedUncheckedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(cardId)
      else next.delete(cardId)
      return [...next]
    })
  }

  function toggleVisibleUncheckedSelection(checked) {
    setSelectedUncheckedIds((current) => {
      const next = new Set(current)
      for (const card of selectableUncheckedRows) {
        if (checked) next.add(card.id)
        else next.delete(card.id)
      }
      return [...next]
    })
  }

  async function submitPrompt(nextPrompt) {
    await withLoader(async () => {
      try {
        const rawAmount = Number(nextPrompt.amount || 0)
        const amount = nextPrompt.kind === 'balance'
          ? rawAmount
          : Math.max(1, Math.round(Number(nextPrompt.amount || 0.01) * 100))
        const body = {
          provider: nextPrompt.provider,
          operation: nextPrompt.kind === 'unchecked-live' ? 'live' : nextPrompt.kind,
          amount,
          displayAmount: rawAmount,
          balanceAmount: nextPrompt.kind === 'balance' ? rawAmount : undefined,
          currency: 'usd',
          liveMode: nextPrompt.kind === 'unchecked-live' ? 'preauth' : undefined,
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
        await reloadAll()
      }
    }, { label: `${nextPrompt.action} çalışıyor`, variant: 'transaction', detail: `${nextPrompt.provider} provider isteği gönderiliyor` })
  }

  async function openCheckedLiveDebug(card) {
    if (user?.role !== 'admin') return
    await withLoader(async () => {
      try {
        const payload = await api(`/checked-live-cards/${card.id}/debug`)
        setDebugLog({ title: `${card.maskedPan || card.id} Debug Log`, payload })
        pushRequestLog({
          action: 'Live Record Debug',
          request: { endpoint: `/api/checked-live-cards/${card.id}/debug` },
          response: payload,
          ok: true,
          status: payload.status || 'ok',
        })
      } catch (error) {
        const payload = error.data || { message: error.message, status: error.status }
        setDebugLog({ title: 'Debug Log Failed', payload })
        pushRequestLog({
          action: 'Live Record Debug Failed',
          request: { endpoint: `/api/checked-live-cards/${card.id}/debug` },
          response: payload,
          ok: false,
          status: error.status || 'failed',
        })
      }
    }, { label: 'Live record logları alınıyor', variant: 'logs', detail: 'Admin debug datası yükleniyor' })
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
            body: JSON.stringify({ cardsText: line, provider: 'clover', autoLiveCheck: true, liveMode: 'verification' }),
          })
          pushRequestLog({
            action: 'Add + Live Check',
            request: { endpoint: '/api/unchecked-cards', body: { cardsText: line, provider: 'clover', autoLiveCheck: true, liveMode: 'verification' } },
            response: payload,
            ok: !payload.errors?.length,
            status: payload.status || 'created',
          })
          if (payload.rows?.length) {
            inserted += payload.rows.length
            remaining = remaining.filter((item) => item !== line)
            setCardsText(remaining.join('\n'))
            setUnchecked((current) => ({
              ...current,
              rows: [...payload.rows, ...current.rows].slice(0, current.pageSize || 25),
              total: current.total + payload.rows.length,
            }))
          }
          if (payload.errors?.length) {
            payload.errors.forEach((item) => {
              errors.push({ line, message: item.message || 'Kart kaydedildi ama check sonucu alınamadı' })
            })
          }
        } catch (error) {
          const payload = error.data || { message: error.message, status: error.status }
          pushRequestLog({
            action: 'Add + Live Check Failed',
            request: { endpoint: '/api/unchecked-cards', body: { cardsText: line, provider: 'clover', autoLiveCheck: true, liveMode: 'verification' } },
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
      await reloadAll()
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

  async function checkSelectedCards() {
    const ids = selectedUncheckedIds
    if (!ids.length) return

    await withLoader(async () => {
      try {
        const body = {
          ids,
          delayMs: range.delayMs,
          provider: 'clover',
          liveMode: 'verification',
        }
        const payload = await api('/unchecked-cards/live-check-selected', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        pushRequestLog({
          action: 'Selected Live Check',
          request: { endpoint: '/api/unchecked-cards/live-check-selected', body },
          response: payload,
          ok: true,
          status: payload.status || 'completed',
        })
        setResult({ title: 'Selected Live Check Result', payload })
        setSelectedUncheckedIds([])
        await reloadAll()
      } catch (error) {
        const payload = error.data || { message: error.message, status: error.status }
        pushRequestLog({
          action: 'Selected Live Check Failed',
          request: { endpoint: '/api/unchecked-cards/live-check-selected', ids },
          response: payload,
          ok: false,
          status: error.status || 'failed',
        })
        setResult({ title: 'Selected Live Check Failed', payload })
      }
    }, { label: 'Seçili kartlar check ediliyor', variant: 'transaction', detail: `${ids.length} kart liveCheck ve binCheck servislerinden geçiriliyor` })
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
            <input value={search} onChange={(event) => { setSearch(event.target.value); setUncheckedPage(1); setLivePage(1) }} placeholder="Kart, son 4, sahip veya banka ara" />
          </div>
        </div>
        {canRunAuthCheck && <div className="unchecked-checkbar">
          <button type="button" onClick={checkRange}>CheckCard</button>
          <button type="button" className="ghost" onClick={checkSelectedCards} disabled={!selectedUncheckedIds.length}>
            Seçili Live Check{selectedUncheckedIds.length ? ` (${selectedUncheckedIds.length})` : ''}
          </button>
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
          <table className="unchecked-cards-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Sayfadaki kartları seç"
                    checked={allVisibleUncheckedSelected}
                    disabled={!selectableUncheckedRows.length}
                    onChange={(event) => toggleVisibleUncheckedSelection(event.target.checked)}
                  />
                </th>
                <th>Kart</th>
                <th>Kart Sahibi</th>
                <th>Banka / Ülke</th>
                <th>Son Kullanma</th>
                <th>Durum</th>
                <th>Eklenme</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {unchecked.rows.map((card) => (
                <tr key={card.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${card.maskedPan} seç`}
                      checked={selectedUncheckedSet.has(card.id)}
                      disabled={!canRunAuthCheck}
                      onChange={(event) => toggleUncheckedSelection(card.id, event.target.checked)}
                    />
                  </td>
                  <td>
                    <div className="unchecked-identity">
                      <strong className="mono">{card.maskedPan || `${card.bin || '------'}******${card.last4 || '----'}`}</strong>
                      <span className="unchecked-meta">{cardMeta(card)}</span>
                    </div>
                  </td>
                  <td title={ownerDetail(card)}>
                    <div className="unchecked-owner">
                      <strong>{ownerPrimary(card)}</strong>
                      <span className="unchecked-meta">{ownerDetail(card)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="unchecked-issuer">
                      <strong>{card.bank || 'Banka henüz belirlenmedi'}</strong>
                      <span className="unchecked-meta">{card.countryCode || 'Ülke yok'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="unchecked-identity">
                      <strong>{card.exp || '-'}</strong>
                      <span className="unchecked-meta">ZIP {card.zip || 'yok'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="unchecked-status">
                      <div className="unchecked-status-row"><span>Checked</span><StatusPill value={card.checked} /></div>
                      <div className="unchecked-status-row"><span>Live</span><StatusPill value={card.live} /></div>
                    </div>
                  </td>
                  <td>{formatDate(card.createdAt)}</td>
                  <td>
                    {canRunAuthCheck
                      ? <button className="small" type="button" onClick={() => openPrompt('unchecked-live', card)}>
                          {card.checked ? 'Tekrar Live Check' : 'Live Check'}
                        </button>
                      : <span className="muted">-</span>}
                  </td>
                </tr>
              ))}
              {uncheckedError && <tr><td colSpan="8" className="muted">{uncheckedError}</td></tr>}
              {!unchecked.rows.length && !uncheckedError && <tr><td colSpan="8" className="muted">Kayıt yok</td></tr>}
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
          <button className="ghost small" type="button" onClick={() => withLoader(loadCheckedLive, { label: 'Live kartlar yenileniyor', variant: 'logs' })}>
            Yenile
          </button>
        </div>
        <div className="table-wrap">
          <table className="checked-live-table">
            <thead>
              <tr>
                <th>Kart</th>
                <th>Kart Sahibi</th>
                <th>Banka / Ülke</th>
                <th>Durum</th>
                <th>Provizyon</th>
                <th>Reference</th>
                <th>Son Sonuç</th>
                <th>Güncelleme</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {checkedLive.rows.map((card) => (
                <tr key={card.id}>
                  <td>
                    <div className="unchecked-identity">
                      <strong className="mono">{card.maskedPan || `${card.bin || '------'}******${card.last4 || '----'}`}</strong>
                      <span className="unchecked-meta">{cardMeta(card)}</span>
                    </div>
                  </td>
                  <td title={ownerDetail(card)}>
                    <div className="unchecked-owner">
                      <strong>{ownerPrimary(card)}</strong>
                      <span className="unchecked-meta">{ownerDetail(card)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="unchecked-issuer">
                      <strong>{card.bank || 'Banka belirlenmedi'}</strong>
                      <span className="unchecked-meta">{card.countryCode || 'Ülke yok'} · {card.provider || '-'}</span>
                    </div>
                  </td>
                  <td><StatusPill value={checkedLiveStatus(card)} /></td>
                  <td><strong>{checkedLiveAmount(card)}</strong></td>
                  <td className="mono" title={card.providerReferenceId || ''}>{truncateText(card.providerReferenceId, 25)}</td>
                  <td className="checked-live-result" title={card.lastMessage || card.lastResult?.responseMessage || ''}>
                    {truncateText(card.lastMessage || card.lastResult?.responseMessage || '-', 40)}
                  </td>
                  <td>{formatDate(card.updatedAt || card.createdAt)}</td>
                  <td>
                    <div className="checked-live-actions">
                      {canRunAuthCheck && checkedLiveCanRun(card, 'balance') ? <button className="small ghost" type="button" onClick={() => openPrompt('balance', card)}>Balance</button> : null}
                      {canRunAuthCheck && checkedLiveCanRun(card, 'auth') ? <button className="small ghost" type="button" onClick={() => openPrompt('auth', card)}>Auth</button> : null}
                      {canRunAuthCheck && checkedLiveCanRun(card, 'capture') ? <button className="small ghost" type="button" onClick={() => openPrompt('capture', card)}>Capture</button> : null}
                      {canRunAuthCheck && checkedLiveCanRun(card, 'void') ? <button className="small ghost" type="button" onClick={() => openPrompt('void', card)}>Void</button> : null}
                      {user?.role === 'admin' ? <button className="small ghost" type="button" onClick={() => openCheckedLiveDebug(card)}>Log</button> : null}
                      {!checkedLiveCanRun(card, 'capture') && !checkedLiveCanRun(card, 'void') ? <span className="muted">Auth sonrası capture/void</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {checkedLiveError && <tr><td colSpan="9" className="muted">{checkedLiveError}</td></tr>}
              {!checkedLive.rows.length && !checkedLiveError && <tr><td colSpan="9" className="muted">Live kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationControls pagination={livePagination} />
        </section>
      </div>
      <RequestLogPanel logs={requestLogs} title="Unchecked Logs" />
      <ResultModal value={debugLog} onClose={() => setDebugLog(null)} />
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
