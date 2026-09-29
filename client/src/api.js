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
  // as: 'tierheim' (Phase T Task 6) loggt ins Demo-Tierheim statt ins Demo-Zuhause ein, as: 'partner' mit
  // slug (Phase P1) in den Demo-Partner-Bereich dieses Partners - siehe PortalAction (Demo-Knöpfe).
  demo: ({ as, slug } = {}) => request('/demo', json('POST', as ? { as, ...(slug ? { slug } : {}) } : {})),
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
  // Beiträge des Partners fürs Portal (Phase P2): nur freigegebene, als Karten wie in "Entdecken" (mit
  // kennzeichnung und clickUrl). demo wie publicPartnerAnimals.
  publicPartnerPosts: (slug, { demo } = {}) => {
    const qs = demo ? `?${new URLSearchParams({ demo }).toString()}` : ''
    return request(`/public/partners/${encodeURIComponent(slug)}/posts${qs}`)
  },
  // "Schreib uns" (Phase P2): payload { name?, email?, telefon?, nachricht, bezugSlug?, website } - website
  // ist der Honigtopf. demo wie oben, damit ein Demo-Portal (?demo=1) die Demo-Meldung (403) statt 404 bekommt.
  contactPartner: (slug, payload, { demo } = {}) => {
    const qs = demo ? `?${new URLSearchParams({ demo }).toString()}` : ''
    return request(`/public/partners/${encodeURIComponent(slug)}/contact${qs}`, json('POST', payload))
  },
  // Anfragen (Phase N, server/routes/anfragen.js): "Noch keinen Gutschein?" (typ 'gutschein') und "Partner-Zugang
  // anfragen" (typ 'partner'). payload { typ, name?, email, nachricht?, firma?, partnerTyp?, plz?, website } - website
  // ist der Honigtopf. Antwort 201 { ok: true } (nie ein Echo), auch aus einer Demo-Sitzung.
  sendAnfrage: (payload) => request('/public/anfragen', json('POST', payload)),
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
  // Reiter "Entdecken" (Phase 3): alle vier Abschnitte in einer Antwort. Die PLZ steht wie bei
  // publicPartners im Body, nie in der URL; ohne PLZ liefert der Server alles, nach Name sortiert.
  discover: ({ plz, radius } = {}) => request('/discover', json('POST', plz ? { plz, radius } : {})),

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

  // Mitglieder einer Familie (Phase R, server/routes/members.js) - nur wenn der aktive Bereich eine Familie
  // ist. Die Antwort { familyId, name, ichBin, mitglieder, einladungen? } kommt von GET wie von jeder
  // Änderung zurück; Entfernen/Widerrufen antworten mit 204.
  familyMembers: () => request('/family/members'),
  setMemberRole: (homeId, rolle) => request(`/family/members/${homeId}`, json('PUT', { rolle })),
  removeMember: (homeId) => request(`/family/members/${homeId}`, { method: 'DELETE' }),
  handOverLeitung: (homeId) => request(`/family/members/leitung/${homeId}`, { method: 'POST' }),
  revokeInvite: (voucherId) => request(`/family/members/einladungen/${voucherId}`, { method: 'DELETE' }),
  // bestaetigung: der genaue Name der Familie. Antwort: das neue "me" (eigenes Zuhause) - oder null (204),
  // wenn die Sitzung mit dem gemeinsamen Schlüssel der Familie lief und mit ihr endet.
  dissolveFamily: (bestaetigung) => request('/family/members/aufloesen', json('POST', { bestaetigung })),
  // payload wie renewKey (currentKey/currentPassword der EIGENEN Identität) - der neue Schlüssel der Familie
  // kommt einmalig zurück ({ key }).
  renewFamilyKey: (payload) => request('/family/members/key', json('POST', payload)),
  // Rolle einer offenen Einladung setzen (Phase R): Leitung jede, Stellvertretung gast/mitglied.
  setVoucherRole: (id, rolle) => request(`/vouchers/${id}/rolle`, json('PUT', { rolle })),

  listDogs: () => request('/dogs'),
  listAllDogs: () => request('/dogs/all'),
  getDog: (id) => request(`/dogs/${id}`),
  createDog: (payload) => request('/dogs', json('POST', payload)),
  updateDog: (id, payload) => request(`/dogs/${id}`, json('PUT', payload)),
  deleteDog: (id) => request(`/dogs/${id}`, { method: 'DELETE' }),
  // Tier der Familie in die eigene Chronik übernehmen (Phase R, Leitung mit eigenem Zuhause) - Antwort:
  // das Tier, wie die Familie es jetzt sieht (dort weiter geteilt).
  takeOverDog: (id) => request(`/dogs/${id}/uebernehmen`, { method: 'POST' }),
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
    // Druckdaten eines Stapels (Phase 5, server/routes/adminStats.js): offene Codes im Klartext, nur für
    // die Druckseite (AdminPrintPage) - der Server antwortet mit no-store, der Client hält sie nur im State.
    printBatch: (id) => request(`/admin/voucher-batches/${encodeURIComponent(id)}/print`),
    // CSV-Export ohne Codes - als Link mit download, kein fetch nötig (die Sitzung geht als Cookie mit).
    voucherCsvUrl: (id) => `/api/admin/voucher-batches/${encodeURIComponent(id)}/export.csv`,
    // Statistik der Karte „Übersicht“ (Phase 5, server/routes/adminStats.js): Einlösungen je Stapel/Partner/
    // Zweck, Mundpropaganda-Ketten, Klicks der letzten 30 Tage und Partner-Status - alles ohne Demo-Daten.
    stats: () => request('/admin/stats'),
    // Admin-Ansicht (Phase 5 Task 5b, server/routes/admin.js POST /view/:familyId): öffnet einen Bereich als
    // Nur-Lesen-Sitzung (setzt das normale Sitzungs-Cookie) und antwortet wie /me, mit adminView: true.
    viewFamily: (id) => request(`/admin/view/${encodeURIComponent(id)}`, { method: 'POST' }),
    // Protokoll dieser Aufrufe, neueste zuerst (Bereich und Zeitpunkt, keine Inhalte).
    log: () => request('/admin/log'),

    // Anfragen (Phase N, server/routes/adminAnfragen.js): eine Seite der Liste (100 je Seite, ohne status alle,
    // offene zuerst) -> { anfragen, gesamt, seite, seiten }; Status/Notiz ändern (Antwort: die ganze Anfrage),
    // löschen (204). Die Zuweisung liefert den Code genau einmal ({ code, anfrage }, Server: no-store) - der Client
    // hält ihn nur, solange der Dialog offen ist.
    anfragen: ({ status, seite } = {}) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (seite) params.set('seite', String(seite))
      const qs = params.toString()
      return request(`/admin/anfragen${qs ? `?${qs}` : ''}`)
    },
    updateAnfrage: (id, payload) => request(`/admin/anfragen/${encodeURIComponent(id)}`, json('PUT', payload)),
    assignAnfrageGutschein: (id, batchId) => request(`/admin/anfragen/${encodeURIComponent(id)}/gutschein`, json('POST', { batchId })),
    deleteAnfrage: (id) => request(`/admin/anfragen/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // Telegram-Benachrichtigungen (Phase N, server/routes/adminNotify.js). Alle Antworten außer Chat finden und
    // Testnachricht: { eingerichtet, quelle, tokenHinweis, chatId, einstellungen } - der Token selbst kommt nie zurück.
    notifySettings: () => request('/admin/notify-settings'),
    // Nur Booleans, auch einzeln: { gutschein_anfrage?, partner_anfrage?, registrierung?, feedback?, beitrag?, details? }
    updateNotifySettings: (payload) => request('/admin/notify-settings', json('PUT', payload)),
    // { token?, chatId? } - fehlend = unverändert, '' = löschen. Ein neuer Token wird vorher bei Telegram geprüft.
    saveTelegram: (payload) => request('/admin/notify-settings/telegram', json('PUT', payload)),
    // [{ id, titel, typ }] - die Chats, die dem Bot zuletzt geschrieben haben (mit dem gespeicherten Token).
    findTelegramChats: ({ token } = {}) => request('/admin/notify-settings/chat-finden', json('POST', token ? { token } : {})),
    sendNotifyTest: () => request('/admin/notify-test', { method: 'POST' }),

    // Partner pflegen (Task 7, AdminPartners) - volle Zeilen (snake_case), anders als publicPartner(s) oben.
    partners: () => request('/admin/partners'),
    createPartner: (payload) => request('/admin/partners', json('POST', payload)),
    updatePartner: (id, payload) => request(`/admin/partners/${id}`, json('PUT', payload)),
    deletePartner: (id) => request(`/admin/partners/${id}`, { method: 'DELETE' }),
    // Bereich eines Partners (Phase P1, jeder Typ: Tierheim-Bereich für tierheim/vermittlung, sonst
    // Partner-Bereich - routes/admin.js POST /:id/area und /:id/area/key). Beide liefern den neuen
    // Zugangsschlüssel einmalig im Klartext zurück ({ key }, das Anlegen zusätzlich { familyId, art }).
    createPartnerArea: (partnerId) => request(`/admin/partners/${partnerId}/area`, { method: 'POST' }),
    renewPartnerAreaKey: (partnerId) => request(`/admin/partners/${partnerId}/area/key`, { method: 'POST' }),
    // Einblicke eines Partners (inkl. ausgeblendeter, Fotos über /uploads) und Ausblenden/Einblenden.
    einblicke: (partnerId) => request(`/admin/einblicke?${new URLSearchParams({ partnerId: String(partnerId) }).toString()}`),
    setEinblickAusgeblendet: (id, ausgeblendet) => request(`/admin/einblicke/${id}/ausblenden`, json('POST', { ausgeblendet })),
    uploadPartnerLogo: (id, file) => {
      const formData = new FormData()
      formData.append('file', file)
      return request(`/admin/partners/${id}/logo`, { method: 'POST', body: formData })
    },

    // Reiter "Entdecken" pflegen (Phase 3 Task 5, server/routes/adminMarketing.js): Empfehlungen/Anzeigen
    // (Zeilen snake_case, dazu bildUrl, clicks7, clicksTotal), Einstellungen (gofundme_url/
    // unterstuetzen_text) und Spendenberichte (Beträge in Cent).
    // freigabe (Phase P2): nur Beiträge mit dieser Freigabe, z. B. 'eingereicht' für "Zur Freigabe".
    promotions: ({ freigabe } = {}) =>
      request(freigabe ? `/admin/promotions?${new URLSearchParams({ freigabe }).toString()}` : '/admin/promotions'),
    approvePromotion: (id) => request(`/admin/promotions/${id}/freigeben`, { method: 'POST' }),
    // grund: 3-300 Zeichen, der Partner sieht ihn in seiner Beitragsliste.
    rejectPromotion: (id, grund) => request(`/admin/promotions/${id}/ablehnen`, json('POST', { grund })),
    createPromotion: (payload) => request('/admin/promotions', json('POST', payload)),
    updatePromotion: (id, payload) => request(`/admin/promotions/${id}`, json('PUT', payload)),
    deletePromotion: (id) => request(`/admin/promotions/${id}`, { method: 'DELETE' }),
    uploadPromotionImage: (id, file) => {
      const formData = new FormData()
      formData.append('file', file)
      return request(`/admin/promotions/${id}/image`, { method: 'POST', body: formData })
    },
    settings: () => request('/admin/settings'),
    updateSettings: (payload) => request('/admin/settings', json('PUT', payload)),
    donationReports: () => request('/admin/donation-reports'),
    createDonationReport: (payload) => request('/admin/donation-reports', json('POST', payload)),
    updateDonationReport: (id, payload) => request(`/admin/donation-reports/${id}`, json('PUT', payload)),
    deleteDonationReport: (id) => request(`/admin/donation-reports/${id}`, { method: 'DELETE' })
  },

  // Partner-Bereich (Phase P, server/routes/partnerArea/*): eigenes Profil, Einblicke und die Vorschau
  // für die Kundensicht. Nur mit Sitzung in einem Partner- oder Tierheim-Bereich; Demo-Sitzungen lesen
  // nur (jeder Schreibversuch -> 403).
  partnerArea: {
    profile: () => request('/partner-area/profile'),
    // Nur die geänderten Felder (camelCase wie die Antwort) - unbekannte Felder lehnt der Server mit 400 ab.
    updateProfile: (fields) => request('/partner-area/profile', json('PUT', fields)),
    uploadLogo: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return request('/partner-area/profile/logo', { method: 'POST', body: formData })
    },
    publish: (aktiv) => request('/partner-area/profile/publish', json('POST', { aktiv })),
    einblicke: () => request('/partner-area/einblicke'),
    // formData: foto, datum (JJJJ-MM-TT), text, einwilligung ('true') - siehe EinblickForm.
    createEinblick: (formData) => request('/partner-area/einblicke', { method: 'POST', body: formData }),
    updateEinblick: (id, fields) => request(`/partner-area/einblicke/${encodeURIComponent(id)}`, json('PUT', fields)),
    deleteEinblick: (id) => request(`/partner-area/einblicke/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    previewPortal: () => request('/partner-area/preview/portal'),
    // Wie api.discover: die PLZ steht im Body, nie in der URL.
    previewDiscover: ({ plz, radius } = {}) => request('/partner-area/preview/discover', json('POST', plz ? { plz, radius } : {})),
    previewAnimal: (dogId) => request(`/partner-area/preview/animals/${encodeURIComponent(dogId)}`),

    // Beiträge (Phase P2, server/routes/partnerArea/posts.js): immer "Anzeige", öffentlich erst nach Freigabe;
    // jede Änderung (auch ein neues Bild) reicht wieder ein. payload: titel, text, bereich, url, start, ende, aktiv.
    posts: () => request('/partner-area/posts'),
    createPost: (payload) => request('/partner-area/posts', json('POST', payload)),
    updatePost: (id, payload) => request(`/partner-area/posts/${encodeURIComponent(id)}`, json('PUT', payload)),
    deletePost: (id) => request(`/partner-area/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    // Nur JPG oder PNG - Antwort: der ganze Beitrag (mit bildUrl und zurückgesetzter Freigabe).
    uploadPostImage: (id, file) => {
      const formData = new FormData()
      formData.append('file', file)
      return request(`/partner-area/posts/${encodeURIComponent(id)}/image`, { method: 'POST', body: formData })
    },

    // Postfach (Phase P2, server/routes/partnerArea/messages.js): { messages, unread }.
    messages: () => request('/partner-area/messages'),
    markMessageRead: (id) => request(`/partner-area/messages/${encodeURIComponent(id)}/read`, { method: 'POST' }),
    deleteMessage: (id) => request(`/partner-area/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // Kunden-Gutscheine (Phase 5 Task 4, server/routes/partnerArea/vouchers.js): { stapel } ohne Codes; die
    // Druckdaten eines eigenen Stapels (offene Codes im Klartext, Server: no-store) nur für PartnerPrintPage.
    vouchers: () => request('/partner-area/vouchers'),
    printBatch: (id) => request(`/partner-area/vouchers/${encodeURIComponent(id)}/print`)
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
