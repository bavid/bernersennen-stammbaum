// „Spenden live“ auf /finanzierung und „Spenden erfassen“ im Admin: Texte und Formular-Helfer. Reine Funktionen, Beträge
// in ganzen Cent. Daten: GET /api/finanzierung/live (server/lib/spendenLive.js). Ruhig und ehrlich - kein Druck, keine
// Alarmfarben; die Kosten heißen neutral nach Kategorie (Server & Technik · Druck & Material · Sonstiges).

import { formatEuroCents } from './discover.js'
import { parseEuroToCents, centsToEuroInput } from './euro.js'
import { verteileUeberschuss } from './finanzierungRuecklage.js'
import { locale, t } from './i18n/index.js'

// Wie server/lib/finanzierungKosten.js KATEGORIEN.
export const KATEGORIEN = Object.freeze([
  { key: 'technik', label: 'Server & Technik', kurz: 'Server & Technik' },
  { key: 'druck', label: 'Druck & Material (Flyer, Karten)', kurz: 'Druck & Material' },
  { key: 'sonstiges', label: 'Sonstiges', kurz: 'Sonstiges' }
])

// Wie server/lib/spenden.js QUELLEN.
export const QUELLEN = Object.freeze([
  { key: 'gofundme', label: 'GoFundMe' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'ueberweisung', label: 'Überweisung' },
  { key: 'bar', label: 'Bar' },
  { key: 'sonstiges', label: 'Sonstiges' }
])

export const SPENDE_LIMITS = Object.freeze({ anzeigename: 40, nachricht: 140 })
export const POLL_MS = 60 * 1000

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HTML_RE = /[<>]/

export function kategorieLabel(key, kurz = false) {
  const kategorie = KATEGORIEN.find((k) => k.key === key)
  if (!kategorie) return ''
  return t(kurz ? kategorie.kurz : kategorie.label)
}

export function quelleLabel(key) {
  const quelle = QUELLEN.find((q) => q.key === key)
  return quelle ? t(quelle.label) : ''
}

// „Laufende Kosten: Server & Technik · Druck & Material (Flyer, Karten)“ - nur die Kategorien, die es gibt, in fester Folge.
export function kategorienText(posten) {
  const vorhanden = new Set((posten || []).map((p) => p.kategorie || 'technik'))
  const labels = KATEGORIEN.filter((k) => vorhanden.has(k.key)).map((k) => t(k.label))
  return labels.length ? t('Laufende Kosten: {kategorien}', { kategorien: labels.join(' · ') }) : ''
}

// Balken in Prozent (0-100).
export function deckungFuellstand(deckungProzent) {
  if (typeof deckungProzent !== 'number' || !Number.isFinite(deckungProzent)) return 0
  return Math.min(100, Math.max(0, deckungProzent))
}

export function deckungText(deckungProzent) {
  if (typeof deckungProzent !== 'number') return t('Für diesen Monat sind keine laufenden Kosten eingetragen.')
  if (deckungProzent >= 100) return t('Diesen Monat sind die Kosten gedeckt – danke!')
  return t('Diesen Monat sind {prozent} % der Kosten gedeckt.', { prozent: deckungProzent })
}

function lokalerTag(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function datumKurz(iso) {
  const [jahr, monat, tag] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(jahr, monat - 1, tag))
}

// „gerade eben“, „vor 2 Stunden“ - wenn die Spende heute erfasst wurde und das Datum stimmt; sonst „am 3. Okt.“.
export function zeitText(eintrag, now = Date.now()) {
  const erfasst = Date.parse(eintrag.erfasst)
  const frisch = Number.isFinite(erfasst) && now - erfasst < 24 * HOUR_MS && lokalerTag(new Date(erfasst)) === eintrag.datum
  if (!frisch) return ISO_DATE_RE.test(eintrag.datum || '') ? t('am {datum}', { datum: datumKurz(eintrag.datum) }) : ''
  const minuten = Math.floor(Math.max(0, now - erfasst) / MINUTE_MS)
  if (minuten < 1) return t('gerade eben')
  if (minuten < 60) return minuten === 1 ? t('vor 1 Minute') : t('vor {n} Minuten', { n: minuten })
  const stunden = Math.floor(minuten / 60)
  return stunden === 1 ? t('vor 1 Stunde') : t('vor {n} Stunden', { n: stunden })
}

// „Anonym · 20,00 € · vor 2 Stunden“
export function eintragText(eintrag, now) {
  return [eintrag.name || t('Anonym'), formatEuroCents(eintrag.betragCents), zeitText(eintrag, now)].filter(Boolean).join(' · ')
}

// Was mit den Spenden dieses Monats nach der Regel passiert (Kosten -> Anschub -> Rücklage-Anteil -> weitergegeben).
// finanz: GET /api/finanzierung (ruecklage, kosten.proJahrCents); live: GET /api/finanzierung/live.
export function aufteilungText(live, finanz) {
  // offenCents ist schon NACH allen Spenden bis heute berechnet: ist noch etwas offen, ging der ganze Rest dieses Monats in
  // den Anschub (älteste Kosten zuerst, server/lib/finanzierungVerteilung.js).
  const nachKosten = Math.max(0, live.summeMonat - live.kostenMonat)
  const anschub = live.vorleistung?.offenCents > 0 ? nachKosten : 0
  const v = verteileUeberschuss({
    spendenCents: live.summeMonat,
    kostenCents: live.kostenMonat + anschub,
    ruecklageCents: finanz?.ruecklage?.centsAktuell || 0,
    kostenProJahrCents: finanz?.kosten?.proJahrCents || 0
  })
  if (!v.ueberschussCents) {
    return anschub
      ? t('Was nach den laufenden Kosten bleibt ({betrag}), deckt zuerst den Anschub.', { betrag: formatEuroCents(anschub) })
      : t('Die Spenden dieses Monats decken zuerst die laufenden Kosten.')
  }
  return t('Nach Kosten und Anschub bleiben {ueberschuss}: {reserve} ({prozent} %) gehen in die Rücklage, {weiter} an Tiere und Projekte.', {
    ueberschuss: formatEuroCents(v.ueberschussCents),
    reserve: formatEuroCents(v.reserveCents),
    prozent: v.anteilProzent,
    weiter: formatEuroCents(v.gespendetCents)
  })
}

// „Anschub (Druck & Material): 3.000,00 € – davon gedeckt: 400,00 €“
export function vorleistungText(vorleistung) {
  if (!vorleistung?.gesamtCents) return ''
  const kategorien = vorleistung.kategorien || [...new Set((vorleistung.posten || []).map((p) => p.kategorie))]
  const labels = kategorien.map((key) => kategorieLabel(key, true)).filter(Boolean).join(', ')
  return t('Anschub ({kategorien}): {gesamt} – davon gedeckt: {gedeckt}', {
    kategorien: labels || t('Sonstiges'),
    gesamt: formatEuroCents(vorleistung.gesamtCents),
    gedeckt: formatEuroCents(vorleistung.gedecktCents)
  })
}

// Für die Live-Region: nur wenn sich die Monatssumme ändert - nie bei jedem Abruf.
export function ansageText(vorher, nachher) {
  if (!vorher || !nachher || vorher.summeMonat === nachher.summeMonat) return null
  return t('Neuer Stand: {betrag} an Spenden diesen Monat.', { betrag: formatEuroCents(nachher.summeMonat) })
}

export function hatLiveDaten(live) {
  return Boolean(live && (live.summeGesamt > 0 || live.kostenMonat > 0 || live.vorleistung))
}

// --- Admin: Spende erfassen ---------------------------------------------------------------------------------------------

export function heuteIso(now = new Date()) {
  return lokalerTag(now)
}

export function spendeForm(spende, now = new Date()) {
  if (!spende) return { betrag: '', datum: heuteIso(now), quelle: 'gofundme', anzeigename: '', nachricht: '', oeffentlich: true }
  return {
    betrag: centsToEuroInput(spende.betragCents),
    datum: spende.datum,
    quelle: spende.quelle,
    anzeigename: spende.anzeigename || '',
    nachricht: spende.nachricht || '',
    oeffentlich: spende.oeffentlich
  }
}

function textFehler(value, max) {
  if (value.length > max) return `Höchstens ${max} Zeichen.`
  if (HTML_RE.test(value)) return 'Bitte ohne < und >.'
  return null
}

// { payload, errors } - payload null, sobald ein Feld nicht stimmt.
export function spendePayload(form) {
  const errors = {}
  const betragCents = parseEuroToCents(form.betrag || '')
  if (!betragCents) errors.betrag = 'Bitte einen Betrag in Euro eingeben, z. B. 20,00.'
  if (!ISO_DATE_RE.test(form.datum || '')) errors.datum = 'Bitte ein Datum wählen.'
  if (!QUELLEN.some((q) => q.key === form.quelle)) errors.quelle = 'Bitte eine Quelle wählen.'
  const anzeigename = (form.anzeigename || '').trim()
  const nachricht = (form.nachricht || '').trim()
  const nameFehler = textFehler(anzeigename, SPENDE_LIMITS.anzeigename)
  const nachrichtFehler = textFehler(nachricht, SPENDE_LIMITS.nachricht)
  if (nameFehler) errors.anzeigename = nameFehler
  if (nachrichtFehler) errors.nachricht = nachrichtFehler
  if (Object.keys(errors).length) return { payload: null, errors }
  return { payload: { betragCents, datum: form.datum, quelle: form.quelle, anzeigename, nachricht, oeffentlich: Boolean(form.oeffentlich) }, errors }
}

// --- Admin: Anschub (Vorleistung) ---------------------------------------------------------------------------------------

export function vorleistungForm(vorleistung, now = new Date()) {
  if (!vorleistung) return { titel: 'Anschub', kategorie: 'druck', betrag: '', datum: heuteIso(now), notiz: '' }
  return {
    titel: vorleistung.titel,
    kategorie: vorleistung.kategorie,
    betrag: centsToEuroInput(vorleistung.betragCents),
    datum: vorleistung.datum,
    notiz: vorleistung.notiz || ''
  }
}

export function vorleistungPayload(form) {
  const errors = {}
  const titel = (form.titel || '').trim()
  if (titel.length > 80) errors.titel = 'Höchstens 80 Zeichen.'
  if (!KATEGORIEN.some((k) => k.key === form.kategorie)) errors.kategorie = 'Bitte eine Kategorie wählen.'
  const betragCents = parseEuroToCents(form.betrag || '')
  if (!betragCents) errors.betrag = 'Bitte einen Betrag in Euro eingeben, z. B. 3000,00.'
  if (!ISO_DATE_RE.test(form.datum || '')) errors.datum = 'Bitte ein Datum wählen.'
  const notiz = (form.notiz || '').trim()
  if (notiz.length > 200) errors.notiz = 'Höchstens 200 Zeichen.'
  if (Object.keys(errors).length) return { payload: null, errors }
  return { payload: { titel, kategorie: form.kategorie, betragCents, datum: form.datum, notiz }, errors }
}

// Fehler des Servers ({ error, feld }) auf das Formularfeld.
export function serverFeldFehler(err) {
  const feld = err?.details?.feld
  if (!feld) return null
  return { field: feld === 'betragCents' ? 'betrag' : feld, message: err.message }
}
