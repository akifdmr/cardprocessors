const routes = [
  ['checkers', 'Card Checkers'],
  ['checked-cards', 'Checked Cards'],
  ['unchecked-cards', 'Unchecked Cards'],
  ['payment-processors', 'Payment Processors'],
  ['debt-management', 'Debt Ops'],
  ['cards', 'Cards'],
  ['services', 'Services'],
  ['perfect-generator', 'Perfect Generator'],
  ['ollama-chat', 'AI Chat'],
]

export function AppShell({ user, route, setRoute, onLogout, children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CardMarket</p>
          <h1>Payment Console</h1>
        </div>
        <div className="identity">
          <span>{user.displayName || user.username}</span>
          <strong>{user.role}</strong>
          <button className="ghost small" type="button" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <nav className="nav">
        {routes.map(([key, label]) => (
          <button type="button" className={route === key ? 'active' : ''} key={key} onClick={() => setRoute(key)}>{label}</button>
        ))}
      </nav>
      {children}
    </div>
  )
}
