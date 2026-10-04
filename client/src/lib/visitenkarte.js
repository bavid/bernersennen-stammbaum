// Karten-Designer für Partner (Phase V5, Feedback-Runde, PartnerVisitenkartenPage): Vorlagen, Farben samt Kontrast,
// Inhalt der Vorderseite, Ziele der QR-Codes und das Raster des A4-Bogens mit Schnittmarken (die Bögen selbst nach
// Kartenzahl: lib/einladungskarte.js buildKartenSheets). Reine Funktionen ohne DOM - spiegelt die Felder von
// server/lib/visitenkarteDesign.js. Maße in Millimetern (styles/visitenkarten.css rechnet mit --mm).
import { contrastRatio } from './contrast.js'
import { portalUrl } from './partnerShare.js'
import { hostLabel, printBaseUrl, voucherUrl } from './voucherPrint.js'
import { DEFAULT_KARTE, KARTEN } from './kartenWahl.js'

export const CARD_MM = Object.freeze({ width: 85, height: 55 })
export const SHEET_MM = Object.freeze({ width: 210, height: 297 })
export const COLUMNS = 2
export const ROWS = 5
export const CARDS_PER_SHEET = COLUMNS * ROWS
export const MAX_KURZTEXT_LENGTH = 120
export const MAX_WIDMUNG_LENGTH = 80
export const MIN_CONTRAST = 4.5
export const LIGHT_TEXT = '#ffffff'
// Tinte des Auftritts (styles/tokens.css --ink) - auf Papier wie auf hellen Farbflächen.
export const DARK_TEXT = '#1c1511'
const PAPER = '#ffffff'

// Raster der Karten mittig auf dem Blatt (oben und unten 11 mm, links und rechts 20 mm) - so liegen die Rückseiten beim
// beidseitigen Druck (Wenden über die lange Kante, mirrorRows) genau hinter ihren Vorderseiten.
export const GRID_MM = Object.freeze({
  left: (SHEET_MM.width - COLUMNS * CARD_MM.width) / 2,
  top: (SHEET_MM.height - ROWS * CARD_MM.height) / 2,
  width: COLUMNS * CARD_MM.width,
  height: ROWS * CARD_MM.height
})
// Schnittmarken: 6 mm lang, 2 mm Abstand zum Raster.
const MARK_GAP_MM = 2
const MARK_LENGTH_MM = 6

export const VORLAGEN = Object.freeze([
  { id: 'klassisch', label: 'Klassisch', hint: 'Logo links, Text rechts' },
  { id: 'foto', label: 'Foto', hint: 'Euer Bannerfoto als Hintergrund' },
  { id: 'schlicht', label: 'Schlicht', hint: 'Schrift und Farbband' }
])
const VORLAGE_IDS = VORLAGEN.map((vorlage) => vorlage.id)
const FALLBACK_VORLAGE = 'klassisch'
const FOTO_VORLAGE = 'foto'

// Farben der Auftritte (styles/tokens.css: Rost, Kastanie, Alpin, Tanne, Tinte, Sand).
export const PALETTE = Object.freeze([
  { farbe: '#a4431d', label: 'Rost' },
  { farbe: '#7d3014', label: 'Kastanie' },
  { farbe: '#3f4b39', label: 'Alpin' },
  { farbe: '#2f6b3f', label: 'Tanne' },
  { farbe: '#1c1511', label: 'Tinte' },
  { farbe: '#d49a5b', label: 'Sand' }
])

// Feedback-Runde: EINE Vorderseite für alle Kombinationen (mit persönlicher Zeile) und die gewählte Kombination (karte).
const DESIGN_KEYS = Object.freeze(['karte', 'vorlage', 'farbe', 'kurztext', 'widmung', 'zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail'])
const HEX_RE = /^#?([0-9a-f]{6})$/i
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i
const MUSTER_PREFIX = 'DEMO-MUST-'
// Feedback-Runde: solange die Plattform keine öffentliche Adresse hat (lib/voucherPrint.js printAddressPending), steht
// auf der Vorschau statt einer technischen Adresse dieser Platzhalter - gedruckt wird dann ohnehin nicht.
export const PENDING_ADDRESS = 'Adresse folgt'

// Welche Angabe des Profils in die Kontaktzeile gehört - in dieser Reihenfolge, je mit Schalter der Gestaltung.
const CONTACTS = Object.freeze([
  { key: 'website', field: 'website', toggle: 'zeigeWebsite', icon: 'globe', label: 'Website' },
  { key: 'telefon', field: 'kontaktTelefon', toggle: 'zeigeTelefon', icon: 'phone', label: 'Telefon' },
  { key: 'email', field: 'kontaktEmail', toggle: 'zeigeEmail', icon: 'mail', label: 'E-Mail' }
])

export const CONTACT_FIELDS = CONTACTS

export function normalizeHex(value) {
  const match = typeof value === 'string' ? value.trim().match(HEX_RE) : null
  return match ? `#${match[1].toLowerCase()}` : null
}

// Schriftfarbe auf einer Farbfläche: hell, wenn das mindestens 4,5 : 1 ergibt, sonst dunkel - und wenn keine von beiden
// reicht (mittlere Töne), die bessere mit ok: false (die Seite rät dann zu einer anderen Farbe).
export function textColorOn(hex) {
  const light = contrastRatio(hex, LIGHT_TEXT)
  if (light >= MIN_CONTRAST) return { color: LIGHT_TEXT, ratio: light, ok: true }
  const dark = contrastRatio(hex, DARK_TEXT)
  if (dark >= MIN_CONTRAST) return { color: DARK_TEXT, ratio: dark, ok: true }
  return light >= dark ? { color: LIGHT_TEXT, ratio: light, ok: false } : { color: DARK_TEXT, ratio: dark, ok: false }
}

// Die Farbe als Schrift auf weißem Papier - nur mit genug Kontrast, sonst Tinte.
export function accentOnWhite(hex) {
  return contrastRatio(hex, PAPER) >= MIN_CONTRAST ? hex : DARK_TEXT
}

export function effectiveVorlage(vorlage, fotoUrl) {
  if (!VORLAGE_IDS.includes(vorlage)) return FALLBACK_VORLAGE
  return vorlage === FOTO_VORLAGE && !fotoUrl ? FALLBACK_VORLAGE : vorlage
}

export function websiteLabel(url) {
  return String(url).replace(SCHEME_RE, '').replace(/^www\./i, '').replace(/\/+$/, '')
}

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== ''
}

// Kontakt-Angaben, die im Profil stehen (nur die lassen sich auf der Karte ein- und ausschalten).
export function availableContacts(profile) {
  return CONTACTS.filter((contact) => hasValue(profile?.[contact.field])).map((contact) => contact.key)
}

export function contactLines(profile, design) {
  return CONTACTS.filter((contact) => hasValue(profile?.[contact.field]) && design[contact.toggle]).map((contact) => ({
    key: contact.key,
    icon: contact.icon,
    text: contact.key === 'website' ? websiteLabel(profile[contact.field].trim()) : profile[contact.field].trim()
  }))
}

// Alles, was eine Karte zum Zeichnen braucht. publicUrl: PUBLIC_URL aus /api/config (sonst origin). demo: der Portal-Link
// trägt ?demo=1 (wie im Reiter "Teilen"), damit er sich in der Demo öffnen lässt. widmung: die persönliche Zeile über dem
// Namen (leer -> keine).
export function cardModel({ profile, design, publicUrl, origin, demo = false }) {
  const baseUrl = printBaseUrl(publicUrl, origin)
  const host = hostLabel(baseUrl)
  const foto = profile.banner?.[0] ?? null
  const textOn = textColorOn(design.farbe)
  const widmung = typeof design.widmung === 'string' ? design.widmung.trim() : ''
  return {
    vorlage: effectiveVorlage(design.vorlage, foto?.fotoUrl),
    farbe: design.farbe,
    textOn: textOn.color,
    accentText: accentOnWhite(design.farbe),
    name: profile.name,
    logoUrl: profile.logoUrl || null,
    fotoUrl: foto?.fotoUrl || null,
    fotoAlt: foto?.alt || '',
    kurztext: design.kurztext,
    widmung: widmung || null,
    ansprechperson: design.zeigeAnsprechperson && hasValue(profile.ansprechperson) ? profile.ansprechperson.trim() : null,
    kontakte: contactLines(profile, design),
    baseUrl,
    host,
    portalUrl: portalUrl({ publicUrl, origin, slug: profile.slug, demo }),
    portalLabel: `${host}/p/${profile.slug}`,
    portalPfad: `/p/${profile.slug}`
  }
}

// Die Vorschau ohne technische Adresse (PENDING_ADDRESS statt Host und Pfad) - die QR-Ziele bleiben, wie sie sind.
export function maskPendingAddress(card) {
  return { ...card, host: PENDING_ADDRESS, portalLabel: PENDING_ADDRESS, portalPfad: '', addressPending: true }
}

// QR-Ziel eines Einladungscodes: /v mit dem Code hinter der Raute - nie in Pfad oder Abfrage (lib/voucherPrint.js).
export function voucherTarget(baseUrl, code) {
  return voucherUrl(baseUrl, code)
}

export function codeGroups(code) {
  return String(code).split('-')
}

// Beispiel-Codes für Demo und Admin-Ansicht ("DEMO-MUST-0001", …) - lassen sich nie einlösen.
export function musterCodes(count) {
  return Array.from({ length: count }, (_, index) => `${MUSTER_PREFIX}${String(index + 1).padStart(4, '0')}`)
}

// Spiegelt die Spaltenreihenfolge jeder Reihe (für die Rückseiten: im Bogen läuft jede Reihe von rechts nach links). Das
// entspricht dem Wenden über die lange Kante (Duplex "lange Kante", von Hand: das Blatt seitlich umdrehen) - links und
// rechts tauschen, oben und unten bleiben.
export function mirrorRows(items, columns = COLUMNS) {
  const rows = []
  for (let start = 0; start < items.length; start += columns) rows.push(items.slice(start, start + columns).reverse())
  return rows.flat()
}

// Schnittmarken als Linien in Millimetern (viewBox des Bogens): an jeder Spalten- und Reihenkante außerhalb des Rasters.
export function cropMarks() {
  const { left, top, width, height } = GRID_MM
  const right = left + width
  const bottom = top + height
  const xs = Array.from({ length: COLUMNS + 1 }, (_, index) => left + index * CARD_MM.width)
  const ys = Array.from({ length: ROWS + 1 }, (_, index) => top + index * CARD_MM.height)
  const vertical = xs.flatMap((x) => [
    { x1: x, y1: top - MARK_GAP_MM - MARK_LENGTH_MM, x2: x, y2: top - MARK_GAP_MM },
    { x1: x, y1: bottom + MARK_GAP_MM, x2: x, y2: bottom + MARK_GAP_MM + MARK_LENGTH_MM }
  ])
  const horizontal = ys.flatMap((y) => [
    { x1: left - MARK_GAP_MM - MARK_LENGTH_MM, y1: y, x2: left - MARK_GAP_MM, y2: y },
    { x1: right + MARK_GAP_MM, y1: y, x2: right + MARK_GAP_MM + MARK_LENGTH_MM, y2: y }
  ])
  return [...vertical, ...horizontal]
}

// Eine Gestaltung vom Server, auf die der Designer sich verlassen kann: unbekannte oder fehlende Kombination -> Kombi,
// fehlende persönliche Zeile -> leer (z. B. eine ältere Antwort während eines Updates).
export function normalizeDesign(design) {
  const karte = KARTEN.some((entry) => entry.id === design?.karte) ? design.karte : DEFAULT_KARTE
  return { ...design, karte, widmung: typeof design?.widmung === 'string' ? design.widmung : '' }
}

// Genau die Felder, die PUT /api/partner-area/visitenkarte erwartet.
export function designPayload(design) {
  return Object.fromEntries(DESIGN_KEYS.map((key) => [key, design[key]]))
}

export function isSameDesign(a, b) {
  if (!a || !b) return false
  return DESIGN_KEYS.every((key) => a[key] === b[key])
}
