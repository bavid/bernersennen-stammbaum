// Euro-Eingaben im Admin (Spendenberichte, Phase 3 Task 5): der Server speichert ganze Cent
// (server/lib/promotions.js validateDonationReport), Menschen tippen Euro - deutsch ("1.250,50") oder mit
// Punkt als Dezimaltrenner ("1250.5"). Reine Funktionen ohne Gleitkomma-Rechnung für die Nachkommastellen.

// Tausender-Gruppen: erste Gruppe 1-3 Ziffern ohne führende Null, danach nur Dreiergruppen.
function thousandsRe(separator) {
  const sep = separator === '.' ? '\\.' : ','
  return new RegExp(`^[1-9]\\d{0,2}(${sep}\\d{3})+$`)
}

function count(text, char) {
  return text.split(char).length - 1
}

// Welches Zeichen trennt die Nachkommastellen ab? null = gar keins, undefined = mehrdeutig/ungültig.
function decimalSeparator(text) {
  const commas = count(text, ',')
  const dots = count(text, '.')
  if (commas && dots) {
    const separator = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.'
    return count(text, separator) === 1 ? separator : undefined
  }
  if (commas) return commas === 1 ? ',' : undefined
  if (dots === 1) return thousandsRe('.').test(text) ? null : '.' // "1.250" ist deutsch 1250 €
  return null // keine Trenner oder nur Tausenderpunkte ("1.250.000")
}

// Ganzzahliger Teil ohne Tausendertrenner, oder null, wenn die Gruppierung nicht stimmt.
function integerDigits(text, thousandsSeparator) {
  if (/^\d*$/.test(text)) return text
  if (thousandsSeparator && thousandsRe(thousandsSeparator).test(text)) return text.split(thousandsSeparator).join('')
  return null
}

// "1.250,50" / "1250,50" / "1250.5" / "1,250.50" / "42 €" -> ganze Cent (kaufmännisch gerundet).
// null für Leeres, Negatives und alles, was keine eindeutige Zahl ist.
export function parseEuroToCents(input) {
  if (typeof input !== 'string') return null
  const text = input.replace(/€/g, '').replace(/\s/g, '')
  if (!text || !/^[\d.,]+$/.test(text)) return null

  const separator = decimalSeparator(text)
  if (separator === undefined) return null

  const [rawInteger, fraction = ''] = separator ? text.split(separator) : [text]
  // Tausender sind immer das jeweils andere Zeichen - ohne Dezimaltrenner der deutsche Punkt.
  const digits = integerDigits(rawInteger, separator === '.' ? ',' : '.')
  if (digits === null || !/^\d*$/.test(fraction) || !(digits + fraction)) return null

  const roundUp = fraction.length > 2 && fraction[2] >= '5' ? 1 : 0
  const cents = Number(digits || '0') * 100 + Number(fraction.padEnd(2, '0').slice(0, 2)) + roundUp
  return Number.isSafeInteger(cents) ? cents : null
}

// Cent zurück ins Eingabefeld zum Bearbeiten, ohne Tausenderpunkte: 125050 -> "1250,50".
export function centsToEuroInput(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return ''
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}
