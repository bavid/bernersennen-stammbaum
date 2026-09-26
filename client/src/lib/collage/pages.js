import { dogLabel, displayName, shortName } from '../timeline.js'
import { formatDateLong, formatDateShort } from '../dates.js'

let nextId = 0
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(nextId += 1)}`

export function newPhoto(url, caption = '') {
  return { id: newId('photo'), url, caption, focusX: 0.5, focusY: 0.5, zoom: 1 }
}

function parentsLine(dog) {
  const mother = dog.mother ? dogLabel(dog.mother) : dog.mother_freitext
  const father = dog.father ? dogLabel(dog.father) : dog.father_freitext
  return [mother && `Mutter: ${mother}`, father && `Vater: ${father}`].filter(Boolean).join('   ·   ')
}

// Alle Fotos eines Hundes: Porträt zuerst, dann Chronik-Fotos mit Titel und Datum als Unterschrift.
export function photosOfDog(dog, entries) {
  const photos = dog.foto_url ? [{ url: dog.foto_url, caption: '' }] : []
  for (const entry of entries) {
    for (const url of entry.foto_urls || []) {
      photos.push({ url, caption: `${entry.titel} · ${formatDateShort(entry.datum)}` })
    }
  }
  const seen = new Set()
  return photos.filter((photo) => !seen.has(photo.url) && seen.add(photo.url))
}

function chunk(list, size) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}

// Seiten aus den gewählten Hunden: optional eine Übersicht aller Porträts, dann je Hund
// so viele Seiten wie nötig. dogsData: [{ dog, entries }] in Auswahl-Reihenfolge.
export function buildPages(dogsData, { perPage = 6, overview = false, familyName = '' } = {}) {
  const pages = []
  if (overview) {
    const portraits = dogsData.filter(({ dog }) => dog.foto_url)
    if (portraits.length) {
      pages.push({
        id: newId('page'),
        title: familyName || 'Unser Rudel',
        subtitle: portraits.map(({ dog }) => displayName(dog)).join(' · '),
        footer: '',
        photos: portraits.map(({ dog }) => newPhoto(dog.foto_url, dogLabel(dog)))
      })
    }
  }

  for (const { dog, entries } of dogsData) {
    const photos = photosOfDog(dog, entries)
    const groups = photos.length ? chunk(photos, perPage) : [[]]
    groups.forEach((group, index) => {
      const subtitle = [
        dog.rasse,
        !dog.name_unbekannt && dog.name !== shortName(dog.name) ? dog.name : null,
        dog.geburtsdatum ? `geboren am ${formatDateLong(dog.geburtsdatum)}` : null
      ]
      pages.push({
        id: newId('page'),
        title: groups.length > 1 ? `${displayName(dog)} · ${index + 1}/${groups.length}` : displayName(dog),
        subtitle: subtitle.filter(Boolean).join(' · '),
        footer: parentsLine(dog),
        photos: group.map((photo) => newPhoto(photo.url, photo.caption))
      })
    })
  }
  return pages
}

// Unveränderliche Helfer für den Editor
export function updatePhoto(page, photoId, patch) {
  return { ...page, photos: page.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) }
}

export function removePhoto(page, photoId) {
  return { ...page, photos: page.photos.filter((p) => p.id !== photoId) }
}

export function movePhoto(page, photoId, toIndex) {
  const from = page.photos.findIndex((p) => p.id === photoId)
  if (from < 0) return page
  const target = Math.max(0, Math.min(page.photos.length - 1, toIndex))
  const photos = [...page.photos]
  const [photo] = photos.splice(from, 1)
  photos.splice(target, 0, photo)
  return { ...page, photos }
}

export function usedUrls(pages) {
  return new Set(pages.flatMap((page) => page.photos.map((p) => p.url)))
}
