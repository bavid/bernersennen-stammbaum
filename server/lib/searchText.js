'use strict'

// Suche (GET /api/suche, lib/search.js): Text vergleichbar machen, Suchbegriff prüfen, Auszug um den Treffer.
// Gefaltet wird in zwei Fassungen, beide klein geschrieben und ohne Akzente (NFKD, Zeichen wie é -> e):
// - "de": deutsche Umschrift, ä/ö/ü -> ae/oe/ue - "Müller" findet "Mueller" und umgekehrt;
// - "basis": Umlaut ohne Punkte, ä/ö/ü -> a/o/u - "Muller" (ohne Umlaut-Taste getippt) findet "Müller".
// ß wird in beiden zu ss. Ein Text trifft, wenn er in EINER der beiden Fassungen den Suchbegriff (gleich gefaltet) enthält.
// Ohne Abhängigkeit zur Datenbank - lib/searchMatch.js vergleicht damit in der Datenbank.

const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 80
// Obergrenze des gefalteten Begriffs: ä -> ae darf ihn verlängern, aber nicht beliebig.
const MAX_FOLDED_LENGTH = 2 * MAX_QUERY_LENGTH
const EXCERPT_MAX = 140
const ELLIPSIS = '…'
// Wie weit ein Auszug höchstens nach vorn/hinten rückt, um nicht mitten im Wort zu beginnen bzw. zu enden.
const WORD_SNAP = 15

// ς (Schluss-Sigma) -> σ: toLowerCase eines ganzen Texts setzt am Wortende ς, Zeichen für Zeichen σ - so falten beide Wege
// gleich (fold für die Datenbank, foldWithMap für Hervorhebung und Auszug).
const VARIANTS = {
  de: { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', ς: 'σ' },
  basis: { ä: 'a', ö: 'o', ü: 'u', ß: 'ss', ς: 'σ' }
}
const TABLE_RE = /[äöüßς]/g
const SIGMA_RE = /ς/g

const MARKS_RE = /\p{M}/gu
// Steuerzeichen (C0/C1) und Bidi-Steuerzeichen - wie lib/partners.js stripUnsafeChars, hier ohne jede Ausnahme.
const UNSAFE_RE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
const SPACE_RE = /\s+/g

function foldChar(char, table) {
  const lower = char.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(table, lower)) return table[lower]
  // Nach dem Zerlegen noch einmal klein: Kompatibilitätszeichen wie ℌ werden erst dabei zu einem (großen) Buchstaben.
  return lower.normalize('NFKD').replace(MARKS_RE, '').toLowerCase().replace(SIGMA_RE, 'σ')
}

// { folded, starts, ends }: je UTF-16-Stelle des gefalteten Texts, wo das Zeichen im (NFC-)Original beginnt und endet.
function foldWithMap(value, variant) {
  const text = typeof value === 'string' ? value.normalize('NFC') : ''
  const table = VARIANTS[variant]
  let folded = ''
  const starts = []
  const ends = []
  for (let index = 0; index < text.length; ) {
    const char = String.fromCodePoint(text.codePointAt(index))
    const replacement = foldChar(char, table)
    for (let k = 0; k < replacement.length; k += 1) {
      starts.push(index)
      ends.push(index + char.length)
    }
    folded += replacement
    index += char.length
  }
  return { text, folded, starts, ends }
}

// Dasselbe Ergebnis wie foldWithMap(...).folded, aber mit wenigen nativen Schritten statt Zeichen für Zeichen - die
// Datenbank ruft das für jede Zeile eines Bereichs auf (lange Erinnerungstexte), da zählt jede Mikrosekunde.
function fold(value, variant) {
  if (value === null || value === undefined) return ''
  const table = VARIANTS[variant]
  return String(value)
    .normalize('NFC')
    .toLowerCase()
    .replace(TABLE_RE, (char) => table[char])
    .normalize('NFKD')
    .replace(MARKS_RE, '')
    .toLowerCase()
    .replace(SIGMA_RE, 'σ')
}
const foldDe = (value) => fold(value, 'de')
const foldBasis = (value) => fold(value, 'basis')

// Suchbegriff aus der Anfrage: nur ein Text, ohne Steuerzeichen, Leerraum zusammengefasst, 2 bis 80 Zeichen - und
// auch gefaltet noch mindestens 2 Zeichen (sonst träfe ein Begriff aus lauter Akzentzeichen jeden Text). Sonst null.
function cleanQuery(raw) {
  if (typeof raw !== 'string') return null
  // Leerraum vor und nach dem Entfernen zusammenfassen: Zeilenumbrüche sind auch Steuerzeichen, und "a \u200e b" soll kein
  // doppeltes Leerzeichen hinterlassen.
  const query = raw.normalize('NFC').replace(SPACE_RE, ' ').replace(UNSAFE_RE, '').replace(SPACE_RE, ' ').trim()
  const length = [...query].length
  if (length < MIN_QUERY_LENGTH || length > MAX_QUERY_LENGTH) return null
  if (foldBasis(query).trim().length < MIN_QUERY_LENGTH) return null
  // Manche Zeichen werden beim Falten lang (U+FDFA zu 18 Buchstaben) - auch gefaltet bleibt der Begriff kurz.
  if (foldDe(query).length > MAX_FOLDED_LENGTH) return null
  return query
}

// Erste Fundstelle von query in text als { start, end } im NFC-Original (end exklusiv) oder null.
function findMatch(text, query) {
  for (const variant of Object.keys(VARIANTS)) {
    const needle = fold(query, variant)
    if (!needle) continue
    const map = foldWithMap(text, variant)
    const at = map.folded.indexOf(needle)
    if (at >= 0) return { start: map.starts[at], end: map.ends[at + needle.length - 1] }
  }
  return null
}

// 0 genau gleich, 1 am Anfang, 2 irgendwo, 3 gar nicht - wie lib/search.js rankSql (für Daten, die schon im Speicher sind).
function matchRank(text, query) {
  const ranks = Object.keys(VARIANTS).map((variant) => {
    const needle = fold(query, variant)
    const hay = fold(text, variant)
    if (!needle || !hay.includes(needle)) return 3
    if (hay === needle) return 0
    return hay.startsWith(needle) ? 1 : 2
  })
  return Math.min(...ranks)
}

// Keine halben Ersatzzeichen (Emoji) an den Schnittkanten.
function isLowSurrogate(text, index) {
  const code = text.charCodeAt(index)
  return code >= 0xdc00 && code <= 0xdfff
}

function snapStart(text, start, matchStart) {
  if (start === 0) return 0
  const space = text.indexOf(' ', start)
  const snapped = space >= 0 && space < matchStart && space - start <= WORD_SNAP ? space + 1 : start
  return isLowSurrogate(text, snapped) ? snapped + 1 : snapped
}

function snapEnd(text, end, matchEnd) {
  if (end >= text.length) return text.length
  const space = text.lastIndexOf(' ', end)
  const snapped = space > matchEnd && end - space <= WORD_SNAP ? space : end
  return isLowSurrogate(text, snapped) ? snapped - 1 : snapped
}

// Höchstens max Zeichen aus text rund um den ersten Treffer (etwa ein Drittel Vorlauf), Zeilenumbrüche zu Leerzeichen,
// "…" an abgeschnittenen Enden. null ohne Text oder ohne Treffer - nie der ganze lange Text.
function excerpt(text, query, max = EXCERPT_MAX) {
  if (typeof text !== 'string') return null
  const flat = text.normalize('NFC').replace(SPACE_RE, ' ').trim()
  const match = findMatch(flat, query)
  if (!match) return null
  if (flat.length <= max) return flat
  const room = max - 2 * ELLIPSIS.length
  const lead = Math.max(0, Math.floor((room - (match.end - match.start)) / 3))
  const rawStart = Math.max(0, Math.min(match.start - lead, flat.length - room))
  const start = snapStart(flat, rawStart, match.start)
  const end = snapEnd(flat, Math.min(flat.length, rawStart + room), match.end)
  const body = flat.slice(start, end).trim()
  return `${start > 0 ? ELLIPSIS : ''}${body}${end < flat.length ? ELLIPSIS : ''}`
}

module.exports = {
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  EXCERPT_MAX,
  foldDe,
  foldBasis,
  cleanQuery,
  findMatch,
  matchRank,
  excerpt
}
