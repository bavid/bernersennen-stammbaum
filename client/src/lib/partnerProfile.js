// Reine Hilfen für das eigene Partner-Profil (/profil, PartnerProfilePage) - spiegeln die Felder und
// Meldungen von server/lib/partnerProfile.js (profileResponse, validateProfileUpdate) und
// server/lib/partners.js (validatePartner).
import { partnerStatusLabel } from './partnerTypes.js'

export const MIN_PORTAL_TEXT_LENGTH = 40
export const MAX_PORTAL_TEXT_LENGTH = 2000
export const MAX_NAME_LENGTH = 120
export const MAX_TITEL_LENGTH = 120
// Phase V4b: Name der Ansprechperson auf dem Portal (server lib/partners.js MAX_ANSPRECHPERSON_LENGTH).
export const MAX_ANSPRECHPERSON_LENGTH = 80

export const LOCKED_HINT = 'Euer Profil ist gesperrt – bitte meldet euch beim Betreiber.'
// Der Demo-Hinweis liegt seit Phase 5 Task 5b zentral in lib/demo.js (neben dem der Admin-Ansicht).
export { DEMO_HINT } from './demo.js'

// Spenden- und Vermittlungs-Link gibt es nur für Tierheime und Vermittlungen (server SHELTER_TYP_VALUES).
const SHELTER_LINK_TYPES = ['tierheim', 'vermittlung']

export function hasShelterLinks(typ) {
  return SHELTER_LINK_TYPES.includes(typ)
}

// Eine Sperre des Betreibers schlägt jeden Status.
export function profileStatusKey(profile) {
  return profile?.gesperrt ? 'gesperrt' : profile?.status
}

// Wie partnerStatusLabel, nur sagt "Aktiv" dem Partner selbst dazu, dass das Profil öffentlich ist.
export function profileStatusLabel(profile) {
  return profileStatusKey(profile) === 'aktiv' ? 'Aktiv (öffentlich)' : partnerStatusLabel(profile)
}

// Textfelder, die der Partner selbst pflegt (server PROFILE_COLUMNS ohne den Schalter).
const TEXT_FIELDS = [
  'name',
  'portalTitel',
  'portalText',
  'farbe',
  'website',
  'spendenUrl',
  'vermittlungUrl',
  'kontaktEmail',
  'kontaktTelefon',
  'kontaktFormularUrl',
  'ansprechperson',
  'plz'
]

// Formularwerte (Strings, dazu der Schalter) aus der Antwort von GET /partner-area/profile.
export function profileForm(profile) {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, profile?.[key] ?? ''])),
    kontaktformularAktiv: Boolean(profile?.kontaktformularAktiv)
  }
}

// Nur die geänderten Felder - PUT lässt nicht mitgeschickte Felder unverändert. Ein geleertes Feld geht
// als null (löscht es ausdrücklich), alles andere getrimmt.
export function changedProfileFields(form, profile) {
  const base = profileForm(profile)
  const changes = {}
  for (const key of TEXT_FIELDS) {
    if (form[key] === base[key]) continue
    const value = form[key].trim()
    changes[key] = value || null
  }
  if (form.kontaktformularAktiv !== base.kontaktformularAktiv) changes.kontaktformularAktiv = form.kontaktformularAktiv
  return changes
}

// Server-Meldung -> Formularfeld. Der Server liefert nur { error }, deshalb über den (stabilen)
// Satzanfang zugeordnet. Was nicht passt (Züchter-Schutz, "Solange euer Profil öffentlich ist …"),
// zeigt das Formular oben im Banner.
const PROFILE_ERROR_FIELDS = [
  [/^Der Name /, 'name'],
  [/^Der Portal-Titel /, 'portalTitel'],
  [/^Der Portal-Text /, 'portalText'],
  [/^(Die )?Farbe /, 'farbe'],
  [/^Website:/, 'website'],
  [/^Spenden-Link:/, 'spendenUrl'],
  [/^Vermittlungs-Link:/, 'vermittlungUrl'],
  [/^Die E-Mail-Adresse /, 'kontaktEmail'],
  [/^Die Telefonnummer /, 'kontaktTelefon'],
  [/^Kontaktformular-Link:/, 'kontaktFormularUrl'],
  [/^Die Ansprechperson /, 'ansprechperson'],
  [/^Diese Postleitzahl /, 'plz']
]

export function profileErrorField(message) {
  if (typeof message !== 'string') return null
  return PROFILE_ERROR_FIELDS.find(([pattern]) => pattern.test(message))?.[1] ?? null
}

// Öffentliche Adresse des Portals - der Slug kommt vom Server, trotzdem kodiert.
export function portalPath(slug) {
  return `/p/${encodeURIComponent(slug)}`
}
