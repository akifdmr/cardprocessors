import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { ResultCard } from '../../components/common/Details'
import { PaginationControls, usePagination } from '../../components/common/Pagination'

const emptyMask = { realFrom: '', realTo: '' }
const emptyCall = { realFrom: '', realTo: '' }
const emptyResolve = { maskedNumber: '' }

export function ServicesPage({ runAction }) {
  const [maskForm, setMaskForm] = useState(emptyMask)
  const [callForm, setCallForm] = useState(emptyCall)
  const [resolveForm, setResolveForm] = useState(emptyResolve)
  const [result, setResult] = useState(null)
  const [numbers, setNumbers] = useState(null)
  const withLoader = runAction || ((task) => task())
  const numberRows = numbers?.data || []
  const numbersPagination = usePagination(numberRows, 25)

  async function loadNumbers() {
    try {
      setNumbers(await api('/numbers/all'))
    } catch (error) {
      setNumbers({ success: false, error: error.message })
    }
  }

  useEffect(() => {
    loadNumbers()
  }, [])

  async function submitMask(event) {
    event.preventDefault()
    await withLoader(async () => {
      setResult(await api('/masks/create', { method: 'POST', body: JSON.stringify(maskForm) }))
    }, { label: 'Mask pair oluşturuluyor', variant: 'transaction', detail: 'Masking servisine create isteği gönderiliyor' })
  }

  async function submitResolve(event) {
    event.preventDefault()
    await withLoader(async () => {
      setResult(await api('/masks/resolve', { method: 'POST', body: JSON.stringify(resolveForm) }))
    }, { label: 'Mask resolve çalışıyor', variant: 'transaction', detail: 'Maskelenmiş numaranın karşılığı aranıyor' })
  }

  async function submitCall(event) {
    event.preventDefault()
    await withLoader(async () => {
      setResult(await api('/calls/initiate', { method: 'POST', body: JSON.stringify(callForm) }))
    }, { label: 'Call routing çalışıyor', variant: 'sale', detail: 'Maskeli çağrı provider router üzerinden başlatılıyor' })
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Voice Services</p>
            <h3>Masking and Call Routing</h3>
          </div>
        </div>
        <div className="service-grid">
          <form className="form-grid service-form" onSubmit={submitMask}>
            <h4 className="full">Create Mask Pair</h4>
            <label><span>Real From</span><input required value={maskForm.realFrom} placeholder="+905551112233" onChange={(event) => setMaskForm({ ...maskForm, realFrom: event.target.value })} /></label>
            <label><span>Real To</span><input required value={maskForm.realTo} placeholder="+905559998877" onChange={(event) => setMaskForm({ ...maskForm, realTo: event.target.value })} /></label>
            <button className="primary full" type="submit">Create Mask Pair</button>
          </form>

          <form className="form-grid service-form" onSubmit={submitResolve}>
            <h4 className="full">Resolve Mask</h4>
            <label className="full"><span>Masked Number</span><input required value={resolveForm.maskedNumber} onChange={(event) => setResolveForm({ maskedNumber: event.target.value })} /></label>
            <button className="primary full" type="submit">Resolve Mask</button>
          </form>

          <form className="form-grid service-form" onSubmit={submitCall}>
            <h4 className="full">Test Call Routing</h4>
            <label><span>Real From</span><input required value={callForm.realFrom} placeholder="+905551112233" onChange={(event) => setCallForm({ ...callForm, realFrom: event.target.value })} /></label>
            <label><span>Real To</span><input required value={callForm.realTo} placeholder="+447700900123" onChange={(event) => setCallForm({ ...callForm, realTo: event.target.value })} /></label>
            <button className="primary full" type="submit">Test Call Routing</button>
          </form>
        </div>
      </section>

      {result ? (
        <ResultCard
          title="Service Result"
          status={result.success ? 'success' : result.status}
          message={result.error || result.providerMessage || result.message}
          items={{
            MaskedFrom: result.maskedFrom || result.maskedNumber,
            MaskedTo: result.maskedTo || result.targetMasked,
            Session: result.sessionId,
            Provider: result.provider,
            Call: result.callId,
            RealNumber: result.realNumber,
          }}
        />
      ) : null}

      <section className="panel wide">
        <div className="section-head">
          <div>
            <p className="eyebrow">Numbers</p>
            <h3>Card Phone Numbers</h3>
          </div>
          <PaginationControls
            pagination={numbersPagination}
            pageSizes={[10, 25, 50]}
            label="Numara sayfa boyutu"
            extra={<button className="ghost small" type="button" onClick={() => withLoader(loadNumbers, { label: 'Numara listesi yenileniyor', variant: 'logs', detail: 'Kart telefon kayıtları alınıyor' })}>Refresh</button>}
          />
        </div>
        <div className="table-wrap">
          <table className="processor-table">
            <thead>
              <tr>
                <th>Phone</th>
                <th>Masked</th>
                <th>Card</th>
                <th>Verified</th>
                <th>Added By</th>
              </tr>
            </thead>
            <tbody>
              {numbersPagination.visibleItems.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.phoneNumber}</td>
                  <td className="mono">{item.maskedNumber}</td>
                  <td className="mono">{item.cardId}</td>
                  <td><span className={`pill ${item.isVerified ? 'good' : 'warn'}`}>{item.isVerified ? 'yes' : 'no'}</span></td>
                  <td>{item.addedBy || '-'}</td>
                </tr>
              ))}
              {!numbersPagination.visibleItems.length ? <tr><td colSpan="5" className="muted">{numbers?.error || 'Kayıt yok veya yetki yok.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
