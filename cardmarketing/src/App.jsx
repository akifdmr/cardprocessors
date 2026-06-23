import { useEffect, useState } from 'react'
import { api, getActiveProjectKey, setActiveProjectKey } from './api/client'
import './App.css'
import { ActionLoader } from './components/common/ActionLoader'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { CardsPage } from './features/cards/CardsPage'
import { CheckersPage } from './features/checkers/CheckersPage'
import { UncheckedCardsPage } from './features/unchecked/UncheckedCardsPage'
import { PaymentProcessorsPage } from './features/processors/PaymentProcessorsPage'
import { DebtManagementPage } from './features/debt/DebtManagementPage'
import { ServicesPage } from './features/services/ServicesPage'
import { UserManagementPage } from './features/users/UserManagementPage'
// Yeni sayfalar
import { PerfectGeneratorPage } from './features/checkers/PerfectGeneratorPage'
import { OllamaChatPage } from './features/ollamaChat/OllamaChatPage'

export default function App() {
  const [route, setRoute] = useState('checkers')
  const [projectKey, setProjectKeyState] = useState(getActiveProjectKey())
  const [user, setUser] = useState(null)
  const [login, setLogin] = useState({ username: 'admin', password: '' })
  const [loginError, setLoginError] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('İşlem yapılıyor')
  const [busyVariant, setBusyVariant] = useState('default')
  const [busyDetail, setBusyDetail] = useState('')
  const [cards, setCards] = useState([])
  const [catalog, setCatalog] = useState(null)
  const [refreshSignal, setRefreshSignal] = useState(0)

  async function run(task, loader = 'İşlem yapılıyor') {
    const meta = typeof loader === 'object' && loader !== null
      ? loader
      : { label: loader }
    setBusyLabel(meta.label || 'İşlem yapılıyor')
    setBusyVariant(meta.variant || 'default')
    setBusyDetail(meta.detail || '')
    setBusy(true)
    try {
      return await task()
    } finally {
      setBusy(false)
    }
  }

  async function loadCards() {
    setCards(await api('/cards'))
  }

  async function loadCatalog() {
    setCatalog(await api('/provider-operations/catalog'))
  }

  async function loadBaseData() {
    await Promise.all([loadCards(), loadCatalog()])
    setRefreshSignal((value) => value + 1)
  }

  useEffect(() => {
    run(async () => {
      try {
        const me = await api('/auth/me')
        setUser(me)
        await loadBaseData()
      } catch {
        setUser(null)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitLogin(event) {
    event.preventDefault()
    setLoginError('')
    await run(async () => {
      try {
        const response = await api('/auth/login', { method: 'POST', body: JSON.stringify(login) })
        if (!response?.user) {
          throw new Error(response?.error || response?.responseMessage || 'Login cevabı kullanıcı bilgisi içermiyor.')
        }
        setUser(response.user)
        await loadBaseData()
      } catch (error) {
        setLoginError(error.message)
      }
    }, { label: 'Oturum açılıyor', variant: 'login', detail: 'Kullanıcı ve panel verileri yükleniyor' })
  }

  async function changeProject(nextProjectKey) {
    setActiveProjectKey(nextProjectKey)
    setProjectKeyState(nextProjectKey)
    await run(async () => {
      const me = await api('/auth/me')
      setUser(me)
      await loadBaseData()
      if (route === 'user-management' && !me.permissions?.canManageUsers) {
        setRoute('checkers')
      }
    }, { label: 'Proje değiştiriliyor', variant: 'logs', detail: 'Aktif yetkiler yeniden yükleniyor' })
  }

  async function logout() {
    await run(async () => {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
    }, { label: 'Oturum kapatılıyor', variant: 'login', detail: 'Aktif session sonlandırılıyor' })
  }

  async function refreshCards() {
    await run(async () => {
      await loadCards()
      setRefreshSignal((value) => value + 1)
    }, { label: 'Kart listesi yenileniyor', variant: 'cards', detail: 'Kayıtlar ve işlem durumları güncelleniyor' })
  }

  if (!user) {
    return (
      <>
        <LoginPage login={login} setLogin={setLogin} error={loginError} onSubmit={submitLogin} />
        <ActionLoader active={busy} label={busyLabel} variant={busyVariant} detail={busyDetail} />
      </>
    )
  }

  return (
    <>
      <AppShell user={user} route={route} setRoute={setRoute} projectKey={projectKey} onProjectChange={changeProject} onLogout={logout}>
        {route === 'checkers' && <CheckersPage cards={cards} onRefreshCards={refreshCards} runAction={run} />}
        {route === 'unchecked-cards' && <UncheckedCardsPage user={user} runAction={run} />}
        {route === 'payment-processors' && (
          <PaymentProcessorsPage cards={cards} catalog={catalog} refreshSignal={refreshSignal} runAction={run} />
        )}
        {route === 'debt-management' && <DebtManagementPage runAction={run} />}
        {route === 'cards' && <CardsPage cards={cards} onRefreshCards={refreshCards} runAction={run} />}
        {route === 'services' && <ServicesPage runAction={run} />}
        {route === 'user-management' && user.permissions?.canManageUsers && <UserManagementPage user={user} runAction={run} />}
        {route === 'perfect-generator' && <PerfectGeneratorPage runAction={run} />}
        {route === 'ollama-chat' && <OllamaChatPage runAction={run} />}
      </AppShell>
      <ActionLoader active={busy} label={busyLabel} variant={busyVariant} detail={busyDetail} />
    </>
  )
}
