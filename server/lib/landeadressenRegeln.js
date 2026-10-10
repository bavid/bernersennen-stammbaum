'use strict'

// Plan 2027 Kap. 6 „Messen ohne Tracking“: Regeln für eigene Landeadressen je Kanal (lib/landeadressen.js) - Kurzname,
// Ziel und Code-Serie prüfen. Reine Funktionen ohne Datenbank, damit die Tests sie direkt prüfen können.

const SLUG_RE = /^[a-z0-9-]{2,30}$/
// Wie lib/adminKpi.js SERIE_PATTERN (Präfix der Stapel-Bezeichnung vor dem „-“).
const SERIE_RE = /^[A-Za-z0-9]{1,8}$/
const ZIEL_MAX = 200
// Nur Pfad, Query und Anker aus harmlosen Zeichen - kein Leerzeichen, kein Backslash, kein Schema.
const ZIEL_RE = /^\/[A-Za-z0-9\-._~/?=&#%]*$/

// Erste Pfad-Ebene der Seiten im Client (App.jsx, AreaRoutes.jsx, lib/areas.js) - ein Ziel muss eine davon sein (oder
// „/“), damit eine Landeadresse nie auf eine andere Landeadresse oder ins Leere zeigt.
const APP_SEITEN = [
  'admin', 'admin-ansicht', 'admin-schreiben', 'alt', 'app', 'beitraege', 'bilderrahmen', 'collage', 'datenschutz',
  'demo-start', 'einstellungen', 'entdecken', 'familien', 'familienbande', 'finanzierung', 'hund', 'impressum',
  'kalender', 'kundensicht', 'mitglieder', 'nachrichten', 'netzwerk', 'p', 'partner', 'partner-drucken',
  'partner-werden', 'pinnwand', 'profil', 'rahmen', 'stammbaum', 'start', 't', 'tier', 'tiere', 'umgebung', 'v',
  'visitenkarten', 'vorstellung', 'wegbegleiter', 'wuerfe', 'zuchtbuch', 'zugang'
]

// Server-Pfade (app.js), Dateien/Ordner aus client/dist und Namen, die absehbar Seiten werden - nie als Kurzname.
const SYSTEM_PFADE = [
  'api', 'uploads', 'partner-media', 'public-media', 'rahmen-foto', 'r', 'health', 'robots', 'sitemap', 'assets',
  'icons', 'schriften', 'stickers', 'splash', 'i18n', 'media', 'sw', 'offline', 'manifest', 'favicon', 'index',
  'static', 'login', 'logout', 'anmelden', 'abmelden', 'registrieren', 'hilfe', 'kontakt', 'suche', 'demo',
  'startpaket', 'geschenk', 'geschenke', 'gruss', 'gruesse', 'grusskarte', 'einladung', 'einladungen', 'gutschein',
  'gutscheine', 'tierheim', 'tierheime', 'zuhause', 'rudel', 'besuche', 'timeline', 'erinnerungen', 'www', 'mail',
  'null', 'undefined'
]

const RESERVIERT = new Set([...APP_SEITEN, ...SYSTEM_PFADE])
const APP_SEITEN_SET = new Set(APP_SEITEN)

function httpError(status, message, feld) {
  const err = new Error(message)
  err.status = status
  if (feld) err.feld = feld
  return err
}

function cleanSlug(value) {
  const slug = String(value ?? '').trim().toLowerCase()
  if (!SLUG_RE.test(slug)) {
    throw httpError(400, 'Kurzname: 2 bis 30 Zeichen, nur a–z, 0–9 und Bindestrich.', 'slug')
  }
  if (slug.startsWith('-') || slug.endsWith('-')) throw httpError(400, 'Kurzname darf nicht mit „-“ beginnen oder enden.', 'slug')
  if (RESERVIERT.has(slug)) throw httpError(400, 'Diesen Kurznamen nutzt die App schon selbst.', 'slug')
  return slug
}

// Ziel in der App: „/“ oder eine Seite aus APP_SEITEN, nie „//…“ (fremde Adresse) - ohne Angabe „/“.
function cleanZiel(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '/'
  const ziel = String(value).trim()
  const ersteEbene = ziel.slice(1).split(/[/?#]/)[0]
  const gueltig =
    ziel.length <= ZIEL_MAX &&
    ZIEL_RE.test(ziel) &&
    !ziel.startsWith('//') &&
    (ersteEbene === '' || APP_SEITEN_SET.has(ersteEbene.toLowerCase()))
  if (!gueltig) throw httpError(400, 'Ziel muss eine Seite der App sein, z. B. / oder /partner-werden.', 'ziel')
  return ziel
}

// Optionale Code-Serie (z. B. „FB“) - leer -> null, sonst groß geschrieben.
function cleanSerie(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const serie = String(value).trim()
  if (!SERIE_RE.test(serie)) throw httpError(400, 'Code-Serie: 1 bis 8 Buchstaben oder Ziffern, z. B. FB.', 'serie')
  return serie.toUpperCase()
}

function isReserviert(slug) {
  return RESERVIERT.has(String(slug ?? '').toLowerCase())
}

module.exports = { SLUG_RE, APP_SEITEN, SYSTEM_PFADE, httpError, cleanSlug, cleanZiel, cleanSerie, isReserviert }
