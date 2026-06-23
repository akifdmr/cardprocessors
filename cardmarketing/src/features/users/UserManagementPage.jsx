import { useEffect, useMemo, useState } from 'react'
import { api, projectOptions } from '../../api/client'

const roles = ['admin', 'operator', 'customer']
const projects = projectOptions.map((project) => [project.key, project.label, project.url])

const roleDefaultPermissions = {
  admin: {
    canManageUsers: true,
    canCreateCards: true,
    canListCards: true,
    canCreateEnrollment: true,
    canViewEnrollment: true,
    canUpdateEnrollment: true,
    canRunLiveCheck: true,
    canRunBinCheck: true,
    canRunBalanceCheck: true,
    canViewBalance: true,
    canRunAuthCheck: true,
    canRunProcessorActions: true,
    canViewProcessorDebug: true,
  },
  operator: {
    canManageUsers: false,
    canCreateCards: true,
    canListCards: true,
    canCreateEnrollment: true,
    canViewEnrollment: false,
    canUpdateEnrollment: false,
    canRunLiveCheck: true,
    canRunBinCheck: true,
    canRunBalanceCheck: true,
    canViewBalance: false,
    canRunAuthCheck: false,
    canRunProcessorActions: false,
    canViewProcessorDebug: false,
  },
  customer: {
    canManageUsers: false,
    canCreateCards: true,
    canListCards: true,
    canCreateEnrollment: false,
    canViewEnrollment: false,
    canUpdateEnrollment: false,
    canRunLiveCheck: false,
    canRunBinCheck: false,
    canRunBalanceCheck: false,
    canViewBalance: false,
    canRunAuthCheck: false,
    canRunProcessorActions: false,
    canViewProcessorDebug: false,
  },
}

const permissionGroups = [
  {
    title: 'Yönetim',
    items: [
      ['canManageUsers', 'Kullanıcı yönetimi'],
      ['canListCards', 'Kart listeleme'],
      ['canCreateCards', 'Kart ekleme'],
    ],
  },
  {
    title: 'Checker',
    items: [
      ['canRunBinCheck', 'BIN check'],
      ['canRunLiveCheck', 'Live check'],
      ['canRunAuthCheck', 'Auth / provizyon'],
      ['canRunBalanceCheck', 'Balance check'],
      ['canViewBalance', 'Balance görüntüleme'],
    ],
  },
  {
    title: 'Enrollment',
    items: [
      ['canCreateEnrollment', 'Enrollment oluşturma'],
      ['canViewEnrollment', 'Enrollment görüntüleme'],
      ['canUpdateEnrollment', 'Enrollment güncelleme'],
    ],
  },
  {
    title: 'Processor',
    items: [
      ['canRunProcessorActions', 'Processor action'],
      ['canViewProcessorDebug', 'Debug görüntüleme'],
    ],
  },
]

function defaultPermissionsForRole(role) {
  return { ...(roleDefaultPermissions[role] || roleDefaultPermissions.operator) }
}

function defaultProjectPermissionsForRole(role) {
  return Object.fromEntries(projects.map(([key]) => [key, defaultPermissionsForRole(role)]))
}

const rolePermissions = {
  admin: [
    'Kullanıcı ve rol yönetimi',
    'Kart ekleme ve listeleme',
    'Live, BIN, balance ve auth check',
    'Processor action ve debug görüntüleme',
  ],
  operator: [
    'Kart ekleme ve listeleme',
    'Live check ve BIN check',
    'Enrollment oluşturma',
    'Balance, auth ve processor action kapalı',
  ],
  customer: [
    'Kart ekleme ve listeleme',
    'Balance yetkisi kullanıcı bazında açılır',
    'Live, auth ve processor action kapalı',
  ],
}

const emptyUser = {
  username: '',
  password: '',
  displayName: '',
  role: 'operator',
  canBalanceCheck: false,
  canViewBalance: false,
  permissionOverrides: defaultPermissionsForRole('operator'),
  projectPermissions: defaultProjectPermissionsForRole('operator'),
  isActive: true,
}

function toFormUser(user) {
  const role = user.role || 'operator'
  const permissionOverrides = {
    ...defaultPermissionsForRole(role),
    ...(user.permission_overrides || {}),
  }
  const projectPermissions = Object.fromEntries(projects.map(([projectKey]) => [
    projectKey,
    {
      ...permissionOverrides,
      ...(user.project_permissions?.[projectKey] || {}),
    },
  ]))
  return {
    displayName: user.display_name || '',
    role,
    canBalanceCheck: Boolean(user.can_balance_check),
    canViewBalance: Boolean(user.can_view_balance),
    permissionOverrides,
    projectPermissions,
    isActive: user.is_active !== false,
  }
}

function PermissionMatrix({ value, disabled = false, onChange }) {
  return (
    <div className="permission-matrix">
      {permissionGroups.map((group) => (
        <div className="permission-group" key={group.title}>
          <strong>{group.title}</strong>
          {group.items.map(([key, label]) => (
            <label className="inline-check" key={key}>
              <input
                type="checkbox"
                checked={Boolean(value?.[key])}
                disabled={disabled}
                onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

function ProjectPermissionMatrix({ value, disabled = false, onChange }) {
  return (
    <div className="project-permission-grid">
      {projects.map(([projectKey, label, url]) => (
        <div className="project-permission-card" key={projectKey}>
          <strong>{label}</strong>
          <span className="muted">{url}</span>
          <PermissionMatrix
            value={value?.[projectKey] || {}}
            disabled={disabled}
            onChange={(permissions) => onChange({ ...value, [projectKey]: permissions })}
          />
        </div>
      ))}
    </div>
  )
}

function UserRow({ user, currentUserId, onSave, onPassword }) {
  const [form, setForm] = useState(() => toFormUser(user))
  const [password, setPassword] = useState('')
  const isSelf = user.id === currentUserId

  useEffect(() => {
    setForm(toFormUser(user))
  }, [user])

  return (
    <tr>
      <td>
        <strong>{user.username}</strong>
        <span className="muted block">{user.display_name || '-'}</span>
      </td>
      <td><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></td>
      <td>
        <select
          value={form.role}
          disabled={isSelf}
          onChange={(event) => {
            const role = event.target.value
            setForm({
              ...form,
              role,
              permissionOverrides: defaultPermissionsForRole(role),
              projectPermissions: defaultProjectPermissionsForRole(role),
            })
          }}
        >
          {roles.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      </td>
      <td>
        <PermissionMatrix
          value={form.permissionOverrides}
          disabled={form.role === 'admin'}
          onChange={(permissionOverrides) => setForm({
            ...form,
            permissionOverrides,
            canBalanceCheck: permissionOverrides.canRunBalanceCheck,
            canViewBalance: permissionOverrides.canViewBalance,
          })}
        />
        <span className="field-label block">Proje bazlı yetkiler</span>
        <ProjectPermissionMatrix
          value={form.projectPermissions}
          disabled={form.role === 'admin'}
          onChange={(projectPermissions) => setForm({ ...form, projectPermissions })}
        />
      </td>
      <td>
        <label className="inline-check">
          <input type="checkbox" checked={form.isActive} disabled={isSelf} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
          Aktif
        </label>
      </td>
      <td className="user-password-cell">
        <input type="password" value={password} placeholder="Yeni şifre" onChange={(event) => setPassword(event.target.value)} />
        <button className="ghost small" type="button" disabled={password.length < 8} onClick={() => onPassword(user.id, password).then(() => setPassword(''))}>Şifre</button>
      </td>
      <td>
        <button className="primary small" type="button" onClick={() => onSave(user.id, form)}>Kaydet</button>
      </td>
    </tr>
  )
}

export function UserManagementPage({ user, runAction }) {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyUser)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const withLoader = runAction || ((task) => task())
  const activeUsers = useMemo(() => users.filter((item) => item.is_active !== false).length, [users])

  async function loadUsers() {
    setUsers(await api('/users'))
  }

  useEffect(() => {
    loadUsers().catch((loadError) => setError(loadError.message))
  }, [])

  async function submitUser(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await withLoader(async () => {
        await api('/users', { method: 'POST', body: JSON.stringify(form) })
        setForm(emptyUser)
        await loadUsers()
        setNotice('Kullanıcı oluşturuldu.')
      }, { label: 'Kullanıcı oluşturuluyor', variant: 'login', detail: 'Rol ve yetki bilgileri kaydediliyor' })
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function saveUser(userId, payload) {
    setError('')
    setNotice('')
    try {
      await withLoader(async () => {
        await api(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        await loadUsers()
        setNotice('Kullanıcı güncellendi.')
      }, { label: 'Kullanıcı güncelleniyor', variant: 'login', detail: 'Rol, durum ve yetki bilgileri yazılıyor' })
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  async function savePassword(userId, password) {
    setError('')
    setNotice('')
    try {
      await withLoader(async () => {
        await api(`/users/${userId}/password`, { method: 'POST', body: JSON.stringify({ password }) })
        setNotice('Şifre güncellendi.')
      }, { label: 'Şifre güncelleniyor', variant: 'login', detail: 'Yeni parola hashlenip kullanıcıya atanıyor' })
    } catch (passwordError) {
      setError(passwordError.message)
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">User Management</p>
            <h3>Kullanıcı, Rol ve Yetki Yönetimi</h3>
          </div>
          <button className="ghost small" type="button" onClick={() => withLoader(loadUsers, { label: 'Kullanıcılar yenileniyor', variant: 'logs' })}>Yenile</button>
        </div>
        <div className="summary user-summary">
          <div><span>Toplam</span><strong>{users.length}</strong></div>
          <div><span>Aktif</span><strong>{activeUsers}</strong></div>
          <div><span>Admin</span><strong>{users.filter((item) => item.role === 'admin').length}</strong></div>
          <div><span>Oturum</span><strong>{user.username}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Create User</p>
            <h3>Yeni Kullanıcı Ekle</h3>
          </div>
        </div>
        <form className="form-grid user-create-form" onSubmit={submitUser}>
          <label><span>Username</span><input required value={form.username} autoComplete="off" onChange={(event) => setForm({ ...form, username: event.target.value.trim() })} /></label>
          <label><span>Display name</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <label><span>Password</span><input required minLength="8" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          <label>
            <span>Role</span>
            <select
              value={form.role}
              onChange={(event) => {
                const role = event.target.value
                setForm({
                  ...form,
                  role,
                  permissionOverrides: defaultPermissionsForRole(role),
                  projectPermissions: defaultProjectPermissionsForRole(role),
                  canBalanceCheck: roleDefaultPermissions[role]?.canRunBalanceCheck || false,
                  canViewBalance: roleDefaultPermissions[role]?.canViewBalance || false,
                })
              }}
            >
              {roles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <div className="full">
            <span className="field-label">İşlem yetkileri</span>
            <PermissionMatrix
              value={form.permissionOverrides}
              disabled={form.role === 'admin'}
              onChange={(permissionOverrides) => setForm({
                ...form,
                permissionOverrides,
                canBalanceCheck: permissionOverrides.canRunBalanceCheck,
                canViewBalance: permissionOverrides.canViewBalance,
              })}
            />
            <span className="field-label block">Proje bazlı yetkiler</span>
            <ProjectPermissionMatrix
              value={form.projectPermissions}
              disabled={form.role === 'admin'}
              onChange={(projectPermissions) => setForm({ ...form, projectPermissions })}
            />
          </div>
          <label className="inline-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Aktif kullanıcı</label>
          <button className="primary" type="submit">Kullanıcı Ekle</button>
        </form>
        {error ? <div className="card result bad"><strong>{error}</strong></div> : null}
        {notice ? <div className="card result good"><strong>{notice}</strong></div> : null}
      </section>

      <section className="panel wide">
        <div className="section-head">
          <div>
            <p className="eyebrow">Roles</p>
            <h3>Rol Yetki Matrisi</h3>
          </div>
        </div>
        <div className="role-grid">
          {roles.map((role) => (
            <article className="role-card" key={role}>
              <h4>{role}</h4>
              {rolePermissions[role].map((item) => <span key={item}>{item}</span>)}
            </article>
          ))}
        </div>
      </section>

      <section className="panel wide">
        <div className="section-head">
          <div>
            <p className="eyebrow">Users</p>
            <h3>Kullanıcı Listesi</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table className="user-management-table">
            <thead>
              <tr>
                <th>Kullanıcı</th>
                <th>Display</th>
                <th>Rol</th>
                <th>İşlem Yetkileri</th>
                <th>Durum</th>
                <th>Şifre Reset</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <UserRow key={item.id} user={item} currentUserId={user.id} onSave={saveUser} onPassword={savePassword} />
              ))}
              {!users.length ? <tr><td colSpan="7" className="muted">Kullanıcı bulunamadı.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
