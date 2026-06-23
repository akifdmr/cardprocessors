const PROJECT_STORAGE_KEY = 'cardmarket.projectKey'
const DEFAULT_PROJECT_KEY = 'jokerpayment'

export function getActiveProjectKey() {
  return localStorage.getItem(PROJECT_STORAGE_KEY) || DEFAULT_PROJECT_KEY
}

export function setActiveProjectKey(projectKey) {
  localStorage.setItem(PROJECT_STORAGE_KEY, projectKey || DEFAULT_PROJECT_KEY)
}

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Project-Key': getActiveProjectKey(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''
  let data = null
  if (text && contentType.includes('application/json')) {
    data = JSON.parse(text)
  } else if (text) {
    const error = new Error(`API JSON yerine ${contentType || 'bilinmeyen'} cevap döndürdü: ${response.status} ${response.statusText}`)
    error.status = response.status
    error.responseText = text.slice(0, 500)
    throw error
  }
  if (!response.ok) {
    const error = new Error(data?.failureReason || data?.responseMessage || data?.error || 'Request failed')
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export function toQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value)
    }
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}
