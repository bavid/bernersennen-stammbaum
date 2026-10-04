import { formatDateLong } from './dates.js'

// „Erinnerung festhalten“ (components/TimelineEntryForm.jsx): Überschrift aus den ersten Worten, die beiden Möglichkeiten
// der Sichtbarkeit und der Entwurf, der ein versehentliches Schließen übersteht.

const TITLE_MAX = 60
const SENTENCE_END = /[.!?…](\s|$)/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UPLOAD_URL = /^\/uploads\/[\w.-]+$/
const MAX_DRAFT_PHOTOS = 20
const DRAFT_PREFIX = 'chronik.entwurf.'

// Der Server verlangt eine Überschrift - ohne eigene nehmen wir den ersten Satz (höchstens TITLE_MAX Zeichen, an einer
// Wortgrenze gekürzt), ohne Text „Erinnerung vom 4. Oktober 2026“.
export function titleSuggestion(text, datum, entryWord) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return datum ? `${entryWord} vom ${formatDateLong(datum)}` : entryWord
  const end = flat.search(SENTENCE_END)
  const sentence = end > 0 ? flat.slice(0, flat[end] === '.' ? end : end + 1) : flat
  if (sentence.length <= TITLE_MAX) return sentence
  const cut = sentence.slice(0, TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[,;:–-]+$/, '').trim()} …`
}

export function joinNames(names) {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`
}

// Zwei Möglichkeiten statt einer Checkbox: privat (nur das eigene Zuhause) oder geteilt - dann sehen es die Familien, in die
// das Tier geteilt ist (shareNames, lib/dogProfile.js visibleInNames), und Gäste, die euch besuchen.
export function visibilityOptions(shareNames = []) {
  const shared =
    shareNames.length > 2 ? `Mit ${shareNames[0]} und ${shareNames.length - 1} weiteren teilen` : shareNames.length ? `Mit ${joinNames(shareNames)} teilen` : 'Mit Familie & Gästen teilen'
  return [
    { privat: true, label: 'Nur wir (privat)', hint: 'Sehen nur die Menschen in eurem Zuhause.' },
    {
      privat: false,
      label: shared,
      hint: shareNames.length ? `Sehen auch ${joinNames(shareNames)} und eure Gäste.` : 'Sehen auch eure Gäste und die Familien, in denen das Tier zu sehen ist.'
    }
  ]
}

// --- Entwurf -------------------------------------------------------------------------------------------------------
// Nur in dieser Browser-Sitzung (sessionStorage) - Erinnerungen sind persönlich und sollen auf einem geteilten Gerät nicht
// liegen bleiben; beim Abmelden räumt App.jsx sie weg (clearDrafts). Gelesen wird nur, was wir selbst schreiben.

export function draftHasContent(draft) {
  return Boolean(draft && (String(draft.text || '').trim() || String(draft.titel || '').trim() || draft.fotos?.length))
}

function cleanDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const text = typeof value.text === 'string' ? value.text.slice(0, 5000) : ''
  const titel = typeof value.titel === 'string' ? value.titel.slice(0, 120) : ''
  const draft = {
    text,
    titel,
    datum: typeof value.datum === 'string' && ISO_DATE.test(value.datum) ? value.datum : '',
    fotos: Array.isArray(value.fotos) ? value.fotos.filter((url) => typeof url === 'string' && UPLOAD_URL.test(url)).slice(0, MAX_DRAFT_PHOTOS) : [],
    privat: value.privat === true,
    erlebtMit: Array.isArray(value.erlebtMit) ? value.erlebtMit.filter(Number.isInteger) : []
  }
  return draftHasContent(draft) ? draft : null
}

function storage() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readDraft(key) {
  try {
    const raw = storage()?.getItem(DRAFT_PREFIX + key)
    return raw ? cleanDraft(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeDraft(key, draft) {
  try {
    storage()?.setItem(DRAFT_PREFIX + key, JSON.stringify(draft))
  } catch {
    // Ohne Speicher gibt es eben keinen Entwurf.
  }
}

export function removeDraft(key) {
  try {
    storage()?.removeItem(DRAFT_PREFIX + key)
  } catch {
    // nichts zu entfernen
  }
}

export function clearDrafts() {
  const store = storage()
  if (!store) return
  try {
    const keys = Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key) => key?.startsWith(DRAFT_PREFIX))
    for (const key of keys) store.removeItem(key)
  } catch {
    // nichts zu entfernen
  }
}
