import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { formatMoneyInput, moneyValue, statusClass } from '../../utils/format'

const tabs = [
  ['accounts', 'Bank Accounts'],
  ['cards', 'Payable Cards'],
  ['payments', 'Payments'],
]

const emptyAccount = {
  bankName: '',
  accountName: '',
  accountType: 'checking',
  ownershipType: 'personal',
  businessName: '',
  accountNumber: '',
  routingNumber: '',
  addressLine1: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
  notes: '',
}

const emptyCard = {
  ownerName: '',
  cardholderName: '',
  bankName: '',
  cardNetwork: '',
  cardLast4: '',
  billingAddressLine1: '',
  billingCity: '',
  billingState: '',
  billingZip: '',
  billingCountry: 'US',
  loginUrl: '',
  loginUsername: '',
  loginPassword: '',
  creditLimit: '',
  currentBalance: '',
  minimumPayment: '',
  dueDate: '',
  notes: '',
}

const emptyPayment = {
  debtCardId: '',
  paymentType: 'card_debt',
  sourceType: 'registered',
  fundingAccountId: '',
  manualBankName: '',
  manualAccountName: '',
  manualAccountType: 'checking',
  manualOwnershipType: 'personal',
  manualAccountLast4: '',
  manualRoutingLast4: '',
  amount: '',
  currency: 'USD',
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentStatus: 'pending',
  confirmationNumber: '',
  repaymentExpectedAmount: '',
  repaymentPaidAmount: '',
  repaymentStatus: 'unpaid',
  repaymentDate: '',
  notes: '',
}

function money(value) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function compact(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function inputPatch(setter, field, value) {
  setter((current) => ({ ...current, [field]: value }))
}

export function DebtManagementPage({ runAction }) {
  const [tab, setTab] = useState('accounts')
  const [summary, setSummary] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [cards, setCards] = useState([])
  const [payments, setPayments] = useState([])
  const [selected, setSelected] = useState(null)
  const [result, setResult] = useState(null)
  const [accountForm, setAccountForm] = useState(emptyAccount)
  const [cardForm, setCardForm] = useState(emptyCard)
  const [paymentForm, setPaymentForm] = useState(emptyPayment)
  const withLoader = runAction || ((task) => task())

  async function loadAll() {
    const [summaryData, accountData, cardData, paymentData] = await Promise.all([
      api('/debt-management/summary'),
      api('/debt-management/funding-accounts'),
      api('/debt-management/cards'),
      api('/debt-management/payments'),
    ])
    setSummary(summaryData)
    setAccounts(accountData)
    setCards(cardData)
    setPayments(paymentData)
  }

  useEffect(() => {
    withLoader(loadAll, { label: 'Debt operations yükleniyor', variant: 'logs', detail: 'Hesap, kart ve ödeme kayıtları hazırlanıyor' }).catch((error) => setResult({ status: 'failed', message: error.message }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedPayments = useMemo(() => {
    if (!selected) return []
    if (selected.type === 'account') return payments.filter((payment) => payment.fundingAccountId === selected.item.id)
    if (selected.type === 'card') return payments.filter((payment) => payment.debtCardId === selected.item.id)
    return []
  }, [payments, selected])

  async function submitAccount(event) {
    event.preventDefault()
    await withLoader(async () => {
      const saved = await api('/debt-management/funding-accounts', { method: 'POST', body: JSON.stringify(compact(accountForm)) })
      setResult({ status: 'success', message: 'Bank account saved', item: saved })
      setAccountForm(emptyAccount)
      await loadAll()
    }, { label: 'Banka hesabı kaydediliyor', variant: 'cards', detail: 'Routing/account bilgileri encrypted saklanıyor' })
  }

  async function submitCard(event) {
    event.preventDefault()
    await withLoader(async () => {
      const body = {
        ...cardForm,
        creditLimit: moneyValue(cardForm.creditLimit),
        currentBalance: moneyValue(cardForm.currentBalance),
        minimumPayment: moneyValue(cardForm.minimumPayment),
      }
      const saved = await api('/debt-management/cards', { method: 'POST', body: JSON.stringify(compact(body)) })
      setResult({ status: 'success', message: 'Payable card saved', item: saved })
      setCardForm(emptyCard)
      await loadAll()
    }, { label: 'Ödenecek kart kaydediliyor', variant: 'cards', detail: 'Kart sahibi, banka, limit ve login bilgileri saklanıyor' })
  }

  async function submitPayment(event) {
    event.preventDefault()
    await withLoader(async () => {
      const body = {
        ...paymentForm,
        amount: moneyValue(paymentForm.amount),
        repaymentExpectedAmount: moneyValue(paymentForm.repaymentExpectedAmount),
        repaymentPaidAmount: moneyValue(paymentForm.repaymentPaidAmount),
      }
      const saved = await api('/debt-management/payments', { method: 'POST', body: JSON.stringify(compact(body)) })
      setResult({ status: saved.status || 'success', message: 'Payment recorded', item: saved })
      setPaymentForm(emptyPayment)
      await loadAll()
    }, { label: 'Ödeme kaydediliyor', variant: 'sale', detail: 'Kart, kaynak hesap ve geri ödeme durumu ilişkilendiriliyor' })
  }

  async function updatePayment(payment, next) {
    await withLoader(async () => {
      const saved = await api(`/debt-management/payments/${payment.id}`, { method: 'PATCH', body: JSON.stringify(next) })
      setResult({ status: saved.paymentStatus, message: 'Payment updated', item: saved })
      await loadAll()
    }, { label: 'Ödeme güncelleniyor', variant: 'transaction', detail: payment.confirmationNumber || payment.id })
  }

  function renderSummary() {
    if (!summary) return null
    return (
      <section className="summary debt-summary">
        <div><span>Accounts</span><strong>{summary.accounts}</strong></div>
        <div><span>Payable Cards</span><strong>{summary.cards}</strong></div>
        <div><span>Total Paid</span><strong>{money(summary.totalPaid)}</strong></div>
        <div><span>Repayment Due</span><strong>{money(summary.repaymentDueTotal)}</strong></div>
      </section>
    )
  }

  function renderAccounts() {
    return (
      <div className="debt-grid">
        <section className="panel">
          <div className="section-head">
            <div><p className="eyebrow">Funding Source</p><h3>Bank Account</h3></div>
          </div>
          <form className="form-grid" onSubmit={submitAccount}>
            <label><span>Bank Name</span><input required value={accountForm.bankName} onChange={(e) => inputPatch(setAccountForm, 'bankName', e.target.value)} /></label>
            <label><span>Account Name</span><input value={accountForm.accountName} onChange={(e) => inputPatch(setAccountForm, 'accountName', e.target.value)} /></label>
            <label><span>Account Type</span><select value={accountForm.accountType} onChange={(e) => inputPatch(setAccountForm, 'accountType', e.target.value)}><option value="checking">Checking</option><option value="savings">Savings</option><option value="money_market">Money Market</option><option value="other">Other</option></select></label>
            <label><span>Ownership</span><select value={accountForm.ownershipType} onChange={(e) => inputPatch(setAccountForm, 'ownershipType', e.target.value)}><option value="personal">Personal</option><option value="business">Business</option></select></label>
            {accountForm.ownershipType === 'business' ? <label className="full"><span>Business Name</span><input value={accountForm.businessName} onChange={(e) => inputPatch(setAccountForm, 'businessName', e.target.value)} /></label> : null}
            <label><span>Account Number</span><input required inputMode="numeric" value={accountForm.accountNumber} onChange={(e) => inputPatch(setAccountForm, 'accountNumber', e.target.value.replace(/\D/g, ''))} /></label>
            <label><span>Routing Number</span><input required inputMode="numeric" maxLength={9} value={accountForm.routingNumber} onChange={(e) => inputPatch(setAccountForm, 'routingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))} /></label>
            <label className="full"><span>Address</span><input value={accountForm.addressLine1} onChange={(e) => inputPatch(setAccountForm, 'addressLine1', e.target.value)} /></label>
            <label><span>City</span><input value={accountForm.city} onChange={(e) => inputPatch(setAccountForm, 'city', e.target.value)} /></label>
            <label><span>State</span><input value={accountForm.state} onChange={(e) => inputPatch(setAccountForm, 'state', e.target.value)} /></label>
            <label><span>ZIP</span><input value={accountForm.zip} onChange={(e) => inputPatch(setAccountForm, 'zip', e.target.value)} /></label>
            <label><span>Country</span><input maxLength={2} value={accountForm.country} onChange={(e) => inputPatch(setAccountForm, 'country', e.target.value.toUpperCase())} /></label>
            <label className="full"><span>Notes</span><textarea value={accountForm.notes} onChange={(e) => inputPatch(setAccountForm, 'notes', e.target.value)} /></label>
            <button className="primary full" type="submit">Hesabı Kaydet</button>
          </form>
        </section>
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">Accounts</p><h3>Kayıtlı Hesaplar</h3></div></div>
          <div className="table-wrap"><table><thead><tr><th>Bank</th><th>Type</th><th>Owner</th><th>Account</th><th>Total Paid</th><th></th></tr></thead><tbody>{accounts.map((account) => (
            <tr key={account.id}><td>{account.bankName}</td><td>{account.accountType}</td><td>{account.ownershipType}</td><td>{account.accountMasked}</td><td>{money(account.totalPaid)}</td><td><button className="ghost small" type="button" onClick={() => setSelected({ type: 'account', item: account })}>Open</button></td></tr>
          ))}</tbody></table></div>
        </section>
      </div>
    )
  }

  function renderCards() {
    return (
      <div className="debt-grid">
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">Payable Card</p><h3>Kredi Kartı</h3></div></div>
          <form className="form-grid" onSubmit={submitCard}>
            <label><span>Owner Name</span><input required value={cardForm.ownerName} onChange={(e) => inputPatch(setCardForm, 'ownerName', e.target.value)} /></label>
            <label><span>Cardholder Name</span><input value={cardForm.cardholderName} onChange={(e) => inputPatch(setCardForm, 'cardholderName', e.target.value)} /></label>
            <label><span>Card Bank</span><input required value={cardForm.bankName} onChange={(e) => inputPatch(setCardForm, 'bankName', e.target.value)} /></label>
            <label><span>Last 4</span><input inputMode="numeric" maxLength={4} value={cardForm.cardLast4} onChange={(e) => inputPatch(setCardForm, 'cardLast4', e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
            <label><span>Credit Limit</span><input inputMode="decimal" value={cardForm.creditLimit} onChange={(e) => inputPatch(setCardForm, 'creditLimit', formatMoneyInput(e.target.value))} /></label>
            <label><span>Current Balance</span><input inputMode="decimal" value={cardForm.currentBalance} onChange={(e) => inputPatch(setCardForm, 'currentBalance', formatMoneyInput(e.target.value))} /></label>
            <label><span>Minimum Payment</span><input inputMode="decimal" value={cardForm.minimumPayment} onChange={(e) => inputPatch(setCardForm, 'minimumPayment', formatMoneyInput(e.target.value))} /></label>
            <label><span>Due Date</span><input type="date" value={cardForm.dueDate} onChange={(e) => inputPatch(setCardForm, 'dueDate', e.target.value)} /></label>
            <label className="full"><span>Billing Address</span><input value={cardForm.billingAddressLine1} onChange={(e) => inputPatch(setCardForm, 'billingAddressLine1', e.target.value)} /></label>
            <label><span>City</span><input value={cardForm.billingCity} onChange={(e) => inputPatch(setCardForm, 'billingCity', e.target.value)} /></label>
            <label><span>State</span><input value={cardForm.billingState} onChange={(e) => inputPatch(setCardForm, 'billingState', e.target.value)} /></label>
            <label><span>ZIP</span><input value={cardForm.billingZip} onChange={(e) => inputPatch(setCardForm, 'billingZip', e.target.value)} /></label>
            <label><span>Login URL</span><input value={cardForm.loginUrl} onChange={(e) => inputPatch(setCardForm, 'loginUrl', e.target.value)} /></label>
            <label><span>Login Username</span><input value={cardForm.loginUsername} onChange={(e) => inputPatch(setCardForm, 'loginUsername', e.target.value)} /></label>
            <label><span>Login Password</span><input type="password" value={cardForm.loginPassword} onChange={(e) => inputPatch(setCardForm, 'loginPassword', e.target.value)} /></label>
            <label className="full"><span>Notes</span><textarea value={cardForm.notes} onChange={(e) => inputPatch(setCardForm, 'notes', e.target.value)} /></label>
            <button className="primary full" type="submit">Kartı Kaydet</button>
          </form>
        </section>
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">Cards</p><h3>Ödenecek Kartlar</h3></div></div>
          <div className="table-wrap"><table><thead><tr><th>Owner</th><th>Bank</th><th>Limit</th><th>Paid</th><th>Repay Due</th><th></th></tr></thead><tbody>{cards.map((card) => (
            <tr key={card.id}><td>{card.ownerName}</td><td>{card.bankName} {card.cardLast4 ? `••${card.cardLast4}` : ''}</td><td>{money(card.creditLimit)}</td><td>{money(card.totalPaid)}</td><td>{money(card.repaymentDueTotal)}</td><td><button className="ghost small" type="button" onClick={() => setSelected({ type: 'card', item: card })}>Open</button></td></tr>
          ))}</tbody></table></div>
        </section>
      </div>
    )
  }

  function renderPayments() {
    return (
      <div className="debt-grid">
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">Payment</p><h3>Ödeme Kaydı</h3></div></div>
          <form className="form-grid" onSubmit={submitPayment}>
            <label className="full"><span>Payable Card</span><select required value={paymentForm.debtCardId} onChange={(e) => inputPatch(setPaymentForm, 'debtCardId', e.target.value)}><option value="">Select card</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.ownerName} / {card.bankName} {card.cardLast4 ? `••${card.cardLast4}` : ''}</option>)}</select></label>
            <label><span>Payment Type</span><select value={paymentForm.paymentType} onChange={(e) => inputPatch(setPaymentForm, 'paymentType', e.target.value)}><option value="card_debt">Credit Card Debt</option><option value="ach_invoice">ACH Invoice</option></select></label>
            <label><span>Source</span><select value={paymentForm.sourceType} onChange={(e) => inputPatch(setPaymentForm, 'sourceType', e.target.value)}><option value="registered">Registered Account</option><option value="manual">Manual Entry</option></select></label>
            {paymentForm.sourceType === 'registered' ? (
              <label className="full"><span>Bank Account</span><select required value={paymentForm.fundingAccountId} onChange={(e) => inputPatch(setPaymentForm, 'fundingAccountId', e.target.value)}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.bankName} / {account.accountType} / {account.accountMasked}</option>)}</select></label>
            ) : (
              <>
                <label><span>Manual Bank</span><input value={paymentForm.manualBankName} onChange={(e) => inputPatch(setPaymentForm, 'manualBankName', e.target.value)} /></label>
                <label><span>Manual Account Last4</span><input maxLength={4} value={paymentForm.manualAccountLast4} onChange={(e) => inputPatch(setPaymentForm, 'manualAccountLast4', e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
              </>
            )}
            <label><span>Amount</span><input required inputMode="decimal" value={paymentForm.amount} onChange={(e) => inputPatch(setPaymentForm, 'amount', formatMoneyInput(e.target.value))} /></label>
            <label><span>Payment Date</span><input type="date" value={paymentForm.paymentDate} onChange={(e) => inputPatch(setPaymentForm, 'paymentDate', e.target.value)} /></label>
            <label><span>Status</span><select value={paymentForm.paymentStatus} onChange={(e) => inputPatch(setPaymentForm, 'paymentStatus', e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label>
            <label><span>Confirmation</span><input value={paymentForm.confirmationNumber} onChange={(e) => inputPatch(setPaymentForm, 'confirmationNumber', e.target.value)} /></label>
            <label><span>Expected Repayment</span><input inputMode="decimal" value={paymentForm.repaymentExpectedAmount} onChange={(e) => inputPatch(setPaymentForm, 'repaymentExpectedAmount', formatMoneyInput(e.target.value))} /></label>
            <label><span>Repayment Paid</span><input inputMode="decimal" value={paymentForm.repaymentPaidAmount} onChange={(e) => inputPatch(setPaymentForm, 'repaymentPaidAmount', formatMoneyInput(e.target.value))} /></label>
            <label><span>Repayment Status</span><select value={paymentForm.repaymentStatus} onChange={(e) => inputPatch(setPaymentForm, 'repaymentStatus', e.target.value)}><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="waived">Waived</option></select></label>
            <label><span>Repayment Date</span><input type="date" value={paymentForm.repaymentDate} onChange={(e) => inputPatch(setPaymentForm, 'repaymentDate', e.target.value)} /></label>
            <label className="full"><span>Notes</span><textarea value={paymentForm.notes} onChange={(e) => inputPatch(setPaymentForm, 'notes', e.target.value)} /></label>
            <button className="primary full" type="submit">Ödemeyi Kaydet</button>
          </form>
        </section>
        <PaymentTable payments={payments} onUpdate={updatePayment} />
      </div>
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-head">
          <div><p className="eyebrow">Debt Operations</p><h3>Card Payment Ledger</h3></div>
          <button className="ghost small" type="button" onClick={() => withLoader(loadAll, { label: 'Debt operations yenileniyor', variant: 'logs' })}>Refresh</button>
        </div>
        {renderSummary()}
      </section>
      <section className="panel"><div className="tabs">{tabs.map(([key, label]) => <button type="button" className={tab === key ? 'primary' : 'ghost'} key={key} onClick={() => setTab(key)}>{label}</button>)}</div></section>
      {tab === 'accounts' ? renderAccounts() : null}
      {tab === 'cards' ? renderCards() : null}
      {tab === 'payments' ? renderPayments() : null}
      {selected ? <DebtDetail selected={selected} payments={selectedPayments} onClose={() => setSelected(null)} onUpdatePayment={updatePayment} /> : null}
      {result ? <section className={`card result ${statusClass(result.status)}`}><div className="result-head"><strong>{result.message}</strong><span className={`pill ${statusClass(result.status)}`}>{result.status}</span></div></section> : null}
    </div>
  )
}

function PaymentTable({ payments, onUpdate, framed = true }) {
  return (
    <section className={framed ? 'panel' : 'debt-inline-table'}>
      <div className="section-head"><div><p className="eyebrow">Ledger</p><h3>Ödeme Kayıtları</h3></div></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Card</th><th>Source</th><th>Type</th><th>Amount</th><th>Status</th><th>Repay Due</th><th>Repay</th><th></th></tr></thead>
          <tbody>{payments.map((payment) => (
            <tr key={payment.id}>
              <td>{payment.paymentDate}</td>
              <td>{payment.card?.ownerName || '-'} / {payment.card?.bankName || '-'}</td>
              <td>{payment.sourceType === 'registered' ? payment.fundingAccount?.bankName : payment.fundingAccount?.bankName || 'Manual'}</td>
              <td>{payment.paymentType}</td>
              <td>{money(payment.amount)}</td>
              <td><span className={`pill ${statusClass(payment.paymentStatus)}`}>{payment.paymentStatus}</span></td>
              <td>{money(payment.repaymentDueAmount)}</td>
              <td><span className={`pill ${statusClass(payment.repaymentStatus)}`}>{payment.repaymentStatus}</span></td>
              <td className="row-actions">
                <button className="ghost small" type="button" onClick={() => onUpdate(payment, { paymentStatus: 'approved' })}>Approve</button>
                <button className="ghost small" type="button" onClick={() => onUpdate(payment, { repaymentPaidAmount: payment.repaymentExpectedAmount, repaymentStatus: 'paid', repaymentDate: new Date().toISOString().slice(0, 10) })}>Paid Back</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  )
}

function DebtDetail({ selected, payments, onClose, onUpdatePayment }) {
  const item = selected.item
  return (
    <section className="panel wide">
      <div className="section-head">
        <div><p className="eyebrow">{selected.type === 'account' ? 'Bank Account Detail' : 'Card Detail'}</p><h3>{selected.type === 'account' ? item.bankName : `${item.ownerName} / ${item.bankName}`}</h3></div>
        <button className="ghost small" type="button" onClick={onClose}>Kapat</button>
      </div>
      <div className="summary">
        {selected.type === 'account' ? (
          <>
            <div><span>Account</span><strong>{item.accountMasked}</strong></div>
            <div><span>Routing</span><strong>{item.routingMasked}</strong></div>
            <div><span>Type</span><strong>{item.accountType}</strong></div>
            <div><span>Total Paid</span><strong>{money(item.totalPaid)}</strong></div>
          </>
        ) : (
          <>
            <div><span>Card</span><strong>{item.cardLast4 ? `••${item.cardLast4}` : '-'}</strong></div>
            <div><span>Limit</span><strong>{money(item.creditLimit)}</strong></div>
            <div><span>Total Paid</span><strong>{money(item.totalPaid)}</strong></div>
            <div><span>Repayment Due</span><strong>{money(item.repaymentDueTotal)}</strong></div>
            <div><span>Login</span><strong>{item.loginUsername || (item.loginPasswordConfigured ? 'configured' : '-')}</strong></div>
            <div><span>Billing ZIP</span><strong>{item.billingZip || '-'}</strong></div>
          </>
        )}
      </div>
      <PaymentTable payments={payments} onUpdate={onUpdatePayment} framed={false} />
    </section>
  )
}
