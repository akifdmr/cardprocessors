import { projectOptions } from '../../api/client'

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

export function AppShell({ user, route, setRoute, projectKey, onProjectChange, onLogout, children }) {
  const activeProject = projectOptions.find((project) => project.key === (projectKey || user.projectKey))
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
            {projectOptions.map((project) => <option key={project.key} value={project.key}>{project.label}</option>)}
          </select>
          {activeProject?.url ? <a className="ghost small" href={activeProject.url} target="_blank" rel="noreferrer">Aç</a> : null}
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
