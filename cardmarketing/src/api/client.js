export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
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
