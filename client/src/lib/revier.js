// Phase M „Mein Revier“ (server/routes/revier.js): reine Hilfen für Radar, Profil und Einstellungen. Der Server nennt
// nie Kilometer oder PLZ eines anderen - nur Stufen ('unter5', '5-10', …); hier stehen ihre Wörter.
import { t } from './i18n/index.js'
import { SETTINGS_ROUTE } from './areas.js'

export const REVIER_ROUTE = '/revier'
// Einstellungen › Wer sieht was › Öffentlich: das eigene Profil.
export const REVIER_SETTINGS_PATH = `${SETTINGS_ROUTE}?bereich=sichtbarkeit&ansicht=oeffentlich`
export const DISCOVER_REVIER_PATH = '/entdecken?bereich=revier'
export const UMKREISE = Object.freeze([5, 10, 25, 50])
export const DEFAULT_UMKREIS = 25
export const TIERARTEN = Object.freeze([
  { key: '', label: 'Alle Tiere' },
  { key: 'hund', label: 'Hunde' },
  { key: 'katze', label: 'Katzen' },
  { key: 'anderes', label: 'Andere' }
])
export const REVIER_ANSICHTEN = Object.freeze([
  { key: 'naehe', label: 'In der Nähe' },
  { key: 'feed', label: 'Aus deinem Revier' },
  { key: 'folge', label: 'Ich folge' }
])
export const MAX_PROFIL_TEXT = 300

const BAND_LABELS = Object.freeze({
  unter5: 'unter 5 km',
  '5-10': '5–10 km',
  '10-25': '10–25 km',
  '25-50': '25–50 km'
})

export function bandLabel(band) {
  return BAND_LABELS[band] ? t(BAND_LABELS[band]) : ''
}

export function profilPath(slug) {
  return `${REVIER_ROUTE}/${encodeURIComponent(slug)}`
}

// „unter 5 km · Hamburg“ - der Ort nur, wenn der Inhaber ihn zeigt.
export function ortZeile(profil) {
  return [bandLabel(profil.band), profil.ort].filter(Boolean).join(' · ')
}

// „3 Folgende“ bzw. bei öffentlicher Liste „Benno vom Spadenland, Lotte & Minka und 2 weitere“.
export function followerZeile(follower) {
  if (!follower || !follower.anzahl) return t('Noch niemand folgt')
  const zahl = follower.anzahl === 1 ? t('1 Folgende:r') : t('{n} Folgende', { n: follower.anzahl })
  if (!follower.namen?.length) return zahl
  const namen = follower.namen.join(', ')
  return follower.weitere > 0 ? t('{zahl}: {namen} und {n} weitere', { zahl, namen, n: follower.weitere }) : `${zahl}: ${namen}`
}

// Darf das Profil eingeschaltet werden? Gleiche Regel wie der Server: bekannte PLZ (5 Ziffern) und das Häkchen.
export function kannEinschalten({ plz, zustimmung }) {
  return /^\d{5}$/.test(plz || '') && Boolean(zustimmung)
}

// Ist eine eigene Erinnerung öffentlich zu sehen? Markiert, nicht privat, keine Gesundheit, Tier im Profil.
export function istOeffentlich(entry, markierte, sichtbareTiere) {
  return markierte.has(entry.id) && !entry.privat && !entry.gesundheit && sichtbareTiere.has(entry.dog_id)
}

// Aus „Wer sieht was“ (useSichtbarkeit data.revier): ist das Profil an, welche Tiere zeigt es, welche Erinnerungen sind
// markiert? Ohne Profil alles leer.
export function revierStand(revier) {
  const settings = revier?.settings
  return {
    vorhanden: Boolean(settings),
    aktiv: Boolean(settings?.aktiv && !settings?.gesperrt),
    tiere: new Set((settings?.tiere || []).filter((tier) => tier.sichtbar).map((tier) => tier.id)),
    markiert: new Set(revier?.markiert || [])
  }
}

// Darf eine eigene Erinnerung öffentlich werden? Nie privat, nie Gesundheit.
export function kannOeffentlich(entry) {
  return !entry.privat && !entry.gesundheit && entry.kategorie !== 'tierarzt'
}
