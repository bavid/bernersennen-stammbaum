'use strict'

// Partner (Tierheime, Vermittlungsstellen, Hundeschulen, ...) mit eigener Portalseite - nie Züchter
// (docs/superpowers/plans/2026-09-28-phase-2-partner.md, Task 2).

const { lookupPlz } = require('./geo')
const { assertNoBreeder } = require('./breederGuard')

const MAX_NAME_LENGTH = 120
const MAX_TITEL_LENGTH = 120
const MAX_URL_LENGTH = 300
const MAX_EMAIL_LENGTH = 120
const MAX_PORTAL_TEXT_LENGTH = 2000

const TYP_VALUES = ['tierheim', 'vermittlung', 'hundeschule', 'futter', 'sonstige']
const STATUS_VALUES = ['entwurf', 'aktiv', 'pausiert']

const SLUG_RE = /^[a-z0-9-]{3,60}$/
const SLUG_MAX_LENGTH = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()/\- ]{5,30}$/
const FARBE_RE = /^#[0-9a-fA-F]{6}$/

// Textfarbe auf der Akzentfläche (--on-rust, hell) - siehe client/src/styles/tokens.css. Fest auf den
// hellen Wert geprüft, unabhängig vom (Server-seitig unbekannten) Theme des Betrachters.
const ON_RUST = '#fffaf2'
const MIN_CONTRAST = 4.5

const UMLAUT_MAP = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' }

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Slug: Umlaute transliterieren, alles andere zu Bindestrichen, gekürzt auf SLUG_MAX_LENGTH ---
function transliterate(value) {
  return value.replace(/[äöüÄÖÜß]/g, (ch) => UMLAUT_MAP[ch])
}

function slugify(name) {
  const normalized = transliterate(String(name || ''))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // übrige Akzente (NFKD-Kombinationszeichen) entfernen
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '')
}

// Übernimmt einen gültigen, selbst angegebenen Slug; sonst den bisherigen (beim Bearbeiten); sonst
// frisch aus dem Namen erzeugt.
function resolveSlug(input, name, existingSlug) {
  const provided = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (provided && SLUG_RE.test(provided)) return provided
  if (existingSlug) return existingSlug
  const generated = slugify(name)
  if (!SLUG_RE.test(generated)) throw httpError(400, 'Aus dem Namen lässt sich kein gültiger Kurzname erzeugen')
  return generated
}

// --- WCAG-Kontrast (relative Luminanz nach https://www.w3.org/TR/WCAG21/#dfn-relative-luminance) ---
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function channelLuminance(channel) {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

function contrastRatio(hexA, hexB) {
  const luminanceA = relativeLuminance(hexToRgb(hexA))
  const luminanceB = relativeLuminance(hexToRgb(hexB))
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

// --- einzelne Feld-Validierungen: undefined/null/'' -> null (kein Wunsch), sonst geprüft ---
function cleanOptionalText(value, maxLength, label) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null
  if (trimmed.length > maxLength) throw httpError(400, `${label} darf höchstens ${maxLength} Zeichen haben`)
  return trimmed
}

function validateTyp(value) {
  if (!TYP_VALUES.includes(value)) throw httpError(400, `Typ muss einer von ${TYP_VALUES.join(', ')} sein`)
  return value
}

// Fehlt status in der Anfrage: beim Bearbeiten bleibt der bisherige Status stehen (wie beim Slug) -
// sonst würde ein Update, das versehentlich kein status-Feld mitschickt, einen aktiven Partner
// stillschweigend auf 'entwurf' zurücksetzen. Beim Anlegen (kein bisheriger Status) ist 'entwurf' der
// sichere Default - ein neuer Partner erscheint nie ungewollt schon öffentlich.
function validateStatus(value, existingStatus) {
  if (value === undefined || value === null || value === '') return existingStatus || 'entwurf'
  if (!STATUS_VALUES.includes(value)) throw httpError(400, `Status muss einer von ${STATUS_VALUES.join(', ')} sein`)
  return value
}

function resolvePlz(value) {
  if (value === undefined || value === null || value === '') return { plz: null, lat: null, lon: null, ort: null }
  const trimmed = typeof value === 'string' ? value.trim() : ''
  const hit = lookupPlz(trimmed)
  if (!hit) throw httpError(400, 'Diese Postleitzahl kennen wir nicht')
  return { plz: trimmed, lat: hit.lat, lon: hit.lon, ort: hit.ort }
}

function validateUrl(value, label) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) throw httpError(400, `${label}: ungültige Adresse`)
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw httpError(400, `${label}: ungültige Adresse`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw httpError(400, `${label}: nur http:// oder https:// erlaubt`)
  }
  return trimmed
}

function validateEmail(value) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(trimmed)) {
    throw httpError(400, 'Die E-Mail-Adresse ist ungültig')
  }
  return trimmed
}

function validatePhone(value) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || !PHONE_RE.test(trimmed)) throw httpError(400, 'Die Telefonnummer ist ungültig')
  return trimmed
}

function validatePortalText(value) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null
  if (trimmed.length > MAX_PORTAL_TEXT_LENGTH) throw httpError(400, `Der Portal-Text darf höchstens ${MAX_PORTAL_TEXT_LENGTH} Zeichen haben`)
  if (/[<>]/.test(trimmed)) throw httpError(400, 'Der Portal-Text darf nur reinen Text enthalten (kein HTML)')
  return trimmed
}

function validateFarbe(value) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!FARBE_RE.test(trimmed)) throw httpError(400, 'Die Farbe muss im Format #rrggbb angegeben werden')
  const hex = trimmed.toLowerCase()
  if (contrastRatio(hex, ON_RUST) < MIN_CONTRAST) {
    throw httpError(400, 'Farbe zu hell – Schrift wäre schlecht lesbar')
  }
  return hex
}

// Validiert und normalisiert die Eingabe für POST/PUT /api/admin/partners. existingSlug/existingStatus:
// beim Bearbeiten die bisherigen Werte, damit ein Update ohne slug-/status-Feld weder die URL noch die
// Sichtbarkeit ungewollt verändert.
function validatePartner(input = {}, { existingSlug, existingStatus } = {}) {
  const name = cleanOptionalText(input.name, MAX_NAME_LENGTH, 'Der Name')
  if (!name) throw httpError(400, 'Der Name ist Pflicht')

  const slug = resolveSlug(input.slug, name, existingSlug)
  const typ = validateTyp(input.typ)
  const status = validateStatus(input.status, existingStatus)
  const istPartner = input.istPartner === undefined || input.istPartner === null ? true : Boolean(input.istPartner)

  const { plz, lat, lon, ort } = resolvePlz(input.plz)

  const website = validateUrl(input.website, 'Website')
  const spendenUrl = validateUrl(input.spendenUrl, 'Spenden-Link')
  const vermittlungUrl = validateUrl(input.vermittlungUrl, 'Vermittlungs-Link')
  const kontaktEmail = validateEmail(input.kontaktEmail)
  const kontaktTelefon = validatePhone(input.kontaktTelefon)
  const portalTitel = cleanOptionalText(input.portalTitel, MAX_TITEL_LENGTH, 'Der Portal-Titel')
  const portalText = validatePortalText(input.portalText)
  const farbe = validateFarbe(input.farbe)

  assertNoBreeder({ name, portal_titel: portalTitel, portal_text: portalText })

  return {
    slug,
    name,
    typ,
    status,
    ist_partner: istPartner ? 1 : 0,
    plz,
    ort,
    lat,
    lon,
    website,
    spenden_url: spendenUrl,
    vermittlung_url: vermittlungUrl,
    kontakt_email: kontaktEmail,
    kontakt_telefon: kontaktTelefon,
    portal_titel: portalTitel,
    portal_text: portalText,
    farbe
  }
}

// Öffentliche Grundfelder eines Partners (Liste, Portal). Sensible/interne Spalten (quelle, osm_ref,
// is_demo, ...) bleiben außen vor.
function publicPartner(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    typ: row.typ,
    plz: row.plz,
    ort: row.ort,
    lat: row.lat,
    lon: row.lon,
    website: row.website,
    kontakt_email: row.kontakt_email,
    kontakt_telefon: row.kontakt_telefon,
    logoUrl: row.logo_file ? `/partner-media/${row.logo_file}` : null,
    badge: row.ist_partner ? 'partner' : 'geprueft'
  }
}

// --- Logo-Upload: echte Datei-Signatur statt nur dem (vom Client behaupteten) Content-Type prüfen ---
const MAX_LOGO_BYTES = 512 * 1024
const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_FILENAME_RE = /^[0-9a-f-]{36}\.(png|jpg|webp)$/i

const LOGO_SIGNATURES = [
  {
    ext: 'png',
    test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  },
  { ext: 'jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
]

// Erkennt PNG/JPG/WebP an den ersten Bytes (Magic Bytes) - unabhängig vom Content-Type-Header, den
// ein Client beliebig setzen kann. Alles andere (auch SVG - XSS-Risiko) liefert null.
function detectImageExt(buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  const match = LOGO_SIGNATURES.find((sig) => sig.test(buffer))
  return match ? match.ext : null
}

module.exports = {
  validatePartner,
  publicPartner,
  slugify,
  contrastRatio,
  detectImageExt,
  TYP_VALUES,
  STATUS_VALUES,
  MAX_LOGO_BYTES,
  LOGO_MIME_TYPES,
  LOGO_FILENAME_RE,
  ON_RUST,
  MIN_CONTRAST
}
