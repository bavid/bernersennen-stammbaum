export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

let onUnauthorized = () => {}

// App registriert hier, was bei abgelaufener Session passieren soll (zurück zum Login).
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      ...options
    })
  } catch {
    throw new ApiError('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.', 0)
  }

  if (!res.ok) {
    let message = `Fehler ${res.status}`
    try {
      const data = await res.json()
      message = data.error || message
    } catch {
      // Antwort ohne JSON-Body
    }
    if (res.status === 401 && path !== '/me' && path !== '/login') onUnauthorized()
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return null
  return res.json()
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })

export const api = {
  config: () => request('/config'),
  me: () => request('/me'),
  login: (password) => request('/login', json('POST', { password })),
  createFamily: (payload) => request('/families', json('POST', payload)),
  logout: () => request('/logout', { method: 'POST' }),

  listDogs: () => request('/dogs'),
  listAllDogs: () => request('/dogs/all'),
  getDog: (id) => request(`/dogs/${id}`),
  createDog: (payload) => request('/dogs', json('POST', payload)),
  updateDog: (id, payload) => request(`/dogs/${id}`, json('PUT', payload)),
  deleteDog: (id) => request(`/dogs/${id}`, { method: 'DELETE' }),

  listTimeline: (dogId) => request(`/timeline${dogId ? `?dogId=${encodeURIComponent(dogId)}` : ''}`),
  createTimelineEntry: (payload) => request('/timeline', json('POST', payload)),
  updateTimelineEntry: (id, payload) => request(`/timeline/${id}`, json('PUT', payload)),
  deleteTimelineEntry: (id) => request(`/timeline/${id}`, { method: 'DELETE' }),

  recentActivity: (limit = 5) => request(`/timeline/recent?limit=${limit}`),

  listNotes: () => request('/notes'),
  createNote: (payload) => request('/notes', json('POST', payload)),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),

  listBreedingEvents: () => request('/breeding'),
  createBreedingEvent: (payload) => request('/breeding', json('POST', payload)),
  deleteBreedingEvent: (id) => request(`/breeding/${id}`, { method: 'DELETE' }),

  upload: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return request('/uploads', { method: 'POST', body: formData })
  }
}
