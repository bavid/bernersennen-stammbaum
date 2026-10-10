// Feedback-Runde: Karten als Kombination (PartnerVisitenkartenPage, components/visitenkarte/KartenWahl.jsx) - vorne
// immer dieselbe Hauptkarte mit euren Kontakten, hinten je nach Wahl euer Portal, ein Einladungscode von Familie auf
// Pfoten oder beides (Kombi). Die Wahl gehört zur Gestaltung (design.karte, server/lib/visitenkarteDesign.js KARTEN) und
// steht in der Adresse (?karte=…); das frühere ?art=einladung öffnet die Einladungskarte. Reine Funktionen.

// Plan 2027: geschenk - vorne das Geschenk-Motiv von Familie auf Pfoten (components/geschenk), hinten ein Einladungscode.
export const KARTE = Object.freeze({ visitenkarte: 'visitenkarte', einladung: 'einladung', kombi: 'kombi', geschenk: 'geschenk' })
export const DEFAULT_KARTE = KARTE.kombi
export const KARTE_PARAM = 'karte'
const LEGACY_PARAM = 'art'
const ROUTE = '/visitenkarten'

export const KARTEN = Object.freeze([
  { id: KARTE.visitenkarte, label: 'Visitenkarte', vorne: 'Kontakte', hinten: 'euer Portal' },
  { id: KARTE.einladung, label: 'Einladungskarte', vorne: 'Kontakte', hinten: 'Einladungscode' },
  { id: KARTE.kombi, label: 'Kombi', vorne: 'Kontakte', hinten: 'Portal + Einladungscode' },
  { id: KARTE.geschenk, label: 'Geschenkkarte', vorne: 'Geschenk-Motiv', hinten: 'Einladungscode' }
])
const IDS = KARTEN.map((karte) => karte.id)

// Trägt die Rückseite einen eigenen Code je Karte? Dann holt "Drucken" die Codes, und ohne Code gibt es keine Karte.
export function backHasCode(karte) {
  return karte === KARTE.einladung || karte === KARTE.kombi || karte === KARTE.geschenk
}

// Die Kombination aus der Adresse - oder null (dann gilt die gespeicherte).
export function karteFromParams(params) {
  const karte = params.get(KARTE_PARAM)
  if (IDS.includes(karte)) return karte
  return params.get(LEGACY_PARAM) === KARTE.einladung ? KARTE.einladung : null
}

// Einstieg in den Designer, auf Wunsch mit vorgewählter Kombination (ohne: die gespeicherte, sonst Kombi).
export function karteRoute(karte = null) {
  return karte ? `${ROUTE}?${KARTE_PARAM}=${karte}` : ROUTE
}
