// Druckkarten für Gutschein-Stapel (AdminPrintPage, VoucherCard): Ziel-Adresse der QR-Codes, Kartenmotiv
// und Aufteilung auf A4-Bögen. Reine Funktionen ohne DOM - die Codes selbst gehen hier nur durch.

// 2 Spalten × 5 Reihen à 85 × 55 mm auf A4 mit 10 mm Rand (print.css)
export const CARDS_PER_SHEET = 10

// Einlöse-Seite der App (App.jsx): der Code steht hinter der Raute, damit er weder im Server-Log noch in
// einem Proxy- oder Browser-Verlauf als Pfad oder Abfrage landet.
const VOUCHER_PATH = '/v'

// Kartenmotive: Kunden-Karte, Partner-Stapel-Karte (Kunden-Gutscheine mit Partner), Partner-Zugangs-Karte
export const DESIGN = Object.freeze({ customer: 'kunde', partner: 'partner', access: 'zugang' })
const ZWECK_PARTNERZUGANG = 'partnerzugang'

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i

// Öffentliche Adresse (PUBLIC_URL, /api/config) oder - als Notnagel - der Ursprung der aktuellen Seite.
export function printBaseUrl(publicUrl, origin) {
  const base = (publicUrl || '').trim() || (origin || '').trim()
  return base.replace(/\/+$/, '')
}

export function voucherUrl(baseUrl, code) {
  return `${baseUrl}${VOUCHER_PATH}#${code}`
}

// Für die Karte: "beispiel-chronik.de" statt der ganzen Adresse
export function hostLabel(baseUrl) {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl.replace(SCHEME_RE, '')
  }
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

// localhost, *.localhost, IPv4 und IPv6 sind kein Ziel für gedruckte Karten - ebenso eine Adresse ohne
// Schema, die ein Handy nicht als Link öffnet.
export function isLocalAddress(url) {
  const hostname = hostnameOf(url)
  if (hostname === null) return true
  const bare = hostname.replace(/^\[|\]$/g, '')
  return bare === 'localhost' || bare.endsWith('.localhost') || IPV4_RE.test(bare) || bare.includes(':')
}

export function needsPublicUrl(publicUrl) {
  return !publicUrl || isLocalAddress(publicUrl)
}

// Feedback-Runde: Partner sehen nie eine technische Adresse (die Warnung mit Adresse bleibt der Druckseite des Admins).
// Ohne öffentliche Domain (PUBLIC_URL fehlt oder ist localhost/eine IP) wartet der Druck echter Karten mit diesem einen
// Satz - außer in Vorschau und Testsystem (appEnv staging/dev); Demo und Admin-Ansicht (readOnly) drucken Muster. Ist die
// Umgebung unbekannt (Konfiguration nicht geladen), gilt wie in Produktion: lieber warten als falsche QR-Ziele drucken.
export const ADDRESS_PENDING_TEXT = 'Drucken ist bald möglich – wir richten gerade die Adresse der Plattform ein.'
const TEST_ENVS = Object.freeze(['staging', 'dev'])

export function printAddressPending({ appEnv, publicUrl, readOnly = false }) {
  return !readOnly && !TEST_ENVS.includes(appEnv) && needsPublicUrl(publicUrl)
}

// Motiv eines Stapels (server/lib/voucherPrint.js printBatch): partnerzugang schlägt alles, sonst
// entscheidet der Partner. Ältere Stapel ohne zweck sind Kunden-Gutscheine.
export function cardDesign(batch) {
  if (batch.zweck === ZWECK_PARTNERZUGANG) return DESIGN.access
  return batch.partner ? DESIGN.partner : DESIGN.customer
}

export function chunkCards(codes, perSheet = CARDS_PER_SHEET) {
  const sheets = []
  for (let start = 0; start < codes.length; start += perSheet) {
    sheets.push(codes.slice(start, start + perSheet))
  }
  return sheets
}
