// Bereiche eines Haushalts: das eigene "Zuhause" (art: 'zuhause') und die Familien/Rudel, denen es beitritt.

// Startseite je aktivem Bereich: Zuhause -> Wegbegleiter, Tierheim -> Tiere, Partner-Bereich (Phase P)
// -> Profil, Familie/Rudel -> Stammbaum. Gilt auch für klassische Rudel-Logins (kein home.art ===
// 'zuhause'), die landen wie bisher am Stammbaum.
const START_ROUTES = {
  zuhause: '/wegbegleiter',
  tierheim: '/tiere',
  partner: '/profil'
}

export function startRoute(family) {
  return START_ROUTES[family?.art] || '/stammbaum'
}

// Bereiche, die zu einem Partner gehören (server/lib/context.js PARTNER_AREA_ARTS): Tierheime bzw.
// Vermittlungen ('tierheim') und alle anderen Partner ('partner'). me.partner ist dann gesetzt.
const PARTNER_AREA_ARTS = ['tierheim', 'partner']

export function isPartnerArea(family) {
  return PARTNER_AREA_ARTS.includes(family?.art)
}

// Beschriftung für "Gutscheine weitergeben" (Fuß der App, Dialog-Titel): Partner und Tierheime geben
// Kunden-Gutscheine an ihre Kundschaft weiter, Haushalte und Rudel laden jemanden ein.
export function inviteLabel(family) {
  return isPartnerArea(family) ? 'Kunden-Gutschein weitergeben' : 'Jemanden einladen'
}

// Fester Anzeigename für den privaten Bereich eines Haushalts im Bereichswechsler, unabhängig vom
// gespeicherten Namen (den ein Haushalt z. B. in Tests oder künftig beim Umbenennen tragen kann).
export const HOME_LABEL = 'Meine Chronik'

// Ist ein Tier im aktiven Bereich bearbeitbar? Die Listen-Endpunkte liefern can_edit (1/0) für jedes
// Tier – eigene und hierher geteilte gemischt. can_edit fehlt in manchen Listen (z. B. der eigenen
// Chronik, die ohnehin nur eigene Tiere zurückgibt) – dann gilt es als bearbeitbar (Rückwärtskompatibilität
// mit Altdaten/Listen ohne das Feld). Geteilte Tiere anderer Bereiche dürfen nicht als Schreibziel
// (Mitbewohner, Eltern, Zuchtpartner …) angeboten werden, auch wenn sie hier sichtbar sind.
export function isEditable(dog) {
  return dog.can_edit === undefined || Boolean(dog.can_edit)
}

// Phase W: Bereichs-Id aus der Adresse (/familien/:id, /tier/:id?in=…) - nur eine ganze Zahl > 0 (als Zahl oder reine
// Ziffernfolge), sonst null. So landet nie "3abc", "-1" oder "1e3" in einem Bereichswechsel.
const AREA_ID_RE = /^[1-9]\d{0,15}$/

export function parseAreaId(value) {
  if (Number.isSafeInteger(value) && value > 0) return value
  if (typeof value !== 'string' || !AREA_ID_RE.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

