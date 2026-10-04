'use strict'

// Suche: der Vergleich in der Datenbank (SQL-Funktionen suche_hat, suche_rang) - mit einem Arbeitsbudget je Anfrage.
// better-sqlite3 rechnet synchron im einen Node-Prozess: lange Texte, viele Bereiche und ein ausgefallener Suchbegriff
// dürfen den Server nicht für alle anhalten (security-review Suche, MEDIUM-1). Darum:
// - Vergleich mit String.includes auf den gefalteten Texten (lib/searchText.js) statt LIKE - linear statt Text × Muster,
//   und Platzhalter wie % und _ gibt es dabei gar nicht erst;
// - jeder Text wird je Anfrage höchstens einmal gefaltet (memo) - eine Erinnerung, die in mehreren Bereichen sichtbar ist,
//   kostet nur einmal;
// - nach MAX_FOLDED_CHARS gefalteten Zeichen hört die Anfrage auf zu vergleichen (exhausted): die übrigen Zeilen zählen als
//   kein Treffer, die Antwort sagt "unvollständig" (lib/search.js runSearch).
// Die Funktionen gelten nur zwischen begin() und end() - lib/search.js ruft beide synchron um eine Suche herum auf.

const db = require('../db')
const { foldDe, foldBasis } = require('./searchText')

const MAX_FOLDED_CHARS = 4_000_000
// Texte ab dieser Länge merkt sich die Anfrage - kurze sind schneller neu gefaltet als nachgeschlagen.
const MEMO_MIN_LENGTH = 200
const ASCII_RE = /^[\x00-\x7f]*$/
const SPACE_RE = /\s+/g
const RANK_NONE = 3

let run = null

function begin({ qDe, qBasis }) {
  run = { qDe, qBasis, used: 0, exhausted: false, memo: new Map() }
}

function end() {
  const exhausted = Boolean(run?.exhausted)
  run = null
  return { exhausted }
}

// [de, basis] - Leerraum zusammengefasst wie im Suchbegriff; null, wenn das Budget aufgebraucht ist.
function foldPair(text) {
  const ascii = ASCII_RE.test(text)
  const cost = ascii ? text.length : 2 * text.length
  if (run.used + cost > MAX_FOLDED_CHARS) {
    run.exhausted = true
    return null
  }
  run.used += cost
  if (ascii) {
    const lower = text.toLowerCase().replace(SPACE_RE, ' ')
    return [lower, lower]
  }
  return [foldDe(text).replace(SPACE_RE, ' '), foldBasis(text).replace(SPACE_RE, ' ')]
}

// 0 genau gleich, 1 am Anfang, 2 irgendwo, 3 kein Treffer (auch: kein Text oder Budget aufgebraucht).
function rankOf(value) {
  if (!run) throw new Error('Suche: Vergleich außerhalb einer Suche')
  if (value === null || value === undefined) return RANK_NONE
  const text = String(value)
  const memoize = text.length >= MEMO_MIN_LENGTH
  if (memoize && run.memo.has(text)) return run.memo.get(text)
  const pair = foldPair(text)
  if (!pair) return RANK_NONE
  const ranks = [
    [pair[0], run.qDe],
    [pair[1], run.qBasis]
  ].map(([hay, needle]) => {
    if (!hay.includes(needle)) return RANK_NONE
    if (hay === needle) return 0
    return hay.startsWith(needle) ? 1 : 2
  })
  const rank = Math.min(...ranks)
  if (memoize) run.memo.set(text, rank)
  return rank
}

db.function('suche_hat', (value) => (rankOf(value) < RANK_NONE ? 1 : 0))
db.function('suche_rang', (value) => rankOf(value))

// Trifft column? / Wie gut (0-2, für ORDER BY - SQLite rechnet das nur für Zeilen, die schon getroffen haben)?
const matchSql = (column) => `suche_hat(${column}) = 1`
const rankSql = (column) => `MIN(suche_rang(${column}), 2)`

module.exports = { begin, end, matchSql, rankSql, MAX_FOLDED_CHARS }
