// Admin-Karte „Band ‚Mit dabei‘“ (components/AdminCommunityBanner.jsx): Formular <-> gespeicherter Stand
// (GET/PUT /api/admin/community/banner, server/lib/communityBanner.js) und die Vorschau-Daten für CommunityBand.
// Die Prüfung hier ist nur Komfort - der Server prüft dasselbe noch einmal (400).

export const BANNER_TEXT_MAX = 80
// Feste Reihenfolge wie im Band (server CHIP_KEYS); Wörter für die Schalter.
export const BANNER_CHIPS = Object.freeze([
  { key: 'familien', label: 'Familien' },
  { key: 'zuhause', label: 'Zuhause' },
  { key: 'erinnerungen', label: 'Erinnerungen' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'spenden', label: 'Spendensumme' },
  { key: 'partner', label: 'Partner' }
])
const CHIP_KEYS = BANNER_CHIPS.map((chip) => chip.key)
const LINK_RE = /^\/(?![/\\])[A-Za-z0-9\-._~/?=&#%+]*$/

export function bannerForm(banner) {
  return {
    partnerId: banner?.partnerId ? String(banner.partnerId) : '',
    bis: banner?.bis || '',
    chips: Array.isArray(banner?.chips) ? CHIP_KEYS.filter((key) => banner.chips.includes(key)) : [...CHIP_KEYS],
    text: banner?.text || '',
    link: banner?.link || ''
  }
}

export function isInternalLink(value) {
  return LINK_RE.test(value)
}

// { payload } oder { errors: { feld: Meldung } }
export function bannerPayload(form) {
  const text = form.text.trim()
  const link = form.link.trim()
  const errors = {}
  if (text.length > BANNER_TEXT_MAX) errors.text = `Höchstens ${BANNER_TEXT_MAX} Zeichen.`
  if (link && !isInternalLink(link)) errors.link = 'Nur ein Pfad in der App, der mit „/“ beginnt (z. B. /partner-werden).'
  if (link && !text) errors.text = 'Ein Link braucht einen Text.'
  if (Object.keys(errors).length) return { errors }
  return {
    payload: {
      partnerId: form.partnerId ? Number(form.partnerId) : null,
      bis: form.partnerId && form.bis ? form.bis : null,
      chips: CHIP_KEYS.filter((key) => form.chips.includes(key)),
      text: text || null,
      link: text && link ? link : null
    }
  }
}

function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Der im Formular gewählte Partner, so wie das Band ihn zeigen würde - oder null (keiner, abgelaufen, Demo ohne Ausnahme).
export function chosenPartner(form, info, now = new Date()) {
  const partner = (info?.partners || []).find((p) => String(p.id) === form.partnerId)
  if (!partner) return null
  if (form.bis && form.bis < todayIso(now)) return null
  if (partner.isDemo && !info.demoPartnerErlaubt) return null
  return partner
}

// Daten in der Form von GET /api/community - aus dem Formular und den Zahlen/Vorgestellten des Servers.
export function bannerPreviewData(form, info, now = new Date()) {
  const monat = chosenPartner(form, info, now)
  const vorgestellt = (info?.vorschau?.vorgestellt || []).filter((p) => !monat || p.slug !== monat.slug)
  const list = (monat ? [{ slug: monat.slug, name: monat.name, typ: monat.typ, fotos: monat.fotos || [] }, ...vorgestellt] : vorgestellt).slice(0, 3)
  const text = form.text.trim()
  const link = form.link.trim()
  return {
    ...(info?.vorschau?.zahlen || {}),
    partnerVorgestellt: list,
    banner: {
      partnerDesMonats: Boolean(monat),
      chips: form.chips,
      hinweis: text ? { text: text.slice(0, BANNER_TEXT_MAX), link: link && isInternalLink(link) ? link : null } : null
    }
  }
}

// Auswahl filtern: Name oder Slug enthält den Suchtext (ohne Groß/Klein); der gewählte bleibt immer in der Liste.
export function filterPartners(partners, query, selectedId) {
  const q = query.trim().toLowerCase()
  if (!q) return partners
  return partners.filter((p) => String(p.id) === selectedId || p.name.toLowerCase().includes(q) || p.slug.includes(q))
}
