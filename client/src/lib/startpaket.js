import { ageText, formatDateLong } from './dates.js'
import { displayName, speciesLabel } from './timeline.js'

// Tierheim-Startpaket (Plan 2027): eine Druckmappe, die das Tierheim bei der Vermittlung mitgibt - Seite 1 der
// Steckbrief, Seite 2 die ersten Erinnerungen, Seite 3 der Übergabe-QR. Hier steht nur das Inhaltsmodell; die Seite
// (pages/StartpaketPage.jsx) zeichnet es. Der Übergabe-Code kommt nie aus der Adresse: nur aus dem State der
// Navigation (HandoverDialog) oder frisch erzeugt auf der Seite selbst - und landet nur im QR und im Drucktext.

export const STARTPAKET_RE = /^\/tier\/(\d+)\/startpaket\/?$/
export const MAX_MEMORIES = 4
// Demo-Tierheim: kein echter Code - der QR zeigt nur auf die Einlöse-Seite, deutlich als „Muster“ markiert.
export const MUSTER_CODE = 'MUSTER'

export function startpaketRoute(dogId) {
  return `/tier/${dogId}/startpaket`
}

// Nur das Tierheim, dem das Tier gehört (art 'tierheim' und canEdit vom Server) - alle anderen sehen nichts.
export function canOpenStartpaket(family, dog) {
  return family?.art === 'tierheim' && Boolean(dog?.canEdit)
}

const byDate = (a, b) => String(a.datum || '').localeCompare(String(b.datum || ''))

// Die ersten Erinnerungen: die ältesten Einträge mit Foto zuerst, fehlen welche, die ältesten ohne Foto.
export function pickMemories(entries = [], max = MAX_MEMORIES) {
  const sorted = [...entries].filter((entry) => entry && entry.datum).sort(byDate)
  const withPhoto = sorted.filter((entry) => entry.foto_urls?.length)
  const withoutPhoto = sorted.filter((entry) => !entry.foto_urls?.length)
  return [...withPhoto, ...withoutPhoto]
    .slice(0, max)
    .sort(byDate)
    .map((entry) => ({
      id: entry.id,
      title: entry.titel || '',
      text: entry.text || '',
      date: formatDateLong(entry.datum),
      iso: entry.datum,
      photo: entry.foto_urls?.[0] || null
    }))
}

function profileOf(dog) {
  const birth = dog.geburtsdatum || null
  return {
    name: displayName(dog),
    fullName: dog.name || '',
    species: speciesLabel(dog.tierart),
    birth: birth ? formatDateLong(birth) : null,
    age: birth ? ageText(birth) : null,
    text: dog.beschreibung || '',
    photo: dog.foto_url || null
  }
}

// handover: { code, link } aus POST /api/dogs/:id/handover (link = "/v#CODE", der Code hinter dem '#'). In der Demo
// gibt es nur das Muster; ohne Code bleibt der QR leer (die Seite bietet dann das Erzeugen an).
function handoverOf({ handover, origin, isDemo }) {
  if (isDemo) return { code: MUSTER_CODE, qrUrl: `${origin}/v`, muster: true }
  if (!handover?.code || !handover?.link) return null
  return { code: handover.code, qrUrl: `${origin}${handover.link}`, muster: false }
}

export function buildStartpaket({ dog, entries, shelter, handover, origin, isDemo = false }) {
  return {
    profile: profileOf(dog),
    shelter: { name: shelter?.name || '', logoUrl: shelter?.logoUrl || null },
    memories: pickMemories(entries),
    handover: handoverOf({ handover, origin, isDemo })
  }
}
