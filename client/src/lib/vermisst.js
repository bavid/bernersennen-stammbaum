import { ageText } from './dates.js'
import { displayName, sexLabel, speciesLabel } from './timeline.js'
import { isVisit } from './visits.js'

// Vermisst-Modus (Plan 2027): ein Suchplakat aus der Chronik für ein eigenes Tier. Nichts wird gespeichert, hochgeladen
// oder veröffentlicht - die Angaben auf der Seite (Ort, Zeit, Telefon, Chipnummer) leben nur im Speicher der Seite.
// Statt eines eigenen Registers verweist das Plakat auf TASSO und FINDEFIX.

export const VERMISST_RE = /^\/tier\/(\d+)\/vermisst\/?$/
export const MAX_PHOTOS = 6
export const REGISTRIES = Object.freeze([
  { name: 'TASSO', url: 'tasso.net' },
  { name: 'FINDEFIX', url: 'findefix.com' }
])
export const EMPTY_INPUTS = Object.freeze({ seenDate: '', seenPlace: '', contact: '', chip: '' })

export function vermisstRoute(dogId) {
  return `/tier/${dogId}/vermisst`
}

// Nur ein eigenes Tier im eigenen Zuhause, das noch bei euch lebt - nicht zu Besuch, nicht in Familie oder Tierheim.
export function canMakePoster(family, dog) {
  return family?.art === 'zuhause' && !isVisit(family) && Boolean(dog?.canEdit) && !dog?.bei_uns_bis
}

// Bis zu sechs Fotos zur Wahl: das Porträt zuerst, dann die neuesten Fotos aus der Chronik, ohne Doppelte.
export function pickPhotos(dog, entries = [], max = MAX_PHOTOS) {
  const fromEntries = [...entries]
    .filter((entry) => entry?.foto_urls?.length)
    .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')))
    .flatMap((entry) => entry.foto_urls)
  return [...new Set([dog?.foto_url, ...fromEntries].filter(Boolean))].slice(0, max)
}

// Die Steckbrief-Zeilen des Plakats: nur, was im Profil steht.
export function posterFacts(dog, today) {
  const age = dog.geburtsdatum ? ageText(dog.geburtsdatum, today) : null
  return [
    ['Tierart', speciesLabel(dog.tierart)],
    ['Rasse', dog.tierart === 'anderes' ? '' : dog.rasse || ''],
    ['Farbe & Abzeichen', dog.farbe_markings || ''],
    ['Geschlecht', sexLabel(dog.geschlecht, dog.tierart)],
    ['Alter', age || '']
  ].filter(([, value]) => value)
}

export function buildPoster({ dog, photo, inputs = EMPTY_INPUTS, today }) {
  return {
    name: displayName(dog),
    photo: photo || null,
    facts: posterFacts(dog, today),
    seenDate: inputs.seenDate.trim(),
    seenPlace: inputs.seenPlace.trim(),
    contact: inputs.contact.trim(),
    chip: inputs.chip.trim()
  }
}
