const routes = [
  ['checkers', 'Card Checkers'],
  ['unchecked-cards', 'Unchecked Cards'],
  ['payment-processors', 'Payment Processors'],
  ['debt-management', 'Debt Ops'],
  ['cards', 'Cards'],
  ['services', 'Services'],
  ['user-management', 'Users', 'canManageUsers'],
  ['perfect-generator', 'Perfect Generator'],
  ['ollama-chat', 'AI Chat'],
]

const projectOptions = [
  ['jokerpayment', 'Joker Payment'],
  ['balanceChecker', 'Balance Checker'],
  ['loginpanelchecker', 'Login Panel Checker'],
]

export function AppShell({ user, route, setRoute, projectKey, onProjectChange, onLogout, children }) {
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
          <select value={projectKey || user.projectKey || 'jokerpayment'} onChange={(event) => onProjectChange(event.target.value)}>
            {projectOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button className="ghost small" type="button" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <nav className="nav">
        {routes.filter(([, , permission]) => !permission || user.permissions?.[permission]).map(([key, label]) => (
          <button type="button" className={route === key ? 'active' : ''} key={key} onClick={() => setRoute(key)}>{label}</button>
        ))}
      </nav>
      {children}
    </div>
  )
}
