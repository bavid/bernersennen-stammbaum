// Reiter in "Entdecken" (Phase U, DiscoverPage/DiscoverTabs/DiscoverPanel): statt fünf langer Kapitel
// untereinander eine Reiter-Leiste mit Zählern. "Alle" zeigt je Bereich höchstens PREVIEW_LIMIT Einträge und
// "Alle anzeigen"; der gewählte Reiter steht in der Adresse (?bereich=). Reine Funktionen über die
// normalisierte Antwort (lib/discover.js normalizeDiscover).
import { isClickUrl } from './discover.js'

export const ALL_TAB = 'alle'
export const TAB_PARAM = 'bereich'
export const PREVIEW_LIMIT = 3

export const DISCOVER_TABS = [
  { key: ALL_TAB, label: 'Alle' },
  { key: 'hundeschulen', label: 'Hundeschulen' },
  { key: 'salon', label: 'Salon & Betreuung' },
  { key: 'begleiter', label: 'Neue Begleiter' },
  { key: 'futter', label: 'Futter' },
  { key: 'unterstuetzen', label: 'Unterstützen' }
]

export const SECTION_KEYS = DISCOVER_TABS.filter((tab) => tab.key !== ALL_TAB).map((tab) => tab.key)

export function tabLabel(key) {
  return DISCOVER_TABS.find((tab) => tab.key === key)?.label || key
}

// Unbekannte oder fehlende Werte in der Adresse landen bei "Alle".
export function tabFromParam(value) {
  return SECTION_KEYS.includes(value) ? value : ALL_TAB
}

// Spendenlinks nur mit gültiger Klickzählung (wie SupportBlock).
export function donationsOf(support) {
  return support.partnerSpenden.filter((item) => isClickUrl(item.clickUrl))
}

// Einträge je Bereich - Karten (Partner, Tiere, Empfehlungen ohne Partner; seit Phase V1 zählen die Anzeigen auf einer
// Partner-Karte nicht extra: ein Partner = eine Karte) und bei "Unterstützen" die Spendenwege
// (GoFundMe, Spendenlinks, Empfehlungen) samt Transparenzbericht. "alle" ist die Summe.
export function sectionCounts(data) {
  const support = data.unterstuetzen
  const counts = {
    hundeschulen: data.hundeschulPartner.length + data.hundeschulPromotions.length,
    salon: data.salonPartner.length + data.salonPromotions.length,
    begleiter: data.begleiterPartner.length + data.begleiterTiere.length + data.begleiterPromotions.length,
    futter: data.futter.length,
    unterstuetzen:
      support.promotions.length + donationsOf(support).length + (isClickUrl(support.gofundmeClickUrl) ? 1 : 0) + (support.bericht ? 1 : 0)
  }
  return { ...counts, [ALL_TAB]: SECTION_KEYS.reduce((sum, key) => sum + counts[key], 0) }
}

// Hat ein Bereich gar nichts zu zeigen? Unterstützen erst, wenn auch der Aufruf-Text fehlt (wie SupportBlock).
export function isSectionEmpty(key, data, counts = sectionCounts(data)) {
  if (key !== 'unterstuetzen') return counts[key] === 0
  return counts.unterstuetzen === 0 && !data.unterstuetzen.text
}

// Die ersten `limit` Einträge über mehrere Listen hinweg, in ihrer Reihenfolge (z. B. nahe Partner, dann
// Empfehlungen, dann "Weiter weg"). Die eigene Karte der Kundensicht (vorschau: true) bleibt immer sichtbar.
// Ohne endliches limit bleibt alles, wie es ist.
export function limitGroups(groups, limit) {
  if (!Number.isFinite(limit)) return groups
  let remaining = limit
  return groups.map((items) =>
    items.filter((item) => {
      if (remaining > 0) {
        remaining -= 1
        return true
      }
      return item?.vorschau === true
    })
  )
}

export function countItems(groups) {
  return groups.reduce((sum, items) => sum + items.length, 0)
}
