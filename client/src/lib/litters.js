// Würfe: entstehen automatisch aus dem Stammbaum – Geschwister mit gleichen Eltern und gleichem Geburtstag.
import { displayName } from './timeline.js'
import { todayIso } from './dates.js'

const DAY_MS = 86400000
const GESTATION_DAYS = 63 // Tragzeit einer Hündin, ungefähr
const MATING_TO_BIRTH = [50, 80] // so viele Tage liegen zwischen Deckakt und Geburt, wenn sie zusammengehören
const PLANNED_GRACE_DAYS = 14 // so lange nach dem errechneten Termin gilt ein Wurf noch als "erwartet"

const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10)
const daysBetween = (fromIso, toIsoDate) => Math.round((toUtc(toIsoDate) - toUtc(fromIso)) / DAY_MS)
const addDays = (iso, days) => toIso(toUtc(iso) + days * DAY_MS)

function monthsBetween(fromIso, toIsoDate) {
  const [ya, ma, da] = fromIso.split('-').map(Number)
  const [yb, mb, db] = toIsoDate.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma) - (db < da ? 1 : 0)
}

const parentKey = (id, text) => (id ? `id:${id}` : text ? `text:${text.trim().toLowerCase()}` : null)

function parentOf(id, text, dogsById) {
  if (id) {
    const dog = dogsById.get(id) || null
    return { id, name: dog ? displayName(dog) : 'Unbekannt', dog }
  }
  return text ? { id: null, name: text, dog: null } : null
}

// Liefert { litters, planned, history }: Würfe (neueste zuerst) samt zugehörigem Deckakt, erwartete Würfe
// mit Countdown und ältere Deckakte ohne erfassten Wurf.
export function buildLitters(dogs, breedingEvents = [], today = todayIso()) {
  const dogsById = new Map(dogs.map((dog) => [dog.id, dog]))
  const groups = new Map()
  for (const dog of dogs) {
    const mother = parentKey(dog.mother_dog_id, dog.mother_freitext)
    const father = parentKey(dog.father_dog_id, dog.father_freitext)
    if (!mother && !father) continue
    const key = [mother, father, dog.geburtsdatum || '?'].join('|')
    groups.set(key, [...(groups.get(key) || []), dog])
  }

  const matched = new Set()
  const litters = [...groups.entries()].map(([key, puppies]) => {
    const first = puppies[0]
    const birthDate = first.geburtsdatum || null
    const breeding =
      birthDate &&
      breedingEvents.find((event) => {
        if (matched.has(event.id) || event.mutter_dog_id !== first.mother_dog_id) return false
        const days = daysBetween(event.datum, birthDate)
        return days >= MATING_TO_BIRTH[0] && days <= MATING_TO_BIRTH[1]
      })
    if (breeding) matched.add(breeding.id)
    return {
      key,
      birthDate,
      mother: parentOf(first.mother_dog_id, first.mother_freitext, dogsById),
      father: parentOf(first.father_dog_id, first.father_freitext, dogsById),
      puppies: [...puppies].sort((a, b) => displayName(a).localeCompare(displayName(b))),
      breeding: breeding || null
    }
  })
  litters.sort((a, b) => (b.birthDate || '').localeCompare(a.birthDate || ''))

  const planned = []
  const history = []
  for (const event of breedingEvents) {
    if (matched.has(event.id)) continue
    const expectedBirth = addDays(event.datum, GESTATION_DAYS)
    const daysUntil = daysBetween(today, expectedBirth)
    if (daysUntil >= -PLANNED_GRACE_DAYS) planned.push({ event, expectedBirth, daysUntil })
    else history.push(event)
  }
  planned.sort((a, b) => a.daysUntil - b.daysUntil)
  return { litters, planned, history }
}

// Schlüssel der jüngsten Altersstufe - LitterCard ersetzt deren Beschriftung durch das Wort des Auftritts
// (words.youngStage, Phase U: Standard "Ganz klein").
export const YOUNG_STAGE_KEY = 'welpe'

// Altersstufe eines Datums, bezogen auf den Geburtstag (für "Fotos im gleichen Alter")
export function ageBucket(birthDate, date) {
  const months = monthsBetween(birthDate, date)
  if (months < 0) return null
  if (months < 4) return { key: YOUNG_STAGE_KEY, label: 'Als Welpen', order: 0 }
  if (months < 9) return { key: 'halbjahr', label: 'Mit einem halben Jahr', order: 1 }
  if (months < 18) return { key: 'jahr-1', label: 'Mit einem Jahr', order: 2 }
  const years = Math.floor((months + 6) / 12)
  return { key: `jahr-${years}`, label: `Mit ${years} Jahren`, order: years + 1 }
}

// Pro Altersstufe das erste Chronik-Foto jedes Geschwisters – nur Stufen, die mindestens zwei vergleichen
export function photosByAge(litter, entries) {
  if (!litter.birthDate) return []
  const puppyIds = new Set(litter.puppies.map((p) => p.id))
  const stages = new Map()
  const chronological = [...entries].sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id)
  for (const entry of chronological) {
    if (!puppyIds.has(entry.dog_id) || !entry.foto_urls?.length) continue
    const bucket = ageBucket(litter.birthDate, entry.datum)
    if (!bucket) continue
    const stage = stages.get(bucket.key) || { ...bucket, byDog: new Map() }
    if (!stage.byDog.has(entry.dog_id)) {
      stage.byDog.set(entry.dog_id, { url: entry.foto_urls[0], entryId: entry.id, datum: entry.datum, titel: entry.titel })
    }
    stages.set(bucket.key, stage)
  }
  return [...stages.values()]
    .filter((stage) => stage.byDog.size >= 2)
    .sort((a, b) => a.order - b.order)
    .map(({ key, label, byDog }) => ({
      key,
      label,
      photos: litter.puppies.filter((p) => byDog.has(p.id)).map((p) => ({ dog: p, ...byDog.get(p.id) }))
    }))
}

// Nächster Geburtstag des Wurfs: Datum, Alter an dem Tag und Tage bis dahin (0 = heute)
export function nextLitterBirthday(birthDate, today = todayIso()) {
  if (!birthDate) return null
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty] = today.split('-').map(Number)
  const onYear = (year) => `${year}-${String(bm).padStart(2, '0')}-${String(bd).padStart(2, '0')}`
  let year = ty
  if (onYear(year) < today) year += 1
  const date = onYear(year)
  return { date, age: year - by, daysUntil: daysBetween(today, date) }
}

// Zuletzt geschriebener Eintrag je Tier
export function latestEntries(entries) {
  const latest = new Map()
  for (const entry of entries) {
    const current = latest.get(entry.dog_id)
    if (!current || entry.created_at > current.created_at || (entry.created_at === current.created_at && entry.id > current.id)) {
      latest.set(entry.dog_id, entry)
    }
  }
  return latest
}
