// „Wer sieht was“ (Einstellungen › Wer sieht was): reine Hilfen für die Übersicht - wer ein eigenes Tier sieht, wie eine
// Erinnerung zu sehen ist und was eine Familie oder ein Gast zu sehen bekommt. Keine neue Regel: es gilt, was der Server
// ohnehin tut - ein Tier sehen die Familien, in die es geteilt ist, und alle Gäste; private Erinnerungen nur ihr.
import { familyAnimals } from './familyGroups.js'
import { isEditable } from './areas.js'
import { joinNames } from './entryForm.js'
import { t } from './i18n/index.js'

// Phase M: „Öffentlich“ - das eigene Profil für „Mein Revier“ (components/sichtbarkeit/OeffentlichAnsicht.jsx).
export const ANSICHTEN = Object.freeze(['tiere', 'verbindungen', 'erinnerungen', 'vorschau', 'oeffentlich'])
export const ERINNERUNG_FILTER = Object.freeze(['alle', 'privat', 'geteilt'])
// So viele Erinnerungen zeigt die Liste zuerst - „Mehr zeigen“ holt jeweils so viele dazu.
export const ERINNERUNGEN_SEITE = 10

// Eigene Tiere des Zuhauses (ohne Platzhalter unbekannter Eltern) - wie Einstellungen › Familien.
export function ownAnimals(dogs, homeId) {
  return familyAnimals(dogs || []).filter((dog) => isEditable(dog) && dog.family_id === homeId)
}

// Nur Erinnerungen, die das Zuhause selbst zu eigenen Tieren geschrieben hat - die neuesten zuerst.
export function ownMemories(entries, homeId, animalIds) {
  const ids = new Set(animalIds)
  return (entries || [])
    .filter((entry) => entry.family_id === homeId && ids.has(entry.dog_id))
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || b.id - a.id)
}

export function filterMemories(memories, { filter = 'alle', dogId = null } = {}) {
  return memories.filter((entry) => {
    if (dogId && entry.dog_id !== dogId) return false
    if (filter === 'privat') return Boolean(entry.privat)
    if (filter === 'geteilt') return !entry.privat
    return true
  })
}

export function shareNames(shares, memberships) {
  const set = new Set(shares || [])
  return (memberships || []).filter((membership) => set.has(membership.id)).map((membership) => membership.name)
}

// Wer eine nicht private Erinnerung dieses Tiers sieht: „Familie Sonnenhang und eure Gäste“, „alle Familien“ …
export function sharedAudience(shares, memberships, guestCount) {
  const names = shareNames(shares, memberships)
  const families = names.length > 1 && names.length === memberships.length ? t('alle eure Familien') : joinNames(names)
  if (families && guestCount > 0) return t('{families} und eure Gäste', { families })
  if (families) return families
  if (guestCount > 0) return t('eure Gäste')
  return t('noch niemand außer euch')
}

export function memoryLabel(entry, shares, memberships, guestCount) {
  if (entry.privat) return t('Privat – nur ihr')
  return t('Geteilt – sehen {audience}', { audience: sharedAudience(shares, memberships, guestCount) })
}

// Nur die Felder, die PUT /api/timeline/:id braucht, damit sich NUR „privat“ ändert: Fotos, Text, Kategorie, „Erlebt mit“
// und Gesundheit bleiben, wie sie sind (fehlende Felder lässt der Server unverändert, die Fotoliste muss mit).
export function privatPayload(entry, privat) {
  return {
    autorName: entry.autor_name,
    datum: entry.datum,
    titel: entry.titel,
    text: entry.text ?? '',
    fotoUrls: entry.foto_urls || [],
    privat
  }
}

// Ein neuer Zähler nach dem Umschalten einer Erinnerung (Server-Zahlen aus GET /api/sichtbarkeit/uebersicht).
export function withCountChange(counts, dogId, privat) {
  const current = counts[dogId] || { privat: 0, geteilt: 0 }
  const delta = privat ? 1 : -1
  return { ...counts, [dogId]: { ...current, privat: current.privat + delta, geteilt: current.geteilt - delta } }
}

// „So sieht es …“: welche Tiere eine Familie (target.kind 'familie') bzw. ein Gast ('gast') sieht und wie viele ihrer
// Erinnerungen - Private zählen nie mit. sharesOf(dogId) -> Familien-Ids.
export function previewFor(target, animals, sharesOf, counts) {
  if (!target) return []
  const visible = target.kind === 'gast' ? animals : animals.filter((dog) => sharesOf(dog.id).includes(target.id))
  return visible.map((dog) => ({ dog, erinnerungen: counts[dog.id]?.geteilt ?? 0, privat: counts[dog.id]?.privat ?? 0 }))
}

// Rahmen-Links (digitaler Bilderrahmen), die dieses Tier zeigen - eine leere Auswahl heißt „alle Tiere“.
export function framesFor(dogId, geraete) {
  return (geraete || []).filter((geraet) => {
    const tiere = geraet.auswahl?.tiere || []
    return tiere.length === 0 || tiere.includes(dogId)
  })
}
