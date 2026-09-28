// Hilfen für den Reiter "Entdecken" (DiscoverPage, PromotionCard, SupportBlock) - reine Funktionen
// über die Antwort von POST /api/discover (server/routes/discover.js).

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// Der Server liefert Spendenbeträge als ganze Cent (eingangCents usw.) - hier in Euro umgerechnet.
export function formatEuroCents(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null
  return EURO.format(cents / 100)
}

// Jeder externe Link kommt vom Server als clickUrl /r/<typ>/<id> (anonyme Klickzählung, leitet nur auf
// gespeicherte Adressen weiter). Nur genau diese Form landet in einem href - nie ein beliebiger String.
const CLICK_URL_RE = /^\/r\/[a-z-]+\/\d+$/

export function isClickUrl(url) {
  return typeof url === 'string' && CLICK_URL_RE.test(url)
}

const KENNZEICHNUNGEN = ['Anzeige', 'Empfehlung', 'Partner']

// Rechtlich vorsichtig: eine unbekannte Kennzeichnung (sollte der Server nie liefern, siehe CHECK in
// server/db.js) wird wie eine Anzeige behandelt - lieber zu deutlich als zu wenig gekennzeichnet.
function normalizeKennzeichnung(kennzeichnung) {
  return KENNZEICHNUNGEN.includes(kennzeichnung) ? kennzeichnung : 'Anzeige'
}

export function isAnzeige(kennzeichnung) {
  return normalizeKennzeichnung(kennzeichnung) === 'Anzeige'
}

export function kennzeichnungLabel({ kennzeichnung, empfohlenVon }) {
  const normalized = normalizeKennzeichnung(kennzeichnung)
  if (normalized === 'Empfehlung' && empfohlenVon) return `Empfehlung von ${empfohlenVon}`
  return normalized
}

// Bezahltes/Provisioniertes ("Anzeige") bekommt rel="sponsored", Empfehlungen und Partner nicht.
export function promotionRel(kennzeichnung) {
  return isAnzeige(kennzeichnung) ? 'sponsored noopener noreferrer' : 'noopener noreferrer'
}

// Umkreis-Fallback: Einträge mit ausserhalb: true hängt der Server nur an, wenn im Radius weniger als
// fünf lagen - die Seite zeigt sie gesondert unter "Weiter weg".
export function splitByDistance(items) {
  return {
    near: items.filter((item) => item.ausserhalb !== true),
    far: items.filter((item) => item.ausserhalb === true)
  }
}

// Nur echte Einträge (Objekte) - null oder Strings in einer Liste würden sonst beim Rendern abstürzen.
function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function normalizeSupport(unterstuetzen) {
  const support = unterstuetzen && typeof unterstuetzen === 'object' ? unterstuetzen : {}
  return {
    gofundmeClickUrl: support.gofundmeClickUrl || null,
    text: support.text || null,
    bericht: support.bericht && typeof support.bericht === 'object' ? support.bericht : null,
    partnerSpenden: asArray(support.partnerSpenden)
  }
}

// Macht aus der Server-Antwort eine Form, in der jeder Abschnitt garantiert vorhanden ist - fehlende
// oder falsch geformte Teile werden zu leeren Listen, damit die Seite nie abstürzt.
export function normalizeDiscover(data) {
  const source = data && typeof data === 'object' ? data : {}
  const hundeschulen = asArray(source.hundeschulen)
  const begleiter = source.begleiter && typeof source.begleiter === 'object' ? source.begleiter : {}
  return {
    hundeschulPartner: hundeschulen.filter((item) => item.kind === 'partner'),
    hundeschulPromotions: hundeschulen.filter((item) => item.kind === 'promotion'),
    begleiterPartner: asArray(begleiter.partner),
    begleiterTiere: asArray(begleiter.tiere),
    futter: asArray(source.futter),
    unterstuetzen: normalizeSupport(source.unterstuetzen),
    fallback: {
      hundeschulen: Boolean(source.fallback?.hundeschulen),
      begleiter: Boolean(source.fallback?.begleiter)
    }
  }
}
