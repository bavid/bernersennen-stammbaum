// Bereiche eines Haushalts: das eigene "Zuhause" (art: 'zuhause') und die Familien/Rudel, denen es beitritt.

// Phase W (Ruhige Hülle): Startseite je Kontext - das eigene Zuhause und klassische Familien-Logins (gemeinsamer
// Schlüssel, kein Zuhause dahinter) starten auf /start (Neuigkeiten), ein Haushalt in einer Familie oder zu Besuch auf
// deren Gruppenseite /familien/:id, Tierheime auf ihren Tieren, Partner-Bereiche (Phase P) im Profil.
export const START_ROUTE = '/start'
export const FAMILIES_ROUTE = '/familien'

const PARTNER_START_ROUTES = {
  tierheim: '/tiere',
  partner: '/profil'
}

// Haushalt als Identität (me.home.art 'zuhause') - im eigenen Zuhause, in einer Familie oder zu Besuch. Ohne home
// (z. B. in Tests) zählt der Bereich selbst.
export function isHouseholdIdentity(family) {
  return family?.home ? family.home.art === 'zuhause' : family?.art === 'zuhause'
}

// Wo steht die Sitzung? 'home' (eigenes Zuhause), 'group' (Haushalt in einer seiner Familien), 'visit' (zu Besuch in
// einem befreundeten Zuhause), 'classic' (Login mit dem Schlüssel einer Familie), 'tierheim' bzw. 'partner'.
export function areaContext(family) {
  if (PARTNER_START_ROUTES[family?.art]) return family.art
  if (!isHouseholdIdentity(family)) return 'classic'
  if (family.zuBesuch) return 'visit'
  return family.home && family.home.id !== family.id ? 'group' : 'home'
}

// Gruppenseite einer Familie bzw. eines befreundeten Zuhauses, optional mit Reiter (?reiter=…).
export function groupRoute(id, reiter) {
  return reiter ? `${FAMILIES_ROUTE}/${id}?reiter=${encodeURIComponent(reiter)}` : `${FAMILIES_ROUTE}/${id}`
}

export function startRoute(family) {
  const context = areaContext(family)
  if (PARTNER_START_ROUTES[context]) return PARTNER_START_ROUTES[context]
  if (context === 'group' || context === 'visit') return groupRoute(family.id)
  return START_ROUTE
}

// Wohin "zurück zu den Tieren" führt (z. B. von einer Tierseite): Tierheime und das eigene Zuhause zu /tiere, eine
// Familie oder ein Besuch zum Reiter "Tiere" ihrer Gruppenseite - dort, wo man das Tier gesehen hat.
export function animalsRoute(family) {
  const context = areaContext(family)
  return context === 'group' || context === 'visit' ? groupRoute(family.id, 'tiere') : '/tiere'
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
  return isPartnerArea(family) ? 'Einladungscode weitergeben' : 'Jemanden einladen'
}

// Fester Anzeigename für den privaten Bereich eines Haushalts (Konto-Menü, Seitenköpfe, Besuchsband), unabhängig vom
// gespeicherten Namen (den ein Haushalt z. B. in Tests oder künftig beim Umbenennen tragen kann). Phase W: überall
// „Mein Zuhause“ statt „Meine Chronik“.
export const HOME_LABEL = 'Mein Zuhause'

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

