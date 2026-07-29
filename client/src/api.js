async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options
  })

  if (!res.ok) {
    let message = `Fehler ${res.status}`
    try {
      const data = await res.json()
      message = data.error || message
    } catch {
      // Antwort ohne JSON-Body
    }
    throw new Error(message)
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  me: () => request('/me'),
  login: (password) => request('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  createFamily: (name, password) =>
    request('/families', { method: 'POST', body: JSON.stringify({ name, password }) }),
  logout: () => request('/logout', { method: 'POST' }),

  listDogs: () => request('/dogs'),
  listAllDogs: () => request('/dogs/all'),
  getDog: (id) => request(`/dogs/${id}`),
  createDog: (payload) => request('/dogs', { method: 'POST', body: JSON.stringify(payload) }),
  updateDog: (id, payload) => request(`/dogs/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  listTimeline: (dogId) => request(`/timeline${dogId ? `?dogId=${dogId}` : ''}`),
  createTimelineEntry: (payload) => request('/timeline', { method: 'POST', body: JSON.stringify(payload) }),

  listBreedingEvents: () => request('/breeding'),
  createBreedingEvent: (payload) => request('/breeding', { method: 'POST', body: JSON.stringify(payload) }),

  upload: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return request('/uploads', { method: 'POST', body: formData })
  }
}
