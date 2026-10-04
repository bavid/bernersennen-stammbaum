// Suche: Text vergleichbar machen - genauso wie der Server (server/lib/searchText.js), damit die Hervorhebung im Ergebnis
// dieselbe Stelle findet, die der Server gefunden hat, und die Abkürzungen lokal nach denselben Regeln passen.
// Zwei Fassungen, beide klein und ohne Akzente: "de" (ä/ö/ü -> ae/oe/ue: "Müller" ~ "Mueller") und "basis"
// (ä/ö/ü -> a/o/u: "Muller" ~ "Müller"); ß wird zu ss, das Schluss-Sigma ς zu σ. Ein Text passt, wenn er in EINER
// Fassung den Begriff enthält.

const VARIANTS = {
  de: { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', ς: 'σ' },
  basis: { ä: 'a', ö: 'o', ü: 'u', ß: 'ss', ς: 'σ' }
}

const MARKS_RE = /\p{M}/gu
const SIGMA_RE = /ς/g

function foldChar(char, table) {
  const lower = char.toLowerCase()
  if (Object.hasOwn(table, lower)) return table[lower]
  // Nach dem Zerlegen noch einmal klein: Kompatibilitätszeichen wie ℌ werden erst dabei zu einem (großen) Buchstaben.
  return lower.normalize('NFKD').replace(MARKS_RE, '').toLowerCase().replace(SIGMA_RE, 'σ')
}

// { text (NFC), folded, starts, ends }: je Stelle des gefalteten Texts, wo das Zeichen im Original beginnt und endet.
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

export function foldText(value, variant = 'de') {
  return foldWithMap(typeof value === 'string' ? value : String(value ?? ''), variant).folded
}

// Erste Fundstelle von query in text: { start, end } im NFC-Text (end exklusiv) oder null.
export function findMatch(text, query) {
  for (const variant of Object.keys(VARIANTS)) {
    const needle = foldText(query, variant).trim()
    if (!needle) continue
    const map = foldWithMap(text, variant)
    const at = map.folded.indexOf(needle)
    if (at >= 0) return { start: map.starts[at], end: map.ends[at + needle.length - 1] }
  }
  return null
}

export function matchesQuery(text, query) {
  return findMatch(text, query) !== null
}

// Text in Stücke für die Hervorhebung: [{ text, match }] - ohne Treffer ein Stück ohne match.
export function highlightParts(value, query) {
  const text = typeof value === 'string' ? value.normalize('NFC') : ''
  const match = query ? findMatch(text, query) : null
  if (!match) return text ? [{ text, match: false }] : []
  return [
    { text: text.slice(0, match.start), match: false },
    { text: text.slice(match.start, match.end), match: true },
    { text: text.slice(match.end), match: false }
  ].filter((part) => part.text)
}
