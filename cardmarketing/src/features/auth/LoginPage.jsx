import { projectOptions } from '../../api/client'

export function LoginPage({ login, setLogin, error, onSubmit, projectKey, setProjectKey }) {
  const selectedProject = projectOptions.find((project) => project.key === projectKey) || projectOptions[0]

  return (
    <main className="login-screen">
      <section className="login-shell">
        <div className="login-brand">
          <p className="eyebrow">Secure Access</p>
          <h1>Joker Project Console</h1>
          <p className="login-copy">Tek kullanıcı hesabıyla yetkili olduğun projeye giriş yap.</p>
          <div className="login-project-grid">
            {projectOptions.map((project) => (
              <button
                className={`login-project ${project.key === selectedProject.key ? 'active' : ''}`}
                key={project.key}
                type="button"
                onClick={() => setProjectKey(project.key)}
              >
                <strong>{project.label}</strong>
                <span>{project.url.replace(/^https?:\/\//, '')}</span>
              </button>
            ))}
          </div>
        </div>
        <form className="panel login-card" onSubmit={onSubmit}>
          <p className="eyebrow">Login</p>
          <h2>{selectedProject.label}</h2>
          <label><span>Username</span><input value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} autoComplete="username" /></label>
          <label><span>Password</span><input value={login.password} type="password" onChange={(event) => setLogin({ ...login, password: event.target.value })} autoComplete="current-password" /></label>
          {error ? <div className="error">{error}</div> : null}
          <button className="primary" type="submit">Giriş Yap ve Yönlendir</button>
          <span className="muted">Hedef: {selectedProject.url}</span>
        </form>
      </section>
    </main>
  )
}
