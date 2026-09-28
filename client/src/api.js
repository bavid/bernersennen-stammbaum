export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message)
    this.status = status
    this.details = details
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
    let details = {}
    try {
      details = await res.json()
      message = details.error || message
    } catch {
      // Antwort ohne JSON-Body
    }
    if (res.status === 401 && !path.startsWith('/admin') && path !== '/me' && path !== '/login') onUnauthorized()
    throw new ApiError(message, res.status, details)
  }

  if (res.status === 204) return null
  return res.json()
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })

export const api = {
  config: () => request('/config'),
  me: () => request('/me'),
  login: (secret) => request('/login', json('POST', { secret })),
  loginUser: (username, password) => request('/login', json('POST', { username, password })),
  // as: 'tierheim' (Phase T Task 6) loggt ins Demo-Tierheim statt ins Demo-Zuhause ein - siehe
  // PartnerPortalPage "Demo als Tierheim ansehen".
  demo: ({ as } = {}) => request('/demo', json('POST', as ? { as } : {})),
  logout: () => request('/logout', { method: 'POST' }),
  renameFamily: (name) => request('/family', json('PUT', { name })),
  updateFamily: (payload) => request('/family', json('PUT', payload)),

  // Öffentlich, ohne Session: Partnerliste (/partner) und Partner-Portal (/p/:slug).
  // Mit plz: POST mit Body statt Query-String, damit die PLZ nicht im Server-/Proxy-Zugriffslog landet
  // (der Server prüft `demo` weiterhin nur als Query-Parameter, s. server/routes/partners.js demoAllowed).
  // Ohne plz bleibt es die bisherige GET-Liste aller aktiven Partner.
  publicPartners: ({ plz, radius, demo } = {}) => {
    if (plz) {
      const qs = demo ? `?${new URLSearchParams({ demo }).toString()}` : ''
      return request(`/public/partners/near${qs}`, json('POST', { plz, radius }))
    }
    const qs = demo ? `?${new URLSearchParams({ demo }).toString()}` : ''
    return request(`/public/partners${qs}`)
  },
  publicPartner: (slug) => request(`/public/partners/${encodeURIComponent(slug)}`),
  // Karten-Daten für die Vermittlungs-Sektion auf dem Portal (Phase T Task 5). demo wie publicPartners:
  // Query-Parameter '1', nur wenn das Portal selbst mit ?demo=1 geladen wurde (siehe PartnerPortalPage).
  publicPartnerAnimals: (slug, { demo } = {}) => {
    const qs = demo ? `?${new URLSearchParams({ demo }).toString()}` : ''
    return request(`/public/partners/${encodeURIComponent(slug)}/animals${qs}`)
  },
  // Öffentlicher Steckbrief eines Tiers (/t/:slug) - kein Login, immer noindex (siehe SteckbriefPage).
  publicAnimal: (slug) => request(`/public/animals/${encodeURIComponent(slug)}`),
  // Happy Ends (Phase T Task 6): bis zu 6 vermittelte Tiere mit Einwilligung ihrer neuen Familie, für
  // die Sektion "Happy Ends" auf dem Portal. demo wie publicPartnerAnimals oben.
  publicHappyEnds: (slug, { demo } = {}) => {
    const qs = demo ? `?${new URLSearchParams({ demo }).toString()}` : ''
    return request(`/public/partners/${encodeURIComponent(slug)}/happy-ends${qs}`)
  },

  // "In der Nähe" (/umgebung, angemeldet): location ist { plz } oder { lat, lon }, nie beides.
  searchPlaces: (location, radius) => request('/places/search', json('POST', { ...location, radius })),

  checkVoucher: (code) => request('/vouchers/check', json('POST', { code })),
  redeemVoucher: (payload) => request('/vouchers/redeem', json('POST', payload)),
  // Übergabe-Gutschein ohne neues Zuhause einlösen (Phase T Task 5): nur eingeloggt, aus dem eigenen
  // Zuhause heraus (siehe App.jsx VoucherSessionCard) - liefert { dogId }.
  claimVoucher: (payload) => request('/vouchers/claim', json('POST', payload)),
  recover: (payload) => request('/recover', json('POST', payload)),
  myVouchers: () => request('/vouchers/mine'),
  // payload trägt den aktuellen Berechtigungsnachweis (currentKey/currentPassword/password je nach
  // Sitzungsart, siehe AccessSettings) - ohne ihn lehnt der Server mit 403 ab (Schutz vor Übernahme
  // einer fremden Sitzung).
  renewKey: (payload) => request('/family/key', json('POST', payload)),
  listUsers: () => request('/users'),
  createUser: (payload) => request('/users', json('POST', payload)),
  deleteUser: (id, payload) => request(`/users/${id}`, json('DELETE', payload)),

  view: (familyId) => request('/view', json('POST', { familyId })),
  joinFamily: (password) => request('/families/join', json('POST', { password })),
  createGroup: (payload) => request('/families/group', json('POST', payload)),
  leaveFamily: (id) => request(`/memberships/${id}`, { method: 'DELETE' }),

  listDogs: () => request('/dogs'),
  listAllDogs: () => request('/dogs/all'),
  getDog: (id) => request(`/dogs/${id}`),
  createDog: (payload) => request('/dogs', json('POST', payload)),
  updateDog: (id, payload) => request(`/dogs/${id}`, json('PUT', payload)),
  deleteDog: (id) => request(`/dogs/${id}`, { method: 'DELETE' }),
  listLinks: () => request('/dogs/links'),
  addHousemate: (dogId, otherDogId) => request(`/dogs/${dogId}/housemates`, json('POST', { otherDogId })),
  removeHousemate: (dogId, otherDogId) => request(`/dogs/${dogId}/housemates/${otherDogId}`, { method: 'DELETE' }),
  setDogShares: (id, familyIds) => request(`/dogs/${id}/shares`, json('PUT', { familyIds })),

  // Phase T – Tierheim: Steckbrief veröffentlichen/zurückziehen und Übergabe-Gutschein erzeugen.
  setSteckbrief: (id, published) => request(`/dogs/${id}/steckbrief`, json('PUT', { published })),
  createHandover: (id) => request(`/dogs/${id}/handover`, { method: 'POST' }),
  // Übergabe zurückziehen (Phase T Task 6): zieht offene Übergabe-Gutscheine zurück und setzt den
  // Status wieder auf "in Vermittlung", falls er noch "reserviert" war - siehe DogDetailPage.
  withdrawHandover: (id) => request(`/dogs/${id}/handover`, { method: 'DELETE' }),
  // Einwilligung "Tierheim darf mitlesen" (Phase T Task 5, Besitzer-Zuhause) - siehe ShelterSharePanel.
  setShelterShare: (id, payload) => request(`/dogs/${id}/shelter-share`, json('PUT', payload)),

  listTimeline: (dogId) => request(`/timeline${dogId ? `?dogId=${encodeURIComponent(dogId)}` : ''}`),
  createTimelineEntry: (payload) => request('/timeline', json('POST', payload)),
  updateTimelineEntry: (id, payload) => request(`/timeline/${id}`, json('PUT', payload)),
  deleteTimelineEntry: (id) => request(`/timeline/${id}`, { method: 'DELETE' }),

  recentActivity: (limit = 5) => request(`/timeline/recent?limit=${limit}`),

  sendMessage: (payload) => request('/messages', json('POST', payload)),

  listNotes: () => request('/notes'),
  createNote: (payload) => request('/notes', json('POST', payload)),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  createReply: (noteId, payload) => request(`/notes/${noteId}/replies`, json('POST', payload)),
  deleteReply: (noteId, replyId) => request(`/notes/${noteId}/replies/${replyId}`, { method: 'DELETE' }),
  addComment: (entryId, payload) => request(`/timeline/${entryId}/comments`, json('POST', payload)),
  deleteComment: (entryId, commentId) => request(`/timeline/${entryId}/comments/${commentId}`, { method: 'DELETE' }),

  admin: {
    me: () => request('/admin/me'),
    login: (username, password) => request('/admin/login', json('POST', { username, password })),
    logout: () => request('/admin/logout', { method: 'POST' }),
    overview: () => request('/admin/overview'),
    family: (id) => request(`/admin/families/${id}`),
    messages: ({ type = '', status = '' } = {}) =>
      request(`/admin/messages?${new URLSearchParams({ type, status }).toString()}`),
    updateMessage: (id, status) => request(`/admin/messages/${id}`, json('PATCH', { status })),
    deleteMessage: (id) => request(`/admin/messages/${id}`, { method: 'DELETE' }),
    voucherBatches: () => request('/admin/voucher-batches'),
    createVoucherBatch: (payload) => request('/admin/voucher-batches', json('POST', payload)),
    voucherBatch: (id) => request(`/admin/voucher-batches/${id}`),
    revokeVoucher: (id) => request(`/admin/vouchers/${id}/revoke`, { method: 'POST' }),

    // Partner pflegen (Task 7, AdminPartners) - volle Zeilen (snake_case), anders als publicPartner(s) oben.
    partners: () => request('/admin/partners'),
    createPartner: (payload) => request('/admin/partners', json('POST', payload)),
    updatePartner: (id, payload) => request(`/admin/partners/${id}`, json('PUT', payload)),
    deletePartner: (id) => request(`/admin/partners/${id}`, { method: 'DELETE' }),
    uploadPartnerLogo: (id, file) => {
      const formData = new FormData()
      formData.append('file', file)
      return request(`/admin/partners/${id}/logo`, { method: 'POST', body: formData })
    }
  },

  listBreedingEvents: () => request('/breeding'),
  createBreedingEvent: (payload) => request('/breeding', json('POST', payload)),
  deleteBreedingEvent: (id) => request(`/breeding/${id}`, { method: 'DELETE' }),

  upload: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return request('/uploads', { method: 'POST', body: formData })
  }
}
