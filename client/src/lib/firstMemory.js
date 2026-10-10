import { readSetting, writeSetting } from './storage.js'
import { homeEntries } from './startFeed.js'

// „Eure erste Erinnerung“ (Plan 2027, components/start/FirstMemoryCard.jsx): ob die Karte auf Start steht und ob ein
// Zuhause sie mit „Später“ weggelegt hat. Gemerkt wird je Zuhause auf diesem Gerät (localStorage über lib/storage.js,
// fehlt der Speicher, kommt die Karte eben wieder).
const skipKey = (familyId) => `ersteErinnerung.spaeter.${familyId}`

export function isFirstMemorySkipped(familyId) {
  return readSetting(skipKey(familyId), false) === true
}

export function rememberFirstMemorySkip(familyId) {
  writeSetting(skipKey(familyId), true)
}

// Erst wenn der Feed ganz geladen ist und darin keine Erinnerung aus dem eigenen Zuhause steht (Erinnerungen aus
// Familien zählen nicht). Gibt es weitere Seiten, ist das Zuhause nicht neu genug - keine Karte.
export function needsFirstMemory(feed) {
  if (!feed || feed.pages === null || feed.error || feed.next) return false
  return homeEntries(feed.pages.flat()).length === 0
}
