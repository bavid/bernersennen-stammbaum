// Reiter in "Entdecken" (Phase U, DiscoverPage/DiscoverTabs/DiscoverPanel): statt fünf langer Kapitel
// untereinander eine Reiter-Leiste mit Zählern. "Alle" zeigt je Bereich höchstens PREVIEW_LIMIT Einträge und
// "Alle anzeigen"; der gewählte Reiter steht in der Adresse (?bereich=). Reine Funktionen über die
// normalisierte Antwort (lib/discover.js normalizeDiscover).
import { isClickUrl } from './discover.js'
import { t } from './i18n/index.js'

export const ALL_TAB = 'alle'
export const TAB_PARAM = 'bereich'
// Audit W: zwei je Bereich (und kompakte Karten, DiscoverSections) - „Alle“ soll ein Überblick bleiben, keine lange Seite.
export const PREVIEW_LIMIT = 2
// Phase W, Schritt 2: "Karte" - Tierheime und Hundeschulen in der Nähe über OpenStreetMap (früher die Seite /umgebung,
// components/nearby/NearbySearch.jsx). Kein Bereich der Antwort von POST /api/discover, darum ohne Zähler.
export const MAP_TAB = 'karte'
// Phase M: „Mein Revier“ - öffentliche Profile in der Nähe, Folgen und „Aus deinem Revier“ (components/revier). Eigene
// Abfragen (server/routes/revier.js), darum ohne Zähler; nicht in der Kundensicht und nicht in einer Rudel-Instanz.
export const REVIER_TAB = 'revier'

export const DISCOVER_TABS = [
  { key: ALL_TAB, label: 'Alle' },
  { key: 'hundeschulen', label: 'Hundeschulen' },
  { key: 'salon', label: 'Salon & Betreuung' },
  { key: 'begleiter', label: 'Neue Begleiter' },
  { key: 'futter', label: 'Futter' },
  { key: 'unterstuetzen', label: 'Unterstützen' },
  { key: MAP_TAB, label: 'Karte' },
  { key: REVIER_TAB, label: 'Mein Revier' }
]

const OWN_TABS = [ALL_TAB, MAP_TAB, REVIER_TAB]
export const SECTION_KEYS = DISCOVER_TABS.filter((tab) => !OWN_TABS.includes(tab.key)).map((tab) => tab.key)

// Die Kundensicht (preview) zeigt, wie Entdecken für die Kundschaft aussieht - ohne Karte und ohne „Mein Revier“; eine
// Rudel-Instanz (revier: false) hat kein Revier.
export function discoverTabsFor({ preview = false, revier = true } = {}) {
  if (preview) return DISCOVER_TABS.filter((tab) => tab.key !== MAP_TAB && tab.key !== REVIER_TAB)
  return revier ? DISCOVER_TABS : DISCOVER_TABS.filter((tab) => tab.key !== REVIER_TAB)
}

export function tabLabel(key) {
  const label = DISCOVER_TABS.find((tab) => tab.key === key)?.label
  return label ? t(label) : key
}

// Unbekannte oder fehlende Werte in der Adresse landen bei "Alle" - die Karte nur außerhalb der Kundensicht.
export function tabFromParam(value, { preview = false } = {}) {
  if (value === MAP_TAB || value === REVIER_TAB) return preview ? ALL_TAB : value
  return SECTION_KEYS.includes(value) ? value : ALL_TAB
}

// Kundensicht: in welchem Bereich die eigene Karte steht - wie server routes/partnerArea/preview.js SECTION_BY_TYP.
// Futter und Sonstige haben keinen eigenen Bereich, dort öffnet "Alle".
const OWN_SECTION_BY_TYP = Object.freeze({
  hundeschule: 'hundeschulen',
  hundesalon: 'salon',
  betreuung: 'salon',
  tierheim: 'begleiter',
  vermittlung: 'begleiter'
})

export function ownSectionTab(typ) {
  return typeof typ === 'string' && Object.hasOwn(OWN_SECTION_BY_TYP, typ) ? OWN_SECTION_BY_TYP[typ] : ALL_TAB
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
