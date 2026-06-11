export function LoginPage({ login, setLogin, error, onSubmit }) {
  return (
    <main className="login-screen">
      <form className="panel login-card" onSubmit={onSubmit}>
        <p className="eyebrow">CardMarket</p>
        <h1>Payment Console</h1>
        <label><span>Username</span><input value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} autoComplete="username" /></label>
        <label><span>Password</span><input value={login.password} type="password" onChange={(event) => setLogin({ ...login, password: event.target.value })} autoComplete="current-password" /></label>
        {error ? <div className="error">{error}</div> : null}
        <button className="primary" type="submit">Login</button>
      </form>
    </main>
  )
}
